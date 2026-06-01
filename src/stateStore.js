/**
 * stateStore.js
 *
 * Persistent storage with two backends:
 *
 *   1. Upstash Redis (preferred) — survives redeploys on Render free plan.
 *      Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 *
 *   2. Local JSON file (fallback) — used when Upstash env vars are absent.
 *      Works fine for local dev; loses data on Render free plan redeploys.
 *
 * The API is identical in both cases so the rest of the bot is unaffected.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

// ── Upstash Redis REST client (no extra npm packages needed) ─────────────────

class UpstashClient {
  constructor(url, token) {
    this.url   = url.replace(/\/$/, '');
    this.token = token;
  }

  _request(body) {
    return new Promise((resolve, reject) => {
      const parsed  = new URL(this.url);
      const payload = JSON.stringify(body);
      const req = https.request({
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: {
          Authorization:  `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            if (data.error) return reject(new Error(data.error));
            resolve(data.result);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('Upstash timeout')); });
      req.write(payload);
      req.end();
    });
  }

  async get(key) {
    const result = await this._request(['GET', key]);
    return result == null ? null : JSON.parse(result);
  }

  async set(key, value) {
    await this._request(['SET', key, JSON.stringify(value)]);
  }

  // Batch pipeline — array of [cmd, ...args]
  async pipeline(commands) {
    return new Promise((resolve, reject) => {
      const parsed  = new URL(this.url + '/pipeline');
      const payload = JSON.stringify(commands.map(cmd => cmd));
      const req = https.request({
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: {
          Authorization:  `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('Upstash pipeline timeout')); });
      req.write(payload);
      req.end();
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const dayMs = 24 * 60 * 60 * 1000;

function dayKeyForOffset(timestamp, utcOffsetMinutes) {
  return Math.floor((timestamp + utcOffsetMinutes * 60 * 1000) / dayMs);
}

function nextDayStartForOffset(dayKey, utcOffsetMinutes) {
  return (dayKey + 1) * dayMs - utcOffsetMinutes * 60 * 1000;
}

// ── StateStore ────────────────────────────────────────────────────────────────

export class StateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);

    const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (upstashUrl && upstashToken) {
      this._redis  = new UpstashClient(upstashUrl, upstashToken);
      this._useRedis = true;
      console.log('[StateStore] Using Upstash Redis for persistent storage.');
      this.ready = Promise.resolve();
    } else {
      this._useRedis = false;
      console.log('[StateStore] Upstash not configured — using local JSON file (data lost on redeploy).');
      this.cache = { guilds: {} };
      this._saveQueue = Promise.resolve();
      this.ready = this._loadFile();
    }
  }

  // ── Redis key helpers ──────────────────────────────────────────────────────

  _guildKey(guildId) { return `guild:${guildId}`; }
  _guildIndexKey() { return 'guild:index'; }

  async _redisGetGuild(guildId) {
    const data = await this._redis.get(this._guildKey(guildId));
    return data ?? { warnings: {}, levels: {}, tickets: { nextNumber: 1 }, economy: { users: {} }, gameSessions: { blackjack: {}, poker: {} }, lolAccounts: {}, tftAccounts: {} };
  }

  async _redisSaveGuild(guildId, guild) {
    await this._redis.pipeline([
      ['SADD', this._guildIndexKey(), guildId],
      ['SET', this._guildKey(guildId), JSON.stringify(guild)]
    ]);
  }

  async _redisListGuildIds() {
    return await this._redis._request(['SMEMBERS', this._guildIndexKey()]) ?? [];
  }

  // ── File fallback ──────────────────────────────────────────────────────────

  async _loadFile() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.cache = JSON.parse(await readFile(this.filePath, 'utf8'));
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

  // ── Guild accessor (works for both backends) ───────────────────────────────

  async getGuild(guildId) {
    if (this._useRedis) {
      // For Redis we return a live object; caller must call _redisSaveGuild to persist
      const guild = await this._redisGetGuild(guildId);
      guild.warnings      ??= {};
      guild.levels        ??= {};
      guild.tickets       ??= { nextNumber: 1 };
      guild.economy       ??= { users: {} };
      guild.economy.users ??= {};
      guild.gameSessions  ??= { blackjack: {}, poker: {} };
      guild.gameSessions.blackjack ??= {};
      guild.gameSessions.poker     ??= {};
      guild.lolAccounts   ??= {};
      guild.tftAccounts   ??= {};
      return guild;
    }

    await this.ready;
    this.cache.guilds[guildId] ??= {};
    const g = this.cache.guilds[guildId];
    g.warnings      ??= {};
    g.levels        ??= {};
    g.tickets       ??= { nextNumber: 1 };
    g.economy       ??= { users: {} };
    g.economy.users ??= {};
    g.gameSessions  ??= { blackjack: {}, poker: {} };
    g.gameSessions.blackjack ??= {};
    g.gameSessions.poker     ??= {};
    g.lolAccounts   ??= {};
    g.tftAccounts   ??= {};
    return g;
  }

  async _saveGuild(guildId, guild) {
    if (this._useRedis) {
      await this._redisSaveGuild(guildId, guild);
    } else {
      await this._save();
    }
  }

  // ── Game sessions ──────────────────────────────────────────────────────────

  async getGameSession(guildId, type, messageId) {
    const guild = await this.getGuild(guildId);
    return guild.gameSessions?.[type]?.[messageId] ?? null;
  }

  async setGameSession(guildId, type, messageId, session) {
    const guild = await this.getGuild(guildId);
    guild.gameSessions[type] ??= {};
    guild.gameSessions[type][messageId] = session;
    await this._saveGuild(guildId, guild);
    return session;
  }

  async deleteGameSession(guildId, type, messageId) {
    const guild = await this.getGuild(guildId);
    if (guild.gameSessions?.[type]) {
      delete guild.gameSessions[type][messageId];
      await this._saveGuild(guildId, guild);
    }
  }

  _refundGameSessionInGuild(guild, type, messageId) {
    const session = guild.gameSessions?.[type]?.[messageId];
    if (!session || session.status !== 'active') {
      if (guild.gameSessions?.[type]?.[messageId]) {
        delete guild.gameSessions[type][messageId];
        return { refunded: false, deleted: true };
      }
      return { refunded: false, deleted: false };
    }

    let refunded = false;
    if (type === 'blackjack' && Array.isArray(session.players)) {
      for (const player of session.players) {
        const totalBet = player.hands
          ? player.hands.reduce((sum, h) => sum + (h.bet ?? 0), 0)
          : (player.bet ?? 0);
        if (totalBet > 0 && player.userId && session.currency) {
          this._getEconomyUser(guild, player.userId);
          guild.economy.users[player.userId][session.currency] = Math.max(0,
            Math.floor((guild.economy.users[player.userId][session.currency] ?? 0) + totalBet));
          refunded = true;
        }
      }
    } else if (type === 'poker' && session.userId && session.bet > 0 && session.currency) {
      this._getEconomyUser(guild, session.userId);
      guild.economy.users[session.userId][session.currency] = Math.max(0,
        Math.floor((guild.economy.users[session.userId][session.currency] ?? 0) + session.bet));
      refunded = true;
    }

    delete guild.gameSessions[type][messageId];
    return { refunded, deleted: true };
  }

  async refundAndDeleteGameSession(guildId, type, messageId) {
    const guild = await this.getGuild(guildId);
    const result = this._refundGameSessionInGuild(guild, type, messageId);
    if (result.deleted || result.refunded) {
      await this._saveGuild(guildId, guild);
    }
    return result;
  }

  async purgeStaleGameSessions(maxAgeMs = 6 * 60 * 60 * 1000) {
    // For Redis: load all guild keys and check each
    // For file: iterate cache
    await this.ready;
    const now = Date.now();
    let dirty = false;

    const processGuilds = async (guildEntries) => {
      for (const [guildId, guild] of guildEntries) {
        if (!guild.gameSessions) continue;
        let guildDirty = false;

        for (const type of ['blackjack', 'poker']) {
          const sessions = guild.gameSessions[type] ?? {};
          for (const [messageId, session] of Object.entries(sessions)) {
            if (!session || session.status !== 'active') {
              delete guild.gameSessions[type][messageId];
              guildDirty = true;
              continue;
            }
            const age = session.createdAt ? now - session.createdAt : maxAgeMs + 1;
            if (age < maxAgeMs) continue;

            this._refundGameSessionInGuild(guild, type, messageId);
            guildDirty = true;
            console.log(`[StateStore] Purged stale ${type} session ${messageId} in guild ${guildId}`);
          }
        }

        if (guildDirty) {
          await this._saveGuild(guildId, guild);
          dirty = true;
        }
      }
    };

    if (this._useRedis) {
      const guildIds = await this._redisListGuildIds();
      const guildEntries = await Promise.all(guildIds.map(async (guildId) => [guildId, await this._redisGetGuild(guildId)]));
      await processGuilds(guildEntries);
      return;
    }

    await processGuilds(Object.entries(this.cache.guilds ?? {}));
    if (dirty) await this._save();
  }

  // ── Economy helpers ────────────────────────────────────────────────────────

  _getEconomyUser(guild, userId) {
    guild.economy.users[userId] ??= { silver: 0, gold: 0, diamond: 0, lastDailyAt: 0, lastDailyDay: null };
    guild.economy.users[userId].silver      ??= 0;
    guild.economy.users[userId].gold        ??= 0;
    guild.economy.users[userId].diamond     ??= 0;
    guild.economy.users[userId].lastDailyAt ??= 0;
    guild.economy.users[userId].lastDailyDay ??= null;
    return guild.economy.users[userId];
  }

  async getBalance(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return { ...this._getEconomyUser(guild, userId) };
  }

  async adjustBalance(guildId, userId, currency, amount) {
    const guild = await this.getGuild(guildId);
    const user  = this._getEconomyUser(guild, userId);
    user[currency] = Math.max(0, Math.floor((user[currency] ?? 0) + amount));
    await this._saveGuild(guildId, guild);
    return { ...user };
  }

  async setBalance(guildId, userId, currency, amount) {
    const guild = await this.getGuild(guildId);
    const user  = this._getEconomyUser(guild, userId);
    user[currency] = Math.max(0, Math.floor(amount));
    await this._saveGuild(guildId, guild);
    return { ...user };
  }

  async claimDaily(guildId, userId, rewards, options = {}) {
    const guild = await this.getGuild(guildId);
    const user  = this._getEconomyUser(guild, userId);
    const now   = Date.now();
    const utcOffsetMinutes = Number.isFinite(options.utcOffsetMinutes) ? options.utcOffsetMinutes : 420;
    const todayKey = dayKeyForOffset(now, utcOffsetMinutes);
    const nextAt   = nextDayStartForOffset(todayKey, utcOffsetMinutes);

    if (user.lastDailyDay === todayKey) {
      return { claimed: false, nextAt, balance: { ...user } };
    }

    user.silver       += rewards.silver  ?? 0;
    user.gold         += rewards.gold    ?? 0;
    user.diamond      += rewards.diamond ?? 0;
    user.lastDailyAt   = now;
    user.lastDailyDay  = todayKey;
    await this._saveGuild(guildId, guild);
    return { claimed: true, nextAt, balance: { ...user } };
  }

  async getEconomyLeaderboard(guildId, currency, limit = 10) {
    const guild = await this.getGuild(guildId);
    return Object.entries(guild.economy.users)
      .map(([userId, data]) => ({ userId, amount: data[currency] ?? 0 }))
      .filter(e => e.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  // ── Warnings ───────────────────────────────────────────────────────────────

  async addWarning(guildId, userId, moderatorId, reason) {
    const guild = await this.getGuild(guildId);
    guild.warnings[userId] ??= [];
    const warning = { id: `${Date.now()}`, moderatorId, reason, createdAt: new Date().toISOString() };
    guild.warnings[userId].push(warning);
    await this._saveGuild(guildId, guild);
    return warning;
  }

  async getWarnings(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return guild.warnings[userId] ?? [];
  }

  async clearWarnings(guildId, userId) {
    const guild = await this.getGuild(guildId);
    const count = guild.warnings[userId]?.length ?? 0;
    guild.warnings[userId] = [];
    await this._saveGuild(guildId, guild);
    return count;
  }

  // ── Levels / XP ───────────────────────────────────────────────────────────

  async addXp(guildId, userId, amount) {
    const guild = await this.getGuild(guildId);
    guild.levels[userId] ??= { xp: 0, level: 0, lastMessageAt: 0 };
    const current = guild.levels[userId];
    const now = Date.now();
    if (now - current.lastMessageAt < 60_000) {
      return { ...current, changed: false, leveledUp: false };
    }
    current.lastMessageAt = now;
    current.xp += amount;
    const nextLevel = Math.floor(Math.sqrt(current.xp / 100));
    const leveledUp = nextLevel > current.level;
    current.level   = Math.max(current.level, nextLevel);
    await this._saveGuild(guildId, guild);
    return { ...current, changed: true, leveledUp };
  }

  async getRank(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return guild.levels[userId] ?? { xp: 0, level: 0, lastMessageAt: 0 };
  }

  async getLeaderboard(guildId, limit = 10) {
    const guild = await this.getGuild(guildId);
    return Object.entries(guild.levels)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async nextTicketNumber(guildId) {
    const guild = await this.getGuild(guildId);
    guild.tickets.nextNumber ??= 1;
    const number = guild.tickets.nextNumber;
    guild.tickets.nextNumber += 1;
    await this._saveGuild(guildId, guild);
    return number;
  }

  // ── LoL linked accounts ────────────────────────────────────────────────────

  async linkLolAccount(guildId, userId, data) {
    const guild = await this.getGuild(guildId);
    guild.lolAccounts[userId] = {
      riotId: data.riotId, puuid: data.puuid, region: data.region,
      linkedAt: new Date().toISOString()
    };
    await this._saveGuild(guildId, guild);
  }

  async unlinkLolAccount(guildId, userId) {
    const guild = await this.getGuild(guildId);
    delete guild.lolAccounts[userId];
    await this._saveGuild(guildId, guild);
  }

  async getLinkedLolAccount(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return guild.lolAccounts?.[userId] ?? null;
  }

  async linkTftAccount(guildId, userId, data) {
    const guild = await this.getGuild(guildId);
    guild.tftAccounts[userId] = {
      riotId: data.riotId, puuid: data.puuid, region: data.region,
      linkedAt: new Date().toISOString()
    };
    await this._saveGuild(guildId, guild);
  }

  async unlinkTftAccount(guildId, userId) {
    const guild = await this.getGuild(guildId);
    delete guild.tftAccounts[userId];
    await this._saveGuild(guildId, guild);
  }

  async getLinkedTftAccount(guildId, userId) {
    const guild = await this.getGuild(guildId);
    return guild.tftAccounts?.[userId] ?? null;
  }
}
