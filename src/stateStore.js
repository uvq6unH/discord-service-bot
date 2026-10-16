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

import crypto from 'node:crypto';
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

function getDayKey(utcOffsetMinutes = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + utcOffsetMinutes * 60000);
  return local.toISOString().split('T')[0];
}

function getPreviousDayKey(utcOffsetMinutes = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + utcOffsetMinutes * 60000 - 24 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
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
  constructor(filePath, options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const redis = opts.redis !== undefined ? opts.redis : (opts.get ? opts : null);
    this.filePath = filePath ? path.resolve(filePath) : path.resolve(process.cwd(), 'data', 'state.json');

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
    economy:           (gId, uId)                  => `{guild:${gId}}:economy:${uId}`,
    economyMembers:    (gId)                       => `{guild:${gId}}:economy:_members`,
    levels:            (gId, uId)                  => `{guild:${gId}}:levels:${uId}`,
    levelsMembers:     (gId)                       => `{guild:${gId}}:levels:_members`,
    warnings:          (gId, uId)                  => `{guild:${gId}}:warnings:${uId}`,
    ticketCounter:     (gId)                       => `{guild:${gId}}:tickets:nextNumber`,
    game:              (gId, type, msgId)           => `{guild:${gId}}:game:${type}:${msgId}`,
    lolAccount:        (gId, uId)                  => `{guild:${gId}}:lolAccount:${uId}`,
    tftAccount:        (gId, uId)                  => `{guild:${gId}}:tftAccount:${uId}`,
    musicQueue:        (gId)                       => `{guild:${gId}}:music:queue`,
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
    if (this._useRedis) return Promise.resolve();
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

  static CAD_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

  async _cadDelete(key, expectedVal) {
    if (typeof this._redis.eval === 'function') {
      try {
        const res = await this._redis.eval(StateStore.CAD_LUA, 1, key, expectedVal);
        return res === 1 || res === '1' ? 1 : 0;
      } catch (err) {
        console.warn(`[stateStore] CAD_LUA failed: ${err.message}`);
      }
    }
    const current = await this._redis.get(key);
    if (current === expectedVal) {
      await this._redis.del(key);
      return 1;
    }
    return 0;
  }

  async _reconcileLegacyDelta(guildId, userId, legacyKey, newKey, knownSnapshot = null) {
    const memberIndexKey = this._k.economyMembers(guildId);
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentLegacyRaw = await this._redis.get(legacyKey);
      if (currentLegacyRaw == null) return; // Cleaned up

      let currentLegacy = null;
      try { currentLegacy = JSON.parse(currentLegacyRaw); } catch { currentLegacy = {}; }

      const currentNewRaw = await this._redis.get(newKey);
      let currentNew = null;
      try { currentNew = currentNewRaw ? JSON.parse(currentNewRaw) : null; } catch { currentNew = null; }

      if (!currentNew) {
        // newKey disappeared or invalid; establish it from legacy
        await this._redis.set(newKey, currentLegacyRaw);
        await this._cadDelete(legacyKey, currentLegacyRaw);
        await this._redis.sadd(memberIndexKey, userId).catch(() => null);
        return;
      }

      // Check if currentLegacy is identical to what was previously migrated
      const legacyHash = crypto.createHash('sha256').update(currentLegacyRaw).digest('hex');
      if (currentNew._legacyHash === legacyHash) {
        // Clean remnant from prior crash: legacyKey is identical to the snapshot migrated into newKey!
        const cad = await this._cadDelete(legacyKey, currentLegacyRaw);
        if (cad === 1) {
          await this._redis.sadd(memberIndexKey, userId).catch(() => null);
          return;
        }
        continue;
      }

      // Baseline snapshot to compare against
      const baseline = knownSnapshot || currentNew._legacySnapshot || currentNew;

      const deltaSilver = Math.max(0, (currentLegacy.silver ?? 0) - (baseline.silver ?? 0));
      const deltaGold = Math.max(0, (currentLegacy.gold ?? 0) - (baseline.gold ?? 0));
      const deltaDiamond = Math.max(0, (currentLegacy.diamond ?? 0) - (baseline.diamond ?? 0));

      if (deltaSilver > 0 || deltaGold > 0 || deltaDiamond > 0) {
        currentNew.silver = (currentNew.silver ?? 0) + deltaSilver;
        currentNew.gold = (currentNew.gold ?? 0) + deltaGold;
        currentNew.diamond = (currentNew.diamond ?? 0) + deltaDiamond;
        console.warn(`[stateStore] Reconciled unmerged legacy balance for ${userId}: +${deltaSilver}s, +${deltaGold}g, +${deltaDiamond}d`);
      }

      currentNew._legacyHash = legacyHash;
      currentNew._legacySnapshot = {
        silver: currentLegacy.silver ?? 0,
        gold: currentLegacy.gold ?? 0,
        diamond: currentLegacy.diamond ?? 0,
      };

      await this._redis.set(newKey, JSON.stringify(currentNew));
      const cad = await this._cadDelete(legacyKey, currentLegacyRaw);
      if (cad === 1) {
        await this._redis.sadd(memberIndexKey, userId).catch(() => null);
        return;
      }
    }
  }

  async _ensureEconUserKeyMigrated(guildId, userId) {
    if (!this._useRedis) return;
    const newKey = this._k.economy(guildId, userId);
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const memberIndexKey = this._k.economyMembers(guildId);

    try {
      let legacyRaw = await this._redis.get(legacyKey);
      if (legacyRaw == null) return;

      const lockKey = `{guild:${guildId}}:lock:migrate:${userId}`;
      const lockToken = `${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
      let locked = await this._redis.set(lockKey, lockToken, 'EX', 5, 'NX').catch(() => null);

      if (locked !== 'OK' && locked !== true && locked !== 1) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 40));
          legacyRaw = await this._redis.get(legacyKey);
          if (legacyRaw == null) return;
        }
        locked = await this._redis.set(lockKey, lockToken, 'EX', 5, 'NX').catch(() => null);
        if (locked !== 'OK' && locked !== true && locked !== 1) {
          // Contention: defer destructive action to owner of active lock
          return;
        }
      }

      try {
        legacyRaw = await this._redis.get(legacyKey);
        if (legacyRaw == null) return;

        let legacyData = null;
        try { legacyData = JSON.parse(legacyRaw); } catch { legacyData = {}; }

        const newRaw = await this._redis.get(newKey);

        if (newRaw == null) {
          const legacyHash = crypto.createHash('sha256').update(legacyRaw).digest('hex');
          const payloadObj = {
            ...DEFAULT_ECONOMY_USER(),
            ...legacyData,
            _legacyHash: legacyHash,
            _legacySnapshot: {
              silver: legacyData.silver ?? 0,
              gold: legacyData.gold ?? 0,
              diamond: legacyData.diamond ?? 0,
            },
          };

          const setRes = await this._redis.set(newKey, JSON.stringify(payloadObj), 'NX');
          if (setRes === 'OK' || setRes === true || setRes === 1) {
            const cadRes = await this._cadDelete(legacyKey, legacyRaw);
            if (cadRes === 1) {
              await this._redis.sadd(memberIndexKey, userId).catch(() => null);
            } else {
              await this._reconcileLegacyDelta(guildId, userId, legacyKey, newKey, payloadObj._legacySnapshot);
            }
          } else {
            await this._reconcileLegacyDelta(guildId, userId, legacyKey, newKey, null);
          }
        } else {
          await this._reconcileLegacyDelta(guildId, userId, legacyKey, newKey, null);
        }
      } finally {
        const releaseLua = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
        await this._redis.eval(releaseLua, 1, lockKey, lockToken).catch(() => null);
      }
    } catch (err) {
      console.warn(`[stateStore] Warning: _ensureEconUserKeyMigrated failed for ${userId}: ${err.message}`);
    }
  }

  async _redisGetEconUser(guildId, userId) {
    await this._ensureEconUserKeyMigrated(guildId, userId);
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

  static DEBIT_LUA = `
local raw = redis.call('GET', KEYS[1])
local user = raw and cjson.decode(raw) or { silver = 0, gold = 0, diamond = 0 }
local currency = ARGV[1]
local debit = tonumber(ARGV[2])
local current = tonumber(user[currency] or 0)

if current < debit then
    return cjson.encode({ ok = false, user = user })
end

user[currency] = math.max(0, math.floor(current - debit))
local updated = cjson.encode(user)
redis.call('SET', KEYS[1], updated)
redis.call('SADD', KEYS[2], ARGV[3])

return cjson.encode({ ok = true, user = user })
`;

  static ADJUST_LUA = `
local raw = redis.call('GET', KEYS[1])
local user = raw and cjson.decode(raw) or { silver = 0, gold = 0, diamond = 0 }
local currency = ARGV[1]
local amount = tonumber(ARGV[2])
local current = tonumber(user[currency] or 0)

user[currency] = math.max(0, math.floor(current + amount))
local updated = cjson.encode(user)
redis.call('SET', KEYS[1], updated)
redis.call('SADD', KEYS[2], ARGV[3])

return updated
`;

  async adjustBalance(guildId, userId, currency, amount) {
    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._ensureEconUserKeyMigrated(guildId, userId);
      const memberIndexKey = this._k.economyMembers(guildId);
      const userKey = this._k.economy(guildId, userId);
      try {
        const rawRes = await this._redis.eval(
          StateStore.ADJUST_LUA,
          2,
          userKey,
          memberIndexKey,
          currency,
          String(amount),
          userId
        );
        const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
        if (parsed) return parsed;
      } catch (luaErr) {
        console.warn(`[stateStore] adjustBalance Lua fallback: ${luaErr.message}`);
      }
    }

    return this._withEconomyLock(guildId, userId, async () => {
      if (this._useRedis) {
        await this._registerGuild(guildId);
        const memberIndexKey = this._k.economyMembers(guildId);
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

    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._ensureEconUserKeyMigrated(guildId, userId);
      const memberIndexKey = this._k.economyMembers(guildId);
      const userKey = this._k.economy(guildId, userId);
      try {
        const rawRes = await this._redis.eval(
          StateStore.DEBIT_LUA,
          2,
          userKey,
          memberIndexKey,
          currency,
          String(debit),
          userId
        );
        const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
        if (parsed && typeof parsed.ok === 'boolean') {
          return { ok: parsed.ok, balance: parsed.user ?? {} };
        }
      } catch (luaErr) {
        console.warn(`[stateStore] tryDebitBalance Lua fallback: ${luaErr.message}`);
      }
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

  static TRANSFER_LUA = `
local function parse_user(raw)
    if not raw or raw == '' then return { silver = 0, gold = 0, diamond = 0 } end
    local ok, parsed = pcall(cjson.decode, raw)
    if ok and type(parsed) == 'table' then return parsed end
    return nil
end

local rawFrom = redis.call('GET', KEYS[1])
local rawTo   = redis.call('GET', KEYS[2])
local userFrom = parse_user(rawFrom)
local userTo   = parse_user(rawTo)

if not userFrom or not userTo then
    return cjson.encode({ ok = false, error = 'CORRUPTED_USER_DATA' })
end

local currency = ARGV[1]
local amount = tonumber(ARGV[2])

if not amount or amount <= 0 or amount ~= math.floor(amount) then
    return cjson.encode({ ok = false, error = 'INVALID_AMOUNT' })
end

local currentFrom = tonumber(userFrom[currency] or 0)
if currentFrom < amount then
    return cjson.encode({ ok = false, error = 'INSUFFICIENT_FUNDS', balance = userFrom })
end

local currentTo = tonumber(userTo[currency] or 0)

userFrom[currency] = math.max(0, math.floor(currentFrom - amount))
userTo[currency]   = math.max(0, math.floor(currentTo + amount))

local okFrom, encFrom = pcall(cjson.encode, userFrom)
local okTo, encTo     = pcall(cjson.encode, userTo)

if not okFrom or not okTo then
    return cjson.encode({ ok = false, error = 'ENCODE_FAILURE' })
end

-- Commit atomic updates with explicit rollback compensation if second write fails
local ok1, err1 = pcall(redis.call, 'SET', KEYS[1], encFrom)
if not ok1 then
    return cjson.encode({ ok = false, error = 'REDIS_RUNTIME_ERROR_FROM', details = tostring(err1) })
end

local ok2, err2 = pcall(redis.call, 'SET', KEYS[2], encTo)
if not ok2 then
    -- ROLLBACK KEYS[1] to rawFrom to preserve Conservation of Money!
    local rollOk, rollErr = pcall(function()
        if rawFrom then
            local okKeepttl = pcall(redis.call, 'SET', KEYS[1], rawFrom, 'KEEPTTL')
            if not okKeepttl then
                redis.call('SET', KEYS[1], rawFrom)
            end
        else
            redis.call('DEL', KEYS[1])
        end
    end)
    if not rollOk then
        return cjson.encode({ ok = false, error = 'CRITICAL_ROLLBACK_FAILED', details = tostring(err2), rollbackDetails = tostring(rollErr) })
    end
    return cjson.encode({ ok = false, error = 'REDIS_RUNTIME_ERROR_TO_ROLLED_BACK', details = tostring(err2) })
end

pcall(redis.call, 'SADD', KEYS[3], ARGV[3])
pcall(redis.call, 'SADD', KEYS[3], ARGV[4])

return cjson.encode({ ok = true, fromBalance = userFrom, toBalance = userTo })
`;

  async transferBalance(guildId, fromUserId, toUserId, currency, amount) {
    const val = Math.floor(Number(amount));
    if (!Number.isFinite(val) || val <= 0) {
      return { ok: false, error: 'INVALID_AMOUNT' };
    }
    if (fromUserId === toUserId) {
      return { ok: false, error: 'SELF_TRANSFER' };
    }

    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._ensureEconUserKeyMigrated(guildId, fromUserId);
      await this._ensureEconUserKeyMigrated(guildId, toUserId);
      const memberIndexKey = this._k.economyMembers(guildId);
      const fromKey = this._k.economy(guildId, fromUserId);
      const toKey = this._k.economy(guildId, toUserId);
      try {
        const rawRes = await this._redis.eval(
          StateStore.TRANSFER_LUA,
          3,
          fromKey,
          toKey,
          memberIndexKey,
          currency,
          String(val),
          fromUserId,
          toUserId
        );
        const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
        if (parsed && typeof parsed.ok === 'boolean') {
          if (!parsed.ok && parsed.error === 'CRITICAL_ROLLBACK_FAILED') {
            console.error(`[stateStore] CRITICAL AUDIT: Compensation rollback failed between ${fromUserId} and ${toUserId} in guild ${guildId}:`, parsed);
          }
          return parsed;
        }
      } catch (luaErr) {
        console.warn(`[stateStore] transferBalance Lua fallback: ${luaErr.message}`);
      }
    }

    const [firstId, secondId] = [fromUserId, toUserId].sort();
    return this._withEconomyLock(guildId, firstId, () => {
      return this._withEconomyLock(guildId, secondId, async () => {
        if (this._useRedis) {
          const fromUser = await this._redisGetEconUser(guildId, fromUserId);
          const currentFrom = fromUser[currency] ?? 0;
          if (currentFrom < val) return { ok: false, error: 'INSUFFICIENT_FUNDS', balance: { ...fromUser } };
          const toUser = await this._redisGetEconUser(guildId, toUserId);
          fromUser[currency] = Math.max(0, Math.floor(currentFrom - val));
          toUser[currency] = Math.max(0, Math.floor((toUser[currency] ?? 0) + val));
          const memberIndexKey = this._k.economyMembers(guildId);
          await this._redis.pipeline([
            ['SADD', memberIndexKey, fromUserId],
            ['SADD', memberIndexKey, toUserId],
            ['SET', this._k.economy(guildId, fromUserId), JSON.stringify(fromUser)],
            ['SET', this._k.economy(guildId, toUserId), JSON.stringify(toUser)],
          ]);
          return { ok: true, fromBalance: { ...fromUser }, toBalance: { ...toUser } };
        }

        const guild = await this._fileGetGuild(guildId);
        guild.economy.users[fromUserId] ??= DEFAULT_ECONOMY_USER();
        guild.economy.users[toUserId]   ??= DEFAULT_ECONOMY_USER();
        const fromUser = guild.economy.users[fromUserId];
        const currentFrom = fromUser[currency] ?? 0;
        if (currentFrom < val) return { ok: false, error: 'INSUFFICIENT_FUNDS', balance: { ...fromUser } };
        const toUser = guild.economy.users[toUserId];
        fromUser[currency] = Math.max(0, Math.floor(currentFrom - val));
        toUser[currency] = Math.max(0, Math.floor((toUser[currency] ?? 0) + val));
        await this._save();
        return { ok: true, fromBalance: { ...fromUser }, toBalance: { ...toUser } };
      });
    });
  }

  static SET_LUA = `
local raw = redis.call('GET', KEYS[1])
local user = raw and cjson.decode(raw) or { silver = 0, gold = 0, diamond = 0 }
local currency = ARGV[1]
local amount = tonumber(ARGV[2])
user[currency] = math.max(0, math.floor(amount))
local updated = cjson.encode(user)
redis.call('SET', KEYS[1], updated)
redis.call('SADD', KEYS[2], ARGV[3])
return updated
`;

  static CLAIM_DAILY_LUA = `
local raw = redis.call('GET', KEYS[1])
local user = raw and cjson.decode(raw) or { silver = 0, gold = 0, diamond = 0 }
local todayKey = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local silver = tonumber(ARGV[3]) or 0
local gold = tonumber(ARGV[4]) or 0
local diamond = tonumber(ARGV[5]) or 0

if user.lastDailyDay == todayKey then
    return cjson.encode({ claimed = false, user = user })
end

user.silver = (user.silver or 0) + silver
user.gold = (user.gold or 0) + gold
user.diamond = (user.diamond or 0) + diamond
user.lastDailyAt = now
user.lastDailyDay = todayKey

local updated = cjson.encode(user)
redis.call('SET', KEYS[1], updated)
redis.call('SADD', KEYS[2], ARGV[6])

return cjson.encode({ claimed = true, user = user })
`;

  async setBalance(guildId, userId, currency, amount) {
    const val = Math.max(0, Math.floor(Number(amount)));
    if (!Number.isFinite(val)) {
      return this.getBalance(guildId, userId);
    }

    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._ensureEconUserKeyMigrated(guildId, userId);
      const memberIndexKey = this._k.economyMembers(guildId);
      const userKey = this._k.economy(guildId, userId);
      try {
        const rawRes = await this._redis.eval(
          StateStore.SET_LUA,
          2,
          userKey,
          memberIndexKey,
          currency,
          String(val),
          userId
        );
        const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
        if (parsed) return parsed;
      } catch (luaErr) {
        console.warn(`[stateStore] setBalance Lua fallback: ${luaErr.message}`);
      }
    }

    return this._withEconomyLock(guildId, userId, async () => {
      const guild = await this._fileGetGuild(guildId);
      guild.economy.users[userId] ??= DEFAULT_ECONOMY_USER();
      const user = guild.economy.users[userId];
      user[currency] = val;
      await this._save();
      return { ...user };
    });
  }

  async claimDaily(guildId, userId, rewards, options = {}) {
    const utcOffsetMinutes = Number.isFinite(options.utcOffsetMinutes)
      ? options.utcOffsetMinutes : 420;
    const now      = Date.now();
    const todayKey = dayKeyForOffset(now, utcOffsetMinutes);
    const nextAt   = nextDayStartForOffset(todayKey, utcOffsetMinutes);

    if (this._useRedis) {
      await this._registerGuild(guildId);
      await this._ensureEconUserKeyMigrated(guildId, userId);
      const memberIndexKey = this._k.economyMembers(guildId);
      const userKey = this._k.economy(guildId, userId);
      try {
        const rawRes = await this._redis.eval(
          StateStore.CLAIM_DAILY_LUA,
          2,
          userKey,
          memberIndexKey,
          String(todayKey),
          String(now),
          String(rewards.silver ?? 0),
          String(rewards.gold ?? 0),
          String(rewards.diamond ?? 0),
          userId
        );
        const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
        if (parsed && typeof parsed.claimed === 'boolean') {
          return { claimed: parsed.claimed, nextAt, balance: parsed.user ?? {} };
        }
      } catch (luaErr) {
        console.warn(`[stateStore] claimDaily Lua fallback: ${luaErr.message}`);
      }
    }

    return this._withEconomyLock(guildId, userId, async () => {
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
    const memberIndexKey = this._k.economyMembers(guildId);
    let memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];
    const legacyMemberKey = `guild:${guildId}:economy:_members`;
    const legacyMemberIds = (await this._redis.smembers(legacyMemberKey)) ?? [];
    if (legacyMemberIds.length) {
      await this._redis.sadd(memberIndexKey, ...legacyMemberIds).catch(() => null);
      await this._redis.del(legacyMemberKey).catch(() => null);
      memberIds = Array.from(new Set([...memberIds, ...legacyMemberIds]));
    }

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
    const memberIndexKey = this._k.economyMembers(guildId);
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

  async addXp(guildId, userId, amount, xpBase = 100, xpExponent = 2.0) {
    return this._withEconomyLock(guildId, userId, async () => {
      const now = Date.now();
      const base = xpBase > 0 ? xpBase : 100;
      const exponent = xpExponent > 0 ? xpExponent : 2.0;

      if (this._useRedis) {
        const memberIndexKey = `guild:${guildId}:levels:_members`;
        const key  = this._k.levels(guildId, userId);
        let current = (await this._rGet(key)) ?? DEFAULT_LEVELS_USER();
        if (now - current.lastMessageAt < 60_000) {
          return { ...current, changed: false, leveledUp: false };
        }
        current.lastMessageAt = now;
        current.xp += amount;
        const nextLevel = Math.floor(Math.pow(current.xp / base, 1 / exponent));
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
      const nextLevel = Math.floor(Math.pow(current.xp / base, 1 / exponent));
      const leveledUp = nextLevel > current.level;
      current.level = Math.max(current.level, nextLevel);
      await this._save();
      return { ...current, changed: true, leveledUp };
    });
  }

  async getRank(guildId, userId, xpBase = 100, xpExponent = 2.0) {
    let current;
    if (this._useRedis) {
      current = (await this._rGet(this._k.levels(guildId, userId))) ?? DEFAULT_LEVELS_USER();
    } else {
      const guild = await this._fileGetGuild(guildId);
      current = guild.levels[userId] ?? DEFAULT_LEVELS_USER();
    }
    const base = xpBase > 0 ? xpBase : 100;
    const exponent = xpExponent > 0 ? xpExponent : 2.0;
    current.level = Math.floor(Math.pow(current.xp / base, 1 / exponent));
    return current;
  }

  async getLeaderboard(guildId, limit = 10, xpBase = 100, xpExponent = 2.0) {
    let entries = [];
    if (!this._useRedis) {
      const guild = await this._fileGetGuild(guildId);
      entries = Object.entries(guild.levels)
        .map(([userId, data]) => ({ userId, ...data }));
    } else {
      // Tương tự economy — dùng member index
      const memberIndexKey = `guild:${guildId}:levels:_members`;
      const memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];

      entries = await Promise.all(
        memberIds.map(async (userId) => {
          const data = (await this._rGet(this._k.levels(guildId, userId))) ?? DEFAULT_LEVELS_USER();
          return { userId, ...data };
        })
      );
    }

    const base = xpBase > 0 ? xpBase : 100;
    const exponent = xpExponent > 0 ? xpExponent : 2.0;
    for (const entry of entries) {
      entry.level = Math.floor(Math.pow(entry.xp / base, 1 / exponent));
    }

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

  // ── Duolingo Language Learning stats ─────────────────────────────────────────
  async getDuolingoStats(guildId, userId, utcOffsetMinutes = 0) {
    const key = `duolingo:stats:${guildId}:${userId}`;
    let stats;
    if (this._useRedis) {
      const val = await this._redis.get(key);
      stats = val ? JSON.parse(val) : { xp: 0, streak: 0, lastActiveDate: null };
    } else {
      const state = await readJsonFile(this._filePath) || {};
      stats = state[`duolingo_stats_${guildId}_${userId}`] || { xp: 0, streak: 0, lastActiveDate: null };
    }

    // Normalize streak: if the user missed yesterday and today, streak resets to 0
    if (stats.lastActiveDate) {
      const today = getDayKey(utcOffsetMinutes);
      const yesterday = getPreviousDayKey(utcOffsetMinutes);
      if (stats.lastActiveDate !== today && stats.lastActiveDate !== yesterday) {
        stats.streak = 0;
        // Save the reset streak back to the DB to avoid repeatedly evaluating it
        await this.saveDuolingoStats(guildId, userId, stats);
      }
    } else {
      stats.streak = 0;
    }

    return stats;
  }

  async saveDuolingoStats(guildId, userId, stats) {
    const key = `duolingo:stats:${guildId}:${userId}`;
    const memberIndexKey = `guild:${guildId}:duolingo:_members`;
    if (this._useRedis) {
      await this._redis.pipeline([
        ['SADD', 'guild:index', guildId],
        ['SADD', memberIndexKey, userId],
        ['SET', key, JSON.stringify(stats)]
      ]);
      return stats;
    }
    const state = await readJsonFile(this._filePath) || {};
    state[`duolingo_stats_${guildId}_${userId}`] = stats;
    state[`guild_duolingo_members_${guildId}`] ??= [];
    if (!state[`guild_duolingo_members_${guildId}`].includes(userId)) {
      state[`guild_duolingo_members_${guildId}`].push(userId);
    }
    fs.writeFileSync(this._filePath, JSON.stringify(state, null, 2), 'utf8');
    return stats;
  }

  async getDuolingoLeaderboard(guildId, limit = 10, utcOffsetMinutes = 0) {
    if (!this._useRedis) {
      const state = await readJsonFile(this._filePath) || {};
      const memberIds = state[`guild_duolingo_members_${guildId}`] || [];
      const entries = [];
      for (const userId of memberIds) {
        const stats = await this.getDuolingoStats(guildId, userId, utcOffsetMinutes);
        entries.push({ userId, xp: stats.xp, streak: stats.streak });
      }
      return entries.sort((a, b) => b.xp - a.xp).slice(0, limit);
    }

    const memberIndexKey = `guild:${guildId}:duolingo:_members`;
    const memberIds = (await this._redis.smembers(memberIndexKey)) ?? [];
    const entries = await Promise.all(
      memberIds.map(async (userId) => {
        const stats = await this.getDuolingoStats(guildId, userId, utcOffsetMinutes);
        return { userId, xp: stats.xp, streak: stats.streak };
      })
    );
    return entries.sort((a, b) => b.xp - a.xp).slice(0, limit);
  }

  // ── Duolingo history ──────────────────────────────────────────────────────────
  async getDuolingoHistory(guildId, userId) {
    const key = `duolingo:history:${guildId}:${userId}`;
    if (this._useRedis) {
      const val = await this._redis.get(key);
      return val ? JSON.parse(val) : [];
    }
    const state = await readJsonFile(this._filePath) || {};
    return state[`duolingo_history_${guildId}_${userId}`] || [];
  }

  async pushDuolingoHistory(guildId, userId, entry) {
    const key = `duolingo:history:${guildId}:${userId}`;
    const history = await this.getDuolingoHistory(guildId, userId);
    history.unshift(entry);
    const limited = history.slice(0, 10); // cap at last 10 lessons

    if (this._useRedis) {
      await this._redis.set(key, JSON.stringify(limited));
      return limited;
    }
    const state = await readJsonFile(this._filePath) || {};
    state[`duolingo_history_${guildId}_${userId}`] = limited;
    fs.writeFileSync(this._filePath, JSON.stringify(state, null, 2), 'utf8');
    return limited;
  }

  // ── Duolingo questions database ────────────────────────────────────────────────
  async getDuolingoQuestions(lang, level) {
    const key = `duolingo:questions:${lang}:${level}`;
    if (this._useRedis) {
      const val = await this._redis.get(key).catch(() => null);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch (err) {
          console.error(`[StateStore] Failed to parse duolingo questions for ${lang}:${level}:`, err);
        }
      }
    }
    return [];
  }

  async setDuolingoQuestions(lang, level, questions) {
    const key = `duolingo:questions:${lang}:${level}`;
    if (this._useRedis) {
      await this._redis.set(key, JSON.stringify(questions));
    }
  }

  // ── Real-time Analytics & Telemetry Tracking ─────────────────────────────────
  async recordTelemetryEvent(guildId, userId, commandName, category = 'general') {
    if (!guildId) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
    const hourStr = `${String(now.getHours()).padStart(2, '0')}:00`;

    const cat = String(category || '').toLowerCase();
    const cmd = String(commandName || '').toLowerCase();

    const isEconomy = ['economy', 'games', 'daily', 'balance', 'pay', 'blackjack', 'slots', 'poker'].includes(cat) ||
      ['balance', 'daily', 'pay', 'blackjack', 'slots', 'coinflip', 'poker'].includes(cmd);
    const isMod = ['moderation', 'ticket'].includes(cat) ||
      ['warn', 'kick', 'ban', 'mute', 'unmute', 'purge', 'ticket'].includes(cmd);

    if (this._useRedis) {
      try {
        const pipeline = [
          ['HINCRBY', `telemetry:guild:${guildId}:daily:${dateStr}`, 'commands', 1],
          ['HINCRBY', `telemetry:global:daily:${dateStr}`, 'commands', 1],
          ['INCR', `telemetry:global:monthly:${monthStr}`],
          ['HINCRBY', `telemetry:guild:${guildId}:active_hours`, hourStr, 1]
        ];
        if (cmd) {
          pipeline.push(['HINCRBY', `telemetry:guild:${guildId}:daily:${dateStr}`, `cmd:${cmd}`, 1]);
        }
        if (isEconomy) {
          pipeline.push(['HINCRBY', `telemetry:guild:${guildId}:daily:${dateStr}`, 'economy', 1]);
        }
        if (isMod) {
          pipeline.push(['HINCRBY', `telemetry:guild:${guildId}:daily:${dateStr}`, 'moderation', 1]);
        }
        if (userId) {
          pipeline.push(['SADD', `telemetry:guild:${guildId}:users:${dateStr}`, String(userId)]);
        }
        await this._redis.pipeline(pipeline);

        import('./bot/logging.js').then(({ pushLiveLog }) => {
          pushLiveLog(this._redis, {
            type: 'CMD',
            message: `Telemetry registered /${cmd || 'command'} (${cat || 'general'})`,
            metadata: guildId
          }).catch(() => null);
        }).catch(() => null);
      } catch (err) {
        /* non-fatal telemetry error */
      }
    } else {
      try {
        const state = (await readJsonFile(this._filePath)) || {};
        state.telemetry ??= {};
        state.telemetry[guildId] ??= {};
        state.telemetry[guildId][dateStr] ??= { commands: 0, economy: 0, moderation: 0, commandsMap: {} };
        const d = state.telemetry[guildId][dateStr];
        d.commands = (d.commands || 0) + 1;
        if (cmd) {
          d.commandsMap[cmd] = (d.commandsMap[cmd] || 0) + 1;
        }
        if (isEconomy) d.economy = (d.economy || 0) + 1;
        if (isMod) d.moderation = (d.moderation || 0) + 1;

        state.telemetry_global ??= {};
        state.telemetry_global[dateStr] = (state.telemetry_global[dateStr] || 0) + 1;

        fs.writeFileSync(this._filePath, JSON.stringify(state, null, 2), 'utf8');
      } catch { /* non-fatal */ }
    }
  }

  // ── Music Queue Persistence (TTL 2h) ─────────────────────────────────────────
  async saveMusicQueue(guildId, queueData) {
    if (!guildId) return;
    const key = this._k.musicQueue(guildId);
    if (this._useRedis) {
      if (!queueData || !queueData.tracks || queueData.tracks.length === 0) {
        await this._rDel(key);
      } else {
        await this._redis.set(key, JSON.stringify(queueData), 'EX', 7200); // 2 hours TTL
      }
      return;
    }
    const guild = await this._fileGetGuild(guildId);
    guild.musicQueue = queueData;
    await this._save();
  }

  async getMusicQueue(guildId) {
    if (!guildId) return null;
    if (this._useRedis) {
      return this._rGet(this._k.musicQueue(guildId));
    }
    const guild = await this._fileGetGuild(guildId);
    return guild.musicQueue ?? null;
  }

  async clearMusicQueue(guildId) {
    if (!guildId) return;
    if (this._useRedis) {
      await this._rDel(this._k.musicQueue(guildId));
      return;
    }
    const guild = await this._fileGetGuild(guildId);
    delete guild.musicQueue;
    await this._save();
  }

}
// getGuild() đã bị xoá (deprecated từ v1.3, không còn caller nào).
// Dùng các method cụ thể: getEconomyUser, getLevels, getWarnings, ...
