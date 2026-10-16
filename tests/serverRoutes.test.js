import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';

describe('Express Server & API Routes (src/server.js)', () => {
  let serverInstance = null;
  let baseUrl = '';
  let mockRedis = null;
  let redisStore = null;
  let mockConfigStore = null;
  let mockStateStore = null;

  const TEST_SESSION_ID = 'test_session_12345';
  const TEST_USER_ID = '123456789012345678';
  const TEST_GUILD_ID = '987654321098765432';

  function getAuthCookie() {
    const secret = process.env.SESSION_SECRET;
    const hash = crypto.createHmac('sha256', secret).update(TEST_SESSION_ID).digest('base64').replace(/\=+$/, '');
    return `dsession=s%3A${TEST_SESSION_ID}.${hash}`;
  }

  function seedSession(user = {}) {
    const sessionData = {
      cookie: {
        originalMaxAge: 3600000,
        expires: new Date(Date.now() + 3600000).toISOString(),
        httpOnly: true,
      },
      user: {
        id: TEST_USER_ID,
        username: 'TestAdmin',
        accessToken: 'mock_access_token',
        expiresAt: Date.now() + 3600000,
        ...user,
      },
    };
    redisStore.set(`sess:${TEST_SESSION_ID}`, JSON.stringify(sessionData));
  }

  beforeEach(() => {
    process.env.SESSION_SECRET = 'super_secret_session_key_that_is_at_least_32_characters_long';
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    process.env.DISCORD_CLIENT_SECRET = 'client_secret_xyz';
    process.env.DISCORD_REDIRECT_URI = 'http://localhost/callback';

    redisStore = new Map();
    mockRedis = {
      store: redisStore,
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val, ...args) => {
        redisStore.set(key, typeof val === 'string' ? val : JSON.stringify(val));
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        redisStore.delete(key);
        return 1;
      }),
      expire: vi.fn(async () => 1),
      rpush: vi.fn(async () => 1),
      lpush: vi.fn(async () => 1),
      ltrim: vi.fn(async () => 1),
      eval: vi.fn(async () => 1),
      _request: vi.fn(async (args) => {
        if (Array.isArray(args) && args[0] === 'HGETALL') {
          const key = args[1];
          if (key === `auth:guilds:${TEST_USER_ID}`) {
            return [
              'data',
              JSON.stringify([
                { id: TEST_GUILD_ID, name: 'Test Guild', owner: true, permissions: '8' },
              ]),
              'version',
              '1',
              'fetchedAt',
              String(Date.now()),
            ];
          }
        }
        return null;
      }),
    };

    mockConfigStore = {
      _redis: mockRedis,
      getGuildConfig: vi.fn(async (guildId) => ({
        prefix: '!',
        commands: [],
        enabled: true,
      })),
      updateGuildConfig: vi.fn(async (guildId, patch) => patch),
    };

    mockStateStore = {
      getBalance: vi.fn(async () => ({ silver: 100, gold: 5 })),
    };
  });

  afterEach(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
      serverInstance = null;
    }
  });

  async function startServer({ botClient = null } = {}) {
    const app = createServer({
      configStore: mockConfigStore,
      stateStore: mockStateStore,
      botClient,
      redis: mockRedis,
    });

    return new Promise((resolve) => {
      serverInstance = app.listen(0, '127.0.0.1', () => {
        const port = serverInstance.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve(app);
      });
    });
  }

  it('fails to initialize if SESSION_SECRET is missing', () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;

    expect(() =>
      createServer({
        configStore: mockConfigStore,
        stateStore: mockStateStore,
        botClient: null,
        redis: mockRedis,
      })
    ).toThrow(/SESSION_SECRET is required/);

    process.env.SESSION_SECRET = original;
  });

  it('serves GET /health with security headers from helmet', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('ok');

    // Verify security headers applied by helmet
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBeDefined();
  });

  it('protects private endpoints from unauthenticated requests', async () => {
    await startServer();

    // GET /api/invite-url without session should be rejected with 401 or redirect
    const resInvite = await fetch(`${baseUrl}/api/invite-url`);
    expect([401, 302]).toContain(resInvite.status);

    // GET /api/guilds without session
    const resGuilds = await fetch(`${baseUrl}/api/guilds`);
    expect([401, 302]).toContain(resGuilds.status);
  });

  it('generates CSRF token via GET /api/csrf-token for authenticated user', async () => {
    seedSession();
    await startServer();

    const res = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: { Cookie: getAuthCookie() },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.csrfToken).toBe('string');
    expect(data.csrfToken.length).toBeGreaterThan(16);
  });

  it('validates Discord snowflake on guild endpoints and rejects invalid formats', async () => {
    seedSession();
    await startServer();

    // Invalid non-snowflake string
    const res = await fetch(`${baseUrl}/api/guild-data?guildId=not-a-snowflake`, {
      headers: { Cookie: getAuthCookie() },
    });
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('snowflake');
  });

  it('returns HTTP 503 on cold cache miss when botClient is null (Split Mode)', async () => {
    seedSession();
    await startServer({ botClient: null });

    // Redis cache does not have guild_cache:987654321098765432
    const res = await fetch(`${baseUrl}/api/guild-data?guildId=${TEST_GUILD_ID}`, {
      headers: { Cookie: getAuthCookie() },
    });
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.error).toContain('Guild cache not available');
  });

  it('returns cached guild data on cache hit in Split Mode', async () => {
    const cachedMeta = {
      id: TEST_GUILD_ID,
      name: 'Cached Guild',
      channels: [{ id: 'ch_1', name: 'general', type: 0 }],
      roles: [{ id: 'r_1', name: 'Member' }],
    };

    redisStore.set(`guild_cache:${TEST_GUILD_ID}`, JSON.stringify(cachedMeta));
    seedSession();

    await startServer({ botClient: null });

    const res = await fetch(`${baseUrl}/api/guild-data?guildId=${TEST_GUILD_ID}`, {
      headers: { Cookie: getAuthCookie() },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('Cached Guild');
    expect(data.channels.length).toBe(1);
    expect(data.roles.length).toBe(1);
  });

  it('enforces payload limit of 128kb on JSON bodies', async () => {
    await startServer();

    // Generate huge string > 150KB
    const hugePayload = { data: 'a'.repeat(160 * 1024) };

    const res = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hugePayload),
    });

    // Express json parser returns 413 Payload Too Large
    expect(res.status).toBe(413);
  });
});
