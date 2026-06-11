const memoryStores = new Map();

function memoryRateLimit(key, windowMs, max) {
  const storeId = `${windowMs}:${max}`;
  let hits = memoryStores.get(storeId);
  if (!hits) {
    hits = new Map();
    memoryStores.set(storeId, hits);
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [entryKey, record] of hits.entries()) {
        if (record.resetAt <= now) hits.delete(entryKey);
      }
    }, Math.max(60_000, windowMs));
    cleanup.unref?.();
  }

  const now = Date.now();
  const record = hits.get(key);
  if (!record || record.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  record.count += 1;
  if (record.count > max) {
    return { allowed: false, retryAfterMs: record.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

async function redisRateLimit(redis, key, windowMs, max) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  // Dùng Lua script để INCR + EXPIRE atomic — tránh race condition khi
  // server crash sau INCR nhưng trước EXPIRE khiến key không bao giờ expire.
  const count = Number(
    await redis.eval(
      `local c = redis.call('INCR', KEYS[1])
       if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       return c`,
      1,        // numKeys
      key,      // KEYS[1]
      String(windowSec) // ARGV[1]
    )
  );

  if (count > max) {
    // Trả TTL thực của key để Retry-After chính xác thay vì luôn dùng windowMs cố định.
    let retryAfterMs = windowMs;
    try {
      const ttlSec = Number(await redis.ttl(key));
      if (ttlSec > 0) retryAfterMs = ttlSec * 1000;
    } catch {
      // Fallback về windowMs nếu TTL call fail
    }
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function createRateLimiter({ windowMs, max, keyPrefix = 'global', redis = null }) {
  return async function rateLimitMiddleware(req, res, next) {
    const key = `${keyPrefix}:${req.ip}:${req.session?.user?.id ?? 'anon'}`;

    let result = { allowed: true, retryAfterMs: 0 };
    if (redis) {
      try {
        result = await redisRateLimit(redis, `ratelimit:${key}`, windowMs, max);
      } catch (error) {
        console.warn('[rateLimit] Redis unavailable, falling back to memory:', error.message);
        result = memoryRateLimit(key, windowMs, max);
      }
    } else {
      result = memoryRateLimit(key, windowMs, max);
    }

    if (!result.allowed) {
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    next();
  };
}
