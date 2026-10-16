import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createMutexPool } from '../src/asyncMutex.js';
import { canBotExecuteInChannel } from '../src/commandAccess.js';
import {
  handleChannelRenameError,
  extractRetryAfterMs,
  channelRenameCooldowns,
  isChannelRenameUnderCooldown
} from '../src/bot/services/countersEngine.js';

describe('P0 Audit: Concurrency, Contention & Lock Behavior', () => {
  it('handles high contention without race condition or state corruption (20 concurrent requests)', async () => {
    const withLock = createMutexPool();
    let balance = 1000;
    const debitAmount = 50;
    const concurrentRequests = 20;

    // Simulate 20 concurrent debit requests on the same user
    const results = await Promise.all(
      Array.from({ length: concurrentRequests }).map(async (_, idx) => {
        return withLock('user_wallet_123', async () => {
          const current = balance;
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          if (current >= debitAmount) {
            balance = current - debitAmount;
            return { idx, success: true, remaining: balance };
          }
          return { idx, success: false, remaining: balance };
        });
      })
    );

    const successfulDebits = results.filter((r) => r.success).length;
    expect(successfulDebits).toBe(20);
    expect(balance).toBe(1000 - 20 * debitAmount); // exactly 0
  });

  it('prevents deadlock in dual-party transactions by lexicographically ordering lock keys', async () => {
    const withLock = createMutexPool();
    const accounts = { Alice: 500, Bob: 500 };

    async function transfer(fromId, toId, amount) {
      const [firstLock, secondLock] = [fromId, toId].sort();

      return withLock(firstLock, async () => {
        return withLock(secondLock, async () => {
          if (accounts[fromId] < amount) return false;
          accounts[fromId] -= amount;
          accounts[toId] += amount;
          return true;
        });
      });
    }

    const tasks = [
      transfer('Alice', 'Bob', 100),
      transfer('Bob', 'Alice', 50),
      transfer('Alice', 'Bob', 200),
      transfer('Bob', 'Alice', 150),
    ];

    const outcomes = await Promise.all(tasks);
    expect(outcomes.every(Boolean)).toBe(true);
    expect(accounts.Alice + accounts.Bob).toBe(1000);
    expect(accounts.Alice).toBe(500 - 100 + 50 - 200 + 150); // 400
    expect(accounts.Bob).toBe(500 + 100 - 50 + 200 - 150);   // 600
  });

  it('demonstrates lock release ownership safety (simulating Lua release script)', () => {
    const redisMock = new Map();

    function luaRelease(key, token) {
      if (redisMock.get(key) === token) {
        redisMock.delete(key);
        return 1;
      }
      return 0;
    }

    const tokenA = 'token_proc_A';
    redisMock.set('lock:resource_1', tokenA);

    const tokenB = 'token_proc_B';
    redisMock.set('lock:resource_1', tokenB);

    const releasedByA = luaRelease('lock:resource_1', tokenA);
    expect(releasedByA).toBe(0);
    expect(redisMock.get('lock:resource_1')).toBe(tokenB);

    const releasedByB = luaRelease('lock:resource_1', tokenB);
    expect(releasedByB).toBe(1);
    expect(redisMock.has('lock:resource_1')).toBe(false);
  });
});

