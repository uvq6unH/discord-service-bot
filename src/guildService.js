import crypto from 'crypto';

const DISCORD_API = 'https://discord.com/api/v10';
const SOFT_TTL_MS = 5 * 60 * 1000;      // 5 minutes
const HARD_TTL_SEC = 7 * 24 * 60 * 60;   // 7 days in Redis
const REVALIDATE_LEASE_SEC = 60;         // 60 seconds
const MUTEX_LEASE_SEC = 30;              // 30 seconds
const FETCH_TIMEOUT_MS = 10000;          // 10 seconds

// In-memory fallback registries when Redis is offline/undefined
const _guildCacheMem = new Map();
const _rateLimitMem = new Map();
const _revalidateLockMem = new Map();
const _mutexLockMem = new Map();

// Local process-level single-flight cache revalidation Map
const _pendingFetches = new Map();

let _lastVersion = 0;
function getNextMonotonicVersion() {
  const now = Date.now();
  if (now <= _lastVersion) {
    _lastVersion += 1;
  } else {
    _lastVersion = now;
  }
  return _lastVersion;
}

// Lua Script for Monotonic Cache Writes on Redis Hash (checks version field natively)
const WRITE_CACHE_LUA = `
local key = KEYS[1]
local version = tonumber(ARGV[1])
local data = ARGV[2]
local ttl = tonumber(ARGV[3])
local fetchedAt = ARGV[4]

local current_version = redis.call("hget", key, "version")
if not current_version or version > tonumber(current_version) then
    redis.call("hset", key, "version", version, "data", data, "fetchedAt", fetchedAt)
    redis.call("expire", key, ttl)
    return 1
else
    return 0
end
`;

// Lua Script for Atomic Lock Release (compare-and-delete)
const COMPARE_AND_DELETE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

function parseHash(flatArray) {
  if (!flatArray || !Array.isArray(flatArray)) return null;
  const obj = {};
  for (let i = 0; i < flatArray.length; i += 2) {
    obj[flatArray[i]] = flatArray[i + 1];
  }
  return obj.data ? obj : null;
}

