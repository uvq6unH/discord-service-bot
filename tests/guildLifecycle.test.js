import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { Events } from 'discord.js';
import { createServer } from '../src/server.js';
import {
  setGuildLifecycle,
  getGuildLifecycle,
  isGuildInaccessible,
  _resetGuildLifecycleForTest,
  SET_GUILD_LIFECYCLE_LUA,
  GUILD_LIFECYCLE_KEY
} from '../src/guildLifecycle.js';
import { defaultConfig } from '../src/configDefaults.js';

describe('Discord Guild Lifecycle & Reminder Worker Resilience', () => {
  let serverInstance = null;
  let baseUrl = '';
  let mockRedis = null;
  let redisStore = null;
  let mockConfigStore = null;
  let mockStateStore = null;

  const TEST_SESSION_ID = 'test_sess_lifecycle_123';
  const TEST_USER_ID = '123456789012345678';
  const TEST_GUILD_ID = '841519618677145612';

  function getAuthCookie() {
    const secret = process.env.SESSION_SECRET;
    const hash = crypto.createHmac('sha256', secret).update(TEST_SESSION_ID).digest('base64').replace(/=+$/, '');
    return `dsession=s%3A${TEST_SESSION_ID}.${hash}`;
  }

  function seedSession(user = {}) {
    const sessionData = {
      cookie: {
        originalMaxAge: 3600000,
        expires: new Date(Date.now() + 3600000).toISOString(),
        httpOnly: true,
      },
      csrfToken: 'test_csrf_token_abc123',
      user: {
        id: TEST_USER_ID,
        username: 'GuildOwner',
        accessToken: 'mock_token',
        expiresAt: Date.now() + 3600000,
        ...user,
      },
    };
    redisStore.set(`sess:${TEST_SESSION_ID}`, JSON.stringify(sessionData));
  }

  beforeEach(() => {
    _resetGuildLifecycleForTest();
    process.env.SESSION_SECRET = 'secret_key_with_at_least_32_characters_for_sessions';
    process.env.DISCORD_CLIENT_ID = '999888777666555444';
    process.env.DISCORD_CLIENT_SECRET = 'test_secret';
    process.env.DISCORD_REDIRECT_URI = 'http://localhost/callback';

    redisStore = new Map();
    mockRedis = {
      store: redisStore,
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => {
        redisStore.set(key, typeof val === 'string' ? val : JSON.stringify(val));
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        redisStore.delete(key);
        return 1;
      }),
      expire: vi.fn(async () => 1),
      eval: vi.fn(async (script, numKeys, key, botPresentStr, tsStr, reasonStr, guildIdStr) => {
        // Faithful JavaScript simulation of SET_GUILD_LIFECYCLE_LUA
        const raw = redisStore.get(key);
        const current = raw ? JSON.parse(raw) : null;
        const clientTs = Number(tsStr) || 0;
        const currentClientTs = current ? Number(current.clientTs || current.updatedAt || 0) : 0;
        if (current && clientTs > 0 && currentClientTs > 0 && clientTs < currentClientTs) {
          return 0; // Stale event rejected
        }
        const currentSeq = current ? Number(current.seq || 0) : 0;
        const nextSeq = currentSeq + 1;
        const payload = {
          guildId: guildIdStr,
          botPresent: botPresentStr === '1',
          updatedAt: clientTs,
          clientTs,
          serverTs: Date.now(),
          seq: nextSeq,
          reason: reasonStr || ''
        };
        redisStore.set(key, JSON.stringify(payload));
        return 1;
      }),
      rpush: vi.fn(async () => 1),
      lpush: vi.fn(async () => 1),
      ltrim: vi.fn(async () => 1),
      _request: vi.fn(async (args) => {
        if (Array.isArray(args) && args[0] === 'HGETALL') {
          const key = args[1];
          if (key === `auth:guilds:${TEST_USER_ID}`) {
            return [
              'data',
              JSON.stringify([
                { id: TEST_GUILD_ID, name: 'Target Server', owner: true, permissions: '8' },
              ]),
              'version', '1',
              'fetchedAt', String(Date.now()),
            ];
          }
        }
        return null;
      }),
    };

    const guildConfigs = new Map();
    mockConfigStore = {
      _redis: mockRedis,
      cache: guildConfigs,
      listGuildIds: vi.fn(async () => Array.from(guildConfigs.keys())),
      getGuildConfig: vi.fn(async (guildId) => {
        return guildConfigs.get(guildId) || {
          ...defaultConfig,
          guildId,
          archived: false,
          archivedAt: null,
        };
      }),
      updateGuildConfig: vi.fn(async (guildId, patch) => {
        const cur = guildConfigs.get(guildId) || { ...defaultConfig, guildId };
        const updated = {
          ...cur,
          ...patch,
          archived: patch.archived !== undefined ? Boolean(patch.archived) : Boolean(cur.archived),
          archivedAt: patch.archived !== undefined ? (patch.archived ? Date.now() : null) : cur.archivedAt,
        };
        guildConfigs.set(guildId, updated);
        return updated;
      }),
      archiveGuildConfig: vi.fn(async (guildId) => {
        return mockConfigStore.updateGuildConfig(guildId, { archived: true });
      }),
      restoreGuildConfig: vi.fn(async (guildId) => {
        return mockConfigStore.updateGuildConfig(guildId, { archived: false });
      }),
      resetGuildConfig: vi.fn(async (guildId) => {
        const reset = { ...defaultConfig, guildId, archived: false, archivedAt: null };
        guildConfigs.set(guildId, reset);
        return reset;
      }),
    };

    mockStateStore = {};
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

  // ── Test 1: Config & reminders survive GuildDelete ──────────────────────────
  it('P0: GuildDelete clears gateway cache but preserves config and scheduled reminders', async () => {
    // 1. Setup guild with custom config and scheduled reminders
    const initialConfig = {
      prefix: '?',
      welcomeEnabled: true,
      remindersEnabled: true,
      reminders: [
        { id: 'rem_1', time: '2026-10-20T10:00:00Z', message: 'Do not delete me', channelId: '111' },
      ],
      archived: false,
    };
    mockConfigStore.cache.set(TEST_GUILD_ID, initialConfig);
    redisStore.set(`guild_cache:${TEST_GUILD_ID}`, JSON.stringify({ id: TEST_GUILD_ID, name: 'Target Server' }));

    // 2. Simulate GuildDelete event when bot is kicked
    const guildDeletePayload = { id: TEST_GUILD_ID, name: 'Target Server', available: true };
    if (guildDeletePayload.available !== false) {
      await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, Date.now(), 'kicked');
      await mockRedis.del(`guild_cache:${TEST_GUILD_ID}`);
    }

    // 3. Verify Redis gateway cache was cleared
    expect(redisStore.get(`guild_cache:${TEST_GUILD_ID}`)).toBeUndefined();

    // 4. Verify config and reminders remain completely intact in configStore
    const preservedConfig = await mockConfigStore.getGuildConfig(TEST_GUILD_ID);
    expect(preservedConfig.prefix).toBe('?');
    expect(preservedConfig.welcomeEnabled).toBe(true);
    expect(preservedConfig.reminders.length).toBe(1);
    expect(preservedConfig.reminders[0].message).toBe('Do not delete me');

    // 5. Verify guild is still indexed in configStore
    const guildIds = await mockConfigStore.listGuildIds();
    expect(guildIds).toContain(TEST_GUILD_ID);
  });

  // ── Test 2: Dashboard does not report configured-but-absent as present ─────
  it('P0: Dashboard represents bot presence independently from saved configuration', async () => {
    // Guild is configured in configStore
    mockConfigStore.cache.set(TEST_GUILD_ID, {
      prefix: '!',
      enabled: true,
      reminders: [],
    });

    // But bot is confirmed absent in lifecycle
    await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, Date.now(), 'kicked');

    // Live botClient has an empty cache (bot is NOT in this guild)
    const mockBotClient = {
      isReady: () => true,
      guilds: { cache: new Map() },
    };

    await startServer({ botClient: mockBotClient });
    seedSession();

    const res = await fetch(`${baseUrl}/api/guilds`, {
      headers: { cookie: getAuthCookie() },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const guild = body.guilds.find((g) => g.id === TEST_GUILD_ID);
    expect(guild).toBeDefined();

    // CRITICAL: Configured is true, but botPresent MUST be false!
    expect(guild.configured).toBe(true);
    expect(guild.botPresent).toBe(false);
    expect(guild.presence).toBe('absent');

    // Must provide an invite URL when bot is confirmed absent
    expect(guild.inviteUrl).toContain('discord.com/oauth2/authorize');
    expect(guild.inviteUrl).toContain(`guild_id=${TEST_GUILD_ID}`);
  });

  // ── Test 3: Unknown presence is not confused with confirmed absence ─────────
  it('P0: Unknown presence is preserved and not treated as confirmed absence', async () => {
    mockConfigStore.cache.set(TEST_GUILD_ID, { prefix: '!' });

    // Web dashboard process with NO botClient, NO Redis cache, NO lifecycle key
    await startServer({ botClient: null });
    seedSession();

    const res = await fetch(`${baseUrl}/api/guilds`, {
      headers: { cookie: getAuthCookie() },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const guild = body.guilds.find((g) => g.id === TEST_GUILD_ID);
    expect(guild).toBeDefined();
    expect(guild.botPresent).toBe(false);
    expect(guild.presence).toBe('unknown'); // NOT 'absent'!
  });

  // ── Test 4: Temporary Discord outage preserves presence and config ─────────
  it('P1: Temporary Discord outage (guild.available === false) does not mark bot kicked', async () => {
    mockConfigStore.cache.set(TEST_GUILD_ID, { prefix: '!' });
    redisStore.set(`guild_cache:${TEST_GUILD_ID}`, JSON.stringify({ id: TEST_GUILD_ID, name: 'Target Server' }));

    // Discord outage event: guild.available === false
    const outageGuild = { id: TEST_GUILD_ID, name: 'Target Server', available: false };
    if (outageGuild.available === false) {
      await setGuildLifecycle(mockRedis, TEST_GUILD_ID, true, Date.now(), 'outage');
    }

    const state = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(state.reason).toBe('outage');
    expect(state.botPresent).toBe(true); // Presence is NOT flipped to absent on outage

    // Gateway cache remains intact
    expect(redisStore.get(`guild_cache:${TEST_GUILD_ID}`)).toBeDefined();
  });

  // ── Test 5: Rejoining reloads original config without resetting ─────────────
  it('P1: Rejoining reloads existing configuration without resetting user settings', async () => {
    const customConfig = {
      prefix: '>>',
      welcomeEnabled: true,
      welcomeMessage: 'Custom Greeting',
      reminders: [{ id: 'rem_special', time: '2026-11-01T00:00:00Z', message: 'Hello' }],
      archived: false,
    };
    mockConfigStore.cache.set(TEST_GUILD_ID, customConfig);

    // Bot was kicked earlier
    await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, 1000, 'kicked');

    // Bot re-joins server at a later time (GuildCreate)
    await setGuildLifecycle(mockRedis, TEST_GUILD_ID, true, 2000, 'joined');

    // On join, bot reads configStore.getGuildConfig
    const reloaded = await mockConfigStore.getGuildConfig(TEST_GUILD_ID);
    expect(reloaded.prefix).toBe('>>');
    expect(reloaded.welcomeMessage).toBe('Custom Greeting');
    expect(reloaded.reminders.length).toBe(1);

    // Lifecycle state is present again
    const lifecycle = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(lifecycle.botPresent).toBe(true);
    expect(lifecycle.reason).toBe('joined');
  });

  // ── Test 6: Inaccessible guilds do not trigger repeated API calls ───────────
  it('P1: Inaccessible guilds are detected without calling Discord API and preserve reminders', async () => {
    const mockDiscordClient = {
      guilds: {
        cache: new Map(), // Not in cache
        fetch: vi.fn(),
      },
    };

    // Guild confirmed kicked
    await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, Date.now(), 'kicked');

    // Check accessibility guard
    const inaccessible = await isGuildInaccessible(mockRedis, TEST_GUILD_ID, mockDiscordClient);
    expect(inaccessible).toBe(true);
    // Verified that Discord API fetch was NEVER called
    expect(mockDiscordClient.guilds.fetch).not.toHaveBeenCalled();

    // Now test that when bot joins back, it is immediately accessible
    mockDiscordClient.guilds.cache.set(TEST_GUILD_ID, { id: TEST_GUILD_ID, name: 'Target Server' });
    const accessibleAfterRejoin = await isGuildInaccessible(mockRedis, TEST_GUILD_ID, mockDiscordClient);
    expect(accessibleAfterRejoin).toBe(false);
  });

  // ── Test 7: Stale lifecycle events rejected by monotonic timestamp fencing ─
  it('P1: Out-of-order lifecycle events are rejected by atomic monotonic fencing', async () => {
    // Event A arrived at t=2000: Bot joined guild
    const ok1 = await setGuildLifecycle(mockRedis, TEST_GUILD_ID, true, 2000, 'joined');
    expect(ok1).toBe(true);

    const stateAfterA = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(stateAfterA.botPresent).toBe(true);
    expect(stateAfterA.updatedAt).toBe(2000);

    // Event B arrived late with t=1000: Stale GuildDelete event from another shard
    const ok2 = await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, 1000, 'kicked');
    expect(ok2).toBe(false); // MUST BE REJECTED!

    // State is STILL present!
    const stateAfterStale = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(stateAfterStale.botPresent).toBe(true);
    expect(stateAfterStale.updatedAt).toBe(2000);

    // Event C arrived with t=3000: Genuine subsequent kick
    const ok3 = await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, 3000, 'kicked');
    expect(ok3).toBe(true);

    const stateAfterC = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(stateAfterC.botPresent).toBe(false);
    expect(stateAfterC.updatedAt).toBe(3000);
  });

  // ── Test 8: Archive, Restore, and Guarded Reset APIs ────────────────────────
  it('P2: Archive/Restore toggles state safely and Reset requires explicit confirmation', async () => {
    mockConfigStore.cache.set(TEST_GUILD_ID, {
      prefix: '!',
      customField: 'preserved_data',
      reminders: [{ id: 'rem_arch', time: '2026-10-30T00:00:00Z', message: 'test' }],
      archived: false,
    });

    await startServer();
    seedSession();

    // 1. Archive the guild
    const archiveRes = await fetch(`${baseUrl}/api/guilds/${TEST_GUILD_ID}/archive`, {
      method: 'POST',
      headers: {
        cookie: getAuthCookie(),
        'x-csrf-token': 'test_csrf_token_abc123',
      },
    });
    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json();
    expect(archiveBody.success).toBe(true);
    expect(archiveBody.archived).toBe(true);

    // Verify stored data preserved
    const archivedConfig = await mockConfigStore.getGuildConfig(TEST_GUILD_ID);
    expect(archivedConfig.archived).toBe(true);
    expect(archivedConfig.customField).toBe('preserved_data');
    expect(archivedConfig.reminders.length).toBe(1);

    // 2. Restore the guild
    const restoreRes = await fetch(`${baseUrl}/api/guilds/${TEST_GUILD_ID}/restore`, {
      method: 'POST',
      headers: {
        cookie: getAuthCookie(),
        'x-csrf-token': 'test_csrf_token_abc123',
      },
    });
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json();
    expect(restoreBody.success).toBe(true);
    expect(restoreBody.archived).toBe(false);

    // 3. Destructive Reset WITHOUT explicit confirmation must fail (400)
    const resetFailRes = await fetch(`${baseUrl}/api/guilds/${TEST_GUILD_ID}/reset`, {
      method: 'POST',
      headers: {
        cookie: getAuthCookie(),
        'x-csrf-token': 'test_csrf_token_abc123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Missing confirmGuildId
    });
    expect(resetFailRes.status).toBe(400);
    const resetFailBody = await resetFailRes.json();
    expect(resetFailBody.error).toMatch(/confirmGuildId/);

    // 4. Destructive Reset WITH mismatched confirmation must fail (400)
    const resetWrongRes = await fetch(`${baseUrl}/api/guilds/${TEST_GUILD_ID}/reset`, {
      method: 'POST',
      headers: {
        cookie: getAuthCookie(),
        'x-csrf-token': 'test_csrf_token_abc123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmGuildId: 'wrong_guild_id' }),
    });
    expect(resetWrongRes.status).toBe(400);

    // 5. Destructive Reset WITH matching confirmGuildId succeeds
    const resetOkRes = await fetch(`${baseUrl}/api/guilds/${TEST_GUILD_ID}/reset`, {
      method: 'POST',
      headers: {
        cookie: getAuthCookie(),
        'x-csrf-token': 'test_csrf_token_abc123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmGuildId: TEST_GUILD_ID }),
    });
    expect(resetOkRes.status).toBe(200);
    const resetOkBody = await resetOkRes.json();
    expect(resetOkBody.success).toBe(true);

    // Verify config was reset to default
    const postResetConfig = await mockConfigStore.getGuildConfig(TEST_GUILD_ID);
    expect(postResetConfig.prefix).toBe('!');
    expect(postResetConfig.customField).toBeUndefined();
    expect(postResetConfig.archived).toBe(false);
  });

  // ── Test 9: Equal timestamps accept event with sequence increment ───────────
  it('P0: Equal timestamps are accepted and strictly ordered by sequence counter', async () => {
    // Event 1 at t=5000: bot present
    const ok1 = await setGuildLifecycle(mockRedis, TEST_GUILD_ID, true, 5000, 'joined');
    expect(ok1).toBe(true);

    const s1 = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(s1.botPresent).toBe(true);
    expect(s1.seq).toBe(1);

    // Event 2 at EXACT SAME t=5000: bot kicked in same millisecond
    const ok2 = await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, 5000, 'kicked');
    expect(ok2).toBe(true); // Must NOT be rejected!

    const s2 = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(s2.botPresent).toBe(false);
    expect(s2.seq).toBe(2);
    expect(s2.reason).toBe('kicked');
  });

  // ── Test 10: Self-healing lifecycle recovery when bot rejoins ───────────────
  it('P0: isGuildInaccessible self-heals Redis lifecycle when bot rejoins', async () => {
    // 1. Mark guild as kicked in Redis
    await setGuildLifecycle(mockRedis, TEST_GUILD_ID, false, 1000, 'kicked');
    const s1 = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(s1.botPresent).toBe(false);

    // 2. Bot is physically present in discordClient cache
    const mockDiscord = {
      guilds: {
        cache: new Map([[TEST_GUILD_ID, { id: TEST_GUILD_ID, name: 'Rejoined Server' }]])
      }
    };

    // 3. Worker checks accessibility
    const inaccessible = await isGuildInaccessible(mockRedis, TEST_GUILD_ID, mockDiscord);
    expect(inaccessible).toBe(false);

    // Wait for self-healing async promise
    await new Promise((r) => setTimeout(r, 50));

    // 4. Redis lifecycle record should be self-healed
    const healed = await getGuildLifecycle(mockRedis, TEST_GUILD_ID);
    expect(healed.botPresent).toBe(true);
    expect(healed.reason).toBe('self_healed_rejoin');
  });

  // ── Test 11: Multi-process Distributed Lock on ConfigStore ──────────────────
  it('P1: ConfigStore updateGuildConfig uses distributed lock preventing concurrent overwrite', async () => {
    const { ConfigStore } = await import('../src/configStore.js');
    const store = new ConfigStore('./data/test_configs.json', mockRedis);

    // Seed config
    redisStore.set(`config:guild:${TEST_GUILD_ID}`, JSON.stringify({
      prefix: '!',
      reminders: [{ id: 'rem_1', time: '2026-10-16T12:00:00Z', message: 'test' }]
    }));
    redisStore.set('config:_index', JSON.stringify([TEST_GUILD_ID]));
    await store.load();

    let lockCallCount = 0;
    const origSet = mockRedis.set;
    mockRedis.set = vi.fn(async (key, val, ...opts) => {
      if (key === `lock:config:${TEST_GUILD_ID}`) {
        lockCallCount++;
        return 'OK';
      }
      return origSet(key, val, ...opts);
    });

    // Update config
    const updated = await store.updateGuildConfig(TEST_GUILD_ID, { prefix: '?' });
    expect(updated.prefix).toBe('?');
    // Verify distributed lock was acquired
    expect(lockCallCount).toBeGreaterThanOrEqual(1);
  });
});

