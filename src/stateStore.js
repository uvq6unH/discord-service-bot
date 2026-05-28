import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class StateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.cache = { guilds: {} };
    // Queue writes so concurrent saves don't interleave.
    this._saveQueue = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
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

  // Atomic write: write to .tmp then rename so a crash mid-write never
  // produces a truncated/corrupted JSON file.
  async _writeToDisk() {
    const tmp = `${this.filePath}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(this.cache, null, 2)}\n`, 'utf8');
    await rename(tmp, this.filePath);
  }

  // Serialise all saves through a queue so rapid concurrent calls don't race.
  save() {
    this._saveQueue = this._saveQueue
      .then(() => this._writeToDisk())
      .catch((err) => console.error('[StateStore] Save error:', err));
    return this._saveQueue;
  }

  async getGuild(guildId) {
    await this.ready;
    this.cache.guilds[guildId] ??= { warnings: {}, levels: {}, tickets: { nextNumber: 1 } };
    this.cache.guilds[guildId].warnings ??= {};
    this.cache.guilds[guildId].levels   ??= {};
    this.cache.guilds[guildId].tickets  ??= { nextNumber: 1 };
    return this.cache.guilds[guildId];
  }

  async addWarning(guildId, userId, moderatorId, reason) {
    const guild = await this.getGuild(guildId);
    guild.warnings[userId] ??= [];
    const warning = {
      id: `${Date.now()}`,
      moderatorId,
      reason,
      createdAt: new Date().toISOString()
    };
    guild.warnings[userId].push(warning);
    await this.save();
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
    await this.save();
    return count;
  }

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
    current.level = Math.max(current.level, nextLevel);
    await this.save();
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

  async nextTicketNumber(guildId) {
    const guild = await this.getGuild(guildId);
    guild.tickets.nextNumber ??= 1;
    const number = guild.tickets.nextNumber;
    guild.tickets.nextNumber += 1;
    await this.save();
    return number;
  }
}