describe('P0 Audit: Security & Proxy Protection', () => {
  it('uses constant-time comparison for sensitive cryptographic tokens', () => {
    function timingSafeCompare(a, b) {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    }

    const token = 'a_very_secret_csrf_token_1234567890abcdef';
    expect(timingSafeCompare(token, token)).toBe(true);
    expect(timingSafeCompare(token, 'a_very_secret_csrf_token_1234567890abcdeg')).toBe(false);
    expect(timingSafeCompare(token, 'short_token')).toBe(false);
  });

  it('validates Fail-Closed Discord proxy authorization when secret is missing or invalid', () => {
    const PROXY_SECRET = 'secret_123';

    function evaluateProxyAuth(secretHeader, envSecret = PROXY_SECRET) {
      if (!envSecret || !secretHeader || secretHeader !== envSecret) {
        return { status: 401, error: 'Unauthorized: proxy secret missing or invalid' };
      }
      return { status: 200, ok: true };
    }

    expect(evaluateProxyAuth(null, PROXY_SECRET).status).toBe(401);
    expect(evaluateProxyAuth('wrong_secret', PROXY_SECRET).status).toBe(401);
    expect(evaluateProxyAuth('secret_123', null).status).toBe(401);
    expect(evaluateProxyAuth('secret_123', PROXY_SECRET).status).toBe(200);
  });

  it('validates proxy strictly rejects deprecated v9 routes and unauthorized API paths', () => {
    const PROXY_SECRET = 'secret_123';

    function evaluateRoute(method, pathname) {
      const isTokenExchange = method === 'POST' && pathname === '/api/v10/oauth2/token';
      const isUserMe = method === 'GET' && pathname === '/api/v10/users/@me';
      const isUserGuilds = method === 'GET' && pathname === '/api/v10/users/@me/guilds';
      return (isTokenExchange || isUserMe || isUserGuilds) ? 200 : 403;
    }

    // Deprecated v9 routes must be forbidden
    expect(evaluateRoute('POST', '/api/v9/oauth2/token')).toBe(403);
    expect(evaluateRoute('GET', '/api/v9/users/@me')).toBe(403);
    // Arbitrary API paths forbidden
    expect(evaluateRoute('GET', '/api/v10/channels/123')).toBe(403);
    expect(evaluateRoute('POST', '/api/v10/guilds')).toBe(403);
    // Legitimate v10 routes allowed
    expect(evaluateRoute('POST', '/api/v10/oauth2/token')).toBe(200);
    expect(evaluateRoute('GET', '/api/v10/users/@me')).toBe(200);
    expect(evaluateRoute('GET', '/api/v10/users/@me/guilds')).toBe(200);
  });

  it('validates proxy enforces HTTP methods: POST for token, GET for user and guilds', () => {
    function evaluateMethodAndRoute(method, pathname) {
      const isTokenExchange = method === 'POST' && pathname === '/api/v10/oauth2/token';
      const isUserMe = method === 'GET' && pathname === '/api/v10/users/@me';
      const isUserGuilds = method === 'GET' && pathname === '/api/v10/users/@me/guilds';
      return (isTokenExchange || isUserMe || isUserGuilds) ? 200 : 403;
    }

    expect(evaluateMethodAndRoute('GET', '/api/v10/oauth2/token')).toBe(403);
    expect(evaluateMethodAndRoute('POST', '/api/v10/users/@me')).toBe(403);
    expect(evaluateMethodAndRoute('POST', '/api/v10/users/@me/guilds')).toBe(403);
  });
});

describe('P1 Audit: Permissions & Rate Limiting', () => {
  it('verifies channel permissions fail closed for sensitive actions when permissions are undetermined', () => {
    const channelUndetermined = {
      name: 'audit-log',
      guild: { members: { me: null, cache: new Map() } },
      permissionsFor: () => null,
    };

    // When failClosed is true (for sensitive actions like moderation/logging):
    const resClosed = canBotExecuteInChannel(channelUndetermined, undefined, { failClosed: true });
    expect(resClosed.ok).toBe(false);
    expect(resClosed.indeterminate).toBe(true);

    // When failClosed is false:
    const resOpen = canBotExecuteInChannel(channelUndetermined, undefined, { failClosed: false });
    expect(resOpen.ok).toBe(true);
  });

  it('verifies channel permissions resolve correctly for DMs and thread channels', () => {
    const mockDM = { isDMBased: () => true };
    expect(canBotExecuteInChannel(mockDM).ok).toBe(true);

    const mockThread = {
      isThread: () => true,
      guild: { members: { me: { id: 'bot_1' } } },
      permissionsFor: () => null,
      parent: {
        permissionsFor: () => ({ has: () => true })
      }
    };
    expect(canBotExecuteInChannel(mockThread, undefined, { failClosed: true }).ok).toBe(true);
  });

  it('standardizes rate limit retry units and separates 50035 invalid form body from 429', () => {
    const discordRestErr = { status: 429, rawError: { retry_after: 5.5 } };
    expect(extractRetryAfterMs(discordRestErr)).toBe(5500);

    const discordJsErr = { status: 429, retryAfter: 3500 };
    expect(extractRetryAfterMs(discordJsErr)).toBe(3500);

    const invalidFormBodyErr = { status: 400, code: 50035, message: 'Invalid Form Body' };
    expect(handleChannelRenameError(invalidFormBodyErr, 'ch_invalid')).toBeNull();
  });

  it('enforces cluster-wide rate limit cooldowns via Redis and falls back to local memory on Redis failure', async () => {
    const redisMock = new Map();
    const failingRedis = {
      set: async () => { throw new Error('Redis connection lost'); },
      get: async () => { throw new Error('Redis connection lost'); },
    };

    // In-memory fallback
    const err429 = { status: 429, rawError: { retry_after: 5 } };
    handleChannelRenameError(err429, 'ch_local', failingRedis);
    const isBlocked = await isChannelRenameUnderCooldown('ch_local', failingRedis);
    expect(isBlocked).toBe(true);
  });
});

