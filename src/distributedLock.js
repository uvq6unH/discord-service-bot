import crypto from 'node:crypto';

/**
 * Redis SET NX lock for multi-instance deployments (Upstash REST).
 */
export async function withRedisLock(redis, lockKey, ttlSec, fn, { waitMs = 5000, retryMs = 25 } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + waitMs;
  let acquired = false;

  while (Date.now() < deadline) {
    const result = await redis.set(lockKey, token, 'NX', 'EX', String(ttlSec));
    if (result === 'OK') {
      acquired = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }

  if (!acquired) {
    throw new Error(`Could not acquire distributed lock: ${lockKey}`);
  }

  try {
    return await fn();
  } finally {
    const luaScript = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
    await redis.eval(luaScript, 1, lockKey, token).catch(() => null);
  }
}
