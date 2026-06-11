import crypto from 'node:crypto';

/**
 * Redis SET NX distributed lock (Upstash REST).
 *
 * Retry: bắt đầu ở 50 ms, exponential backoff × 1.5 mỗi lần, tối đa 400 ms.
 * Giảm từ 200 lần (25 ms × 200) xuống ~15–30 lần trong cùng window 5 s
 * → ít Upstash request hơn đáng kể so với fixed 25 ms polling.
 */
export async function withRedisLock(
  redis,
  lockKey,
  ttlSec,
  fn,
  { waitMs = 5_000, initialRetryMs = 50, maxRetryMs = 400 } = {}
) {
  const token    = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + waitMs;
  let   delay    = initialRetryMs;
  let   acquired = false;

  while (Date.now() < deadline) {
    const result = await redis.set(lockKey, token, 'NX', 'EX', String(ttlSec));
    if (result === 'OK') { acquired = true; break; }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxRetryMs);
  }

  if (!acquired) {
    throw new Error(`Could not acquire distributed lock: ${lockKey}`);
  }

  const LUA_RELEASE = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

  try {
    return await fn();
  } finally {
    await redis.eval(LUA_RELEASE, 1, lockKey, token).catch(() => null);
  }
}
