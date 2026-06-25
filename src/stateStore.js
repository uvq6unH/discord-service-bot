/**
 * stateStore.js  (v2 — granular Redis keys)
 *
 * Redis key scheme (thay cho blob guild:{id}):
 *
 *   guild:index                            → Set<guildId>   (danh sách guild)
 *   guild:{guildId}:economy:{userId}       → JSON user economy
 *   guild:{guildId}:levels:{userId}        → JSON user xp/level
 *   guild:{guildId}:warnings:{userId}      → JSON array warnings
 *   guild:{guildId}:tickets:nextNumber     → string number (INCR-safe)
 *   guild:{guildId}:game:{type}:{msgId}    → JSON game session
 *   guild:{guildId}:lolAccount:{userId}    → JSON riot account
 *   guild:{guildId}:tftAccount:{userId}    → JSON riot account
 *
 * Lợi ích so với blob guild:{id}:
 *   ✅ Không load toàn bộ data guild cho mỗi thao tác
 *   ✅ Concurrent reads không block nhau
 *   ✅ Pipeline saveGuild không cần serialize toàn bộ object
 *   ✅ Upstash free tier: mỗi key nhỏ, ít bị hit 1MB limit
 *   ✅ Dễ debug (redis-cli KEYS "guild:123:economy:*")
 *
 * Backward compat:
 *   - Nếu Redis chưa có granular key → fallback đọc blob cũ guild:{guildId}
 *   - File JSON local vẫn hoạt động như cũ (không đổi format)
 */

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createMutexPool } from './asyncMutex.js';
import { withRedisLock }   from './distributedLock.js';
import { readJsonFile }    from './safeJson.js';
import { createUpstashFromEnv } from './upstash.js';

// ── Day helpers (cho daily reward) ────────────────────────────────────────────

const dayMs = 24 * 60 * 60 * 1000;

function dayKeyForOffset(timestamp, utcOffsetMinutes) {
  return Math.floor((timestamp + utcOffsetMinutes * 60 * 1000) / dayMs);
}

function nextDayStartForOffset(dayKey, utcOffsetMinutes) {
  return (dayKey + 1) * dayMs - utcOffsetMinutes * 60 * 1000;
}

// ── Default values ─────────────────────────────────────────────────────────────

const DEFAULT_ECONOMY_USER = () => ({
  silver: 0, gold: 0, diamond: 0,
  lastDailyAt: 0, lastDailyDay: null,
});

const DEFAULT_LEVELS_USER = () => ({
  xp: 0, level: 0, lastMessageAt: 0,
});

// ── StateStore ─────────────────────────────────────────────────────────────────

