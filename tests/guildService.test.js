import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGuildService } from '../src/guildService.js';

describe('Guild Service (src/guildService.js)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createMockRedis() {
    const memory = new Map();
    return {
      memory,
      get: vi.fn(async (key) => memory.get(key) ?? null),
      set: vi.fn(async (key, val, ex, ttl, nx) => {
        if (nx && memory.has(key)) return null;
        memory.set(key, val);
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        memory.delete(key);
        return 1;
      }),
      _request: vi.fn(async (args) => {
        if (args[0] === 'HGETALL') {
          const key = args[1];
          const val = memory.get(key);
          if (!val) return [];
          return ['data', val.data, 'version', String(val.version), 'fetchedAt', String(val.fetchedAt)];
        }
        return [];
      }),
      eval: vi.fn(async (script, keyCount, key, ...args) => {
        if (script.includes('hset')) {
          const [version, data, ttl, fetchedAt] = args;
          memory.set(key, { data, version, fetchedAt });
          return 1;
        }
        if (script.includes('del')) {
          memory.delete(key);
          return 1;
        }
        return 0;
      }),
    };
  }

  it('rejects call when userId is missing', async () => {
    const service = createGuildService(null);
    const result = await service.fetchAndCacheUserGuilds(null, 'valid_token');
    expect(result.status).toBe('error');
    expect(result.error).toContain('UserId missing');
  });

  it('fetches guilds from Discord API on cold cache miss and caches them', async () => {
    const mockGuilds = [
      { id: 'guild_1', name: 'Server One', permissions: '8' },
      { id: 'guild_2', name: 'Server Two', permissions: '0' },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGuilds,
    });

    const mockRedis = createMockRedis();
    const service = createGuildService(mockRedis);

    const result = await service.fetchAndCacheUserGuilds('user_100', 'access_token_123');

    expect(result.status).toBe('ready');
    expect(result.guilds).toEqual(mockGuilds);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Verify cache hit on second fetch within soft TTL
    const secondResult = await service.fetchAndCacheUserGuilds('user_100', 'access_token_123');
    expect(secondResult.status).toBe('ready');
    expect(secondResult.guilds).toEqual(mockGuilds);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // No new network call!
  });

  it('returns syncing state immediately when lock is held by another process', async () => {
    const mockRedis = createMockRedis();
    // Simulate lock held
    mockRedis.set('lock:guilds:user_locked', 'other_worker_token');

    const service = createGuildService(mockRedis);
    const result = await service.fetchAndCacheUserGuilds('user_locked', 'access_token_xyz');

    expect(result.status).toBe('syncing');
    expect(result.retryAfter).toBe(2);
  });

  it('handles Discord 429 rate limit and activates backoff', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (h) => (h === 'retry-after' ? '3' : null),
      },
    });

    const mockRedis = createMockRedis();
    const service = createGuildService(mockRedis);

    const result = await service.fetchAndCacheUserGuilds('user_rl', 'access_token_rl');
    expect(result.status).toBe('error');
    expect(result.error).toContain('Discord Rate Limit (429)');

    // Second call immediately must be intercepted by rate limit check
    const secondResult = await service.fetchAndCacheUserGuilds('user_rl', 'access_token_rl');
    expect(secondResult.status).toBe('rate-limited');
    expect(secondResult.guilds).toEqual([]);
  });

  it('works seamlessly in in-memory mode when Redis is null', async () => {
    const mockGuilds = [{ id: 'guild_mem', name: 'Memory Server' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGuilds,
    });

    const service = createGuildService(null);

    const res1 = await service.fetchAndCacheUserGuilds('user_mem', 'token_mem');
    expect(res1.status).toBe('ready');
    expect(res1.guilds).toEqual(mockGuilds);

    const res2 = await service.fetchAndCacheUserGuilds('user_mem', 'token_mem');
    expect(res2.status).toBe('ready');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await service.invalidateUserGuildsCache('user_mem');
    const res3 = await service.fetchAndCacheUserGuilds('user_mem', 'token_mem');
    expect(res3.status).toBe('ready');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
