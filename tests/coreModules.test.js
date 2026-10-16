import { describe, it, expect, vi } from 'vitest';
import { CommandCooldowns, formatRetryAfter } from '../src/cooldowns.js';
import {
  STAFF_COMMAND_TYPES,
  hasModerationPermission,
  sanitizeAnnouncementText,
  canModerateMember
} from '../src/commandAccess.js';
import { createMutexPool } from '../src/asyncMutex.js';
import { fileExists, readJsonFile } from '../src/safeJson.js';
import { createCsrfProtection } from '../src/csrf.js';
import { withRedisLock } from '../src/distributedLock.js';
import { pickBoolean, pickFlag } from '../src/configPatch.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { formatRiotError, noApiKeyMsg, resolveRiotSummonerInput } from '../src/riot/helpers.js';
import { TranslationService } from '../src/services/translation.service.js';
import { loginWithRetry } from '../src/utils/loginWithRetry.js';

describe('Core Module: CommandCooldowns', () => {
  it('correctly calculates cooldown durations for different categories', () => {
    const cooldowns = new CommandCooldowns();
    expect(cooldowns.cooldownFor('lolprofile')).toBe(15_000);
    expect(cooldowns.cooldownFor('tftmatch')).toBe(15_000);
    expect(cooldowns.cooldownFor('blackjack')).toBe(5_000);
    expect(cooldowns.cooldownFor('coinflip')).toBe(5_000);
    expect(cooldowns.cooldownFor('purge')).toBe(2_000);
    expect(cooldowns.cooldownFor('ping')).toBe(3_000);
  });

  it('enforces cooldowns per guild, user, and commandType', () => {
    const cooldowns = new CommandCooldowns();
    const req = { guildId: 'g1', userId: 'u1', commandType: 'ping' };

    const first = cooldowns.check(req);
    expect(first.allowed).toBe(true);
    expect(first.retryAfterMs).toBe(0);

    const second = cooldowns.check(req);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);

    // Bypass allows execution
    const bypassed = cooldowns.check({ ...req, bypass: true });
    expect(bypassed.allowed).toBe(true);
  });

  it('formats retryAfter correctly', () => {
    expect(formatRetryAfter(2500)).toBe('3s');
    expect(formatRetryAfter(500)).toBe('1s');
    expect(formatRetryAfter(12000)).toBe('12s');
  });

  it('prunes expired cooldown records', () => {
    const cooldowns = new CommandCooldowns();
    cooldowns.entries.set('g1:u1:test', Date.now() - 1000); // already expired
    cooldowns.entries.set('g1:u2:test', Date.now() + 50000); // active
    expect(cooldowns.entries.size).toBe(2);

    cooldowns.prune();
    expect(cooldowns.entries.size).toBe(1);
    expect(cooldowns.entries.has('g1:u2:test')).toBe(true);
  });
});

describe('Core Module: CommandAccess & Permissions', () => {
  it('contains expected staff commands', () => {
    expect(STAFF_COMMAND_TYPES.has('purge')).toBe(true);
    expect(STAFF_COMMAND_TYPES.has('ban')).toBe(true);
    expect(STAFF_COMMAND_TYPES.has('kick')).toBe(true);
    expect(STAFF_COMMAND_TYPES.has('announce')).toBe(true);
    expect(STAFF_COMMAND_TYPES.has('ping')).toBe(false);
  });

  it('neutralizes @everyone and @here in announcement text', () => {
    const dangerous = 'Hello @everyone and @here check this out!';
    const sanitized = sanitizeAnnouncementText(dangerous);
    expect(sanitized).not.toContain('@everyone');
    expect(sanitized).not.toContain('@here');
    expect(sanitized).toContain('@\u200beveryone');
    expect(sanitized).toContain('@\u200bhere');
  });

  it('checks moderation role hierarchy accurately', () => {
    const actor = {
      id: 'actor1',
      guild: { ownerId: 'owner1' },
      roles: { highest: { position: 10 } }
    };
    const targetSameRole = {
      id: 'target1',
      guild: { ownerId: 'owner1', members: { me: { roles: { highest: { position: 20 } } } } },
      roles: { highest: { position: 10 } }
    };
    const targetLowerRole = {
      id: 'target2',
      guild: { ownerId: 'owner1', members: { me: { roles: { highest: { position: 20 } } } } },
      roles: { highest: { position: 5 } }
    };

    // Cannot moderate self
    expect(canModerateMember(actor, { id: 'actor1', guild: { ownerId: 'owner1' } }).ok).toBe(false);

    // Cannot moderate owner
    expect(canModerateMember(actor, { id: 'owner1', guild: { ownerId: 'owner1' } }).ok).toBe(false);

    // Cannot moderate member with equal or higher role
    expect(canModerateMember(actor, targetSameRole).ok).toBe(false);

    // Can moderate member with lower role
    expect(canModerateMember(actor, targetLowerRole).ok).toBe(true);
  });
});

