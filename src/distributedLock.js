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
  { waitMs = 5_000, initialRetryMs = 50, maxRetryMs = 400, autoRenew = false } = {}
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
  const LUA_RENEW   = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("expire",KEYS[1],ARGV[2]) else return 0 end`;

  let renewalTimer = null;
  let leaseLost = false;

  if (autoRenew && ttlSec > 1) {
    const intervalMs = Math.max(500, Math.min(Math.floor((ttlSec * 1000) / 2), 2000));
    renewalTimer = setInterval(async () => {
      try {
        const res = await redis.eval(LUA_RENEW, 1, lockKey, token, String(ttlSec));
        if (res !== 1) {
          leaseLost = true;
          if (renewalTimer) clearInterval(renewalTimer);
        }
      } catch {
        // network error
      }
    }, intervalMs);
    renewalTimer.unref?.();
  }

  const FENCED_SET_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("set", KEYS[2], ARGV[2]) else return 0 end`;

  const lockContext = {
    token,
    lockKey,
    isLeaseValid: () => !leaseLost,
    assertLeaseValid: () => {
      if (leaseLost) {
        throw new Error(`Fencing violation: distributed lock lease was lost for ${lockKey}`);
      }
    },
    fencedSet: async (targetKey, targetValue) => {
      if (leaseLost) {
        throw new Error(`Fencing violation: cannot write ${targetKey} because lease for ${lockKey} was lost`);
      }
      const res = await redis.eval(FENCED_SET_LUA, 2, lockKey, targetKey, token, String(targetValue));
      if (res !== 'OK' && res !== 1) {
        leaseLost = true;
        throw new Error(`Fencing violation: write rejected because lock token for ${lockKey} expired or was overwritten`);
      }
      return res;
    },
  };

  try {
    return await fn(lockContext);
  } finally {
    if (renewalTimer) clearInterval(renewalTimer);
    await redis.eval(LUA_RELEASE, 1, lockKey, token).catch(() => null);
  }
}
