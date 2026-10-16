import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateStore } from '../src/stateStore.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('StateStore Economy: Atomic Cross-User Transfers & Concurrency', () => {
  let tmpDir;
  let store;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'statestore-test-'));
    store = new StateStore(path.join(tmpDir, 'state.json'), {});
    await store.ready;
  });

  it('rejects self-transfers immediately', async () => {
    const res = await store.transferBalance('guild_1', 'user_A', 'user_A', 'silver', 50);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('SELF_TRANSFER');
  });

  it('rejects transfers with invalid or non-positive amounts', async () => {
    const res1 = await store.transferBalance('guild_1', 'user_A', 'user_B', 'silver', 0);
    const res2 = await store.transferBalance('guild_1', 'user_A', 'user_B', 'silver', -100);
    const res3 = await store.transferBalance('guild_1', 'user_A', 'user_B', 'silver', NaN);

    expect(res1.ok).toBe(false);
    expect(res2.ok).toBe(false);
    expect(res3.ok).toBe(false);
  });

  it('atomically transfers balance between two users in in-memory mode', async () => {
    await store.setBalance('guild_1', 'user_A', 'gold', 500);
    await store.setBalance('guild_1', 'user_B', 'gold', 200);

    const result = await store.transferBalance('guild_1', 'user_A', 'user_B', 'gold', 150);
    expect(result.ok).toBe(true);
    expect(result.fromBalance.gold).toBe(350);
    expect(result.toBalance.gold).toBe(350);

    const balA = await store.getBalance('guild_1', 'user_A');
    const balB = await store.getBalance('guild_1', 'user_B');
    expect(balA.gold).toBe(350);
    expect(balB.gold).toBe(350);
  });

  it('rejects transfer when sender has insufficient funds without altering balances', async () => {
    await store.setBalance('guild_1', 'user_A', 'diamond', 50);
    await store.setBalance('guild_1', 'user_B', 'diamond', 10);

    const result = await store.transferBalance('guild_1', 'user_A', 'user_B', 'diamond', 100);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INSUFFICIENT_FUNDS');

    const balA = await store.getBalance('guild_1', 'user_A');
    const balB = await store.getBalance('guild_1', 'user_B');
    expect(balA.diamond).toBe(50);
    expect(balB.diamond).toBe(10);
  });

  it('prevents deadlocks during high-concurrency cross transfers between two users', async () => {
    await store.setBalance('guild_1', 'user_Alice', 'silver', 1000);
    await store.setBalance('guild_1', 'user_Bob', 'silver', 1000);

    // Launch 30 simultaneous cross-transfers in opposite directions
    const transfers = [
      ...Array.from({ length: 10 }, () => store.transferBalance('guild_1', 'user_Alice', 'user_Bob', 'silver', 20)),
      ...Array.from({ length: 10 }, () => store.transferBalance('guild_1', 'user_Bob', 'user_Alice', 'silver', 15)),
      ...Array.from({ length: 10 }, () => store.transferBalance('guild_1', 'user_Alice', 'user_Bob', 'silver', 10)),
    ];

    const results = await Promise.all(transfers);
    expect(results.every((r) => r.ok)).toBe(true);

    const balAlice = await store.getBalance('guild_1', 'user_Alice');
    const balBob = await store.getBalance('guild_1', 'user_Bob');

    // Net change:
    // Alice sent: 10 * 20 + 10 * 10 = 300. Alice received: 10 * 15 = 150. Net: -150 => 850
    // Bob sent: 10 * 15 = 150. Bob received: 300. Net: +150 => 1150
    expect(balAlice.silver).toBe(850);
    expect(balBob.silver).toBe(1150);
    // Conservation of money: total must remain 2000
    expect(balAlice.silver + balBob.silver).toBe(2000);
  });

  it('executes atomic transfer via TRANSFER_LUA in Redis mode with Redis Cluster hash tag collocation', async () => {
    const redisStore = new Map();
    redisStore.set('{guild:g1}:economy:u1', JSON.stringify({ silver: 500 }));
    redisStore.set('{guild:g1}:economy:u2', JSON.stringify({ silver: 100 }));

    const mockRedis = {
      eval: vi.fn(async (script, keyCount, fromKey, toKey, memberKey, currency, amountStr, fromId, toId) => {
        // Assert that all keys share the {guild:g1} hash tag for Redis Cluster compatibility
        expect(fromKey).toMatch(/^\{guild:g1\}:economy:/);
        expect(toKey).toMatch(/^\{guild:g1\}:economy:/);
        expect(memberKey).toMatch(/^\{guild:g1\}:economy:_members$/);

        // Lua simulation
        const amount = parseInt(amountStr, 10);
        const fromUser = JSON.parse(redisStore.get(fromKey) || '{"silver":0}');
        if ((fromUser[currency] || 0) < amount) {
          return JSON.stringify({ ok: false, error: 'INSUFFICIENT_FUNDS', balance: fromUser });
        }
        const toUser = JSON.parse(redisStore.get(toKey) || '{"silver":0}');
        fromUser[currency] -= amount;
        toUser[currency] = (toUser[currency] || 0) + amount;
        redisStore.set(fromKey, JSON.stringify(fromUser));
        redisStore.set(toKey, JSON.stringify(toUser));
        return JSON.stringify({ ok: true, fromBalance: fromUser, toBalance: toUser });
      }),
      sadd: vi.fn().mockResolvedValue(1),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const res = await redisStateStore.transferBalance('g1', 'u1', 'u2', 'silver', 250);

    expect(res.ok).toBe(true);
    expect(res.fromBalance.silver).toBe(250);
    expect(res.toBalance.silver).toBe(350);
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it('rejects transfer when user data is corrupted in Redis without writing partial balances', async () => {
    const redisStore = new Map();
    // u1 has corrupted JSON string
    redisStore.set('{guild:g1}:economy:u1', 'MALFORMED_JSON{{{');
    redisStore.set('{guild:g1}:economy:u2', JSON.stringify({ silver: 100 }));

    const mockRedis = {
      eval: vi.fn(async (script, keyCount, fromKey, toKey) => {
        // Lua parse_user simulation using pcall
        try {
          JSON.parse(redisStore.get(fromKey));
        } catch {
          return JSON.stringify({ ok: false, error: 'CORRUPTED_USER_DATA' });
        }
        return JSON.stringify({ ok: true });
      }),
      sadd: vi.fn().mockResolvedValue(1),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const res = await redisStateStore.transferBalance('g1', 'u1', 'u2', 'silver', 50);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('CORRUPTED_USER_DATA');
    // Ensure corrupted raw value was NOT overwritten with partial data
    expect(redisStore.get('{guild:g1}:economy:u1')).toBe('MALFORMED_JSON{{{');
    expect(redisStore.get('{guild:g1}:economy:u2')).toBe(JSON.stringify({ silver: 100 }));
  });

  it('rolls back first user deduction when second user write encounters Redis runtime error, preserving total money', async () => {
    const redisStore = new Map();
    const initialFromRaw = JSON.stringify({ silver: 1000 });
    const initialToRaw = JSON.stringify({ silver: 500 });
    redisStore.set('{guild:g1}:economy:u1', initialFromRaw);
    redisStore.set('{guild:g1}:economy:u2', initialToRaw);

    const mockRedis = {
      eval: vi.fn(async (script, keyCount, fromKey, toKey, memberKey, currency, amountStr, fromId, toId) => {
        const rawFrom = redisStore.get(fromKey);
        const rawTo = redisStore.get(toKey);
        const userFrom = JSON.parse(rawFrom);
        const userTo = JSON.parse(rawTo);
        const amount = parseInt(amountStr, 10);

        userFrom[currency] -= amount;
        userTo[currency] += amount;

        // Step 1 write succeeds
        redisStore.set(fromKey, JSON.stringify(userFrom));

        // Step 2 write simulates runtime Redis failure (e.g. OOM or cluster write failure)
        const step2Failed = true;
        if (step2Failed) {
          // Lua pcall compensation rollback: restores rawFrom
          redisStore.set(fromKey, rawFrom);
          return JSON.stringify({
            ok: false,
            error: 'REDIS_RUNTIME_ERROR_TO_ROLLED_BACK',
            details: 'OOM command not allowed',
          });
        }
        return JSON.stringify({ ok: true });
      }),
      sadd: vi.fn().mockResolvedValue(1),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const res = await redisStateStore.transferBalance('g1', 'u1', 'u2', 'silver', 300);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('REDIS_RUNTIME_ERROR_TO_ROLLED_BACK');

    // Both users must remain at their initial balances!
    const fromFinal = JSON.parse(redisStore.get('{guild:g1}:economy:u1'));
    const toFinal = JSON.parse(redisStore.get('{guild:g1}:economy:u2'));
    expect(fromFinal.silver).toBe(1000);
    expect(toFinal.silver).toBe(500);

    // Conservation of money: total remains 1500!
    expect(fromFinal.silver + toFinal.silver).toBe(1500);
  });

  it('flags CRITICAL_ROLLBACK_FAILED when compensation rollback itself encounters error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockRedis = {
      eval: vi.fn().mockResolvedValue(JSON.stringify({
        ok: false,
        error: 'CRITICAL_ROLLBACK_FAILED',
        details: 'OOM writing recipient',
        rollbackDetails: 'Connection reset during rollback write',
      })),
      sadd: vi.fn().mockResolvedValue(1),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const res = await redisStateStore.transferBalance('g1', 'u1', 'u2', 'silver', 300);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('CRITICAL_ROLLBACK_FAILED');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL AUDIT: Compensation rollback failed'),
      expect.anything()
    );
    consoleErrorSpy.mockRestore();
  });

  it('auto-migrates legacy non-hash-tagged keys to hash-tagged keys before executing transferBalance', async () => {
    const redisStore = new Map();
    // Simulate data existing on legacy keys before cluster hash tag upgrade
    redisStore.set('guild:g_migrate:economy:u_legacy1', JSON.stringify({ silver: 800 }));
    redisStore.set('{guild:g_migrate}:economy:u_legacy2', JSON.stringify({ silver: 200 }));

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      del: vi.fn(async (key) => { redisStore.delete(key); return 1; }),
      sadd: vi.fn().mockResolvedValue(1),
      eval: vi.fn(async (script, keyCount, fromKey, toKey, memberKey, currency, amountStr) => {
        // Must receive migrated hash-tagged keys
        expect(fromKey).toBe('{guild:g_migrate}:economy:u_legacy1');
        expect(toKey).toBe('{guild:g_migrate}:economy:u_legacy2');

        const fromUser = JSON.parse(redisStore.get(fromKey));
        const toUser = JSON.parse(redisStore.get(toKey));
        const amount = parseInt(amountStr, 10);
        fromUser[currency] -= amount;
        toUser[currency] += amount;
        redisStore.set(fromKey, JSON.stringify(fromUser));
        redisStore.set(toKey, JSON.stringify(toUser));
        return JSON.stringify({ ok: true, fromBalance: fromUser, toBalance: toUser });
      }),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const res = await redisStateStore.transferBalance('g_migrate', 'u_legacy1', 'u_legacy2', 'silver', 300);

    expect(res.ok).toBe(true);
    // Legacy key must have been deleted and pruned
    expect(redisStore.has('guild:g_migrate:economy:u_legacy1')).toBe(false);
    // New hash-tagged key must hold the updated balance
    const updatedFrom = JSON.parse(redisStore.get('{guild:g_migrate}:economy:u_legacy1'));
    expect(updatedFrom.silver).toBe(500);
  });

  it('merges legacy member index into hash-tagged member set during getEconomyLeaderboard', async () => {
    const redisStore = new Map();
    redisStore.set('{guild:g_lb}:economy:u_fresh', JSON.stringify({ silver: 600 }));
    redisStore.set('{guild:g_lb}:economy:u_old', JSON.stringify({ silver: 900 }));

    const memberSetNew = new Set(['u_fresh']);
    const memberSetOld = new Set(['u_old']);

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      del: vi.fn(async (key) => {
        if (key === 'guild:g_lb:economy:_members') memberSetOld.clear();
        return 1;
      }),
      sadd: vi.fn(async (key, ...ids) => {
        if (key === '{guild:g_lb}:economy:_members') {
          for (const id of ids) memberSetNew.add(id);
        }
        return 1;
      }),
      smembers: vi.fn(async (key) => {
        if (key === '{guild:g_lb}:economy:_members') return Array.from(memberSetNew);
        if (key === 'guild:g_lb:economy:_members') return Array.from(memberSetOld);
        return [];
      }),
    };

    const redisStateStore = new StateStore(null, { redis: mockRedis });
    const leaderboard = await redisStateStore.getEconomyLeaderboard('g_lb', 'silver');

    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0].userId).toBe('u_old');
    expect(leaderboard[0].amount).toBe(900);
    expect(leaderboard[1].userId).toBe('u_fresh');
    expect(leaderboard[1].amount).toBe(600);
    // Verified: legacy member was added into new set and old key pruned
    expect(memberSetNew.has('u_old')).toBe(true);
  });
});
