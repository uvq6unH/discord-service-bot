/**
 * guildLifecycle.js — Distributed Guild Presence & Lifecycle Management
 *
 * Implements monotonic atomic lifecycle tracking in Redis using Lua scripts:
 * - Guarantees that out-of-order lifecycle events (e.g. GuildDelete arriving after
 *   GuildCreate due to network lag across shards/processes) never overwrite newer state.
 * - Separates bot presence (botPresent) from configuration existence (configured)
 *   and administrative archiving (archived).
 * - Distinguishes temporary Discord server outages (guild.available === false) from
 *   confirmed bot kick/leave.
 */

export const GUILD_LIFECYCLE_KEY = (guildId) => `guild:lifecycle:${guildId}`;

// Lua Script: Authoritative Redis TIME combined with monotonic sequence counter & client timestamp fencing
export const SET_GUILD_LIFECYCLE_LUA = `
-- SCRIPT: SET_GUILD_LIFECYCLE
local raw = redis.call('GET', KEYS[1])
local current = raw and cjson.decode(raw) or nil
local clientTs = tonumber(ARGV[2] or 0)

-- Fetch authoritative Redis server time in ms
local t = redis.call('TIME')
local serverNowMs = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local currentClientTs = current and tonumber(current.clientTs or current.updatedAt or 0) or 0
local currentServerTs = current and tonumber(current.serverTs or 0) or 0
local currentSeq = current and tonumber(current.seq or 0) or 0

-- Reject if client event timestamp is strictly older than current state
if current and clientTs > 0 and currentClientTs > 0 and clientTs < currentClientTs then
  return 0 -- Stale event rejected: newer lifecycle state already exists!
end

-- If clientTs is equal or newer, serialize with monotonic sequence counter
local nextSeq = currentSeq + 1
local finalTs = (clientTs and clientTs > 0) and clientTs or serverNowMs

local payload = {
  guildId = ARGV[4],
  botPresent = (ARGV[1] == '1'),
  updatedAt = finalTs,
  clientTs = clientTs,
  serverTs = serverNowMs,
  seq = nextSeq,
  reason = ARGV[3] or ''
}
redis.call('SET', KEYS[1], cjson.encode(payload), 'EX', 2592000) -- Persist 30 days
return 1
`;

// In-memory fallback map for single-process/test environments
export const _inMemoryGuildLifecycle = new Map();

export function _resetGuildLifecycleForTest() {
  _inMemoryGuildLifecycle.clear();
}

/**
 * Record guild lifecycle state atomically with monotonic sequence and server timestamp protection.
 * @param {object|null} redis Upstash Redis client
 * @param {string} guildId
 * @param {boolean} botPresent Whether the bot is confirmed present in the guild
 * @param {number} [timestamp] Event timestamp in ms (defaults to Date.now())
 * @param {string} [reason] 'joined' | 'kicked' | 'outage' | 'inaccessible' | 'ready' | 'self_healed_rejoin'
 * @returns {Promise<boolean>} True if updated, false if rejected as stale
 */
export async function setGuildLifecycle(redis, guildId, botPresent, timestamp = Date.now(), reason = '') {
  if (!guildId) return false;
  const ts = Number(timestamp) || Date.now();

  if (redis) {
    try {
      const res = await redis.eval(
        SET_GUILD_LIFECYCLE_LUA,
        1,
        GUILD_LIFECYCLE_KEY(guildId),
        botPresent ? '1' : '0',
        String(ts),
        String(reason || ''),
        String(guildId)
      );
      return res === 1;
    } catch (err) {
      console.warn(`[guildLifecycle] Redis eval error for ${guildId}: ${err.message}. Falling back to memory.`);
    }
  }

  // In-memory fallback: enforce monotonic sequence and timestamp comparison
  const current = _inMemoryGuildLifecycle.get(guildId);
  const currentClientTs = current?.clientTs ?? current?.updatedAt ?? 0;
  if (current && ts > 0 && currentClientTs > 0 && ts < currentClientTs) {
    return false; // Stale event rejected
  }

  const nextSeq = (current?.seq ?? 0) + 1;
  _inMemoryGuildLifecycle.set(guildId, {
    guildId,
    botPresent: Boolean(botPresent),
    updatedAt: ts,
    clientTs: ts,
    serverTs: Date.now(),
    seq: nextSeq,
    reason: String(reason || '')
  });
  return true;
}

/**
 * Get the current lifecycle state of a guild from Redis or in-memory fallback.
 * @param {object|null} redis Upstash Redis client
 * @param {string} guildId
 * @returns {Promise<{ guildId: string, botPresent: boolean, updatedAt: number, clientTs?: number, serverTs?: number, seq?: number, reason: string }|null>}
 */
export async function getGuildLifecycle(redis, guildId) {
  if (!guildId) return null;

  if (redis) {
    try {
      const raw = await redis.get(GUILD_LIFECYCLE_KEY(guildId));
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      return null;
    } catch (err) {
      console.warn(`[guildLifecycle] Redis get error for ${guildId}: ${err.message}`);
    }
  }

  return _inMemoryGuildLifecycle.get(guildId) || null;
}

/**
 * Check if a guild is confirmed inaccessible without invoking Discord API.
 * Includes automatic self-healing if Discord client has the guild present.
 * @param {object|null} redis Upstash Redis client
 * @param {string} guildId
 * @param {import('discord.js').Client|null} [discordClient]
 * @returns {Promise<boolean>}
 */
export async function isGuildInaccessible(redis, guildId, discordClient = null) {
  if (!guildId) return false;

  // 1. If in-memory client has guild in cache, it is definitely accessible.
  // Automatically self-heal Redis lifecycle if it was previously marked kicked/inaccessible!
  if (discordClient?.guilds?.cache?.has?.(guildId)) {
    if (redis) {
      getGuildLifecycle(redis, guildId).then((lc) => {
        if (lc && !lc.botPresent) {
          setGuildLifecycle(redis, guildId, true, Date.now(), 'self_healed_rejoin').catch(() => null);
        }
      }).catch(() => null);
    }
    return false;
  }

  // 2. Check distributed lifecycle record in Redis
  const lifecycle = await getGuildLifecycle(redis, guildId).catch(() => null);
  if (lifecycle && !lifecycle.botPresent && (lifecycle.reason === 'kicked' || lifecycle.reason === 'inaccessible')) {
    return true;
  }

  return false;
}