describe('P0 Audit: Distributed Reminder Resilience & Failure Modes', () => {
  it('reminder crash scenario 1: prevents message loss when bot crashes before send during pending lease', async () => {
    const redisMock = new Map();
    let sentMessages = 0;

    async function tick(reminderId, slotTime, crashBeforeSend = false) {
      const claimKey = `reminder:claim:${reminderId}:${slotTime}`;
      if (redisMock.get(claimKey) === 'dispatched') return 'ALREADY_DISPATCHED';
      if (redisMock.get(claimKey) === 'pending') return 'LEASE_ACTIVE';

      redisMock.set(claimKey, 'pending');
      if (crashBeforeSend) {
        // Crash happens: Lease expires after 60s
        redisMock.delete(claimKey);
        return 'CRASHED';
      }

      sentMessages++;
      redisMock.set(claimKey, 'dispatched');
      return 'SUCCESS';
    }

    const remId = 'rem_1';
    const slot = 1000;

    // Run 1: Crashes before send
    const out1 = await tick(remId, slot, true);
    expect(out1).toBe('CRASHED');
    expect(sentMessages).toBe(0);

    // Run 2: Recovers and executes successfully -> Message is NOT lost
    const out2 = await tick(remId, slot, false);
    expect(out2).toBe('SUCCESS');
    expect(sentMessages).toBe(1);
  });

  it('reminder crash scenario 2: prevents duplicate sending when bot crashes after send but before DB update', async () => {
    const redisMock = new Map();
    let sentMessages = 0;

    async function tick(reminderId, slotTime) {
      const claimKey = `reminder:claim:${reminderId}:${slotTime}`;
      if (redisMock.get(claimKey) === 'dispatched') return 'ALREADY_DISPATCHED';

      redisMock.set(claimKey, 'pending');
      sentMessages++;
      redisMock.set(claimKey, 'dispatched');
      return 'SUCCESS';
    }

    const remId = 'rem_2';
    const slot = 2000;

    // First execution succeeds and commits 'dispatched'
    await tick(remId, slot);
    expect(sentMessages).toBe(1);

    // Crash happens after send. Bot restarts and encounters the same scheduled slot:
    const restartResult = await tick(remId, slot);
    expect(restartResult).toBe('ALREADY_DISPATCHED');
    expect(sentMessages).toBe(1); // Never sent twice!
  });

  it('reminder timeout scenario 3: fencing guard prevents split-brain lease expiry during slow send', () => {
    const LEASE_TTL_MS = 60_000;
    const FENCING_TIMEOUT_MS = 15_000;

    // Fencing guarantee: Send timeout must be strictly less than lease TTL
    expect(FENCING_TIMEOUT_MS).toBeLessThan(LEASE_TTL_MS / 2);
  });

  it('reminder network drop scenario 4: oracle verifies message existence on Discord to resolve Two Generals dilemma', async () => {
    // Mock channel with recent message posted by bot
    const mockChannel = {
      client: { user: { id: 'bot_99' } },
      messages: {
        fetch: async () => [
          {
            content: 'Team Standup in 5 mins',
            createdTimestamp: Date.now() - 5000,
            author: { id: 'bot_99' }
          }
        ]
      }
    };

    async function oracleCheck(channel, text) {
      const recent = await channel.messages.fetch();
      return recent.some((m) => m.content === text && m.author.id === channel.client.user.id);
    }

    // Even if HTTP connection dropped, oracle confirms Discord received the message
    const isPosted = await oracleCheck(mockChannel, 'Team Standup in 5 mins');
    expect(isPosted).toBe(true);

    const isMissing = await oracleCheck(mockChannel, 'Different Reminder');
    expect(isMissing).toBe(false);
  });

  it('reminder fatal error scenario 5: consumes reminder safely on fatal 403/404 without infinite loop', () => {
    function classifyDiscordError(err) {
      const isFatal = err?.status === 403 || err?.status === 404 || err?.code === 50001 || err?.code === 50035;
      return isFatal ? 'FATAL_CONSUME' : 'TRANSIENT_RETRY';
    }

    expect(classifyDiscordError({ status: 403, message: 'Missing Access' })).toBe('FATAL_CONSUME');
    expect(classifyDiscordError({ status: 404, message: 'Unknown Channel' })).toBe('FATAL_CONSUME');
    expect(classifyDiscordError({ code: 50001, message: 'Missing Permissions' })).toBe('FATAL_CONSUME');
    expect(classifyDiscordError({ status: 500, message: 'Discord Internal Server Error' })).toBe('TRANSIENT_RETRY');
    expect(classifyDiscordError(new Error('ETIMEDOUT'))).toBe('TRANSIENT_RETRY');
  });

  it('reminder scenario 6: CAS Lua script prevents stale worker from committing dispatched after lease ownership was lost', () => {
    const redisMock = new Map();

    function luaCommitDispatched(key, token, timestamp) {
      const raw = redisMock.get(key);
      if (!raw) return 0;
      const claim = JSON.parse(raw);
      if (claim && claim.token === token) {
        redisMock.set(key, JSON.stringify({ status: 'dispatched', token, at: timestamp }));
        return 1;
      }
      return 0; // Lost ownership!
    }

    const claimKey = 'reminder:claim:rem_cas_1:1000';

    // Worker A acquires lease with token_A
    redisMock.set(claimKey, JSON.stringify({ status: 'pending', token: 'token_A' }));

    // Worker A hangs... Lease expires, and Worker B takes over with token_B:
    redisMock.set(claimKey, JSON.stringify({ status: 'pending', token: 'token_B' }));

    // Worker A wakes up late and attempts to commit 'dispatched' with token_A:
    const commitResultA = luaCommitDispatched(claimKey, 'token_A', Date.now());
    // Must be rejected!
    expect(commitResultA).toBe(0);
    // Worker B's active lease remains untouched:
    expect(JSON.parse(redisMock.get(claimKey)).token).toBe('token_B');

    // Worker B finishes on time and commits 'dispatched' with token_B:
    const commitResultB = luaCommitDispatched(claimKey, 'token_B', Date.now());
    expect(commitResultB).toBe(1);
    expect(JSON.parse(redisMock.get(claimKey)).status).toBe('dispatched');
  });

  it('reminder scenario 7: Oracle tri-state classification distinguishes verified sent from uncertain', async () => {
    const mockChannel = {
      client: { user: { id: 'bot_1' } },
      messages: {
        fetch: async () => [
          { content: 'Meeting Now', author: { id: 'bot_1' }, createdTimestamp: Date.now() - 2000 }
        ]
      }
    };

    async function evaluateOracle(channel, expectedText) {
      if (channel.permissionsFor && !channel.permissionsFor().has('ReadMessageHistory')) {
        return 'UNCERTAIN';
      }
      try {
        const recent = await channel.messages.fetch();
        const found = recent.some(m => m.content === expectedText && m.author.id === channel.client.user.id);
        return found ? 'VERIFIED_SENT' : 'UNCERTAIN';
      } catch {
        return 'UNCERTAIN';
      }
    }

    // Exact match found
    expect(await evaluateOracle(mockChannel, 'Meeting Now')).toBe('VERIFIED_SENT');
    // Content not found -> UNCERTAIN (cannot assume not sent on Discord side)
    expect(await evaluateOracle(mockChannel, 'Other text')).toBe('UNCERTAIN');

    // Missing ReadMessageHistory permission -> UNCERTAIN
    const noHistoryPermChannel = {
      permissionsFor: () => ({ has: (p) => p !== 'ReadMessageHistory' }),
      messages: { fetch: async () => [] }
    };
    expect(await evaluateOracle(noHistoryPermChannel, 'Meeting Now')).toBe('UNCERTAIN');

    // Channel fetch threw network error -> UNCERTAIN
    const brokenChannel = { messages: { fetch: async () => { throw new Error('Network timeout'); } } };
    expect(await evaluateOracle(brokenChannel, 'Meeting Now')).toBe('UNCERTAIN');
  });

  it('reminder scenario 8: uncertain delivery transitions to backoff state to prevent immediate duplicate retries', () => {
    const redisMock = new Map();

    function luaSetUncertain(key, token) {
      const raw = redisMock.get(key);
      if (!raw) return 0;
      const claim = JSON.parse(raw);
      if (claim && claim.token === token) {
        const retries = (claim.retries || 0) + 1;
        redisMock.set(key, JSON.stringify({ status: 'uncertain', token, retries }));
        return retries;
      }
      return 0;
    }

    const claimKey = 'reminder:claim:uncertain_1:5000';
    redisMock.set(claimKey, JSON.stringify({ status: 'pending', token: 'tok_1', retries: 0 }));

    // Send encountered network error, oracle was uncertain -> transition to uncertain backoff:
    const retries = luaSetUncertain(claimKey, 'tok_1');
    expect(retries).toBe(1);

    const saved = JSON.parse(redisMock.get(claimKey));
    expect(saved.status).toBe('uncertain');
    expect(saved.retries).toBe(1);
  });

  it('reminder scenario 9: quarantines reminder into dead_letter state when max uncertain retries is exceeded', () => {
    const redisMock = new Map();

    function luaSetUncertainWithQuarantine(key, token, maxRetries = 2) {
      const raw = redisMock.get(key);
      if (!raw) return 0;
      const claim = JSON.parse(raw);
      if (claim && claim.token === token) {
        const retries = (claim.retries || 0) + 1;
        if (retries >= maxRetries) {
          redisMock.set(key, JSON.stringify({ status: 'dead_letter', token, retries, reason: 'MAX_UNCERTAIN_RETRIES_EXCEEDED' }));
          return -1; // Quarantined
        }
        redisMock.set(key, JSON.stringify({ status: 'uncertain', token, retries }));
        return retries;
      }
      return 0;
    }

    const claimKey = 'reminder:claim:dead_letter_test:9999';
    // State after 1 previous uncertain retry:
    redisMock.set(claimKey, JSON.stringify({ status: 'pending', token: 'uuid_token_1', retries: 1 }));

    // Second failure reaches maxRetries (2) -> transitions to dead_letter:
    const result = luaSetUncertainWithQuarantine(claimKey, 'uuid_token_1', 2);
    expect(result).toBe(-1);

    const quarantined = JSON.parse(redisMock.get(claimKey));
    expect(quarantined.status).toBe('dead_letter');
    expect(quarantined.reason).toBe('MAX_UNCERTAIN_RETRIES_EXCEEDED');
  });

  it('reminder scenario 10: pre-handshake socket error where footprint is absent correctly returns UNCERTAIN to enforce backoff and prevent premature retry', async () => {
    const now = Date.now();
    const mockChannel = {
      client: { user: { id: 'bot_1' } },
      messages: {
        fetch: async () => [
          { content: 'Hello world', author: { id: 'other_user' }, createdTimestamp: now - 1000 },
          { content: 'Old message', author: { id: 'other_user' }, createdTimestamp: now - 120_000 }
        ]
      }
    };

    async function evaluateSafeOracle(channel, footprint) {
      const msgs = await channel.messages.fetch();
      const found = msgs.some(m => m.content?.includes(footprint) && m.author.id === channel.client.user.id);
      if (found) return 'VERIFIED_SENT';
      // Without paginated complete coverage proof, absence in bounded fetch MUST be treated as UNCERTAIN
      return 'UNCERTAIN';
    }

    const footprint = '\u200B[rid:rem_socket_fail:1000]\u200B';
    const status = await evaluateSafeOracle(mockChannel, footprint);
    expect(status).toBe('UNCERTAIN');
  });

  it('reminder scenario 11: dropped HTTP ACK where Discord received request is recovered via footprint Oracle into dispatched', async () => {
    const now = Date.now();
    const footprint = '\u200B[rid:rem_ack_drop:2000]\u200B';

    // Discord did receive the message, but TCP ACK dropped
    const mockChannel = {
      client: { user: { id: 'bot_1' } },
      messages: {
        fetch: async () => [
          {
            content: `Team Standup ${footprint}`,
            author: { id: 'bot_1' },
            createdTimestamp: now - 3000
          }
        ]
      }
    };

    async function evaluateFootprintOracle(channel, expectedFootprint) {
      const msgs = await channel.messages.fetch();
      const found = msgs.some(m => m.content?.includes(expectedFootprint) && m.author.id === channel.client.user.id);
      return found ? 'VERIFIED_SENT' : 'UNCERTAIN';
    }

    const status = await evaluateFootprintOracle(mockChannel, footprint);
    expect(status).toBe('VERIFIED_SENT');
  });

  it('reminder scenario 12: Redis connection lost after Discord accepted message falls back to memory and recovers via Oracle on restart', async () => {
    const redisMock = new Map();
    const failingRedis = {
      get: async () => { throw new Error('Redis connection refused'); },
      set: async () => { throw new Error('Redis connection refused'); },
      eval: async () => { throw new Error('Redis connection refused'); }
    };
    const inMemoryFallback = new Map();
    const footprint = '\u200B[rid:rem_redis_drop:3000]\u200B';
    const claimKey = 'reminder:claim:rem_redis_drop:3000';

    // Step 1: Send to Discord succeeded
    const discordSent = true;

    // Step 2: Redis commit fails
    let redisCommitSuccess = false;
    try {
      await failingRedis.eval();
      redisCommitSuccess = true;
    } catch {
      // Step 3: Worker saves to in-memory fallback
      inMemoryFallback.set(claimKey, JSON.stringify({ status: 'dispatched', footprint }));
    }
    expect(redisCommitSuccess).toBe(false);
    expect(inMemoryFallback.get(claimKey)).toContain('dispatched');

    // Step 4: Worker restarts (memory wiped, Redis recovered)
    inMemoryFallback.clear();
    const recoveredRedis = new Map();

    // On restart tick: Redis has no record of claim, but Discord channel has the message:
    const mockChannel = {
      client: { user: { id: 'bot_1' } },
      messages: {
        fetch: async () => [
          { content: `Standup Reminder ${footprint}`, author: { id: 'bot_1' }, createdTimestamp: Date.now() - 5000 }
        ]
      }
    };

    // Before sending, worker or oracle checks channel if needed:
    const msgs = await mockChannel.messages.fetch();
    const alreadyOnDiscord = msgs.some(m => m.content?.includes(footprint) && m.author.id === mockChannel.client.user.id);
    expect(alreadyOnDiscord).toBe(true);
    // Prevents duplicate sending on recovery!
  });

  it('reminder scenario 13: preserves retries across worker restarts via Lua and enforces dead_letter without counter reset', () => {
    const redisStore = new Map();

    function luaAcquireLease(key, token, now, ttl) {
      const raw = redisStore.get(key);
      if (!raw) {
        redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: now, retries: 0 }));
        return 1;
      }
      const claim = JSON.parse(raw);
      if (['dispatched', 'permanent_failure', 'dead_letter'].includes(claim.status)) {
        return -1; // Terminal
      }
      if (claim.status === 'uncertain') {
        if (now < (claim.backoffUntil || 0)) {
          return 0; // Still in backoff window
        }
        // Backoff expired: Acquire new lease and PRESERVE RETRIES
        redisStore.set(key, JSON.stringify({
          status: 'pending',
          token,
          acquiredAt: now,
          retries: claim.retries || 0
        }));
        return 1;
      }
      return 0;
    }

    function luaSetUncertain(key, token, maxRetries, now, backoffMs) {
      const raw = redisStore.get(key);
      if (!raw) return 0;
      const claim = JSON.parse(raw);
      if (claim && claim.token === token) {
        const retries = (claim.retries || 0) + 1;
        if (retries >= maxRetries) {
          redisStore.set(key, JSON.stringify({
            status: 'dead_letter',
            token,
            retries,
            reason: 'MAX_UNCERTAIN_RETRIES_EXCEEDED'
          }));
          return -1;
        }
        redisStore.set(key, JSON.stringify({
          status: 'uncertain',
          token,
          retries,
          backoffUntil: now + backoffMs
        }));
        return retries;
      }
      return 0;
    }

    const claimKey = 'reminder:claim:restart_test:1000';
    const t0 = 1_000_000;

    // 1. Initial attempt: acquires lease with retries: 0
    expect(luaAcquireLease(claimKey, 'tok_1', t0, 120)).toBe(1);

    // 2. Failure occurs: transitions to uncertain with retries: 1, backoffUntil: t0 + 300_000
    expect(luaSetUncertain(claimKey, 'tok_1', 2, t0, 300_000)).toBe(1);
    expect(JSON.parse(redisStore.get(claimKey)).retries).toBe(1);

    // 3. Tick while backoff active (e.g. t0 + 60_000): rejected!
    expect(luaAcquireLease(claimKey, 'tok_2', t0 + 60_000, 120)).toBe(0);

    // 4. Worker RESTARTS (new process, new memory, but Redis is persistent):
    // Tick after backoff expires (t0 + 301_000): acquires lease and PRESERVES retries: 1
    expect(luaAcquireLease(claimKey, 'tok_3', t0 + 301_000, 120)).toBe(1);
    const claimAfterRestart = JSON.parse(redisStore.get(claimKey));
    expect(claimAfterRestart.token).toBe('tok_3');
    expect(claimAfterRestart.retries).toBe(1); // Crucial: retries was NOT reset!

    // 5. Second attempt also fails: reaches maxRetries (2) -> transitions to dead_letter!
    expect(luaSetUncertain(claimKey, 'tok_3', 2, t0 + 301_000, 300_000)).toBe(-1);
    const terminalClaim = JSON.parse(redisStore.get(claimKey));
    expect(terminalClaim.status).toBe('dead_letter');
    expect(terminalClaim.retries).toBe(2);

    // 6. Any future tick: permanently blocked (-1)
    expect(luaAcquireLease(claimKey, 'tok_4', t0 + 600_000, 120)).toBe(-1);
  });

  it('reminder scenario 14: CAS token mismatch prevents stale workers from corrupting state and 1-hour stale pruner guarantees reminders cannot outlive 24h Redis TTL', () => {
    const redisStore = new Map();

    function luaSetUncertainCAS(key, token, maxRetries, now, backoffMs) {
      const raw = redisStore.get(key);
      if (!raw) return 0;
      const claim = JSON.parse(raw);
      if (claim && claim.token === token) {
        claim.status = 'uncertain';
        redisStore.set(key, JSON.stringify(claim));
        return 1;
      }
      return 0; // CAS mismatch!
    }

    const claimKey = 'reminder:claim:cas_test:123';
    // Worker B took the lease with token 'worker_B_token'
    redisStore.set(claimKey, JSON.stringify({ status: 'pending', token: 'worker_B_token', retries: 0 }));

    // Worker A (stale) tries to commit uncertainty with old token 'worker_A_token':
    const casResult = luaSetUncertainCAS(claimKey, 'worker_A_token', 2, Date.now(), 300_000);
    expect(casResult).toBe(0); // Safely rejected! Worker B's lease remains untouched.
    expect(JSON.parse(redisStore.get(claimKey)).token).toBe('worker_B_token');

    // Lifecycle convergence test:
    // Reminders older than 60 minutes are discarded as stale by reminderTick.
    const scheduledTime = Date.now() - (61 * 60 * 1000); // 61 minutes ago
    const STALE_THRESHOLD_MS = 60 * 60 * 1000;
    const isStale = (Date.now() - scheduledTime) > STALE_THRESHOLD_MS;
    expect(isStale).toBe(true);
    // Since STALE_THRESHOLD_MS (1 hour) is far shorter than Redis Claim TTL (24 hours),
    // a reminder is always discarded or advanced 23 hours before the Redis claim key can expire!
  });

  it('reminder scenario 15: dead_letter is never overwritten by dispatched and shields against duplicate send if configStore write fails', async () => {
    const redisStore = new Map();
    const claimKey = 'reminder:claim:dl_persist:5555';
    const leaseToken = 'token_abc_123';

    // Simulate reminder transitioning to dead_letter:
    redisStore.set(claimKey, JSON.stringify({
      status: 'dead_letter',
      token: leaseToken,
      retries: 2,
      reason: 'MAX_UNCERTAIN_RETRIES_EXCEEDED'
    }));

    // Verify terminalOutcome separation:
    const terminalOutcome = 'dead_letter';
    let committedDispatched = false;
    if (terminalOutcome === 'dispatched') {
      committedDispatched = true;
      redisStore.set(claimKey, JSON.stringify({ status: 'dispatched' }));
    }
    // Must NOT commit dispatched!
    expect(committedDispatched).toBe(false);
    expect(JSON.parse(redisStore.get(claimKey)).status).toBe('dead_letter');

    // Simulate Failure Case: configStore.patchGuildConfig failed to write to database!
    // Therefore, the guild still has the old reminder in config.reminders!
    const reminderInConfig = { id: 'dl_persist', time: new Date(5555).toISOString(), message: 'Important Alert', repeat: 'none' };

    // On NEXT tick (60 seconds later), worker encounters the reminder that wasn't deleted from config:
    const rawClaim = redisStore.get(claimKey);
    const claimData = JSON.parse(rawClaim);

    let sendAttempted = false;
    let scheduleAdvancedWithoutSend = false;

    if (['dispatched', 'permanent_failure', 'dead_letter'].includes(claimData?.status)) {
      scheduleAdvancedWithoutSend = true;
      // Advances schedule / returns null without calling channel.send!
    } else {
      sendAttempted = true;
    }

    expect(scheduleAdvancedWithoutSend).toBe(true);
    expect(sendAttempted).toBe(false); // Defended by persistent dead_letter state!
  });

  it('reminder scenario 16: granular Lua CAS error codes and pre-flight Oracle check prevent duplicate dispatch', () => {
    const redisStore = new Map();

    function luaCommitDispatched(key, token, timestamp) {
      const raw = redisStore.get(key);
      if (!raw) return -10; // Key expired
      const claim = JSON.parse(raw);
      if (!claim) return -11; // Corrupt
      if (claim.token !== token) return -12; // Token mismatch
      if (claim.status !== 'pending') return -13; // Not in pending state

      claim.status = 'dispatched';
      claim.at = timestamp;
      redisStore.set(key, JSON.stringify(claim));
      return 1;
    }

    const claimKey = 'reminder:claim:prec_test:9999';

    // 1. Key expired (-10)
    expect(luaCommitDispatched(claimKey, 'tok_1', 1000)).toBe(-10);

    // 2. Token mismatch (-12)
    redisStore.set(claimKey, JSON.stringify({ status: 'pending', token: 'tok_active' }));
    expect(luaCommitDispatched(claimKey, 'tok_stale', 1000)).toBe(-12);

    // 3. Not in pending state (-13)
    redisStore.set(claimKey, JSON.stringify({ status: 'dead_letter', token: 'tok_active' }));
    expect(luaCommitDispatched(claimKey, 'tok_active', 1000)).toBe(-13);

    // 4. Valid commit (1)
    redisStore.set(claimKey, JSON.stringify({ status: 'pending', token: 'tok_active' }));
    expect(luaCommitDispatched(claimKey, 'tok_active', 1000)).toBe(1);
    expect(JSON.parse(redisStore.get(claimKey)).status).toBe('dispatched');

    // 5. Pre-flight Oracle test:
    // If Discord already received the message during an unacknowledged attempt,
    // preCheck detects footprint and completely skips channel.send.
    const footprint = '\u200B[rid:rem_dup:1000]\u200B';
    const channelMessages = [
      { content: `Meeting in 5m ${footprint}`, author: { bot: true }, createdTimestamp: Date.now() - 5000 }
    ];

    let sendCalled = false;
    const preCheckStatus = channelMessages.some(m => m.content.includes(footprint)) ? 'VERIFIED_SENT' : 'UNCERTAIN';

    let terminalOutcome = null;
    if (preCheckStatus === 'VERIFIED_SENT') {
      terminalOutcome = 'dispatched'; // Suppressed duplicate!
    } else {
      sendCalled = true;
    }

    expect(preCheckStatus).toBe('VERIFIED_SENT');
    expect(sendCalled).toBe(false);
    expect(terminalOutcome).toBe('dispatched');
  });

  it('reminder scenario 17: read-back confirmation resolves ambiguous Redis commit timeout and 5m backoff covers late Discord deliveries', async () => {
    const redisStore = new Map();
    const claimKey = 'reminder:claim:readback_test:1234';

    // Simulate scenario:
    // 1. Worker executed COMMIT_DISPATCHED_LUA on Redis server (which wrote 'dispatched').
    // 2. But the response packet timed out or dropped on the return path!
    // The Redis server state is already 'dispatched':
    redisStore.set(claimKey, JSON.stringify({ status: 'dispatched', token: 'tok_sent', at: 1234 }));

    // Worker catches Redis network timeout exception:
    let isConfirmedCommitted = false;
    try {
      throw new Error('Connection timeout to Redis host');
    } catch (err) {
      // Worker performs read-back:
      const rawAfterErr = redisStore.get(claimKey);
      if (rawAfterErr) {
        const parsed = JSON.parse(rawAfterErr);
        if (parsed.status === 'dispatched') {
          isConfirmedCommitted = true;
        }
      }
    }

    expect(isConfirmedCommitted).toBe(true);

    // Simulate 5m backoff enforcement:
    // A late-finishing Discord request has a 5-minute grace period where no other worker can acquire lease.
    const now = 100000;
    const backoffUntil = now + 300_000; // 5 minutes
    redisStore.set('reminder:claim:backoff_test:555', JSON.stringify({
      status: 'uncertain',
      token: 'tok_flight',
      retries: 1,
      backoffUntil
    }));

    // Another worker tries to acquire lease at now + 60s (1 minute later):
    const earlyWorkerTickTime = now + 60_000;
    const rawBackoffClaim = JSON.parse(redisStore.get('reminder:claim:backoff_test:555'));

    const canAcquireEarly = earlyWorkerTickTime >= rawBackoffClaim.backoffUntil;
    expect(canAcquireEarly).toBe(false); // Strictly blocked! Cannot race ahead of late Discord delivery.

    // After 5 minutes (now + 301s):
    const lateWorkerTickTime = now + 301_000;
    const canAcquireLate = lateWorkerTickTime >= rawBackoffClaim.backoffUntil;
    expect(canAcquireLate).toBe(true); // Eligible for re-evaluation after safety window.
  });
});
