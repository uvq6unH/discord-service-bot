import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateStore } from '../src/stateStore.js';

describe('Economy Migration, Cluster Hash Slots & Concurrency (StateStore)', () => {
  let mockRedis;
  let redisStorage;

  beforeEach(() => {
    redisStorage = new Map();
    mockRedis = {
      storage: redisStorage,
      get: vi.fn(async (key) => redisStorage.get(key) ?? null),
      set: vi.fn(async (key, val, ...args) => {
        if (args.includes('NX') && redisStorage.has(key)) {
          return null;
        }
        redisStorage.set(key, typeof val === 'string' ? val : JSON.stringify(val));
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        redisStorage.delete(key);
        return 1;
      }),
      sadd: vi.fn(async (key, ...members) => {
        let set = redisStorage.get(key);
        if (!set || !(set instanceof Set)) {
          set = new Set();
          redisStorage.set(key, set);
        }
        members.forEach((m) => set.add(m));
        return members.length;
      }),
      smembers: vi.fn(async (key) => {
        const set = redisStorage.get(key);
        return set instanceof Set ? Array.from(set) : [];
      }),
      pipeline: vi.fn(async (commands) => {
        for (const [cmd, key, ...rest] of commands) {
          if (cmd === 'SET') redisStorage.set(key, rest[0]);
          if (cmd === 'SADD') {
            let set = redisStorage.get(key);
            if (!set || !(set instanceof Set)) {
              set = new Set();
              redisStorage.set(key, set);
            }
            rest.forEach((m) => set.add(m));
          }
        }
        return commands.map(() => 'OK');
      }),
      eval: vi.fn(async (script, keyCount, ...args) => {
        // Handle lock release script (compare-and-delete)
        if (script.includes('return redis.call("del", KEYS[1])')) {
          const [key, expectedToken] = args;
          const current = redisStorage.get(key);
          if (current === expectedToken) {
            redisStorage.delete(key);
            return 1;
          }
          return 0;
        }

        // Assert: Multi-key scripts must only use keys sharing the same hash-tag {guild:ID}
        const keys = args.slice(0, keyCount);
        const hashTags = keys.map((k) => {
          const match = k.match(/\{([^}]+)\}/);
          return match ? match[1] : null;
        });

        if (keys.length > 1) {
          const firstTag = hashTags[0];
          const hasCrossSlot = hashTags.some((tag) => tag === null || tag !== firstTag);
          if (hasCrossSlot) {
            throw new Error(`CROSSSLOT Keys in request don't hash to the same slot: ${keys.join(', ')}`);
          }
        }

        // Simulate TRANSFER_LUA
        if (script.includes('userFrom[currency] = math.max(0, math.floor(currentFrom - amount))')) {
          const [fromKey, toKey, memberIndexKey, currency, amountStr, fromId, toId] = args;
          const fromRaw = redisStorage.get(fromKey);
          const toRaw = redisStorage.get(toKey);
          const fromUser = fromRaw ? JSON.parse(fromRaw) : { silver: 0, gold: 0, diamond: 0 };
          const toUser = toRaw ? JSON.parse(toRaw) : { silver: 0, gold: 0, diamond: 0 };
          const amount = parseInt(amountStr, 10);

          if ((fromUser[currency] ?? 0) < amount) {
            return JSON.stringify({ ok: false, error: 'INSUFFICIENT_FUNDS', balance: fromUser });
          }

          fromUser[currency] -= amount;
          toUser[currency] = (toUser[currency] ?? 0) + amount;

          redisStorage.set(fromKey, JSON.stringify(fromUser));
          redisStorage.set(toKey, JSON.stringify(toUser));

          return JSON.stringify({ ok: true, fromBalance: fromUser, toBalance: toUser });
        }

        return null;
      }),
    };
  });

  it('migrates legacy non-hash-tagged key using single-key operations to avoid CROSSSLOT', async () => {
    const guildId = 'guild_slot_1';
    const userId = 'user_legacy_1';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    // Seed legacy key
    redisStorage.set(legacyKey, JSON.stringify({ silver: 500, gold: 10, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });

    // Ensure migration
    await store._ensureEconUserKeyMigrated(guildId, userId);

    // Verify: new hash-tagged key was written with exact balance
    expect(redisStorage.has(newKey)).toBe(true);
    const migrated = JSON.parse(redisStorage.get(newKey));
    expect(migrated.silver).toBe(500);
    expect(migrated.gold).toBe(10);

    // Verify: legacy key was deleted
    expect(redisStorage.has(legacyKey)).toBe(false);

    // Verify: user was registered in member set
    const members = await mockRedis.smembers(`{guild:${guildId}}:economy:_members`);
    expect(members).toContain(userId);
  });

  it('safely handles concurrent migrations of the same user from two instances without data corruption', async () => {
    const guildId = 'guild_conc_1';
    const userId = 'user_double_mig';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    redisStorage.set(legacyKey, JSON.stringify({ silver: 1200, gold: 50, diamond: 1 }));

    const instance1 = new StateStore(null, { redis: mockRedis });
    const instance2 = new StateStore(null, { redis: mockRedis });

    // Both instances trigger migration concurrently
    await Promise.all([
      instance1._ensureEconUserKeyMigrated(guildId, userId),
      instance2._ensureEconUserKeyMigrated(guildId, userId),
    ]);

    // Balance is intact, exactly one new key exists, legacy key deleted
    expect(redisStorage.has(newKey)).toBe(true);
    expect(redisStorage.has(legacyKey)).toBe(false);
    const balance = JSON.parse(redisStorage.get(newKey));
    expect(balance.silver).toBe(1200);
    expect(balance.gold).toBe(50);
  });

  it('self-heals and cleans up orphaned legacy key if a prior migration crashed midway after write', async () => {
    const guildId = 'guild_crash_1';
    const userId = 'user_crashed_midway';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    // Simulate scenario: previous process wrote newKey (updated to 700 silver),
    // but crashed before DEL legacyKey (which still holds 500 silver).
    redisStorage.set(newKey, JSON.stringify({ silver: 700, gold: 20, diamond: 0 }));
    redisStorage.set(legacyKey, JSON.stringify({ silver: 500, gold: 10, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });

    // Migration runs as part of subsequent read or write
    await store._ensureEconUserKeyMigrated(guildId, userId);

    // Assert: new key's updated balance (700) is preserved (NOT overwritten by 500!)
    const current = JSON.parse(redisStorage.get(newKey));
    expect(current.silver).toBe(700);

    // Assert: leftover legacy key is now cleanly removed
    expect(redisStorage.has(legacyKey)).toBe(false);
  });

  it('executes atomic transfer when one user has a legacy key and one has a new key without CROSSSLOT errors', async () => {
    const guildId = 'guild_transfer_slots';
    const userA = 'user_legacy_sender';
    const userB = 'user_modern_receiver';

    const legacyKeyA = `guild:${guildId}:economy:${userA}`;
    const newKeyB = `{guild:${guildId}}:economy:${userB}`;

    redisStorage.set(legacyKeyA, JSON.stringify({ silver: 1000, gold: 0, diamond: 0 }));
    redisStorage.set(newKeyB, JSON.stringify({ silver: 200, gold: 0, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });

    // Perform transfer
    const res = await store.transferBalance(guildId, userA, userB, 'silver', 300);

    expect(res.ok).toBe(true);
    expect(res.fromBalance.silver).toBe(700);
    expect(res.toBalance.silver).toBe(500);

    // Total conservation of money: 1000 + 200 = 1200 -> 700 + 500 = 1200
    const totalSilver = res.fromBalance.silver + res.toBalance.silver;
    expect(totalSilver).toBe(1200);

    // User A's legacy key was safely deleted
    expect(redisStorage.has(legacyKeyA)).toBe(false);
    expect(redisStorage.has(`{guild:${guildId}}:economy:${userA}`)).toBe(true);
  });

  it('merges legacy member set into hash-tagged member set during leaderboard query', async () => {
    const guildId = 'guild_lb_migration';
    const legacyMemberKey = `guild:${guildId}:economy:_members`;
    const newMemberKey = `{guild:${guildId}}:economy:_members`;

    redisStorage.set(legacyMemberKey, new Set(['user_old_1', 'user_old_2']));
    redisStorage.set(newMemberKey, new Set(['user_new_1']));

    redisStorage.set(`{guild:${guildId}}:economy:user_old_1`, JSON.stringify({ silver: 500 }));
    redisStorage.set(`{guild:${guildId}}:economy:user_old_2`, JSON.stringify({ silver: 800 }));
    redisStorage.set(`{guild:${guildId}}:economy:user_new_1`, JSON.stringify({ silver: 300 }));

    const store = new StateStore(null, { redis: mockRedis });

    const leaderboard = await store.getEconomyLeaderboard(guildId, 'silver', 10);

    expect(leaderboard.length).toBe(3);
    expect(leaderboard[0].userId).toBe('user_old_2');
    expect(leaderboard[0].amount).toBe(800);

    // Legacy member set was merged and deleted
    expect(redisStorage.has(legacyMemberKey)).toBe(false);
    const finalSet = await mockRedis.smembers(newMemberKey);
    expect(finalSet).toEqual(expect.arrayContaining(['user_old_1', 'user_old_2', 'user_new_1']));
  });

  it('CRITICAL INVARIANT: prevents lost updates when migration interleaves with a live transaction', async () => {
    const guildId = 'guild_race_lost_update';
    const userId = 'user_target_race';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    // 1. Initial state: user has 100 silver in legacy key
    redisStorage.set(legacyKey, JSON.stringify({ silver: 100, gold: 0, diamond: 0 }));

    const instanceA = new StateStore(null, { redis: mockRedis });
    const instanceB = new StateStore(null, { redis: mockRedis });

    // 2. Both instance A and B attempt to migrate.
    // Simulate step: Instance A successfully finishes migration to newKey = 100
    await instanceA._ensureEconUserKeyMigrated(guildId, userId);
    expect(redisStorage.has(newKey)).toBe(true);
    expect(JSON.parse(redisStorage.get(newKey)).silver).toBe(100);

    // 3. A live valid transaction occurs! User receives +20 silver (balance = 120)
    const current = JSON.parse(redisStorage.get(newKey));
    current.silver = 120;
    redisStorage.set(newKey, JSON.stringify(current));

    // 4. Now Instance B (which was delayed or had pre-fetched legacy state) tries to migrate.
    // In unhardened code, B would overwrite newKey with 100, causing a 20 silver LOST UPDATE!
    await instanceB._ensureEconUserKeyMigrated(guildId, userId);

    // 5. ASSERT INVARIANT: newKey MUST remain 120, not reverted to 100!
    const finalData = JSON.parse(redisStorage.get(newKey));
    expect(finalData.silver).toBe(120);

    // And legacy key remains deleted
    expect(redisStorage.has(legacyKey)).toBe(false);
  });

  it('CRITICAL INVARIANT: total currency is 100% conserved across concurrent transfers', async () => {
    const guildId = 'guild_conservation';
    const user1 = 'u_acc_1';
    const user2 = 'u_acc_2';
    const user3 = 'u_acc_3';

    // Seed balances
    redisStorage.set(`{guild:${guildId}}:economy:${user1}`, JSON.stringify({ silver: 1000, gold: 0, diamond: 0 }));
    redisStorage.set(`{guild:${guildId}}:economy:${user2}`, JSON.stringify({ silver: 500, gold: 0, diamond: 0 }));
    redisStorage.set(`{guild:${guildId}}:economy:${user3}`, JSON.stringify({ silver: 250, gold: 0, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });
    const initialTotal = 1000 + 500 + 250; // 1750

    // Execute multiple transfers in parallel
    await Promise.all([
      store.transferBalance(guildId, user1, user2, 'silver', 100),
      store.transferBalance(guildId, user2, user3, 'silver', 50),
      store.transferBalance(guildId, user1, user3, 'silver', 200),
    ]);

    const bal1 = (await store.getBalance(guildId, user1)).silver;
    const bal2 = (await store.getBalance(guildId, user2)).silver;
    const bal3 = (await store.getBalance(guildId, user3)).silver;

    const finalTotal = bal1 + bal2 + bal3;

    // INVARIANT: Money cannot be created or destroyed
    expect(finalTotal).toBe(initialTotal);
    expect(finalTotal).toBe(1750);
  });

  it('reconciles delta when legacy writer updates legacyKey between read and CAD delete', async () => {
    const guildId = 'guild_race_cad';
    const userId = 'user_race_cad';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    // 1. Initial state in legacy key: 100 silver
    redisStorage.set(legacyKey, JSON.stringify({ silver: 100, gold: 0, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });

    // 2. Intercept mockRedis.set on newKey: simulate an old unmigrated writer
    // writing 50 additional silver into legacyKey in the exact millisecond between read and CAD!
    const originalSet = mockRedis.set;
    let interleaved = false;
    mockRedis.set = vi.fn(async (key, val, ...args) => {
      const res = await originalSet(key, val, ...args);
      if (key === newKey && !interleaved) {
        interleaved = true;
        // Old writer updates legacy key to 150 silver!
        redisStorage.set(legacyKey, JSON.stringify({ silver: 150, gold: 0, diamond: 0 }));
      }
      return res;
    });

    // 3. Trigger migration
    await store._ensureEconUserKeyMigrated(guildId, userId);

    // 4. Assertions:
    // CAD rejected the initial delete because legacyKey changed from 100 to 150.
    // Migration detected the delta (+50 silver) and merged it into newKey!
    expect(redisStorage.has(newKey)).toBe(true);
    const finalBalance = JSON.parse(redisStorage.get(newKey));
    expect(finalBalance.silver).toBe(150);

    // Legacy key was safely deleted only after the updated 150 was reconciled
    expect(redisStorage.has(legacyKey)).toBe(false);
  });

  it('reconciles legacy writer delta during post-crash recovery without double-counting', async () => {
    const guildId = 'guild_crash_delta';
    const userId = 'user_crash_delta';
    const legacyKey = `guild:${guildId}:economy:${userId}`;
    const newKey = `{guild:${guildId}}:economy:${userId}`;

    // Prior process crashed after writing newKey (200 silver) with snapshot (200 silver),
    // but before deleting legacyKey. In the meantime, an old instance added 60 silver to legacyKey (now 260).
    redisStorage.set(
      newKey,
      JSON.stringify({
        silver: 200,
        gold: 10,
        diamond: 0,
        _legacySnapshot: { silver: 200, gold: 10, diamond: 0 },
      })
    );
    redisStorage.set(legacyKey, JSON.stringify({ silver: 260, gold: 10, diamond: 0 }));

    const store = new StateStore(null, { redis: mockRedis });

    // Next operation triggers migration check
    await store._ensureEconUserKeyMigrated(guildId, userId);

    // Assert: delta (+60 silver) was identified and added to newKey (200 + 60 = 260)
    const finalBalance = JSON.parse(redisStorage.get(newKey));
    expect(finalBalance.silver).toBe(260);
    expect(finalBalance.gold).toBe(10);

    // Cleanly deleted after reconciliation
    expect(redisStorage.has(legacyKey)).toBe(false);
  });
});