export class StateStore {
  constructor(filePath, { redis = null } = {}) {
    this.filePath = path.resolve(filePath);

    // Local mutex pools (single-process fallback)
    this._economyMutex    = createMutexPool();
    this._gameSessionMutex = createMutexPool();
    this._warningsMutex   = createMutexPool();
    this._lolMutex        = createMutexPool();
    this._ticketMutex     = createMutexPool();

    this._redis = redis ?? createUpstashFromEnv();

    if (this._redis) {
      this._useRedis = true;
      console.log('[StateStore] Using Upstash Redis (granular key scheme).');
      this.ready = Promise.resolve();
    } else {
      this._useRedis = false;
      console.log('[StateStore] Upstash not configured — using local JSON file.');
      this.cache = { guilds: {} };
      this._saveQueue = Promise.resolve();
      this.ready = this._loadFile();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Redis key builders  (tất cả key đều có prefix rõ ràng)
  // ════════════════════════════════════════════════════════════════════════════

  _k = {
    guildIndex:        ()                          => `guild:index`,
    economy:           (gId, uId)                  => `guild:${gId}:economy:${uId}`,
    levels:            (gId, uId)                  => `guild:${gId}:levels:${uId}`,
    warnings:          (gId, uId)                  => `guild:${gId}:warnings:${uId}`,
    ticketCounter:     (gId)                       => `guild:${gId}:tickets:nextNumber`,
    game:              (gId, type, msgId)           => `guild:${gId}:game:${type}:${msgId}`,
    lolAccount:        (gId, uId)                  => `guild:${gId}:lolAccount:${uId}`,
    tftAccount:        (gId, uId)                  => `guild:${gId}:tftAccount:${uId}`,
    // Compat: blob key cũ (đọc migrate, không ghi)
    legacyGuild:       (gId)                       => `guild:${gId}`,
  };

  // ── Redis helpers ────────────────────────────────────────────────────────────

  async _rGet(key) {
    const raw = await this._redis.get(key);
    return raw == null ? null : JSON.parse(raw);
  }

  async _rSet(key, value) {
    await this._redis.set(key, JSON.stringify(value));
  }

  async _rDel(key) {
    await this._redis.del(key);
  }

  /** Đăng ký guildId vào index (idempotent). */
  async _registerGuild(guildId) {
    await this._redis.sadd(this._k.guildIndex(), guildId);
  }

  async _listGuildIds() {
    return (await this._redis.smembers(this._k.guildIndex())) ?? [];
  }

  // ── Migration: đọc blob cũ nếu granular key chưa có ─────────────────────────

  async _migrateGuildBlob(guildId) {
    const blob = await this._rGet(this._k.legacyGuild(guildId));
    if (!blob) return;

    console.log(`[StateStore] Migrating legacy blob for guild ${guildId}…`);
    const pipeline = [];

    // Economy users
    for (const [userId, data] of Object.entries(blob.economy?.users ?? {})) {
      pipeline.push(['SET', this._k.economy(guildId, userId), JSON.stringify({ ...DEFAULT_ECONOMY_USER(), ...data })]);
    }

    // Levels
    for (const [userId, data] of Object.entries(blob.levels ?? {})) {
      pipeline.push(['SET', this._k.levels(guildId, userId), JSON.stringify({ ...DEFAULT_LEVELS_USER(), ...data })]);
    }

    // Warnings
    for (const [userId, list] of Object.entries(blob.warnings ?? {})) {
      if (Array.isArray(list) && list.length) {
        pipeline.push(['SET', this._k.warnings(guildId, userId), JSON.stringify(list)]);
      }
    }

    // Ticket counter
    if (blob.tickets?.nextNumber) {
      pipeline.push(['SET', this._k.ticketCounter(guildId), String(blob.tickets.nextNumber)]);
    }

    // LoL / TFT accounts
    for (const [userId, data] of Object.entries(blob.lolAccounts ?? {})) {
      pipeline.push(['SET', this._k.lolAccount(guildId, userId), JSON.stringify(data)]);
    }
    for (const [userId, data] of Object.entries(blob.tftAccounts ?? {})) {
      pipeline.push(['SET', this._k.tftAccount(guildId, userId), JSON.stringify(data)]);
    }

    // Game sessions
    for (const type of ['blackjack', 'poker']) {
      for (const [msgId, session] of Object.entries(blob.gameSessions?.[type] ?? {})) {
        pipeline.push(['SET', this._k.game(guildId, type, msgId), JSON.stringify(session)]);
      }
    }

    // Ghi granular keys
    if (pipeline.length) {
      await this._redis.pipeline(pipeline);
    }

    // Đăng ký guild
    await this._registerGuild(guildId);

    // Xoá blob cũ (rename → backup 24h rồi xoá)
    await this._redis.set(`${this._k.legacyGuild(guildId)}:migrated_backup`, JSON.stringify(blob), 'EX', 86400);
    await this._rDel(this._k.legacyGuild(guildId));

    console.log(`[StateStore] Migration done for guild ${guildId}. Pipeline: ${pipeline.length} keys.`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // File fallback (local dev / không có Redis)
  // ════════════════════════════════════════════════════════════════════════════

  async _loadFile() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.cache = await readJsonFile(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`[StateStore] Could not read state file. Starting fresh. ${error.message}`);
      }
      this.cache = { guilds: {} };
      await this._writeToDisk();
    }
  }

  async _writeToDisk() {
    const tmp = `${this.filePath}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(this.cache, null, 2)}\n`, 'utf8');
    await rename(tmp, this.filePath);
  }

