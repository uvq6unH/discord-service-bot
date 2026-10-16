import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthRouter, getDiscordFetchHeaders } from '../src/auth.js';

describe('OAuth2 Flow: prompt=none, Error Handling & State Validation', () => {
  let mockApp;
  let routes;
  let mockRedis;
  let mockGuildService;

  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = 'test_client_id';
    process.env.DISCORD_CLIENT_SECRET = 'test_client_secret';
    process.env.DISCORD_REDIRECT_URI = 'https://bot.example.com/auth/callback';

    const redisStore = new Map();
    mockRedis = {
      set: vi.fn(async (key, val) => {
        redisStore.set(key, val);
        return 'OK';
      }),
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      del: vi.fn(async (key) => (redisStore.delete(key) ? 1 : 0)),
      eval: vi.fn(async (script, keyCount, key, sessionId) => {
        const raw = redisStore.has(key)
          ? redisStore.get(key)
          : JSON.stringify({ sessionId: sessionId || 'default_session_id', createdAt: Date.now() });
        let data;
        try { data = JSON.parse(raw); } catch { return -3; }
        if (sessionId && data?.sessionId && data.sessionId !== sessionId) {
          return -2;
        }
        redisStore.delete(key);
        return 1;
      }),
    };

    mockGuildService = {
      getCachedGuilds: vi.fn().mockResolvedValue(null),
    };

    const auth = createAuthRouter({ user: { id: 'bot_id' } }, mockRedis, mockGuildService);
    routes = {};
    for (const layer of auth.router.stack) {
      if (layer.route) {
        const method = Object.keys(layer.route.methods)[0];
        routes[`${method.toUpperCase()} ${layer.route.path}`] = layer.route.stack[0].handle;
      }
    }
  });

  describe('GET /auth/login', () => {
    it('omits prompt parameter by default for standard seamless OAuth2 flow', async () => {
      const loginHandler = routes['GET /auth/login'];
      const req = {
        query: { returnTo: '/dashboard' },
        session: {
          regenerate: (cb) => cb(null),
          save: (cb) => cb(null),
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
        status: () => res,
        send: vi.fn(),
      };

      await loginHandler(req, res);
      expect(redirectedUrl).toContain('https://discord.com/oauth2/authorize');
      const url = new URL(redirectedUrl);
      expect(url.searchParams.get('client_id')).toBe('test_client_id');
      expect(url.searchParams.get('prompt')).toBeNull(); // Must be omitted by default
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(req.session.oauthState).toBe(url.searchParams.get('state'));
      expect(req.session.returnTo).toBe('/dashboard');
    });

    it('preserves prompt=consent when explicitly requested', async () => {
      const loginHandler = routes['GET /auth/login'];
      const req = {
        query: { prompt: 'consent' },
        session: {
          regenerate: (cb) => cb(null),
          save: (cb) => cb(null),
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await loginHandler(req, res);
      const url = new URL(redirectedUrl);
      expect(url.searchParams.get('prompt')).toBe('consent');
    });

    it('preserves prompt=none when explicitly requested for silent check', async () => {
      const loginHandler = routes['GET /auth/login'];
      const req = {
        query: { prompt: 'none' },
        session: {
          regenerate: (cb) => cb(null),
          save: (cb) => cb(null),
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await loginHandler(req, res);
      const url = new URL(redirectedUrl);
      expect(url.searchParams.get('prompt')).toBe('none');
    });

    it('ignores arbitrary un-whitelisted prompt values in GET /auth/login', async () => {
      const loginHandler = routes['GET /auth/login'];
      const req = {
        query: { prompt: 'malicious_or_unknown_value' },
        session: {
          regenerate: (cb) => cb(null),
          save: (cb) => cb(null),
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await loginHandler(req, res);
      const url = new URL(redirectedUrl);
      expect(url.searchParams.get('prompt')).toBeNull(); // Must not be forwarded
    });
  });

  describe('GET /auth/callback', () => {
    it('rejects speculative prefetch requests immediately with 204 No Content', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: { purpose: 'prefetch' },
        session: {},
        query: { code: 'some_code', state: 'some_state' },
      };
      let statusSent = 0;
      let ended = false;
      const res = {
        status: (s) => { statusSent = s; return res; },
        end: () => { ended = true; },
      };

      await callbackHandler(req, res);
      expect(statusSent).toBe(204);
      expect(ended).toBe(true);
    });

    it('validates state before evaluating query parameters and rejects state mismatch', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: { oauthState: 'expected_secret_state' },
        query: { code: 'code123', state: 'attacker_forged_state' },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=state_mismatch');
      // State in session should NOT be accepted
      expect(req.session.oauthState).toBe('expected_secret_state');
    });

    it('rejects missing state with state_mismatch even if error is present in query', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: { oauthState: 'valid_session_state' },
        query: { error: 'consent_required' }, // missing state
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=state_mismatch');
    });

    it('handles consent_required / interaction_required gracefully by redirecting to interactive consent flow', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: {
          oauthState: 'valid_session_state',
          returnTo: '/economy',
          save: (cb) => cb(),
        },
        query: {
          error: 'consent_required',
          error_description: 'User must consent to requested scopes',
          state: 'valid_session_state',
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/auth/login?prompt=consent&returnTo=%2Feconomy');
      expect(req.session.oauthState).toBeNull(); // Consumed state
      expect(req.session.consentRetried).toBe(true);
    });

    it('breaks infinite redirect loop if consent_required recurs when consentRetried is already set', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: {
          oauthState: 'valid_session_state',
          consentRetried: true, // Already retried once!
          save: (cb) => cb(),
        },
        query: {
          error: 'consent_required',
          state: 'valid_session_state',
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      // Must abort loop and redirect to login error
      expect(redirectedUrl).toBe('/login?error=consent_required');
      expect(req.session.oauthState).toBeNull();
      expect(req.session.consentRetried).toBeNull();
    });

    it('handles access_denied when user clicks Cancel on Discord prompt', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: {
          oauthState: 'valid_session_state',
          save: (cb) => cb(),
        },
        query: {
          error: 'access_denied',
          state: 'valid_session_state',
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=access_denied');
      expect(req.session.oauthState).toBeNull();
    });

    it('rejects missing code with missing_code when state is valid and no error is present', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: {
          oauthState: 'valid_session_state',
          save: (cb) => cb(),
        },
        query: {
          state: 'valid_session_state',
          // code is missing
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
      };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=missing_code');
    });

    it('deduplicates in-flight code exchanges and shares exchange promise across concurrent requests', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const testCode = 'shared_auth_code_999';
      const testState = 'state_concurrent_123';

      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('/oauth2/token')) {
          fetchCallCount++;
          await new Promise((r) => setTimeout(r, 50));
          return {
            status: 200,
            ok: true,
            text: async () => JSON.stringify({ access_token: 'at_test', refresh_token: 'rt_test', expires_in: 604800 }),
          };
        }
        if (url.includes('/users/@me')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ id: 'discord_u1', username: 'DiscordUser' }),
          };
        }
        return { status: 404, ok: false };
      });

      const makeReq = () => ({
        headers: {},
        session: {
          oauthState: testState,
          returnTo: '/dashboard',
          save: (cb) => cb?.(),
          regenerate: (cb) => cb?.(null),
        },
        query: { code: testCode, state: testState },
      });

      const req1 = makeReq();
      const req2 = makeReq();

      const res1 = { redirect: vi.fn(), status: vi.fn(() => res1), send: vi.fn() };
      const res2 = { redirect: vi.fn(), status: vi.fn(() => res2), send: vi.fn() };

      // Launch both requests simultaneously with the same authorization code
      await Promise.all([
        callbackHandler(req1, res1),
        callbackHandler(req2, res2),
      ]);

      expect(res1.redirect).toHaveBeenCalledWith('/dashboard');
      expect(res2.redirect).toHaveBeenCalledWith('/dashboard');
      // Token endpoint must ONLY have been hit ONCE because the second request attaches to the in-flight promise!
      expect(fetchCallCount).toBe(1);
    });

    it('rejects state that is too short (< 16 characters) with state_mismatch', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const req = {
        headers: {},
        session: { oauthState: 'short' },
        query: { code: 'code123', state: 'short' }, // only 5 chars
      };
      let redirectedUrl = '';
      const res = { redirect: (url) => { redirectedUrl = url; } };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=state_mismatch');
    });

    it('atomically rejects replayed callback when state was already consumed in Redis', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      // Simulate state already consumed
      mockRedis.eval = vi.fn().mockResolvedValue(-1);

      const testState = 'already_consumed_valid_state_1234';
      const req = {
        headers: {},
        session: {
          oauthState: testState,
          save: (cb) => cb?.(),
        },
        query: { code: 'some_code', state: testState },
      };
      let redirectedUrl = '';
      const res = { redirect: (url) => { redirectedUrl = url; } };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=state_already_consumed');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.anything(),
        1,
        `oauth:state:${testState}`,
        expect.anything()
      );
    });

    it('fails closed when Redis throws error during callback state verification without falling back to memory', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      mockRedis.eval = vi.fn().mockRejectedValue(new Error('ECONNREFUSED: Redis offline'));

      const testState = 'error_during_redis_eval_9999';
      const req = {
        headers: {},
        session: {
          id: 'test_session_id',
          oauthState: testState,
          save: (cb) => cb?.(),
        },
        query: { code: 'some_code', state: testState },
      };
      let redirectedUrl = '';
      const res = { redirect: (url) => { redirectedUrl = url; } };

      await callbackHandler(req, res);
      // Must fail closed with auth_service_unavailable instead of bypassing Redis
      expect(redirectedUrl).toBe('/login?error=auth_service_unavailable');
    });

    it('fails closed with 500 when Redis throws error on login state persistence', async () => {
      const loginHandler = routes['GET /auth/login'];
      mockRedis.set = vi.fn().mockRejectedValue(new Error('ETIMEDOUT writing OAuth state'));

      const req = {
        query: {},
        session: {
          id: 'login_fail_session',
          regenerate: (cb) => cb(null),
          save: (cb) => cb(null),
        },
      };
      let statusSent = 0;
      let bodySent = '';
      const res = {
        status: (s) => { statusSent = s; return res; },
        send: (b) => { bodySent = b; },
        redirect: vi.fn(),
      };

      await loginHandler(req, res);
      expect(statusSent).toBe(500);
      expect(bodySent).toContain('Authentication service temporarily unavailable');
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('returns 500 when session store fails to save consumed state', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const testState = 'unpersistable_session_state_9999';
      const req = {
        headers: {},
        session: {
          oauthState: testState,
          save: (cb) => cb?.(new Error('Redis session write failed')),
        },
        query: { code: 'code123', state: testState },
      };
      let statusSent = 0;
      let bodySent = '';
      const res = {
        status: (s) => { statusSent = s; return res; },
        send: (b) => { bodySent = b; },
      };

      await callbackHandler(req, res);
      expect(statusSent).toBe(500);
      expect(bodySent).toContain('Session persistence error');
    });

    it('rejects callback with session_mismatch when valid state was initiated by a different session', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const testState = 'cross_session_attack_state_1234';

      // Mock redis.eval simulating Lua script returning -2 (session mismatch)
      mockRedis.eval = vi.fn().mockResolvedValue(-2);

      const req = {
        headers: {},
        session: {
          id: 'victim_session_uuid_2',
          oauthState: testState,
          save: (cb) => cb?.(),
        },
        query: { code: 'some_code', state: testState },
      };
      let redirectedUrl = '';
      const res = { redirect: (url) => { redirectedUrl = url; } };

      await callbackHandler(req, res);
      expect(redirectedUrl).toBe('/login?error=session_mismatch');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("data.sessionId ~= ARGV[1]"),
        1,
        `oauth:state:${testState}`,
        'victim_session_uuid_2'
      );
    });

    it('stores session-bound state payload in Redis during /auth/login', async () => {
      const loginHandler = routes['GET /auth/login'];
      const req = {
        query: {},
        session: {
          id: 'origin_session_uuid_1',
          regenerate: (cb) => {
            req.session.id = 'regenerated_session_uuid_1';
            cb(null);
          },
          save: (cb) => cb(null),
        },
      };
      let redirectedUrl = '';
      const res = {
        redirect: (url) => { redirectedUrl = url; },
        status: () => res,
        send: vi.fn(),
      };

      await loginHandler(req, res);
      expect(redirectedUrl).toContain('https://discord.com/oauth2/authorize');

      // Verify Redis received JSON payload with regenerated session ID
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth:state:/),
        expect.stringContaining('"sessionId":"regenerated_session_uuid_1"'),
        'EX',
        '600'
      );
    });

    it('ensures callback from Session B does NOT consume Session A state, allowing Session A to succeed subsequently', async () => {
      const callbackHandler = routes['GET /auth/callback'];
      const testState = 'protected_state_across_sessions_123';
      const sessionA_Id = 'session_legitimate_A';
      const sessionB_Id = 'session_attacker_B';

      const redisStore = new Map();
      redisStore.set(`oauth:state:${testState}`, JSON.stringify({ sessionId: sessionA_Id, createdAt: Date.now() }));

      // Real Lua logic simulation for eval
      mockRedis.eval = vi.fn(async (script, keyCount, key, sessionId) => {
        const raw = redisStore.get(key);
        if (!raw) return -1;
        const data = JSON.parse(raw);
        if (sessionId && data?.sessionId && data.sessionId !== sessionId) {
          return -2; // Mismatch: do NOT delete
        }
        redisStore.delete(key);
        return 1;
      });

      // 1. Session B attempts callback using Session A's state
      const reqB = {
        headers: {},
        session: { id: sessionB_Id, oauthState: testState, save: (cb) => cb?.() },
        query: { code: 'code_from_b', state: testState },
      };
      let redirectedUrlB = '';
      const resB = { redirect: (url) => { redirectedUrlB = url; } };

      await callbackHandler(reqB, resB);
      expect(redirectedUrlB).toBe('/login?error=session_mismatch');

      // CRITICAL ASSERTION: State in Redis was NOT consumed by Session B!
      expect(redisStore.has(`oauth:state:${testState}`)).toBe(true);

      // 2. Legitimate Session A now executes callback using the same state
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('/oauth2/token')) {
          return {
            status: 200,
            ok: true,
            text: async () => JSON.stringify({ access_token: 'at_legit_a', refresh_token: 'rt_legit_a', expires_in: 604800 }),
          };
        }
        if (url.includes('/users/@me')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ id: 'discord_legit_user', username: 'LegitUser' }),
          };
        }
        return { status: 404, ok: false };
      });

      const reqA = {
        headers: {},
        session: {
          id: sessionA_Id,
          oauthState: testState,
          returnTo: '/dashboard',
          save: (cb) => cb?.(),
          regenerate: (cb) => cb?.(null),
        },
        query: { code: 'valid_code_for_a', state: testState },
      };
      let redirectedUrlA = '';
      const resA = { redirect: (url) => { redirectedUrlA = url; }, status: () => resA, send: vi.fn() };

      await callbackHandler(reqA, resA);

      // Session A completes login successfully!
      expect(redirectedUrlA).toBe('/dashboard');
      // State is now consumed by Session A
      expect(redisStore.has(`oauth:state:${testState}`)).toBe(false);
    });

    it('cross-process concurrency: Process 1 consumes state and exchanges token, Process 2 gets state_already_consumed without duplicate token burn', async () => {
      const testState = 'state_cross_process_unique_999';
      const sessionId = 'session_cross_proc_123';
      const authCode = 'discord_single_use_auth_code_777';

      const redisStore = new Map();
      redisStore.set(`oauth:state:${testState}`, JSON.stringify({ sessionId, createdAt: Date.now() }));

      // Shared Redis instance with atomic Lua evaluation
      const sharedRedis = {
        get: vi.fn(async (key) => redisStore.get(key) ?? null),
        set: vi.fn(async (key, val) => {
          redisStore.set(key, val);
          return 'OK';
        }),
        del: vi.fn(async (key) => (redisStore.delete(key) ? 1 : 0)),
        eval: vi.fn(async (script, keyCount, key, sId) => {
          const raw = redisStore.get(key);
          if (!raw) return -1; // State already consumed
          let data;
          try { data = JSON.parse(raw); } catch { return -3; }
          if (sId && data?.sessionId && data.sessionId !== sId) {
            return -2; // Session mismatch
          }
          redisStore.delete(key); // Atomic consume
          return 1;
        }),
      };

      // Create two independent Router instances simulating two separate Node.js processes (Process 1 & Process 2)
      // They do NOT share memory (distinct inFlightExchanges Maps), but DO share Redis!
      const proc1 = createAuthRouter({ user: { id: 'bot_proc_1' } }, sharedRedis, mockGuildService);
      const proc2 = createAuthRouter({ user: { id: 'bot_proc_2' } }, sharedRedis, mockGuildService);

      const getCallbackHandler = (routerInstance) => {
        for (const layer of routerInstance.router.stack) {
          if (layer.route && layer.route.path === '/auth/callback') {
            return layer.route.stack[0].handle;
          }
        }
        throw new Error('Callback handler not found');
      };

      const handlerProc1 = getCallbackHandler(proc1);
      const handlerProc2 = getCallbackHandler(proc2);

      let discordTokenCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('/oauth2/token')) {
          discordTokenCallCount++;
          return {
            status: 200,
            ok: true,
            text: async () => JSON.stringify({ access_token: 'at_cross_proc', refresh_token: 'rt_cross_proc', expires_in: 604800 }),
          };
        }
        if (url.includes('/users/@me')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ id: 'cross_proc_user', username: 'CrossProcUser' }),
          };
        }
        return { status: 404, ok: false };
      });

      // Request arriving at Process 1
      const req1 = {
        headers: {},
        session: { id: sessionId, oauthState: testState, returnTo: '/dashboard', save: (cb) => cb?.(), regenerate: (cb) => cb?.(null) },
        query: { code: authCode, state: testState },
      };
      let redirectUrl1 = '';
      const res1 = { redirect: (url) => { redirectUrl1 = url; }, status: () => res1, send: vi.fn() };

      // Request arriving at Process 2 (e.g. proxy duplication or browser retry to Pod 2)
      const req2 = {
        headers: {},
        session: { id: sessionId, oauthState: testState, returnTo: '/dashboard', save: (cb) => cb?.(), regenerate: (cb) => cb?.(null) },
        query: { code: authCode, state: testState },
      };
      let redirectUrl2 = '';
      const res2 = { redirect: (url) => { redirectUrl2 = url; }, status: () => res2, send: vi.fn() };

      // Fire both callbacks concurrently across the two processes!
      await Promise.all([
        handlerProc1(req1, res1),
        handlerProc2(req2, res2),
      ]);

      // Exactly ONE process won the atomic Lua CAS and completed login to /dashboard!
      // The other process received state_already_consumed without calling Discord!
      const redirects = [redirectUrl1, redirectUrl2];
      expect(redirects).toContain('/dashboard');
      expect(redirects).toContain('/login?error=state_already_consumed');

      // CRITICAL ARCHITECTURAL PROOF:
      // Discord OAuth token exchange endpoint was called EXACTLY ONCE!
      // Authorization code was never burned twice, eliminating invalid_grant 400 errors.
      expect(discordTokenCallCount).toBe(1);

      // And state in Redis was atomically consumed
      expect(redisStore.has(`oauth:state:${testState}`)).toBe(false);
    });

    it('replay defense: subsequent callback replay after completion is rejected without touching Discord token endpoint', async () => {
      const testState = 'state_completed_and_consumed_456';
      const sessionId = 'session_already_done';
      const authCode = 'code_already_used';

      const redisStore = new Map();
      // State is already deleted from Redis (already completed earlier)
      const sharedRedis = {
        get: vi.fn(async () => null),
        eval: vi.fn(async () => -1), // Returns -1 (not found / consumed)
      };

      const authInstance = createAuthRouter({ user: { id: 'bot_proc' } }, sharedRedis, mockGuildService);
      let callbackHandler;
      for (const layer of authInstance.router.stack) {
        if (layer.route && layer.route.path === '/auth/callback') {
          callbackHandler = layer.route.stack[0].handle;
        }
      }

      let discordFetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        discordFetchCount++;
        return { status: 200, ok: true };
      });

      const req = {
        headers: {},
        session: { id: sessionId, oauthState: testState, save: (cb) => cb?.() },
        query: { code: authCode, state: testState },
      };
      let redirectUrl = '';
      const res = { redirect: (url) => { redirectUrl = url; } };

      await callbackHandler(req, res);

      // Replay is safely rejected with state_already_consumed
      expect(redirectUrl).toBe('/login?error=state_already_consumed');
      // Discord token endpoint was NOT called
      expect(discordFetchCount).toBe(0);
    });
  });
});

