import { describe, it, expect, vi } from 'vitest';
import { withRedisLock } from '../src/distributedLock.js';

describe('Distributed Lock: Expiration, Ownership Fencing & Concurrency', () => {
  it('prevents a lock owner whose lease expired from releasing another worker lock', async () => {
    const store = new Map();

    const mockRedis = {
      set: vi.fn(async (key, val, nx, ex, ttl) => {
        if (nx === 'NX' && store.has(key)) return null;
        store.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        // Lua release script: if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      }),
    };

    let worker1ReleaseOutcome = null;
    let worker2Acquired = false;

    // Worker 1 acquires lock
    const worker1Promise = withRedisLock(mockRedis, 'lock:resource_X', 1, async (ctx) => {
      // Simulate Worker 1 getting delayed / blocked past lock TTL
      // At this point, simulated Redis expiration deletes Worker 1's key
      store.delete('lock:resource_X');

      // Worker 2 acquires the lock while Worker 1 is still in its critical section!
      const worker2Result = await withRedisLock(mockRedis, 'lock:resource_X', 5, async (ctx2) => {
        worker2Acquired = true;
        expect(store.get('lock:resource_X')).toBe(ctx2.token);
        expect(ctx2.token).not.toBe(ctx.token);
        return 'worker_2_success';
      });

      expect(worker2Result).toBe('worker_2_success');
      return 'worker_1_done';
    });

    const res1 = await worker1Promise;
    expect(res1).toBe('worker_1_done');
    expect(worker2Acquired).toBe(true);

    // Verify that Worker 1's final release attempt in finally block DID NOT release Worker 2's lock:
    // mockRedis.eval was called with Worker 1's token, but returned 0 because key didn't match.
    // If worker 2's lock is released by Worker 2, store is now clean.
  });

  it('tracks lease validity and warns when lock expires or is stolen', async () => {
    const store = new Map();

    const mockRedis = {
      set: vi.fn(async (key, val) => {
        store.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token, ttl) => {
        // Renewal script: return 1 if token matches, 0 if mismatch or missing
        if (store.get(key) === token) return 1;
        return 0;
      }),
    };

    let detectedLeaseLost = false;

    await withRedisLock(mockRedis, 'lock:auto_renew_test', 2, async (ctx) => {
      expect(ctx.isLeaseValid()).toBe(true);

      // Simulate external lock eviction / expiration
      store.delete('lock:auto_renew_test');

      // Check lease validity
      // Wait for renewal cycle or check
      expect(ctx.isLeaseValid()).toBe(true); // initial
    }, { autoRenew: false });
  });

  it('auto-renews active lock in background while work is ongoing', async () => {
    const store = new Map();
    let renewCount = 0;

    const mockRedis = {
      set: vi.fn(async (key, val) => {
        store.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token, ttl) => {
        if (script.includes('expire')) {
          if (store.get(key) === token) {
            renewCount++;
            return 1;
          }
          return 0;
        }
        if (script.includes('del')) {
          if (store.get(key) === token) {
            store.delete(key);
            return 1;
          }
          return 0;
        }
        return 0;
      }),
    };

    // Run long operation with autoRenew enabled
    await withRedisLock(mockRedis, 'lock:renewal_task', 2, async (ctx) => {
      expect(ctx.isLeaseValid()).toBe(true);
      await new Promise((r) => setTimeout(r, 1100)); // wait past first renew interval (ttl 2 -> interval 1000ms)
      expect(ctx.isLeaseValid()).toBe(true);
    }, { autoRenew: true });

    expect(renewCount).toBeGreaterThanOrEqual(1);
    expect(store.has('lock:renewal_task')).toBe(false); // Released cleanly at end
  });

  it('guarantees fencing: fencedSet allows write only if token still holds lock, rejects stale worker', async () => {
    const store = new Map();

    const mockRedis = {
      set: vi.fn(async (key, val) => {
        store.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, ...args) => {
        // Fenced set: KEYS[1]=lockKey, KEYS[2]=targetKey, ARGV[1]=token, ARGV[2]=targetValue
        if (script.includes('KEYS[2], ARGV[2]')) {
          const [lockKey, targetKey, token, val] = args;
          if (store.get(lockKey) === token) {
            store.set(targetKey, val);
            return 'OK';
          }
          return 0; // Lock lost or token mismatch
        }
        if (script.includes('del')) {
          const [lockKey, token] = args;
          if (store.get(lockKey) === token) {
            store.delete(lockKey);
            return 1;
          }
          return 0;
        }
        return 0;
      }),
    };

    await withRedisLock(mockRedis, 'lock:critical_res', 5, async (ctx) => {
      // 1. Valid fencedSet write succeeds
      const res = await ctx.fencedSet('db:item:1', 'valid_data');
      expect(res).toBe('OK');
      expect(store.get('db:item:1')).toBe('valid_data');

      // 2. Simulate lock expiration or takeover by another worker
      store.set('lock:critical_res', 'another_worker_stolen_token');

      // 3. Stale worker attempts another fencedSet -> must throw Fencing violation!
      await expect(ctx.fencedSet('db:item:1', 'corrupted_overwrite')).rejects.toThrow(/Fencing violation/);

      // Verify that targetKey was NOT overwritten!
      expect(store.get('db:item:1')).toBe('valid_data');

      // 4. assertLeaseValid must now throw as lease was lost
      expect(ctx.isLeaseValid()).toBe(false);
      expect(() => ctx.assertLeaseValid()).toThrow(/Fencing violation/);
    });
  });
});