  _save() {
    this._saveQueue = this._saveQueue
      .then(() => this._writeToDisk())
      .catch(err => console.error('[StateStore] Save error:', err));
    return this._saveQueue;
  }

  // File: lấy guild object (unchanged từ v1)
  async _fileGetGuild(guildId) {
    await this.ready;
    this.cache.guilds[guildId] ??= {};
    const g = this.cache.guilds[guildId];
    g.warnings    ??= {};
    g.levels      ??= {};
    g.tickets     ??= { nextNumber: 1 };
    g.economy     ??= { users: {} };
    g.economy.users ??= {};
    g.gameSessions ??= { blackjack: {}, poker: {} };
    g.gameSessions.blackjack ??= {};
    g.gameSessions.poker     ??= {};
    g.lolAccounts ??= {};
    g.tftAccounts ??= {};
    return g;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lock helpers
  // ════════════════════════════════════════════════════════════════════════════

  async _withEconomyLock(guildId, userId, fn) {
    const lockKey = `lock:economy:${guildId}:${userId}`;
    if (this._useRedis) return withRedisLock(this._redis, lockKey, 15, fn);
    return this._economyMutex(lockKey, fn);
  }

  async withGameSessionLock(guildId, gameType, messageId, fn) {
    const lockKey = `lock:game:${gameType}:${guildId}:${messageId}`;
    if (this._useRedis) return withRedisLock(this._redis, lockKey, 30, fn);
    return this._gameSessionMutex(lockKey, fn);
  }

  async _withWarningsLock(guildId, userId, fn) {
    const lockKey = `lock:warnings:${guildId}:${userId}`;
    if (this._useRedis) return withRedisLock(this._redis, lockKey, 15, fn);
    return this._warningsMutex(lockKey, fn);
  }

  async _withTicketLock(guildId, fn) {
    const lockKey = `lock:ticket:${guildId}`;
    if (this._useRedis) return withRedisLock(this._redis, lockKey, 15, fn);
    return this._ticketMutex(guildId, fn);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Game Sessions
  // ════════════════════════════════════════════════════════════════════════════

  async getGameSession(guildId, type, messageId) {
    if (this._useRedis) {
      return this._rGet(this._k.game(guildId, type, messageId));
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.gameSessions?.[type]?.[messageId] ?? null;
  }

  // Game sessions có TTL 3 giờ trên Redis — auto-expire nếu bot crash trước khi xử lý xong.
  // purgeStaleGameSessions() dùng để refund ngay khi bot khởi động, không chờ TTL.
  static GAME_SESSION_TTL_S = 3 * 60 * 60; // 3 giờ

  async setGameSession(guildId, type, messageId, session) {
    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._redis.set(
        this._k.game(guildId, type, messageId),
        JSON.stringify(session),
        'EX', StateStore.GAME_SESSION_TTL_S
      );
      return session;
    }
    const guild = await this._fileGetGuild(guildId);
    guild.gameSessions[type] ??= {};
    guild.gameSessions[type][messageId] = session;
    await this._save();
    return session;
  }

  async deleteGameSession(guildId, type, messageId) {
    if (this._useRedis) {
      await this._rDel(this._k.game(guildId, type, messageId));
      return;
    }
    const guild = await this._fileGetGuild(guildId);
    if (guild.gameSessions?.[type]) {
      delete guild.gameSessions[type][messageId];
      await this._save();
    }
  }

  // Helper: refund economy user trong một game session (dùng cả Redis lẫn file)
  async _refundGameSession(guildId, type, messageId, session) {
    if (!session || session.status !== 'active') return false;
    let refunded = false;

    if (type === 'blackjack' && Array.isArray(session.players)) {
      for (const player of session.players) {
        const totalBet = player.hands
          ? player.hands.reduce((sum, h) => sum + (h.bet ?? 0), 0)
          : (player.bet ?? 0);
        if (totalBet > 0 && player.userId && session.currency) {
          await this.adjustBalance(guildId, player.userId, session.currency, totalBet);
          refunded = true;
        }
      }
    } else if (type === 'poker' && session.userId && session.bet > 0 && session.currency) {
      await this.adjustBalance(guildId, session.userId, session.currency, session.bet);
      refunded = true;
    }

    return refunded;
  }

  async refundAndDeleteGameSession(guildId, type, messageId) {
    const session = await this.getGameSession(guildId, type, messageId);
    if (!session) return { refunded: false, deleted: false };

    const refunded = await this._refundGameSession(guildId, type, messageId, session);
    await this.deleteGameSession(guildId, type, messageId);
    return { refunded, deleted: true };
  }

  async purgeStaleGameSessions(maxAgeMs = 6 * 60 * 60 * 1000) {
    if (!this._useRedis) {
      // File fallback: iterate cache
      await this.ready;
      const now = Date.now();
      for (const [guildId, guild] of Object.entries(this.cache.guilds ?? {})) {
        let dirty = false;
        for (const type of ['blackjack', 'poker']) {
          for (const [msgId, session] of Object.entries(guild.gameSessions?.[type] ?? {})) {
            if (!session || session.status !== 'active') {
              delete guild.gameSessions[type][msgId];
              dirty = true;
              continue;
            }
            const age = session.createdAt ? now - session.createdAt : maxAgeMs + 1;
            if (age >= maxAgeMs) {
              await this._refundGameSession(guildId, type, msgId, session);
              delete guild.gameSessions[type][msgId];
              dirty = true;
            }
          }
        }
        if (dirty) await this._save();
      }
      return;
    }

    // Redis: dùng KEYS pattern để tìm tất cả game sessions
    // Upstash REST hỗ trợ KEYS (đã thêm vào UpstashClient).
    // Với số lượng guilds / game sessions thấp, KEYS an toàn hơn SCAN cho Upstash.
    const now = Date.now();
    let purged = 0;

    for (const type of ['blackjack', 'poker']) {
      let keys;
      try {
        keys = await this._redis.keys(`guild:*:game:${type}:*`);
      } catch (err) {
        console.warn(`[StateStore] purge: KEYS failed for ${type}:`, err.message);
        continue;
      }

      for (const key of (keys ?? [])) {
        try {
          const session = await this._rGet(key);
          if (!session || session.status !== 'active') {
            await this._rDel(key);
            purged++;
            continue;
          }
          const age = session.createdAt ? now - session.createdAt : maxAgeMs + 1;
          if (age >= maxAgeMs) {
            // Parse guildId + messageId dari key: guild:{guildId}:game:{type}:{msgId}
            const parts = key.split(':');
            if (parts.length >= 5) {
              const guildId   = parts[1];
              const messageId = parts[4];
              await this._refundGameSession(guildId, type, messageId, session);
            }
            await this._rDel(key);
            purged++;
          }
        } catch (err) {
          console.warn(`[StateStore] purge: failed for key ${key}:`, err.message);
        }
      }
    }

    if (purged > 0) console.log(`[StateStore] Purged ${purged} stale game session(s) from Redis.`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Economy
  // ════════════════════════════════════════════════════════════════════════════

  async _redisGetEconUser(guildId, userId) {
    let data = await this._rGet(this._k.economy(guildId, userId));
    if (!data) {
      // Thử migrate từ blob cũ nếu có
      const legacy = await this._rGet(this._k.legacyGuild(guildId));
      if (legacy?.economy?.users?.[userId]) {
        await this._migrateGuildBlob(guildId);
        data = await this._rGet(this._k.economy(guildId, userId));
      }
    }
    return { ...DEFAULT_ECONOMY_USER(), ...(data ?? {}) };
  }

  async getBalance(guildId, userId) {
    if (this._useRedis) {
      return this._redisGetEconUser(guildId, userId);
    }
    const guild = await this._fileGetGuild(guildId);
    guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
    return { ...guild.economy.users[userId] };
  }

  async adjustBalance(guildId, userId, currency, amount) {
    return this._withEconomyLock(guildId, userId, async () => {
      if (this._useRedis) {
        await this._registerGuild(guildId);
        const memberIndexKey = `guild:${guildId}:economy:_members`;
        const user = await this._redisGetEconUser(guildId, userId);
        user[currency] = Math.max(0, Math.floor((user[currency] ?? 0) + amount));
        await this._redis.pipeline([
          ['SADD', memberIndexKey, userId],
          ['SET', this._k.economy(guildId, userId), JSON.stringify(user)],
        ]);
        return { ...user };
      }
      const guild = await this._fileGetGuild(guildId);
      guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
      const user = guild.economy.users[userId];
      user[currency] = Math.max(0, Math.floor((user[currency] ?? 0) + amount));
      await this._save();
      return { ...user };
    });
  }

  async tryDebitBalance(guildId, userId, currency, amount) {
    const debit = Math.floor(amount);
    if (!Number.isFinite(debit) || debit <= 0) {
      return { ok: false, balance: await this.getBalance(guildId, userId) };
    }

    return this._withEconomyLock(guildId, userId, async () => {
      if (this._useRedis) {
        await this._registerGuild(guildId);
        const user = await this._redisGetEconUser(guildId, userId);
        const current = user[currency] ?? 0;
        if (current < debit) return { ok: false, balance: { ...user } };
        user[currency] = Math.max(0, Math.floor(current - debit));
        await this._rSet(this._k.economy(guildId, userId), user);
        return { ok: true, balance: { ...user } };
      }
      const guild = await this._fileGetGuild(guildId);
      guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
      const user = guild.economy.users[userId];
      const current = user[currency] ?? 0;
      if (current < debit) return { ok: false, balance: { ...user } };
      user[currency] = Math.max(0, Math.floor(current - debit));
      await this._save();
      return { ok: true, balance: { ...user } };
    });
  }

  async setBalance(guildId, userId, currency, amount) {
    return this._withEconomyLock(guildId, userId, async () => {
      if (this._useRedis) {
        await this._registerGuild(guildId);
        const user = await this._redisGetEconUser(guildId, userId);
        user[currency] = Math.max(0, Math.floor(amount));
        await this._rSet(this._k.economy(guildId, userId), user);
        return { ...user };
      }
      const guild = await this._fileGetGuild(guildId);
      guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
      const user = guild.economy.users[userId];
      user[currency] = Math.max(0, Math.floor(amount));
      await this._save();
      return { ...user };
    });
  }

  async claimDaily(guildId, userId, rewards, options = {}) {
    return this._withEconomyLock(guildId, userId, async () => {
      const utcOffsetMinutes = Number.isFinite(options.utcOffsetMinutes)
        ? options.utcOffsetMinutes : 420;
      const now      = Date.now();
      const todayKey = dayKeyForOffset(now, utcOffsetMinutes);
      const nextAt   = nextDayStartForOffset(todayKey, utcOffsetMinutes);

      if (this._useRedis) {
        await this._registerGuild(guildId);
        const user = await this._redisGetEconUser(guildId, userId);
        if (user.lastDailyDay === todayKey) {
          return { claimed: false, nextAt, balance: { ...user } };
        }
        user.silver     += rewards.silver  ?? 0;
        user.gold       += rewards.gold    ?? 0;
        user.diamond    += rewards.diamond ?? 0;
        user.lastDailyAt  = now;
        user.lastDailyDay = todayKey;
        await this._rSet(this._k.economy(guildId, userId), user);
        return { claimed: true, nextAt, balance: { ...user } };
      }

      const guild = await this._fileGetGuild(guildId);
      guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
      const user = guild.economy.users[userId];
      if (user.lastDailyDay === todayKey) {
        return { claimed: false, nextAt, balance: { ...user } };
      }
      user.silver     += rewards.silver  ?? 0;
      user.gold       += rewards.gold    ?? 0;
      user.diamond    += rewards.diamond ?? 0;
      user.lastDailyAt  = now;
      user.lastDailyDay = todayKey;
      await this._save();
      return { claimed: true, nextAt, balance: { ...user } };
    });
  }

  async getEconomyLeaderboard(guildId, currency, limit = 10) {
    if (!this._useRedis) {
      const guild = await this._fileGetGuild(guildId);
      return Object.entries(guild.economy.users)
        .map(([userId, data]) => ({ userId, amount: data[currency] ?? 0 }))
        .filter(e => e.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
    }

    // Redis: Upstash không support SCAN — leaderboard cần guild member index
    // Workaround: lưu danh sách userId đã từng có economy trong guild
    const memberIndexKey = `guild:${guildId}:economy:_members`;
    const memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];

    const entries = await Promise.all(
      memberIds.map(async (userId) => {
        const user = await this._redisGetEconUser(guildId, userId);
        return { userId, amount: user[currency] ?? 0 };
      })
    );

    return entries
      .filter(e => e.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  // Ghi economy và đăng ký userId vào member index của guild
  async _redisSetEconUserWithIndex(guildId, userId, user) {
    const memberIndexKey = `guild:${guildId}:economy:_members`;
    await this._redis.pipeline([
      ['SADD', `guild:index`, guildId],
      ['SADD', memberIndexKey, userId],
      ['SET', this._k.economy(guildId, userId), JSON.stringify(user)],
    ]);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Warnings
  // ════════════════════════════════════════════════════════════════════════════

  async addWarning(guildId, userId, moderatorId, reason) {
    return this._withWarningsLock(guildId, userId, async () => {
      const warning = {
        id: `${Date.now()}`,
        moderatorId,
        reason,
        createdAt: new Date().toISOString(),
      };

      if (this._useRedis) {
        await this._registerGuild(guildId);
        const list = (await this._rGet(this._k.warnings(guildId, userId))) ?? [];
        list.push(warning);
        await this._rSet(this._k.warnings(guildId, userId), list);
        return warning;
      }

      const guild = await this._fileGetGuild(guildId);
      guild.warnings[userId] ??= [];
      guild.warnings[userId].push(warning);
      await this._save();
      return warning;
    });
  }

  async getWarnings(guildId, userId) {
    if (this._useRedis) {
      return (await this._rGet(this._k.warnings(guildId, userId))) ?? [];
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.warnings[userId] ?? [];
  }

  async clearWarnings(guildId, userId) {
    return this._withWarningsLock(guildId, userId, async () => {
      if (this._useRedis) {
        const list = (await this._rGet(this._k.warnings(guildId, userId))) ?? [];
        await this._rDel(this._k.warnings(guildId, userId));
        return list.length;
      }
      const guild = await this._fileGetGuild(guildId);
      const count = guild.warnings[userId]?.length ?? 0;
      guild.warnings[userId] = [];
      await this._save();
      return count;
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Levels / XP
  // ════════════════════════════════════════════════════════════════════════════

  async addXp(guildId, userId, amount) {
    return this._withEconomyLock(guildId, userId, async () => {
      const now = Date.now();

      if (this._useRedis) {
        const memberIndexKey = `guild:${guildId}:levels:_members`;
        const key  = this._k.levels(guildId, userId);
        let current = (await this._rGet(key)) ?? DEFAULT_LEVELS_USER();
        if (now - current.lastMessageAt < 60_000) {
          return { ...current, changed: false, leveledUp: false };
        }
        current.lastMessageAt = now;
        current.xp += amount;
        const nextLevel = Math.floor(Math.sqrt(current.xp / 100));
        const leveledUp = nextLevel > current.level;
        current.level = Math.max(current.level, nextLevel);
        await this._redis.pipeline([
          ['SADD', 'guild:index', guildId],
          ['SADD', memberIndexKey, userId],
          ['SET', key, JSON.stringify(current)],
        ]);
        return { ...current, changed: true, leveledUp };
      }

      const guild = await this._fileGetGuild(guildId);
      guild.levels[userId] ??= DEFAULT_LEVELS_USER();
      const current = guild.levels[userId];
      if (now - current.lastMessageAt < 60_000) {
        return { ...current, changed: false, leveledUp: false };
      }
      current.lastMessageAt = now;
      current.xp += amount;
      const nextLevel = Math.floor(Math.sqrt(current.xp / 100));
      const leveledUp = nextLevel > current.level;
      current.level = Math.max(current.level, nextLevel);
      await this._save();
      return { ...current, changed: true, leveledUp };
    });
  }

  async getRank(guildId, userId) {
    if (this._useRedis) {
      return (await this._rGet(this._k.levels(guildId, userId))) ?? DEFAULT_LEVELS_USER();
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.levels[userId] ?? DEFAULT_LEVELS_USER();
  }

  async getLeaderboard(guildId, limit = 10) {
    if (!this._useRedis) {
      const guild = await this._fileGetGuild(guildId);
      return Object.entries(guild.levels)
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, limit);
    }

    // Tương tự economy — dùng member index
    const memberIndexKey = `guild:${guildId}:levels:_members`;
    const memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];

    const entries = await Promise.all(
      memberIds.map(async (userId) => {
        const data = (await this._rGet(this._k.levels(guildId, userId))) ?? DEFAULT_LEVELS_USER();
        return { userId, ...data };
      })
    );

    return entries.sort((a, b) => b.xp - a.xp).slice(0, limit);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Tickets
  // ════════════════════════════════════════════════════════════════════════════

  async nextTicketNumber(guildId) {
    return this._withTicketLock(guildId, async () => {
      if (this._useRedis) {
        await this._registerGuild(guildId);
        const key = this._k.ticketCounter(guildId);
        const current = await this._rGet(key);
        const number = current ? Number(current) : 1;
        await this._rSet(key, number + 1);
        return number;
      }
      const guild = await this._fileGetGuild(guildId);
      guild.tickets.nextNumber ??= 1;
      const number = guild.tickets.nextNumber;
      guild.tickets.nextNumber += 1;
      await this._save();
      return number;
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LoL / TFT Account Linking
  // ════════════════════════════════════════════════════════════════════════════

  async linkLolAccount(guildId, userId, data) {
    return this._lolMutex(`lol:${guildId}:${userId}`, async () => {
      const account = {
        riotId: data.riotId,
        puuid:  data.puuid,
        region: data.region,
        linkedAt: new Date().toISOString(),
      };
      if (this._useRedis) {
        await this._registerGuild(guildId);
        await this._rSet(this._k.lolAccount(guildId, userId), account);
        return;
      }
      const guild = await this._fileGetGuild(guildId);
      guild.lolAccounts[userId] = account;
      await this._save();
    });
  }

  async unlinkLolAccount(guildId, userId) {
    return this._lolMutex(`lol:${guildId}:${userId}`, async () => {
      if (this._useRedis) {
        await this._rDel(this._k.lolAccount(guildId, userId));
        return;
      }
      const guild = await this._fileGetGuild(guildId);
      delete guild.lolAccounts[userId];
      await this._save();
    });
  }

  async getLinkedLolAccount(guildId, userId) {
    if (this._useRedis) {
      return this._rGet(this._k.lolAccount(guildId, userId));
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.lolAccounts?.[userId] ?? null;
  }

  async linkTftAccount(guildId, userId, data) {
    return this._lolMutex(`tft:${guildId}:${userId}`, async () => {
      const account = {
        riotId: data.riotId,
        puuid:  data.puuid,
        region: data.region,
        linkedAt: new Date().toISOString(),
      };
      if (this._useRedis) {
        await this._registerGuild(guildId);
        await this._rSet(this._k.tftAccount(guildId, userId), account);
        return;
      }
      const guild = await this._fileGetGuild(guildId);
      guild.tftAccounts[userId] = account;
      await this._save();
    });
  }

  async unlinkTftAccount(guildId, userId) {
    return this._lolMutex(`tft:${guildId}:${userId}`, async () => {
      if (this._useRedis) {
        await this._rDel(this._k.tftAccount(guildId, userId));
        return;
      }
      const guild = await this._fileGetGuild(guildId);
      delete guild.tftAccounts[userId];
      await this._save();
    });
  }

  async getLinkedTftAccount(guildId, userId) {
    if (this._useRedis) {
      return this._rGet(this._k.tftAccount(guildId, userId));
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.tftAccounts?.[userId] ?? null;
  }

  // ── Quiz Daily tracking ──────────────────────────────────────────────────────
  async hasPlayedDailyQuiz(userId, mode, dayKey) {
    const key = `quiz:daily:${userId}:${mode}:${dayKey}`;
    if (this._useRedis) {
      return (await this._redis.get(key)) === 'true';
    }
    const state = await readJsonFile(this._filePath) || {};
    return state[`quiz_daily_${userId}_${mode}_${dayKey}`] === true;
  }

  async setPlayedDailyQuiz(userId, mode, dayKey) {
    const key = `quiz:daily:${userId}:${mode}:${dayKey}`;
    if (this._useRedis) {
      await this._redis.set(key, 'true', 'EX', 36 * 60 * 60); // 36 hours TTL
      return;
    }
    const state = await readJsonFile(this._filePath) || {};
    state[`quiz_daily_${userId}_${mode}_${dayKey}`] = true;
    fs.writeFileSync(this._filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  // ── Quiz Leaderboard & Scoring ───────────────────────────────────────────────
  async getQuizPoints(guildId, userId) {
    const key = `quiz:points:${guildId}:${userId}`;
    if (this._useRedis) {
      const val = await this._redis.get(key);
      return val ? parseInt(val, 10) : 0;
    }
    const state = await readJsonFile(this._filePath) || {};
    return state[`quiz_points_${guildId}_${userId}`] || 0;
  }

  async adjustQuizPoints(guildId, userId, amount) {
    const key = `quiz:points:${guildId}:${userId}`;
    const memberIndexKey = `guild:${guildId}:quiz:_members`;
    if (this._useRedis) {
      const current = await this.getQuizPoints(guildId, userId);
      const newVal = Math.max(0, current + amount);
      await this._redis.pipeline([
        ['SADD', 'guild:index', guildId],
        ['SADD', memberIndexKey, userId],
        ['SET', key, String(newVal)]
      ]);
      return newVal;
    }
    const state = await readJsonFile(this._filePath) || {};
    const current = state[`quiz_points_${guildId}_${userId}`] || 0;
    const newVal = Math.max(0, current + amount);
    state[`quiz_points_${guildId}_${userId}`] = newVal;
    state[`guild_quiz_members_${guildId}`] ??= [];
    if (!state[`guild_quiz_members_${guildId}`].includes(userId)) {
      state[`guild_quiz_members_${guildId}`].push(userId);
    }
    fs.writeFileSync(this._filePath, JSON.stringify(state, null, 2), 'utf8');
    return newVal;
  }

  async getQuizLeaderboard(guildId, limit = 10) {
    if (!this._useRedis) {
      const state = await readJsonFile(this._filePath) || {};
      const memberIds = state[`guild_quiz_members_${guildId}`] || [];
      const entries = [];
      for (const userId of memberIds) {
        const points = state[`quiz_points_${guildId}_${userId}`] || 0;
        entries.push({ userId, points });
      }
      return entries.sort((a, b) => b.points - a.points).slice(0, limit);
    }

    const memberIndexKey = `guild:${guildId}:quiz:_members`;
    const memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];
    const entries = await Promise.all(
      memberIds.map(async (userId) => {
        const points = await this.getQuizPoints(guildId, userId);
        return { userId, points };
      })
    );
    return entries.sort((a, b) => b.points - a.points).slice(0, limit);
  }

}
// getGuild() đã bị xoá (deprecated từ v1.3, không còn caller nào).
// Dùng các method cụ thể: getEconomyUser, getLevels, getWarnings, ...
