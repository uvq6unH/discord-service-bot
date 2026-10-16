import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Events } from 'discord.js';
import {
  writeGuildMetaCache,
  scheduleGuildMetaRefresh,
  metaDebounceTimers,
  pendingReconcileGuilds,
  reconcilePendingGuilds,
  REDIS_PENDING_RECONCILE_KEY
} from '../src/bot.js';
import {
  extractRetryAfterMs,
  handleChannelRenameError,
  isChannelRenameUnderCooldown,
  channelRenameCooldowns
} from '../src/bot/services/countersEngine.js';

describe('Gateway Cache Recovery & Dynamic Rate Limiting', () => {
  beforeEach(() => {
    metaDebounceTimers.clear();
    channelRenameCooldowns.clear();
    pendingReconcileGuilds.clear();
  });

  describe('writeGuildMetaCache & Redis Failure Recovery', () => {
    it('retries writeGuildMetaCache on transient Redis failure', async () => {
      let attempts = 0;
      const mockRedis = {
        set: vi.fn(async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('ETIMEDOUT: Upstash Redis connection timed out');
          }
          return 'OK';
        }),
      };

      const mockGuild = {
        id: 'guild_recovery_1',
        name: 'Alpha Guild',
        iconURL: vi.fn(() => 'https://cdn.discordapp.com/icons/g1/icon.png'),
        memberCount: 150,
        ownerId: 'owner_1',
        channels: {
          fetch: vi.fn(async () => new Map([
            ['c1', { id: 'c1', name: 'general', type: 0 }],
            ['c2', { id: 'c2', name: 'voice', type: 2 }],
          ])),
          cache: new Map(),
        },
        roles: {
          fetch: vi.fn(async () => [
            { id: 'r1', name: 'Admin', rawPosition: 10, color: 0xff0000 },
          ]),
          cache: new Map(),
        },
      };

      // Call writeGuildMetaCache with retries = 1
      await writeGuildMetaCache(mockGuild, mockRedis, 1);

      // First attempt threw error and scheduled retry after 1500ms
      expect(attempts).toBe(1);

      // Fast-forward or wait for retry timeout
      await new Promise((r) => setTimeout(r, 1600));

      expect(attempts).toBe(2);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('debounces multiple rapid events for the same guild before writing to Redis', async () => {
      const mockRedis = {
        set: vi.fn().mockResolvedValue('OK'),
      };

      const mockGuild = {
        id: 'guild_debounce_1',
        name: 'Rapid Guild',
        iconURL: vi.fn(() => null),
        memberCount: 20,
        ownerId: 'owner_1',
        channels: {
          fetch: vi.fn(async () => new Map()),
        },
        roles: {
          fetch: vi.fn(async () => []),
        },
      };

      // Rapidly fire 3 events (e.g. ChannelCreate, ChannelUpdate, RoleCreate)
      scheduleGuildMetaRefresh(mockGuild, mockRedis, 100);
      scheduleGuildMetaRefresh(mockGuild, mockRedis, 100);
      scheduleGuildMetaRefresh(mockGuild, mockRedis, 100);

      expect(metaDebounceTimers.has(mockGuild.id)).toBe(true);

      // Wait for debounce timer (100ms) to trigger
      await new Promise((r) => setTimeout(r, 150));

      // Must have consolidated into a single Redis write call
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('enqueues failed guild into pendingReconcileGuilds when retries are exhausted and reconciles when Redis recovers', async () => {
      const brokenRedis = {
        set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED: Redis offline')),
      };

      const mockGuild = {
        id: 'guild_offline_1',
        name: 'Offline Guild',
        iconURL: vi.fn(() => null),
        memberCount: 50,
        ownerId: 'owner_offline',
        channels: { fetch: vi.fn(async () => new Map()) },
        roles: { fetch: vi.fn(async () => []) },
      };

      // Attempt write with 0 retries remaining
      await writeGuildMetaCache(mockGuild, brokenRedis, 0);

      // Guild ID must be safely recorded in pendingReconcileGuilds
      expect(pendingReconcileGuilds.has('guild_offline_1')).toBe(true);

      // Now simulate Redis recovering and bot client reconciling
      const healthyRedis = {
        set: vi.fn().mockResolvedValue('OK'),
      };
      const mockClient = {
        guilds: {
          cache: new Map([['guild_offline_1', mockGuild]]),
        },
      };

      const recoveredCount = await reconcilePendingGuilds(mockClient, healthyRedis);

      expect(recoveredCount).toBe(1);
      expect(healthyRedis.set).toHaveBeenCalledTimes(1);
      // Drained from pending set
      expect(pendingReconcileGuilds.has('guild_offline_1')).toBe(false);
    });

    it('keeps failed guild in pendingReconcileGuilds if reconciliation fails midway', async () => {
      pendingReconcileGuilds.add('guild_intermittent_1');

      const intermittentRedis = {
        set: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Redis still flaky')),
      };
      const mockGuild = {
        id: 'guild_intermittent_1',
        name: 'Intermittent Guild',
        iconURL: vi.fn(() => null),
        memberCount: 10,
        ownerId: 'owner_1',
        channels: { fetch: vi.fn(async () => new Map()) },
        roles: { fetch: vi.fn(async () => []) },
      };
      const mockClient = {
        guilds: {
          cache: new Map([['guild_intermittent_1', mockGuild]]),
        },
      };

      const count = await reconcilePendingGuilds(mockClient, intermittentRedis);

      // Did not recover
      expect(count).toBe(0);
      // Guild remains in pending set for subsequent ShardResume or interval
      expect(pendingReconcileGuilds.has('guild_intermittent_1')).toBe(true);
    });

    it('recovers persisted pending guilds from Redis after simulated process restart', async () => {
      // Simulate: process crashed previously, leaving 'guild_crashed_restart' in Redis set
      const redisPersistedSet = new Set(['guild_crashed_restart']);
      const mockRedis = {
        smembers: vi.fn(async (key) => [...redisPersistedSet]),
        srem: vi.fn(async (key, member) => { redisPersistedSet.delete(member); return 1; }),
        set: vi.fn().mockResolvedValue('OK'),
      };

      // Simulate a fresh process start: pendingReconcileGuilds memory Set is completely EMPTY!
      pendingReconcileGuilds.clear();
      expect(pendingReconcileGuilds.size).toBe(0);

      const mockGuild = {
        id: 'guild_crashed_restart',
        name: 'Recovered Guild After Reboot',
        iconURL: vi.fn(() => null),
        memberCount: 300,
        ownerId: 'owner_reboot',
        channels: { fetch: vi.fn(async () => new Map()) },
        roles: { fetch: vi.fn(async () => []) },
      };

      const mockClient = {
        guilds: {
          cache: new Map([['guild_crashed_restart', mockGuild]]),
        },
      };

      // Execute reconcilePendingGuilds on startup
      const recovered = await reconcilePendingGuilds(mockClient, mockRedis);

      expect(recovered).toBe(1);
      expect(mockRedis.smembers).toHaveBeenCalledWith(REDIS_PENDING_RECONCILE_KEY);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      // Must be pruned from Redis persisted set
      expect(mockRedis.srem).toHaveBeenCalledWith(REDIS_PENDING_RECONCILE_KEY, 'guild_crashed_restart');
      expect(redisPersistedSet.has('guild_crashed_restart')).toBe(false);
    });
  });

  describe('Dynamic Channel Rename Rate-Limit Extraction', () => {
    it('extracts retry-after dynamically from Discord REST body, discord.js, and HTTP headers', () => {
      // 1. Raw body in seconds (e.g. 5.5s)
      const err1 = { rawError: { retry_after: 5.5 } };
      expect(extractRetryAfterMs(err1)).toBe(5500);

      // 2. Discord.js ms (> 1000)
      const err2 = { retryAfter: 12500 };
      expect(extractRetryAfterMs(err2)).toBe(12500);

      // 3. Discord.js seconds (<= 1000)
      const err3 = { retryAfter: 3 };
      expect(extractRetryAfterMs(err3)).toBe(3000);

      // 4. HTTP response header 'retry-after'
      const err4 = {
        response: {
          headers: {
            get: (h) => (h === 'retry-after' ? '45' : null),
          },
        },
      };
      expect(extractRetryAfterMs(err4)).toBe(45000);

      // 5. Fallback when Discord provides no retry-after value
      const err5 = { code: 'RATE_LIMITED' };
      expect(extractRetryAfterMs(err5)).toBe(300000); // 5 mins fallback
    });

    it('sets distributed Redis cooldown and local cooldown on 429 response', async () => {
      const mockRedis = {
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue(null),
      };

      const err = { status: 429, rawError: { retry_after: 8 } };
      const waitMs = handleChannelRenameError(err, 'channel_999', mockRedis);

      expect(waitMs).toBe(8000);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'cooldown:channel_rename:channel_999',
        '1',
        'EX',
        '8'
      );

      const underCooldown = await isChannelRenameUnderCooldown('channel_999', null);
      expect(underCooldown).toBe(true);
    });
  });
});