export function createGuildService(redis) {
  // Helper to run Lua scripts on Upstash/Redis
  async function runLua(script, keys, args) {
    if (redis) {
      try {
        return await redis.eval(script, keys.length, ...keys, ...args);
      } catch (err) {
        console.error('[guildService] Lua script execution failed:', err.message);
        return 0;
      }
    }
    return 0;
  }

  // --- Lock Primitives ---

  async function acquireLock(lockKey, token, leaseSec) {
    if (redis) {
      try {
        const res = await redis.set(lockKey, token, 'EX', leaseSec, 'NX');
        return res === 'OK' || res === true || res === 1;
      } catch {
        return false;
      }
    }
    // Fallback in-memory
    const now = Date.now();
    const entry = _mutexLockMem.get(lockKey);
    if (entry && now < entry.expiresAt) return false;
    _mutexLockMem.set(lockKey, { token, expiresAt: now + leaseSec * 1000 });
    return true;
  }

  async function releaseLock(lockKey, token) {
    if (redis) {
      return await runLua(COMPARE_AND_DELETE_LUA, [lockKey], [token]);
    }
    // Fallback in-memory
    const entry = _mutexLockMem.get(lockKey);
    if (entry && entry.token === token) {
      _mutexLockMem.delete(lockKey);
      return true;
    }
    return false;
  }

  // --- Rate Limit Primitives ---

  async function isRateLimited(userId) {
    const key = `ratelimit:discord:guilds:${userId}`;
    if (redis) {
      try {
        const exists = await redis.get(key);
        return !!exists;
      } catch {
        return false;
      }
    }
    const expiresAt = _rateLimitMem.get(userId);
    return expiresAt ? Date.now() < expiresAt : false;
  }

  async function setRateLimit(userId, retryAfterSeconds) {
    const key = `ratelimit:discord:guilds:${userId}`;
    const ttl = Math.max(1, Math.ceil(retryAfterSeconds));
    if (redis) {
      try {
        await redis.set(key, '1', 'EX', ttl);
      } catch { /* ignore */ }
      return;
    }
    _rateLimitMem.set(userId, Date.now() + ttl * 1000);
  }

  // --- Cache Storage Helpers ---

  async function getCachedGuilds(userId) {
    const key = `auth:guilds:${userId}`;
    if (redis) {
      try {
        const raw = await redis._request(['HGETALL', key]);
        const res = parseHash(raw);
        if (res) {
          return {
            guilds: JSON.parse(res.data),
            version: Number(res.version ?? 0),
            fetchedAt: Number(res.fetchedAt ?? 0),
          };
        }
        return null;
      } catch (err) {
        console.warn(`[guildService] getCachedGuilds error: ${err.message}`);
        return null;
      }
    }
    // Fallback in-memory
    const entry = _guildCacheMem.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      _guildCacheMem.delete(userId);
      return null;
    }
    return entry.value;
  }

  async function setCachedGuilds(userId, guilds, version) {
    const key = `auth:guilds:${userId}`;
    const payload = {
      guilds,
      version,
      fetchedAt: Date.now()
    };
    const jsonStr = JSON.stringify(guilds);

    if (redis) {
      try {
        const args = [String(version), jsonStr, String(HARD_TTL_SEC), String(Date.now())];
        const res = await runLua(WRITE_CACHE_LUA, [key], args);
        return res === 1;
      } catch (err) {
        console.error(`[guildService] setCachedGuilds error: ${err.message}`);
        return false;
      }
    }
    // Fallback in-memory
    const entry = _guildCacheMem.get(userId);
    if (!entry || version > entry.value.version) {
      _guildCacheMem.set(userId, {
        value: payload,
        expiresAt: Date.now() + HARD_TTL_SEC * 1000
      });
      return true;
    }
    return false;
  }

  // --- Background Revalidation ---

  async function triggerBackgroundRevalidation(userId, accessToken, currentVersion) {
    const revalKey = `revalidate:guilds:${userId}`;
    const token = crypto.randomUUID();

    // Check rate limit first
    if (await isRateLimited(userId)) return;

    // Acquire revalidation lock
    const acquired = await acquireLock(revalKey, token, REVALIDATE_LEASE_SEC);
    if (!acquired) return; // another instance revalidating

    console.log(`[guildService] Triggering background revalidation for user ${userId}`);
    // Non-blocking background revalidation
    (async () => {
      try {
        // Fetch from Discord
        const guilds = await executeFetch(userId, accessToken);
        if (guilds) {
          const nextVersion = getNextMonotonicVersion();
          await setCachedGuilds(userId, guilds, nextVersion);
          console.log(`[guildService] Background revalidation completed for user ${userId}`);
        }
      } catch (err) {
        console.warn(`[guildService] Background revalidation error: ${err.message}`);
      } finally {
        await releaseLock(revalKey, token);
      }
    })();
  }

  // --- Raw Discord Fetch ---

  async function executeFetch(userId, accessToken) {
    // Process-level single flight deduplication
    if (_pendingFetches.has(userId)) {
      return _pendingFetches.get(userId);
    }

    const promise = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        });

        if (res.status === 429) {
          const retryAfter = parseFloat(res.headers.get('retry-after') ?? '5');
          console.warn(`[guildService] Discord 429 hit. Retry-After: ${retryAfter}s`);
          await setRateLimit(userId, retryAfter);
          throw new Error(`Discord Rate Limit (429), retry after ${retryAfter}s`);
        }

        if (!res.ok) {
          throw new Error(`Discord HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data;
      } finally {
        clearTimeout(t);
      }
    })();

    _pendingFetches.set(userId, promise);
    try {
      return await promise;
    } finally {
      _pendingFetches.delete(userId);
    }
  }

  // --- Authoritative Entry Point ---

  async function fetchAndCacheUserGuilds(userId, accessToken) {
    if (!userId) {
      return { status: 'error', guilds: [], error: 'UserId missing' };
    }

    // 1. Read Cache
    const cached = await getCachedGuilds(userId);
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age < SOFT_TTL_MS) {
        return { status: 'ready', guilds: cached.guilds };
      }
      // Soft-expired: trigger background revalidation (non-blocking) and return stale immediately
      triggerBackgroundRevalidation(userId, accessToken, cached.version);
      return { status: 'ready', guilds: cached.guilds };
    }

    // 2. Hard Miss (No Cache)
    // Check Rate limit key before lock
    if (await isRateLimited(userId)) {
      return { status: 'rate-limited', guilds: [] };
    }

    const lockKey = `lock:guilds:${userId}`;
    const token = crypto.randomUUID();

    // Try to acquire distributed lock
    const acquired = await acquireLock(lockKey, token, MUTEX_LEASE_SEC);
    if (!acquired) {
      // Return syncing state immediately (non-blocking)
      return { status: 'syncing', guilds: [], retryAfter: 2 };
    }

    try {
      const guilds = await executeFetch(userId, accessToken);
      const nextVersion = getNextMonotonicVersion();
      await setCachedGuilds(userId, guilds, nextVersion);
      return { status: 'ready', guilds };
    } catch (err) {
      console.warn(`[guildService] Fetch failed under lock for ${userId}: ${err.message}`);
      return { status: 'error', guilds: [], error: err.message };
    } finally {
      await releaseLock(lockKey, token);
    }
  }

  return {
    getCachedGuilds,
    setCachedGuilds,
    fetchAndCacheUserGuilds,
  };
}