describe('Core Module: Async Mutex Pool', () => {
  it('serializes operations on the same key', async () => {
    const withLock = createMutexPool();
    const executionOrder = [];

    const p1 = withLock('user_123', async () => {
      await new Promise(r => setTimeout(r, 20));
      executionOrder.push('first');
    });

    const p2 = withLock('user_123', async () => {
      executionOrder.push('second');
    });

    await Promise.all([p1, p2]);
    expect(executionOrder).toEqual(['first', 'second']);
  });

  it('allows concurrent execution on different keys', async () => {
    const withLock = createMutexPool();
    let key1Done = false;
    let key2Done = false;

    await Promise.all([
      withLock('k1', async () => {
        key1Done = true;
      }),
      withLock('k2', async () => {
        key2Done = true;
      })
    ]);

    expect(key1Done).toBe(true);
    expect(key2Done).toBe(true);
  });
});

describe('Core Module: CSRF Protection', () => {
  it('creates and validates csrf tokens', () => {
    const csrf = createCsrfProtection();
    const req = { session: {}, method: 'POST', path: '/api/settings', get: () => null, body: {} };
    const res = {
      status: (code) => ({
        json: (data) => ({ code, data })
      })
    };

    const token = csrf.ensureToken(req);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    // Test rejection on wrong token
    let nextCalled = false;
    csrf.validate(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);

    // Test pass on valid token
    req.body.csrfToken = token;
    csrf.validate(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('Core Module: Safe JSON & File Existence', () => {
  it('verifies existing and non-existing files', async () => {
    expect(await fileExists('package.json')).toBe(true);
    expect(await fileExists('non_existing_file_xyz_123.tmp')).toBe(false);
  });

  it('reads valid JSON file safely and throws when exceeding size limit', async () => {
    const data = await readJsonFile('package.json', 10 * 1024 * 1024);
    expect(data.name).toBe('discord-service-bot');

    // Throws when maxBytes is exceeded
    await expect(readJsonFile('package.json', 10)).rejects.toThrow(/exceeds maximum size/i);
  });
});

describe('Core Module: Distributed Lock (withRedisLock)', () => {
  it('acquires lock, runs function, and releases token with Lua script', async () => {
    const store = new Map();
    let released = false;

    const mockRedis = {
      set: vi.fn(async (key, token, nx, ex, ttl) => {
        if (!store.has(key)) {
          store.set(key, token);
          return 'OK';
        }
        return null;
      }),
      eval: vi.fn(async (script, numKeys, key, token) => {
        if (store.get(key) === token) {
          store.delete(key);
          released = true;
          return 1;
        }
        return 0;
      })
    };

    const result = await withRedisLock(mockRedis, 'test:lock:1', 10, async () => {
      expect(store.has('test:lock:1')).toBe(true);
      return 'lock-success';
    });

    expect(result).toBe('lock-success');
    expect(released).toBe(true);
    expect(store.has('test:lock:1')).toBe(false);
  });

  it('times out and throws if lock cannot be acquired within waitMs', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null), // Always locked by another process
      eval: vi.fn().mockResolvedValue(0)
    };

    await expect(
      withRedisLock(mockRedis, 'test:contended:lock', 10, async () => 'ok', {
        waitMs: 60,
        initialRetryMs: 10,
        maxRetryMs: 20
      })
    ).rejects.toThrow(/Could not acquire distributed lock/i);
  });
});

describe('Core Module: Config Patch Utilities', () => {
  it('correctly picks boolean values preserving currents', () => {
    expect(pickBoolean({}, 'enabled', { enabled: true })).toBe(true);
    expect(pickBoolean({ enabled: false }, 'enabled', { enabled: true })).toBe(false);
    expect(pickBoolean({ enabled: true }, 'enabled', { enabled: false })).toBe(true);
  });

  it('correctly picks flag values with defaultTrue options', () => {
    expect(pickFlag({}, 'flag', {})).toBe(true);
    expect(pickFlag({}, 'flag', { flag: false })).toBe(false);
    expect(pickFlag({ flag: false }, 'flag', { flag: true })).toBe(false);
    expect(pickFlag({ flag: true }, 'flag', { flag: false })).toBe(true);
    expect(pickFlag({}, 'flag', {}, { defaultTrue: false })).toBe(false);
  });
});

describe('Core Module: Rate Limiting Middleware', () => {
  it('allows requests within threshold and blocks excess with Retry-After header', () => {
    const limiter = createRateLimiter({ windowMs: 5000, max: 2, keyPrefix: 'test-limit' });

    let statusCalledWith = null;
    let jsonCalledWith = null;
    let headerSet = {};

    const createReq = () => ({ ip: '127.0.0.1', session: { user: { id: 'u_test' } } });
    const createRes = () => ({
      set: (k, v) => { headerSet[k] = v; },
      status: (code) => {
        statusCalledWith = code;
        return {
          json: (d) => { jsonCalledWith = d; }
        };
      }
    });

    let nextCount = 0;
    const next = () => { nextCount++; };

    // Request 1: allowed
    limiter(createReq(), createRes(), next);
    expect(nextCount).toBe(1);

    // Request 2: allowed
    limiter(createReq(), createRes(), next);
    expect(nextCount).toBe(2);

    // Request 3: blocked (exceeds max 2)
    limiter(createReq(), createRes(), next);
    expect(nextCount).toBe(2); // next not called
    expect(statusCalledWith).toBe(429);
    expect(headerSet['Retry-After']).toBeDefined();
    expect(jsonCalledWith.error).toContain('Too many requests');
  });
});

describe('Core Module: Riot Helpers', () => {
  it('formats Riot error messages correctly', () => {
    expect(formatRiotError({ status: 404, message: 'Not found' })).toContain('Không tìm thấy dữ liệu');
    expect(formatRiotError({ status: 404, message: 'other' })).toContain('Không tìm thấy người chơi');
    expect(formatRiotError({ status: 429 })).toContain('vượt giới hạn');
    expect(formatRiotError({ status: 403, body: 'status_code: 403' })).toContain('API Key không hợp lệ');
    expect(formatRiotError({ status: 500, message: 'Internal Server Error' })).toContain('Lỗi: Internal Server Error');
  });

  it('formats noApiKeyMsg according to interaction flag', () => {
    expect(noApiKeyMsg(false)).toBe('❌ Bot chưa được cấu hình Riot API Key.');
    expect(noApiKeyMsg(true)).toEqual({
      content: '❌ Bot chưa được cấu hình Riot API Key.',
      ephemeral: true
    });
  });

  it('resolves riot summoner input from interaction and prefix args', async () => {
    const mockStateStore = {};
    const getLinkedAccount = vi.fn().mockResolvedValue({ riotId: 'Faker#KR1', region: 'kr' });

    // Slash interaction with args
    const slashSource = {
      options: {
        getString: (name) => (name === 'summoner' ? 'Gumayusi#KR1' : 'kr')
      }
    };
    const resolvedSlash = await resolveRiotSummonerInput({
      source: slashSource,
      isInteraction: true,
      stateStore: mockStateStore,
      guildId: 'g1',
      getLinkedAccount
    });
    expect(resolvedSlash).toEqual({ riotIdStr: 'Gumayusi#KR1', region: 'kr' });

    // Prefix with fallback to linked account
    const prefixSource = { author: { id: 'user_t1' } };
    const resolvedPrefix = await resolveRiotSummonerInput({
      source: prefixSource,
      args: '',
      isInteraction: false,
      stateStore: mockStateStore,
      guildId: 'g1',
      getLinkedAccount
    });
    expect(resolvedPrefix).toEqual({ riotIdStr: 'Faker#KR1', region: 'kr' });
  });
});

describe('Core Module: Translation Service & Cache', () => {
  it('caches translation results and returns cached entry without re-querying provider', async () => {
    const mockProvider = {
      translate: vi.fn().mockResolvedValue({
        translatedText: 'Xin chào thế giới',
        detectedLang: 'en'
      })
    };

    const service = new TranslationService(mockProvider);
    const res1 = await service.translate('Hello world', 'vi', 'en', true);
    expect(res1.translatedText).toBe('Xin chào thế giới');
    expect(mockProvider.translate).toHaveBeenCalledTimes(1);

    // Call again -> should hit cache
    const res2 = await service.translate('Hello world', 'vi', 'en', true);
    expect(res2.translatedText).toBe('Xin chào thế giới');
    expect(mockProvider.translate).toHaveBeenCalledTimes(1); // Still 1!
  });

  it('automatically translates to en when source text is auto-detected as vi', async () => {
    const mockProvider = {
      translate: vi.fn()
        .mockResolvedValueOnce({
          translatedText: 'Xin chào',
          detectedLang: 'vi'
        })
        .mockResolvedValueOnce({
          translatedText: 'Hello',
          detectedLang: 'vi'
        })
    };

    const service = new TranslationService(mockProvider);
    const res = await service.translate('Xin chào', 'vi', 'auto', false);
    expect(res.translatedText).toBe('Hello');
    expect(res.actualTargetLang).toBe('en');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });
});

describe('Core Module: Discord Login With Retry', () => {
  it('logs in successfully on first attempt without retrying', async () => {
    const mockClient = {
      login: vi.fn().mockResolvedValue('token_accepted')
    };

    await loginWithRetry(mockClient, 'fake_token', { maxRetries: 3, baseDelay: 10 });
    expect(mockClient.login).toHaveBeenCalledTimes(1);
  });

  it('retries on transient network error (ECONNRESET) then succeeds', async () => {
    const transientErr = new Error('Socket hang up');
    transientErr.code = 'ECONNRESET';

    const mockClient = {
      login: vi.fn()
        .mockRejectedValueOnce(transientErr)
        .mockResolvedValueOnce('token_accepted')
    };

    await loginWithRetry(mockClient, 'fake_token', { maxRetries: 3, baseDelay: 10 });
    expect(mockClient.login).toHaveBeenCalledTimes(2);
  });

  it('exits process on fatal 401 error', async () => {
    const fatalErr = new Error('An invalid token was provided');
    fatalErr.status = 401;

    const mockClient = {
      login: vi.fn().mockRejectedValue(fatalErr)
    };

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    await loginWithRetry(mockClient, 'invalid_token', { maxRetries: 2, baseDelay: 10 });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

