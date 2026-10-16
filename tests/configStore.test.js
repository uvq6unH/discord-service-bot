import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultConfig } from '../src/configDefaults.js';

let mockRedisClient = null;

vi.mock('../src/upstash.js', () => ({
  createUpstashFromEnv: vi.fn(() => mockRedisClient),
}));

import { ConfigStore } from '../src/configStore.js';

describe('Config Defaults & Patching', () => {
  it('should contain default values for prefix and disabledCommands', () => {
    expect(defaultConfig.prefix).toBe('!');
    expect(Array.isArray(defaultConfig.disabledCommands)).toBe(true);
    expect(defaultConfig.disabledCommands.length).toBe(0);
  });

  it('should contain core commands', () => {
    expect(Array.isArray(defaultConfig.core?.commands)).toBe(true);
    const pingCmd = defaultConfig.core.commands.find(c => c.name === 'ping');
    expect(pingCmd).toBeDefined();
    expect(pingCmd?.type).toBe('ping');
  });
});

describe('ConfigStore Implementation (src/configStore.js)', () => {
  let redisStorage;

  beforeEach(() => {
    redisStorage = new Map();
    mockRedisClient = {
      get: vi.fn(async (key) => redisStorage.get(key) ?? null),
      set: vi.fn(async (key, val, ...args) => {
        if (args.includes('NX') && redisStorage.has(key)) {
          return null;
        }
        redisStorage.set(key, val);
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        redisStorage.delete(key);
        return 1;
      }),
      eval: vi.fn(async (script, numkeys, ...args) => {
        if (typeof script === 'string' && script.includes('del')) {
          const k = args[0];
          const tok = args[1];
          if (redisStorage.get(k) === tok) {
            redisStorage.delete(k);
            return 1;
          }
          return 0;
        }
        return 'OK';
      }),
    };
  });

  it('throws error on instantiation when Upstash Redis is not configured', () => {
    mockRedisClient = null;
    expect(() => new ConfigStore()).toThrow(/ConfigStore requires UPSTASH_REDIS_REST_URL/);
  });

  it('initializes and loads existing guild configs from Redis index', async () => {
    const existingConfig = {
      prefix: '?',
      welcomeEnabled: true,
      welcomeChannelId: '123456789012345678',
    };
    redisStorage.set('config:_index', JSON.stringify(['guild_101']));
    redisStorage.set('config:guild:guild_101', JSON.stringify(existingConfig));

    const store = new ConfigStore();
    await store.ready;

    const guildIds = await store.listGuildIds();
    expect(guildIds).toEqual(['guild_101']);

    const config = await store.getGuildConfig('guild_101');
    expect(config.prefix).toBe('?');
    expect(config.welcomeEnabled).toBe(true);
    expect(config.welcomeChannelId).toBe('123456789012345678');
  });

  it('returns default config when fetching an unconfigured guild', async () => {
    const store = new ConfigStore();
    await store.ready;

    const config = await store.getGuildConfig('guild_new');
    expect(config.prefix).toBe('!');
    expect(config.welcomeEnabled).toBe(false);
    expect(config.autoReplyEnabled).toBe(true);
    expect(Array.isArray(config.commands)).toBe(true);
  });

  it('updates guild config, validates inputs, and serializes to Redis', async () => {
    const store = new ConfigStore();
    await store.ready;

    const updated = await store.updateGuildConfig('guild_test', {
      prefix: '>>',
      welcomeEnabled: true,
      welcomeChannelId: '987654321098765432',
      welcomeMessage: 'Welcome to our server!',
      remindersEnabled: true,
      reminders: [
        {
          id: 'rem_1',
          time: '2026-10-12T10:00:00.000Z',
          message: 'Standup',
          channelId: '111222333444555666',
        },
      ],
    });

    expect(updated.prefix).toBe('>>');
    expect(updated.welcomeEnabled).toBe(true);
    expect(updated.reminders.length).toBe(1);
    expect(updated.reminders[0].id).toBe('rem_1');

    // Verify written into Redis
    expect(redisStorage.has('config:guild:guild_test')).toBe(true);
    const savedInRedis = JSON.parse(redisStorage.get('config:guild:guild_test'));
    expect(savedInRedis.prefix).toBe('>>');
  });

  it('serializes concurrent updates for the same guild via mutex lock', async () => {
    const store = new ConfigStore();
    await store.ready;

    // Concurrent updates to same guild
    const p1 = store.updateGuildConfig('guild_concurrent', { prefix: '$' });
    const p2 = store.updateGuildConfig('guild_concurrent', { autoReplyEnabled: true });
    const p3 = store.updateGuildConfig('guild_concurrent', { mentionReactEnabled: true, mentionReactEmoji: '🎉' });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    const finalConfig = await store.getGuildConfig('guild_concurrent');

    expect(finalConfig.prefix).toBe('$');
    expect(finalConfig.autoReplyEnabled).toBe(true);
    expect(finalConfig.mentionReactEnabled).toBe(true);
    expect(finalConfig.mentionReactEmoji).toBe('🎉');
  });

  it('invalidates cache correctly for specific guild or all guilds', async () => {
    const store = new ConfigStore();
    await store.ready;

    await store.updateGuildConfig('guild_inv', { prefix: '!' });
    expect(store.cache['guild_inv']).toBeDefined();

    store.invalidate('guild_inv');
    expect(store.cache['guild_inv']).toBeUndefined();

    await store.updateGuildConfig('guild_inv_2', { prefix: '!' });
    store.invalidate();
    expect(Object.keys(store.cache).length).toBe(0);
  });
});
