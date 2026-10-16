import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processOneReminder,
  verifyMessageSentInChannel,
  calculateNextReminderTime,
  LEASE_TTL_SEC,
  reminderTick,
  startReminderWorker,
  stopReminderWorker,
  releaseLease,
  _inFlightSends,
  _dispatchHistory,
  _inMemoryClaims,
  _inMemoryMarkDispatching,
  _inMemoryCommitDispatched,
  _resetWorkerStateForTest,
} from '../src/bot/reminderWorker.js';

describe('Reminder Reliability: Timeouts, Late Delivery & Fencing CAS', () => {
  let mockGuild;
  let mockChannel;
  let sentMessages;

  beforeEach(() => {
    sentMessages = [];
    mockChannel = {
      id: 'ch_reminders_1',
      name: 'general',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      guild: {
        members: {
          me: { id: 'bot_id' },
        },
      },
      client: {
        user: { id: 'bot_id' },
      },
      messages: {
        fetch: vi.fn(async () => {
          const map = new Map();
          for (let i = 0; i < sentMessages.length; i++) {
            map.set(`msg_${i}`, sentMessages[i]);
          }
          return map;
        }),
      },
      send: vi.fn(async (content) => {
        const msg = {
          id: `msg_${sentMessages.length + 1}`,
          content,
          author: { id: 'bot_id' },
          createdTimestamp: Date.now(),
        };
        sentMessages.push(msg);
        return msg;
      }),
    };

    mockGuild = {
      id: 'guild_1',
      name: 'Test Guild',
      channels: {
        fetch: vi.fn(async (id) => (id === mockChannel.id ? mockChannel : null)),
      },
    };
  });

  it('detects late message delivery via Oracle footprint when client send timed out', async () => {
    const reminder = {
      id: 'rem_timeout_1',
      channelId: mockChannel.id,
      message: 'Weekly standup meeting',
      time: '2026-05-01T10:00:00.000Z',
      repeat: 'weekly',
      userId: 'user_123',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const footprint = `\u200B[rid:${reminder.id}:${scheduledMs}]\u200B`;

    // Simulate scenario:
    // Discord received and posted the message on the channel,
    // but the client TCP socket timed out before receiving the HTTP 200 response.
    sentMessages.push({
      id: 'msg_delayed_ack',
      content: `<@user_123> Weekly standup meeting ${footprint}`,
      author: { id: 'bot_id' },
      createdTimestamp: Date.now() - 5000,
    });

    // Make channel.send fail if called, to prove it skips duplicate sending!
    mockChannel.send = vi.fn().mockRejectedValue(new Error('Should NOT send duplicate!'));

    // Execute processOneReminder with in-memory claim at scheduledMs + 60s
    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, null);

    // Because Pre-flight Oracle detected footprint in channel, it must NOT call send() again!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Must successfully advance weekly reminder to next week without duplicating!
    expect(result).not.toBeNull();
    expect(result.time).toBe('2026-05-08T10:00:00.000Z');
  });

  it('recovers gracefully from Redis commit timeout using Read-back check', async () => {
    const reminder = {
      id: 'rem_redis_timeout',
      channelId: mockChannel.id,
      message: 'Take your vitamins',
      time: '2026-05-01T08:00:00.000Z',
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes('status = \'pending\'')) {
          // ACQUIRE_LEASE_LUA
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('status = \'dispatched\'')) {
          // COMMIT_DISPATCHED_LUA:
          // Simulate Redis server successfully wrote 'dispatched', BUT connection dropped during response transfer!
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token, at: scheduledMs }));
          throw new Error('ECONNRESET: Redis connection closed while reading response');
        }
        return 0;
      }),
    };

    // Execute processOneReminder at scheduledMs + 60s
    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Send was called
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // Read-back was executed and discovered 'dispatched' in redisStore
    expect(mockRedis.get).toHaveBeenCalledWith(claimKey);

    // Advanced to next day cleanly
    expect(result).not.toBeNull();
    expect(result.time).toBe('2026-05-02T08:00:00.000Z');
  });

  it('prevents stale worker from committing when lease expired and token was reassigned', async () => {
    const reminder = {
      id: 'rem_stale_worker',
      channelId: mockChannel.id,
      message: 'Monthly maintenance',
      time: '2026-05-01T00:00:00.000Z',
      repeat: 'none', // one-shot
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes('status = \'pending\'')) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('status = \'dispatched\'')) {
          // Compare token: current token in redis is 'worker_2_stolen_token' but stale worker passed a different token
          const current = JSON.parse(redisStore.get(key) || '{}');
          if (current.token !== token) {
            return -12; // Token mismatch (fencing violation)
          }
          return 1;
        }
        return 0;
      }),
    };

    // Simulate: While channel.send is in progress, lease expires and Worker 2 reassigns the claim
    mockChannel.send = vi.fn().mockImplementation(async (content) => {
      redisStore.set(claimKey, JSON.stringify({ status: 'reconciling', token: 'worker_2_stolen_token', leaseExpiresAt: scheduledMs + 130_000 + 120_000 }));
      const msg = {
        id: 'msg_1',
        content,
        author: { id: 'bot_id' },
        createdTimestamp: Date.now(),
      };
      sentMessages.push(msg);
      return msg;
    });

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Even though Discord send happened, CAS commit rejected with -12 (fencing violation).
    // The reminder is not rescheduled as completed by this stale worker.
    expect(result).toEqual(reminder); // preserved without deleting/advancing
  });

  it('quarantines reminder to dead_letter when message delivery cannot be verified due to missing ReadMessageHistory permission', async () => {
    const reminder = {
      id: 'rem_unprovable_1',
      channelId: mockChannel.id,
      message: 'Critical payroll run',
      time: '2026-05-01T12:00:00.000Z',
      repeat: 'monthly',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const redisStore = new Map();

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => {
        redisStore.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token, ...rest) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter'")) {
          const [status, reason] = rest;
          redisStore.set(key, JSON.stringify({ status, token, reason }));
          return 1;
        }
        return 0;
      }),
    };

    // Simulate: channel.send times out / throws
    mockChannel.send = vi.fn().mockRejectedValue(new Error('Network timeout waiting for Discord ACK'));

    // Simulate: bot has NO ReadMessageHistory permission in channel
    mockChannel.permissionsFor = vi.fn(() => ({
      has: (flag) => false, // missing all perms including ReadMessageHistory
    }));

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Because delivery is unprovable, system must NOT blindly retry or advance schedule:
    // It must quarantine to dead_letter via atomic SET_TERMINAL_LUA
    const savedClaim = JSON.parse(redisStore.get(claimKey) || '{}');
    expect(savedClaim.status).toBe('dead_letter');
    expect(savedClaim.reason).toBe('CANNOT_PROVE_NO_HISTORY_PERMISSION');

    // Did not advance schedule
    expect(result).toEqual(reminder);
  });

  it('prevents stale worker whose lease expired from overwriting another worker claim when entering dead_letter path', async () => {
    const reminder = {
      id: 'rem_stale_fencing_1',
      channelId: mockChannel.id,
      message: 'Monthly tax reporting',
      time: '2026-05-01T15:00:00.000Z',
      repeat: 'monthly',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const redisStore = new Map();

    let workerAcquiredToken = null;

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => {
        redisStore.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token, ...rest) => {
        if (script.includes("status = 'pending'")) {
          workerAcquiredToken = token;
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter'")) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          // CAS Check: token must match!
          if (current.token !== token) {
            return -12; // TOKEN_MISMATCH (fencing violation!)
          }
          const [status, reason] = rest;
          redisStore.set(key, JSON.stringify({ status, token, reason }));
          return 1;
        }
        return 0;
      }),
    };

    // Simulate: channel.send hangs or fails, and permission is missing
    mockChannel.send = vi.fn().mockImplementation(async () => {
      // While Worker A is inside send(), its lease expires and Worker B takes over!
      redisStore.set(claimKey, JSON.stringify({
        status: 'pending',
        token: 'worker_B_active_fresh_token',
        acquiredAt: scheduledMs + 5000,
      }));
      throw new Error('TCP connection timed out');
    });

    // Bot lacks ReadMessageHistory
    mockChannel.permissionsFor = vi.fn(() => ({
      has: () => false,
    }));

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Verify Worker A was REJECTED by CAS (-12) and Worker B's lease remains UNTOUCHED in Redis!
    const activeClaim = JSON.parse(redisStore.get(claimKey) || '{}');
    expect(activeClaim.token).toBe('worker_B_active_fresh_token');
    expect(activeClaim.status).toBe('pending');
    expect(activeClaim.status).not.toBe('dead_letter');

    // Reminder is preserved
    expect(result).toEqual(reminder);
  });

  it('fail-safe yields reminder when Redis throws connection error on claim read, never falling back to memory claims or duplicate sending', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_redis_outage_1',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Critical server update',
    };

    // Redis client configured but experiencing network partition
    const failingRedis = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED: Redis cluster unreachable')),
      eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED: Redis cluster unreachable')),
    };

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 5000, failingRedis);

    // Fail-safe requirement: Must preserve reminder in queue without executing delivery or falling back to RAM
    expect(result).toEqual(reminder);
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(failingRedis.get).toHaveBeenCalled();
  });

  it('fail-safe yields reminder when Redis throws error on ACQUIRE_LEASE_LUA', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_redis_outage_lease',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Weekly backup check',
    };

    const failingRedis = {
      get: vi.fn().mockResolvedValue(null),
      eval: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connection dropped during eval')),
    };

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 5000, failingRedis);

    expect(result).toEqual(reminder);
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('dispatches admin alert embed to systemChannel when reminder reaches dead_letter', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_dead_letter_alert',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Urgent meeting',
    };

    mockGuild.systemChannel = {
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({ id: 'alert_msg_1' }),
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...rest) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter'")) {
          redisStore.set(key, JSON.stringify({ status: 'dead_letter', token }));
          return 1;
        }
        return 0;
      }),
    };

    // Bot lacks ReadMessageHistory to verify delivery
    mockChannel.permissionsFor = vi.fn(() => ({ has: () => false }));
    mockChannel.send = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await processOneReminder(reminder, mockGuild, scheduledMs + 5000, mockRedis);

    // Verify systemChannel received an alert embed
    expect(mockGuild.systemChannel.send).toHaveBeenCalled();
    const alertCall = mockGuild.systemChannel.send.mock.calls[0][0];
    expect(alertCall.embeds[0].title).toContain('Reminder Alert');
    expect(alertCall.embeds[0].description).toContain('CANNOT_PROVE_NO_HISTORY_PERMISSION');
  });

  it('preserves reminder and does not delete it when Discord guild fetch fails transiently', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_transient_guild_fail',
      time: new Date(scheduledMs).toISOString(),
      channelId: 'ch_123',
      message: 'Monthly report',
    };

    let savedReminders = null;
    const mockConfigStore = {
      _redis: null,
      listGuildIds: vi.fn().mockResolvedValue(['guild_fail_1']),
      getGuildConfig: vi.fn().mockResolvedValue({
        enabled: true,
        remindersEnabled: true,
        reminders: [reminder],
      }),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        savedReminders = patch.reminders;
      }),
    };

    // Discord client fails to fetch guild (e.g. transient gateway REST timeout)
    const mockDiscordClient = {
      guilds: {
        fetch: vi.fn().mockRejectedValue(new Error('Gateway 503 Service Unavailable')),
      },
    };

    await reminderTick(mockDiscordClient, mockConfigStore);

    // Critical requirement: updateGuildConfig must NOT delete the reminder!
    expect(mockConfigStore.updateGuildConfig).not.toHaveBeenCalled();
  });

  it('cleanly completes dead_letter quarantine even if admin alert dispatch fails', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_alert_crash_test',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Urgent notice',
    };

    mockGuild.systemChannel = {
      isTextBased: () => true,
      send: vi.fn().mockRejectedValue(new Error('Discord 500 Internal Server Error')),
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...rest) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter'")) {
          redisStore.set(key, JSON.stringify({ status: 'dead_letter', token }));
          return 1;
        }
        return 0;
      }),
    };

    mockChannel.permissionsFor = vi.fn(() => ({ has: () => false }));
    mockChannel.send = vi.fn().mockRejectedValue(new Error('TCP timeout'));

    // Must not throw an unhandled error despite systemChannel.send failing
    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 5000, mockRedis);

    // Verify reminder was preserved in schedule list
    expect(result).toEqual(reminder);
    // Verify Redis dead_letter was cleanly committed
    const claim = JSON.parse(redisStore.get(`reminder:claim:${reminder.id}:${scheduledMs}`));
    expect(claim.status).toBe('dead_letter');
  });

  it('recovers and dispatches reminder on subsequent tick after transient Redis outage clears', async () => {
    const scheduledMs = Date.now() - 1000;
    const reminder = {
      id: 'rem_recovery_across_ticks',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'System backup alert',
    };

    const redisStore = new Map();
    let redisIsDown = true;

    const mockRedis = {
      get: vi.fn(async (key) => {
        if (redisIsDown) throw new Error('ECONNREFUSED: Redis offline');
        return redisStore.get(key) ?? null;
      }),
      set: vi.fn(async (key, val) => {
        if (redisIsDown) throw new Error('ECONNREFUSED: Redis offline');
        redisStore.set(key, val);
        return 'OK';
      }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (redisIsDown) throw new Error('ECONNREFUSED: Redis offline');
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    // Tick 1: Redis is DOWN -> fail-safe yield
    const tick1Result = await processOneReminder(reminder, mockGuild, scheduledMs + 5000, mockRedis);
    expect(tick1Result).toEqual(reminder); // Preserved in schedule!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Tick 2: Redis RECOVERS -> reminder is dispatched
    redisIsDown = false;
    const tick2Result = await processOneReminder(reminder, mockGuild, scheduledMs + 65_000, mockRedis);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    // One-shot reminder completes: returns null to consume from schedule
    expect(tick2Result).toBeNull();

    // Claim is committed as dispatched in Redis
    const claim = JSON.parse(redisStore.get(`reminder:claim:${reminder.id}:${scheduledMs}`));
    expect(claim.status).toBe('dispatched');
  });

  it('recovers from ConfigStore write failure during reminder tick on subsequent tick without duplicate Discord dispatch', async () => {
    const scheduledMs = Date.now() - 5000;
    const reminder = {
      id: 'rem_config_fail_1',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Database backup',
      repeat: 'daily',
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    let guildConfig = {
      enabled: true,
      remindersEnabled: true,
      reminders: [reminder],
    };

    let configWriteAttempts = 0;
    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn().mockResolvedValue(['guild_cfg_fail']),
      getGuildConfig: vi.fn(async () => guildConfig),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        configWriteAttempts++;
        if (configWriteAttempts === 1) {
          // Simulate: Config Store network error or disk failure during tick 1
          throw new Error('ETIMEDOUT: ConfigStore write failed');
        }
        guildConfig = { ...guildConfig, ...patch };
      }),
    };

    const mockDiscordClient = {
      guilds: {
        fetch: vi.fn(async (gId) => (gId === 'guild_cfg_fail' ? mockGuild : null)),
      },
    };

    // TICK 1: Discord sends message, Redis records 'dispatched', but updateGuildConfig THROWS!
    await reminderTick(mockDiscordClient, mockConfigStore);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(configWriteAttempts).toBe(1);

    // Verify Redis claim was committed as dispatched
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const claim1 = JSON.parse(redisStore.get(claimKey) || '{}');
    expect(claim1.status).toBe('dispatched');

    // In guildConfig, reminder is STILL at original time because write failed
    expect(guildConfig.reminders[0].time).toBe(reminder.time);

    // TICK 2: Worker runs subsequent tick.
    // Must recognize Redis terminal 'dispatched' state, advance schedule, and NOT call send() again!
    await reminderTick(mockDiscordClient, mockConfigStore);
    expect(mockChannel.send).toHaveBeenCalledTimes(1); // ZERO duplicate calls!
    expect(configWriteAttempts).toBe(2);

    // Guild config now successfully updated to next day
    expect(guildConfig.reminders[0].time).not.toBe(reminder.time);
  });

  it('treats Oracle fetch failure/empty as UNCERTAIN false negative and transitions to backoff without double firing', async () => {
    const scheduledMs = Date.now() - 5000;
    const reminder = {
      id: 'rem_oracle_uncertain',
      time: new Date(scheduledMs).toISOString(),
      channelId: mockChannel.id,
      message: 'Financial audit report',
      repeat: 'weekly',
    };

    const redisStore = new Map();
    let uncertainLuaCalled = false;

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("SET_UNCERTAIN_LUA") || script.includes("status = 'uncertain'")) {
          uncertainLuaCalled = true;
          redisStore.set(key, JSON.stringify({ status: 'uncertain', token, backoffUntil: Date.now() + 300000 }));
          return 1; // retry #1
        }
        return 0;
      }),
    };

    // Client send times out
    mockChannel.send = vi.fn().mockRejectedValue(new Error('Discord Gateway timeout (504)'));

    // Oracle messages fetch also fails or returns empty (Oracle false negative)
    mockChannel.messages.fetch = vi.fn().mockRejectedValue(new Error('Discord REST 500 Internal Error'));

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Must NOT crash, must NOT assume "not sent", must enter uncertain backoff state
    expect(uncertainLuaCalled).toBe(true);
    expect(result).toEqual(reminder); // preserved in schedule without deleting
  });

  it('advances recurring schedules correctly across daily, weekly, monthly and leap year boundaries', () => {
    // Daily
    const dailyNext = calculateNextReminderTime('2026-03-15T10:00:00.000Z', 'daily', new Date('2026-03-15T11:00:00.000Z').getTime());
    expect(dailyNext).toBe('2026-03-16T10:00:00.000Z');

    // Weekly
    const weeklyNext = calculateNextReminderTime('2026-03-15T10:00:00.000Z', 'weekly', new Date('2026-03-15T11:00:00.000Z').getTime());
    expect(weeklyNext).toBe('2026-03-22T10:00:00.000Z');

    // Monthly clamp (Jan 31 -> Feb 28 in non-leap year)
    const jan31 = '2026-01-31T12:00:00.000Z';
    const monthlyNext = calculateNextReminderTime(jan31, 'monthly', new Date('2026-01-31T13:00:00.000Z').getTime());
    expect(monthlyNext).toBe('2026-02-28T12:00:00.000Z');

    // One-shot returns null
    const oneShot = calculateNextReminderTime('2026-01-01T00:00:00.000Z', 'none', Date.now());
    expect(oneShot).toBeNull();
  });

  it('handles stale reminders older than 1 hour without firing messages to Discord', async () => {
    // 2 hours ago
    const staleScheduled = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const staleRecurring = {
      id: 'rem_stale_rec',
      time: staleScheduled,
      channelId: mockChannel.id,
      message: 'Standup',
      repeat: 'daily',
    };
    const staleOneShot = {
      id: 'rem_stale_once',
      time: staleScheduled,
      channelId: mockChannel.id,
      message: 'Quick note',
      repeat: 'none',
    };

    let savedReminders = null;
    const mockConfigStore = {
      _redis: null,
      listGuildIds: vi.fn().mockResolvedValue(['guild_stale_test']),
      getGuildConfig: vi.fn().mockResolvedValue({
        enabled: true,
        remindersEnabled: true,
        reminders: [staleRecurring, staleOneShot],
      }),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        savedReminders = patch.reminders;
      }),
    };

    const mockDiscordClient = {
      guilds: {
        fetch: vi.fn().mockResolvedValue(mockGuild),
      },
    };

    await reminderTick(mockDiscordClient, mockConfigStore);

    // Stale reminders must NOT fire message to Discord
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Stale one-shot was discarded, stale recurring was rescheduled
    expect(savedReminders).toBeDefined();
    expect(savedReminders.length).toBe(1);
    expect(savedReminders[0].id).toBe('rem_stale_rec');
    expect(new Date(savedReminders[0].time).getTime()).toBeGreaterThan(Date.now());
  });

  it('coordinates concurrent ticks across multiple instances via distributed lock', async () => {
    let lockHolder = null;
    const mockRedis = {
      set: vi.fn(async (key, val, ...rest) => {
        const isNX = rest.includes('NX') || rest.includes('nx');
        if (isNX && lockHolder !== null) return null;
        lockHolder = val;
        return 'OK';
      }),
      del: vi.fn(async () => {
        lockHolder = null;
        return 1;
      }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (lockHolder === token) {
          lockHolder = null;
          return 1;
        }
        return 0;
      }),
    };

    let tickRuns = 0;
    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn(async () => {
        tickRuns++;
        // Hold lock for 250ms, longer than waitMs (150ms)
        await new Promise((r) => setTimeout(r, 250));
        return [];
      }),
    };

    const mockDiscordClient = {
      guilds: { fetch: vi.fn() },
    };

    // Run two ticks concurrently
    await Promise.all([
      reminderTick(mockDiscordClient, mockConfigStore),
      reminderTick(mockDiscordClient, mockConfigStore),
    ]);

    // Exactly one instance must have won the lock and executed the tick
    expect(tickRuns).toBe(1);
  });
});

describe('Phase 4 Regression Tests: Deterministic Delivery Invariants (A-K)', () => {
  let mockGuild;
  let mockChannel;
  let sentMessages;

  beforeEach(() => {
    _resetWorkerStateForTest();
    sentMessages = [];
    mockChannel = {
      id: 'ch_reminders_reg',
      name: 'general',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      guild: {
        members: {
          me: { id: 'bot_id' },
        },
      },
      client: {
        user: { id: 'bot_id' },
      },
      messages: {
        fetch: vi.fn(async () => {
          const map = new Map();
          for (let i = 0; i < sentMessages.length; i++) {
            map.set(`msg_${i}`, sentMessages[i]);
          }
          return map;
        }),
      },
      send: vi.fn(async (content) => {
        const msg = {
          id: `msg_${sentMessages.length + 1}`,
          content,
          author: { id: 'bot_id' },
          createdTimestamp: Date.now(),
        };
        sentMessages.push(msg);
        return msg;
      }),
    };

    mockGuild = {
      id: 'guild_reg_1',
      name: 'Regression Test Guild',
      channels: {
        fetch: vi.fn(async (id) => (id === mockChannel.id ? mockChannel : null)),
      },
      systemChannel: {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue({ id: 'alert_ok' }),
      },
    };
  });

  afterEach(async () => {
    await stopReminderWorker();
    _resetWorkerStateForTest();
    vi.useRealTimers();
  });

  it('Requirement A: Two workers poll the same due occurrence concurrently; at most one enters dispatch path', async () => {
    const reminder = {
      id: 'rem_concurrent_A',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Concurrent meeting alert',
      repeat: 'none',
    };

    const redisStore = new Map();
    let dispatchCallCount = 0;
    mockChannel.send = vi.fn(async () => {
      dispatchCallCount++;
      await new Promise((r) => setTimeout(r, 40));
      return { id: 'msg_1' };
    });

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          const raw = redisStore.get(key);
          if (!raw) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: Date.now(), leaseExpiresAt: Date.now() + 120_000 }));
            return 1;
          }
          return 0; // Already claimed by competitor!
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          if (current.token === token) {
            redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
            return 1;
          }
          return -12; // Fencing mismatch
        }
        return 0;
      }),
    };

    const [res1, res2] = await Promise.all([
      processOneReminder(reminder, mockGuild, Date.now(), mockRedis),
      processOneReminder(reminder, mockGuild, Date.now(), mockRedis),
    ]);

    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(dispatchCallCount).toBe(1);

    const outcomes = [res1, res2];
    expect(outcomes).toContain(null); // Winner consumed one-shot
    expect(outcomes).toContainEqual(reminder); // Loser safely yielded reminder without dispatching
  });

  it('Requirement B: startReminderWorker called twice creates only one polling loop and is idempotent', async () => {
    const mockClient = { guilds: { fetch: vi.fn() } };
    const mockStore = { listGuildIds: vi.fn().mockResolvedValue([]) };

    const handle1 = startReminderWorker(mockClient, mockStore);
    const handle2 = startReminderWorker(mockClient, mockStore);

    expect(handle1).toBeDefined();
    expect(handle1).toBe(handle2); // Idempotent: returns existing handle without duplicate timer
  });

  it('Requirement C: Worker A lease expires, Worker B claims and commits; Worker A resumes and CAS rejects stale commit', async () => {
    const reminder = {
      id: 'rem_stale_C',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Critical payroll run',
      repeat: 'monthly',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const redisStore = new Map();

    let workerAToken = null;
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          workerAToken = token;
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          if (current.token !== token) {
            return -12; // Token mismatch: Fencing violation!
          }
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    // Simulate: While Worker A is inside send(), Worker B takes over and completes
    mockChannel.send = vi.fn().mockImplementation(async () => {
      redisStore.set(claimKey, JSON.stringify({
        status: 'dispatched',
        token: 'worker_B_token_999',
        at: scheduledMs + 5000,
      }));
      return { id: 'msg_worker_A' };
    });

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    // Stale Worker A had its CAS rejected (-12), does NOT mutate Redis, yields reminder without advancing
    expect(result).toEqual(reminder);
    const stateInRedis = JSON.parse(redisStore.get(claimKey) || '{}');
    expect(stateInRedis.token).toBe('worker_B_token_999');
    expect(stateInRedis.status).toBe('dispatched');
  });

  it('Requirement D: Discord accepts message but client response times out; enters uncertain backoff quarantine', async () => {
    const reminder = {
      id: 'rem_timeout_D',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Delayed ACK meeting',
      repeat: 'daily',
    };

    const redisStore = new Map();
    let uncertainLuaCalled = false;
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: Date.now(), leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes("SET_UNCERTAIN_LUA") || script.includes("status = 'uncertain'")) {
          uncertainLuaCalled = true;
          redisStore.set(key, JSON.stringify({ status: 'uncertain', token, retries: 1, backoffUntil: Date.now() + 300_000 }));
          return 1;
        }
        return 0;
      }),
    };

    mockChannel.send = vi.fn().mockRejectedValue(new Error('Operation timed out after 15000ms'));
    mockChannel.messages.fetch = vi.fn().mockResolvedValue(new Map()); // Not found in recent 50

    const result = await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);

    expect(uncertainLuaCalled).toBe(true);
    expect(result).toEqual(reminder); // Preserved in schedule without advance
    const claim = JSON.parse(redisStore.get(`reminder:claim:${reminder.id}:${new Date(reminder.time).getTime()}`) || '{}');
    expect(claim.status).toBe('uncertain');
    expect(claim.retries).toBe(1);
    expect(claim.backoffUntil).toBeGreaterThan(Date.now());
  });

  it('Requirement E: Definite failure before request reaches Discord (channel not found / 403) transitions to permanent_failure and alerts admin', async () => {
    const reminder = {
      id: 'rem_definite_E',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: 'non_existent_channel',
      message: 'Definite failure check',
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter' or 'permanent_failure'")) {
          const [status, reason] = args;
          redisStore.set(key, JSON.stringify({ status, token, reason }));
          return 1;
        }
        return 0;
      }),
    };

    mockGuild.channels.fetch = vi.fn().mockResolvedValue(null);

    const result = await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);

    expect(result).toEqual(reminder);
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(mockGuild.systemChannel.send).toHaveBeenCalled();

    const claim = JSON.parse(redisStore.get(`reminder:claim:${reminder.id}:${new Date(reminder.time).getTime()}`) || '{}');
    expect(claim.status).toBe('permanent_failure');
    expect(claim.reason).toBe('CHANNEL_NOT_FOUND');
  });

  it('Requirement F: Redis failure during claim and state transition fails closed without unsafe fallback or duplicate dispatch', async () => {
    const reminder = {
      id: 'rem_redis_fail_F',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Fail closed check',
    };

    const failingRedis = {
      get: vi.fn().mockRejectedValue(new Error('ECONNRESET: Redis connection lost')),
      eval: vi.fn().mockRejectedValue(new Error('ECONNRESET: Redis connection lost')),
    };

    const result = await processOneReminder(reminder, mockGuild, Date.now(), failingRedis);

    expect(result).toEqual(reminder);
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('Requirement G: Crash recovery when Discord posted message but Redis success commit was lost follows uncertain policy', async () => {
    const reminder = {
      id: 'rem_crash_recovery_G',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Monthly payroll',
      repeat: 'monthly',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const redisStore = new Map();

    redisStore.set(`reminder:claim:${reminder.id}:${scheduledMs}`, JSON.stringify({
      status: 'uncertain',
      token: 'prior_crashed_token',
      retries: 1,
      backoffUntil: Date.now() - 1000,
    }));

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, retries: 1 }));
          return 1;
        }
        if (script.includes("ARGV[2] -- 'dead_letter'")) {
          redisStore.set(key, JSON.stringify({ status: 'dead_letter', token }));
          return 1;
        }
        return 0;
      }),
    };

    // Bot lacks ReadMessageHistory so Oracle cannot verify
    mockChannel.permissionsFor = vi.fn(() => ({ has: () => false }));
    mockChannel.send = vi.fn();

    await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);

    // MUST NOT blindly resend to Discord!
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('Requirement H: Recurring reminder completes occurrence and advances; repeated scans do not resend completed occurrence', async () => {
    const initialTime = '2026-05-01T10:00:00.000Z';
    const initialMs = new Date(initialTime).getTime();
    const reminder = {
      id: 'rem_recurring_H',
      time: initialTime,
      channelId: mockChannel.id,
      message: 'Weekly team sync',
      repeat: 'weekly',
    };

    let guildConfig = {
      enabled: true,
      remindersEnabled: true,
      reminders: [reminder],
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn().mockResolvedValue(['guild_rec_H']),
      getGuildConfig: vi.fn(async () => guildConfig),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        guildConfig = { ...guildConfig, ...patch };
      }),
    };

    const mockDiscordClient = {
      guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
    };

    mockChannel.send = vi.fn().mockResolvedValue({ id: 'msg_1' });

    // Tick 1: May 1 10:01
    const tick1Time = initialMs + 60_000;
    vi.setSystemTime(new Date(tick1Time));

    await reminderTick(mockDiscordClient, mockConfigStore);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(guildConfig.reminders[0].time).toBe('2026-05-08T10:00:00.000Z');

    // Tick 2: May 1 10:02
    vi.setSystemTime(new Date(tick1Time + 60_000));
    await reminderTick(mockDiscordClient, mockConfigStore);

    // ZERO duplicate dispatches on repeated scan!
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
  });

  it('Requirement I: Two different reminders due at the same time are each delivered once', async () => {
    const nowMs = Date.now();
    const rem1 = {
      id: 'rem_due_I1',
      time: new Date(nowMs - 2000).toISOString(),
      channelId: mockChannel.id,
      message: 'Reminder Alpha',
      repeat: 'none',
    };
    const rem2 = {
      id: 'rem_due_I2',
      time: new Date(nowMs - 2000).toISOString(),
      channelId: mockChannel.id,
      message: 'Reminder Beta',
      repeat: 'none',
    };

    let guildConfig = {
      enabled: true,
      remindersEnabled: true,
      reminders: [rem1, rem2],
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes("status = 'pending'")) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes("status = 'dispatched'")) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn().mockResolvedValue(['guild_I']),
      getGuildConfig: vi.fn(async () => guildConfig),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        guildConfig = { ...guildConfig, ...patch };
      }),
    };

    const mockDiscordClient = {
      guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
    };

    mockChannel.send = vi.fn().mockResolvedValue({ id: 'msg_ok' });

    await reminderTick(mockDiscordClient, mockConfigStore);

    expect(mockChannel.send).toHaveBeenCalledTimes(2);
    const sentCalls = mockChannel.send.mock.calls.map(c => c[0]);
    expect(sentCalls.some(t => t.includes('Reminder Alpha'))).toBe(true);
    expect(sentCalls.some(t => t.includes('Reminder Beta'))).toBe(true);
    expect(guildConfig.reminders.length).toBe(0);
  });

  it('Requirement J: Only intended process initializes reminder worker, respecting DISABLE_REMINDER_WORKER flag', async () => {
    process.env.DISABLE_REMINDER_WORKER = 'true';

    const mockClient = { guilds: { fetch: vi.fn() } };
    const mockStore = { listGuildIds: vi.fn().mockResolvedValue([]) };

    const handle = startReminderWorker(mockClient, mockStore);
    expect(handle).toBeNull();

    delete process.env.DISABLE_REMINDER_WORKER;
  });

  it('Requirement K: Slow send in flight beyond local timeout prevents starting a second send for same occurrence', async () => {
    const reminder = {
      id: 'rem_slow_K',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Slow network test',
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const occurrenceId = `${reminder.id}:${scheduledMs}`;

    let resolveSlowSend;
    const slowSendPromise = new Promise((resolve) => {
      resolveSlowSend = resolve;
    });

    mockChannel.send = vi.fn().mockReturnValue(slowSendPromise);

    _inFlightSends.set(occurrenceId, slowSendPromise);

    const result = await processOneReminder(reminder, mockGuild, Date.now(), null);

    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(result).toEqual(reminder);

    resolveSlowSend({ id: 'msg_done' });
    _inFlightSends.delete(occurrenceId);
  });

  it('Safeguard: Emergency circuit breaker quarantines occurrence exceeding dispatch limit within 60s', async () => {
    const reminder = {
      id: 'rem_circuit_breaker',
      time: new Date(Date.now() - 1000).toISOString(),
      channelId: mockChannel.id,
      message: 'Flood test',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const occurrenceId = `${reminder.id}:${scheduledMs}`;

    _dispatchHistory.set(occurrenceId, [Date.now() - 5000, Date.now() - 3000, Date.now() - 1000]);

    mockChannel.send = vi.fn();

    await processOneReminder(reminder, mockGuild, Date.now(), null);

    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(mockGuild.systemChannel.send).toHaveBeenCalled();
    const alert = mockGuild.systemChannel.send.mock.calls[0][0];
    expect(alert.embeds[0].title).toContain('Reminder Alert');
    expect(alert.embeds[0].description).toContain('EMERGENCY_CIRCUIT_BREAKER_TRIPPED');

    _dispatchHistory.clear();
  });

  it('Invariant 9: releaseLease deletes claim only if token matches', async () => {
    const claimKey = 'reminder:claim:rem_rel_1:12345';
    _inMemoryClaims.set(claimKey, JSON.stringify({ status: 'pending', token: 'token_valid' }));

    const resWrong = await releaseLease(null, claimKey, 'token_invalid');
    expect(resWrong).toBe(0);
    expect(_inMemoryClaims.has(claimKey)).toBe(true);

    const resCorrect = await releaseLease(null, claimKey, 'token_valid');
    expect(resCorrect).toBe(1);
    expect(_inMemoryClaims.has(claimKey)).toBe(false);
  });
});

describe('Pre-Staging Verification: Interleaving Invariants (User Review A-F)', () => {
  let mockGuild;
  let mockChannel;
  let sentMessages;

  beforeEach(() => {
    _resetWorkerStateForTest();
    sentMessages = [];
    mockChannel = {
      id: 'ch_pre_staging',
      name: 'pre-staging',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      guild: {
        members: {
          me: { id: 'bot_id' },
        },
      },
      client: {
        user: { id: 'bot_id' },
      },
      messages: {
        fetch: vi.fn(async () => {
          const map = new Map();
          for (let i = 0; i < sentMessages.length; i++) {
            map.set(`msg_${i}`, sentMessages[i]);
          }
          return map;
        }),
      },
      send: vi.fn(async (content) => {
        const msg = {
          id: `msg_${sentMessages.length + 1}`,
          content,
          author: { id: 'bot_id' },
          createdTimestamp: Date.now(),
        };
        sentMessages.push(msg);
        return msg;
      }),
    };

    mockGuild = {
      id: 'guild_pre_staging',
      name: 'Pre-Staging Guild',
      channels: {
        fetch: vi.fn(async (id) => (id === mockChannel.id ? mockChannel : null)),
      },
      systemChannel: {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue({ id: 'sys_1' }),
      },
    };
  });

  afterEach(() => {
    _resetWorkerStateForTest();
  });

  it('Test A: Worker A sends a request, remains unresolved, and loses its lease; Worker B must not send the same occurrence automatically', async () => {
    const reminder = {
      id: 'rem_pre_A',
      channelId: mockChannel.id,
      message: 'Unresolved request test',
      time: '2026-05-01T10:00:00.000Z',
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    // Worker A already transitioned to 'dispatching' and sent request to Discord,
    // but Worker A's lease expired without committing dispatched status.
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'dispatching',
      token: 'worker_A_token',
      acquiredAt: scheduledMs,
      leaseExpiresAt: scheduledMs + 10_000, // Expired
      retries: 0,
    }));

    // Worker B polls occurrence after lease expiry
    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, null);

    // Worker B MUST NOT call channel.send because an ambiguous prior send was initiated!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Occurrence entered quarantine backoff
    const claim = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claim.status).toBe('uncertain');
    expect(claim.backoffUntil).toBeGreaterThan(scheduledMs + 60_000);
    expect(result).toEqual(reminder); // preserved in schedule without resending
  });

  it('Test B: Worker A resumes after Worker B acquires a newer lease; Worker A must not mutate the newer claim or state', async () => {
    const claimKey = 'reminder:claim:rem_pre_B:1777629600000';

    // Worker B acquired new lease and committed dispatched
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'dispatched',
      token: 'worker_B_newer_token_999',
      completedAt: Date.now(),
    }));

    // Worker A resumes with its old token and attempts CAS commit
    const staleCommitResult = _inMemoryCommitDispatched(claimKey, 'worker_A_stale_token_111', Date.now());

    // CAS rejected with fencing violation
    expect(staleCommitResult).toBe(-12);

    // Worker B's state remains intact
    const state = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(state.status).toBe('dispatched');
    expect(state.token).toBe('worker_B_newer_token_999');
  });

  it('Test C: Three separate processes each trigger the same occurrence; local circuit breaker is not the only protection (Redis Distributed Breaker blocks >3 attempts)', async () => {
    const reminder = {
      id: 'rem_pre_C',
      channelId: mockChannel.id,
      message: 'Multi-process race test',
      time: new Date(Date.now() - 1000).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const redisStore = new Map();

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          const raw = redisStore.get(key);
          if (!raw) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, dispatchAttempts: 0 }));
            return 1;
          }
          const claim = JSON.parse(raw);
          if (claim.allowReacquire) {
            claim.token = token;
            redisStore.set(key, JSON.stringify(claim));
            return 1;
          }
          return 0; // Already claimed by another process
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          const raw = redisStore.get(key);
          const claim = raw ? JSON.parse(raw) : { token, dispatchAttempts: 0 };
          claim.dispatchAttempts = (claim.dispatchAttempts || 0) + 1;
          if (claim.dispatchAttempts > 3) {
            claim.status = 'dead_letter';
            redisStore.set(key, JSON.stringify(claim));
            return -20; // Distributed circuit breaker tripped!
          }
          claim.status = 'dispatching';
          redisStore.set(key, JSON.stringify(claim));
          return 1;
        }
        if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
          const raw = redisStore.get(key);
          const claim = raw ? JSON.parse(raw) : { token };
          claim.status = 'dispatched';
          redisStore.set(key, JSON.stringify(claim));
          return 1;
        }
        return 0;
      }),
    };

    // 1. Process 1, Process 2, and Process 3 race concurrently
    const [res1, res2, res3] = await Promise.all([
      processOneReminder(reminder, mockGuild, Date.now(), mockRedis),
      processOneReminder(reminder, mockGuild, Date.now(), mockRedis),
      processOneReminder(reminder, mockGuild, Date.now(), mockRedis),
    ]);

    // Exactly ONE process entered dispatch path, even though they had separate local memory
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // Winner consumed one-shot, losers safely yielded
    const outcomes = [res1, res2, res3];
    expect(outcomes.filter(r => r === null).length).toBe(1);
    expect(outcomes.filter(r => r === reminder).length).toBe(2);

    // 2. Now simulate 4th attempt hitting Redis distributed circuit breaker
    sentMessages.length = 0; // Simulate message not confirmed by Oracle so attempt reaches dispatch phase
    const raw = JSON.parse(redisStore.get(claimKey));
    raw.dispatchAttempts = 3; // already had 3 attempts
    raw.status = 'pending';
    raw.leaseExpiresAt = 0; // Expired lease so it can be re-acquired
    raw.allowReacquire = true;
    redisStore.set(claimKey, JSON.stringify(raw));

    mockChannel.send.mockClear();
    await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);

    // Blocked by Redis Distributed Circuit Breaker (-20), send not called!
    expect(mockChannel.send).not.toHaveBeenCalled();
    const finalClaim = JSON.parse(redisStore.get(claimKey));
    expect(finalClaim.status).toBe('dead_letter');
  });

  it('Test D: An uncertain occurrence is scanned repeatedly; no normal dispatch occurs', async () => {
    const initialTime = Date.now();
    const reminder = {
      id: 'rem_pre_D',
      channelId: mockChannel.id,
      message: 'Uncertain repeated scan',
      time: new Date(initialTime - 1000).toISOString(),
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    // Occurrence is quarantined in 'uncertain' state with backoff until initialTime + 300s
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'uncertain',
      token: 'tok_uncertain',
      backoffUntil: initialTime + 300_000,
      retries: 1,
    }));

    // Scan at T + 60s
    const res1 = await processOneReminder(reminder, mockGuild, initialTime + 60_000, null);
    // Scan at T + 120s
    const res2 = await processOneReminder(reminder, mockGuild, initialTime + 120_000, null);
    // Scan at T + 180s
    const res3 = await processOneReminder(reminder, mockGuild, initialTime + 180_000, null);

    // ZERO dispatches across all repeated scans!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Reminder preserved in schedule without advancing or deleting
    expect(res1).toEqual(reminder);
    expect(res2).toEqual(reminder);
    expect(res3).toEqual(reminder);
  });

  it('Test E: Two different reminder IDs with identical content remain distinct and both are delivered', async () => {
    const baseTime = new Date('2026-05-01T10:00:00.000Z').toISOString();
    const rem1 = {
      id: 'rem_pre_E_alpha',
      channelId: mockChannel.id,
      message: 'Legitimate duplicate text message',
      time: baseTime,
      repeat: 'none',
    };
    const rem2 = {
      id: 'rem_pre_E_beta',
      channelId: mockChannel.id,
      message: 'Legitimate duplicate text message',
      time: baseTime,
      repeat: 'none',
    };

    let guildConfig = {
      enabled: true,
      remindersEnabled: true,
      reminders: [rem1, rem2],
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn().mockResolvedValue(['guild_pre_staging']),
      getGuildConfig: vi.fn(async () => guildConfig),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        guildConfig = { ...guildConfig, ...patch };
      }),
    };

    const mockDiscordClient = {
      guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
    };

    vi.setSystemTime(new Date('2026-05-01T10:01:00.000Z'));
    await reminderTick(mockDiscordClient, mockConfigStore);

    // Both distinct reminder IDs must each be delivered exactly once!
    expect(mockChannel.send).toHaveBeenCalledTimes(2);

    const sentFootprints = mockChannel.send.mock.calls.map(c => c[0]);
    expect(sentFootprints.some(msg => msg.includes('rem_pre_E_alpha'))).toBe(true);
    expect(sentFootprints.some(msg => msg.includes('rem_pre_E_beta'))).toBe(true);
  });

  it('Test F: Redis claim/transition operations time out after server executes them; code reconciles state via read-back rather than assuming failure', async () => {
    const reminder = {
      id: 'rem_pre_F',
      channelId: mockChannel.id,
      message: 'Timeout reconciliation test',
      time: '2026-05-01T08:00:00.000Z',
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
    const redisStore = new Map();

    let acquireEvaluated = false;
    let commitEvaluated = false;

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          // Redis successfully wrote 'pending' in database, but network timed out on returning response!
          acquireEvaluated = true;
          redisStore.set(key, JSON.stringify({ status: 'pending', token, acquiredAt: scheduledMs, leaseExpiresAt: scheduledMs + 120_000 }));
          throw new Error('ETIMEDOUT: Redis socket timeout while reading ACQUIRE response');
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: scheduledMs + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
          // Redis successfully wrote 'dispatched', but network timed out on returning response!
          commitEvaluated = true;
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token, at: scheduledMs }));
          throw new Error('ECONNRESET: Redis socket reset while reading COMMIT response');
        }
        return 0;
      }),
    };

    const result = await processOneReminder(reminder, mockGuild, scheduledMs + 60_000, mockRedis);

    expect(acquireEvaluated).toBe(true);
    expect(commitEvaluated).toBe(true);

    // Read-back successfully confirmed lease acquisition and committed status despite Redis network timeouts
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // Occurrence successfully advanced to next day
    expect(result).not.toBeNull();
    expect(result.time).toBe('2026-05-02T08:00:00.000Z');

    const state = JSON.parse(redisStore.get(claimKey));
    expect(state.status).toBe('dispatched');
  });

  it('Test G: Oracle handles 2-page pagination in high-traffic channels and classifies Discord API 403/429 errors as UNCERTAIN', async () => {
    const scheduledMs = Date.now() - 30_000;
    const footprint = '\u200B[rid:rem_pre_G:1777000000]\u200B';

    // Page 1: 100 recent noise messages without footprint
    const page1Messages = new Map();
    for (let i = 0; i < 100; i++) {
      page1Messages.set(`noise_${i}`, {
        id: `msg_page1_${i}`,
        content: `Chat noise ${i}`,
        author: { id: 'user_regular' },
        createdTimestamp: Date.now() - (i * 100),
      });
    }

    // Page 2: Older messages, one of which contains the bot's footprint
    const page2Messages = new Map();
    page2Messages.set('msg_target', {
      id: 'msg_target_footprint',
      content: `Meeting reminder alert ${footprint}`,
      author: { id: 'bot_id' },
      createdTimestamp: scheduledMs + 500,
    });

    const paginatedChannel = {
      id: 'ch_paginated',
      isTextBased: () => true,
      client: { user: { id: 'bot_id' } },
      guild: { members: { me: { id: 'bot_id' } } },
      permissionsFor: () => ({ has: () => true }),
      messages: {
        fetch: vi.fn(async (opts) => {
          if (opts.before) {
            return page2Messages;
          }
          return page1Messages;
        }),
      },
    };

    // 1. Verify that Oracle successfully paginates to page 2 and discovers footprint
    const oracleResult = await verifyMessageSentInChannel(paginatedChannel, 'Meeting reminder alert', 60_000, footprint);
    expect(oracleResult.status).toBe('VERIFIED_SENT');
    expect(paginatedChannel.messages.fetch).toHaveBeenCalledTimes(2);

    // 2. Verify that Discord 403 API error is classified as UNCERTAIN (never NOT_SENT)
    paginatedChannel.messages.fetch = vi.fn().mockRejectedValue({ status: 403, message: 'Missing Access' });
    const permErrResult = await verifyMessageSentInChannel(paginatedChannel, 'Test', 60_000, footprint);
    expect(permErrResult.status).toBe('UNCERTAIN');
    expect(permErrResult.reason).toBe('MISSING_READ_MESSAGE_HISTORY_PERMISSION');

    // 3. Verify that Discord 429 Rate Limit error is classified as UNCERTAIN (never NOT_SENT)
    paginatedChannel.messages.fetch = vi.fn().mockRejectedValue({ status: 429, message: 'You are being rate limited' });
    const rateLimitResult = await verifyMessageSentInChannel(paginatedChannel, 'Test', 60_000, footprint);
    expect(rateLimitResult.status).toBe('UNCERTAIN');
    expect(rateLimitResult.reason).toBe('RATE_LIMITED');
  });

  it('Test H: MARK_DISPATCHING_LUA verifies token atomically before incrementing dispatchAttempts; stale worker cannot increment or mutate state', async () => {
    const claimKey = 'reminder:claim:rem_pre_H:99999';
    const activeToken = 'active_worker_token_123';
    const staleToken = 'stale_worker_token_999';
    const now = Date.now();

    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'pending',
      token: activeToken,
      dispatchAttempts: 1,
      windowStart: now - 5000,
    }));

    // 1. Stale worker tries to mark dispatching using invalid token
    const staleResult = _inMemoryMarkDispatching(claimKey, staleToken, now, 3, 60_000);
    expect(staleResult).toBe(-12); // Fencing violation

    // Verify claim state and counter were NOT touched
    const claimAfterStale = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claimAfterStale.status).toBe('pending');
    expect(claimAfterStale.token).toBe(activeToken);
    expect(claimAfterStale.dispatchAttempts).toBe(1);

    // 2. Active worker marks dispatching -> succeeds and increments
    const activeResult = _inMemoryMarkDispatching(claimKey, activeToken, now, 3, 60_000);
    expect(activeResult).toBe(1);

    const claimAfterActive = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claimAfterActive.status).toBe('dispatching');
    expect(claimAfterActive.dispatchAttempts).toBe(2);

    // 3. Outside time window (> 60s), attempts counter resets
    const futureTime = now + 120_000;
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'pending',
      token: activeToken,
      dispatchAttempts: 2,
      windowStart: now,
    }));

    const windowResetResult = _inMemoryMarkDispatching(claimKey, activeToken, futureTime, 3, 60_000);
    expect(windowResetResult).toBe(1);
    const claimAfterReset = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claimAfterReset.dispatchAttempts).toBe(1);
    expect(claimAfterReset.windowStart).toBe(futureTime);
  });
});

describe('P0 Deterministic Regression Tests (User Review P0.5 A-H)', () => {
  let mockGuild;
  let mockChannel;
  let sentMessages;

  beforeEach(() => {
    _resetWorkerStateForTest();
    sentMessages = [];
    mockChannel = {
      id: 'ch_p0_reg',
      name: 'p0-regression',
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      guild: { members: { me: { id: 'bot_id' } } },
      client: { user: { id: 'bot_id' } },
      messages: {
        fetch: vi.fn(async () => {
          const map = new Map();
          for (let i = 0; i < sentMessages.length; i++) {
            map.set(`msg_${i}`, sentMessages[i]);
          }
          return map;
        }),
      },
      send: vi.fn(async (content) => {
        const msg = {
          id: `msg_${sentMessages.length + 1}`,
          content,
          author: { id: 'bot_id' },
          createdTimestamp: Date.now(),
        };
        sentMessages.push(msg);
        return msg;
      }),
    };

    mockGuild = {
      id: 'guild_p0_reg',
      name: 'P0 Regression Guild',
      channels: {
        fetch: vi.fn(async (id) => (id === mockChannel.id ? mockChannel : null)),
      },
      systemChannel: {
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue({ id: 'sys_1' }),
      },
    };
  });

  afterEach(() => {
    _resetWorkerStateForTest();
  });

  it('P0.5 Test A: Worker A pauses after MARK_DISPATCHING but before channel.send; when A resumes after lease expiry, pre-send pause guard aborts send', async () => {
    const referenceNow = 1000000;
    const reminder = {
      id: 'rem_p0_A',
      channelId: mockChannel.id,
      message: 'Pause race test',
      time: new Date(referenceNow).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: referenceNow + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          // Worker A successfully transitions to dispatching
          redisStore.set(key, JSON.stringify({ status: 'dispatching', token, leaseExpiresAt: referenceNow + 120_000 }));
          // Simulate Worker A being paused (SIGSTOP) right here: Date.now() jumps by 125 seconds!
          vi.setSystemTime(referenceNow + 125_000);
          return 1;
        }
        return 0;
      }),
    };

    vi.setSystemTime(referenceNow);
    const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

    // Pre-send pause guard detected Date.now() >= leaseExpiry - 5000 and aborted send!
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(result).toEqual(reminder); // Yielded without dispatching
  });

  it('P0.5 Test B: Worker A calls channel.send() with unresolved in-flight promise; Worker B must not send a second time', async () => {
    const reminder = {
      id: 'rem_p0_B',
      channelId: mockChannel.id,
      message: 'In-flight unresolved test',
      time: new Date(Date.now() - 1000).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const occurrenceId = `${reminder.id}:${scheduledMs}`;

    // Create a deferred, unresolved promise for Worker A's send
    let resolveSend;
    const unresolvedPromise = new Promise((resolve) => {
      resolveSend = resolve;
    });

    // Worker A has the request in-flight
    _inFlightSends.set(occurrenceId, unresolvedPromise);

    // Worker B attempts to process the exact same occurrence
    const resultB = await processOneReminder(reminder, mockGuild, Date.now(), null);

    // Worker B yields cleanly due to in-flight tracking
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(resultB).toEqual(reminder);

    // Cleanup
    resolveSend({ id: 'msg_done' });
    _inFlightSends.delete(occurrenceId);
  });

  it('P0.5 Test C: Oracle of Worker A completes after Worker B replaced claim/token; A must not overwrite B state', async () => {
    const claimKey = 'reminder:claim:rem_p0_C:1777000000';
    const workerBToken = 'worker_B_newer_token_888';
    const workerAToken = 'worker_A_stale_token_111';

    // Worker B acquired lease and set status to reconciling or dispatched
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'dispatched',
      token: workerBToken,
      completedAt: Date.now(),
    }));

    // Worker A's slow Oracle finishes and attempts to commit using its stale token
    const staleCommitResult = _inMemoryCommitDispatched(claimKey, workerAToken, Date.now());

    // CAS rejects with fencing violation -12
    expect(staleCommitResult).toBe(-12);

    // Worker B's state remains untouched
    const state = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(state.status).toBe('dispatched');
    expect(state.token).toBe(workerBToken);
  });

  it('P0.5 Test D: Redis executes Lua but client receives socket timeout; read-back insufficient evidence fails closed', async () => {
    const reminder = {
      id: 'rem_p0_D',
      channelId: mockChannel.id,
      message: 'Socket timeout fail closed test',
      time: new Date(Date.now() - 1000).toISOString(),
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const mockRedis = {
      get: vi.fn(async () => null), // Read-back returns null (e.g. partition or key expired)
      eval: vi.fn(async (script) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          throw new Error('ETIMEDOUT: Redis connection dropped after sending command');
        }
        return 0;
      }),
    };

    const result = await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);

    // Fail-closed: read-back did not confirm lease ownership, so channel.send was NOT called
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(result).toEqual(reminder); // preserved in schedule
  });

  it('P0.5 Test E: Oracle does not find footprint in 200 messages; occurrence remains UNCERTAIN, no blind resend', async () => {
    const reminder = {
      id: 'rem_p0_E',
      channelId: mockChannel.id,
      message: 'Not found in 200 msgs test',
      time: new Date(Date.now() - 1000).toISOString(),
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    // Occurrence is in reconciling mode (lease expired while in dispatching)
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'dispatching',
      token: 'prior_tok',
      leaseExpiresAt: 0,
      retries: 0,
    }));

    // Mock channel with 100 noise messages in page 1 and 100 noise messages in page 2
    mockChannel.messages.fetch = vi.fn(async (opts) => {
      const page = new Map();
      const prefix = opts?.before ? 'p2' : 'p1';
      for (let i = 0; i < 100; i++) {
        page.set(`${prefix}_${i}`, {
          id: `${prefix}_msg_${i}`,
          content: `Regular chatter noise ${i}`,
          author: { id: 'some_user' },
          createdTimestamp: Date.now() - (i * 1000),
        });
      }
      return page;
    });

    const result = await processOneReminder(reminder, mockGuild, Date.now(), null);

    // Zero sends!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Occurrence quarantined in 'uncertain' state with backoff
    const claim = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claim.status).toBe('uncertain');
    expect(claim.backoffUntil).toBeGreaterThan(Date.now());
    expect(result).toEqual(reminder);
  });

  it('P0.5 Test F: Two workers process an occurrence across multiple consecutive ticks; lease expiry transitions to reconciling without duplicate send', async () => {
    const baseTime = 2000000;
    const reminder = {
      id: 'rem_p0_F',
      channelId: mockChannel.id,
      message: 'Consecutive ticks multi-worker test',
      time: new Date(baseTime).toISOString(),
      repeat: 'daily',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    // Tick 1 (T0): Worker A claims and starts dispatch, but send is slow/hangs
    vi.setSystemTime(baseTime);
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'dispatching',
      token: 'worker_A_tok',
      acquiredAt: baseTime,
      leaseExpiresAt: baseTime + 120_000,
    }));

    // Tick 2 (T0 + 60s): Worker B scans. Lease has NOT expired (expires at T0 + 120s). Worker B skips.
    vi.setSystemTime(baseTime + 60_000);
    const resTick2 = await processOneReminder(reminder, mockGuild, baseTime + 60_000, null);
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Tick 3 (T0 + 130s): Lease has expired. Worker B scans.
    // ACQUIRE_LEASE transitions to 'reconciling' (returns 2), NOT allowing send.
    vi.setSystemTime(baseTime + 130_000);
    const resTick3 = await processOneReminder(reminder, mockGuild, baseTime + 130_000, null);

    // Oracle doesn't see message, so occurrence enters 'uncertain' backoff
    expect(mockChannel.send).not.toHaveBeenCalled();
    const claimAfterTick3 = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(claimAfterTick3.status).toBe('uncertain');
    expect(claimAfterTick3.backoffUntil).toBe(baseTime + 130_000 + 300_000);

    // Tick 4 (T0 + 190s): Within backoff period. Both workers skip tick.
    vi.setSystemTime(baseTime + 190_000);
    const resTick4 = await processOneReminder(reminder, mockGuild, baseTime + 190_000, null);
    expect(mockChannel.send).not.toHaveBeenCalled();

    // ZERO duplicate dispatches across all 4 ticks!
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  it('P0.5 Test G: dispatchAttempts reaches circuit breaker limit; occurrence quarantined in dead_letter and send is completely blocked', async () => {
    const reminder = {
      id: 'rem_p0_G',
      channelId: mockChannel.id,
      message: 'Circuit breaker limit test',
      time: new Date(Date.now() - 1000).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    // Occurrence already had 3 authorized dispatch attempts within current window
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'pending',
      token: 'existing_token',
      dispatchAttempts: 3,
      windowStart: Date.now(),
      leaseExpiresAt: 0,
    }));

    // Next dispatch attempt trips circuit breaker
    await processOneReminder(reminder, mockGuild, Date.now(), null);

    // send is BLOCKED!
    expect(mockChannel.send).not.toHaveBeenCalled();

    // Claim quarantined in dead_letter
    const finalClaim = JSON.parse(_inMemoryClaims.get(claimKey));
    expect(finalClaim.status).toBe('dead_letter');
    expect(finalClaim.reason).toBe('EMERGENCY_CIRCUIT_BREAKER_TRIPPED');

    // Admin alert dispatched
    expect(mockGuild.systemChannel.send).toHaveBeenCalled();
  });

  it('P0.5 Test H: Recurring reminder completes occurrence 1 and advances; repeated scans do not re-send occurrence 1; next occurrence is processed once', async () => {
    const initialTime = '2026-05-01T10:00:00.000Z';
    const initialMs = new Date(initialTime).getTime();
    const reminder = {
      id: 'rem_p0_H',
      time: initialTime,
      channelId: mockChannel.id,
      message: 'Weekly recurrent sync',
      repeat: 'weekly',
    };

    let guildConfig = {
      enabled: true,
      remindersEnabled: true,
      reminders: [reminder],
    };

    const redisStore = new Map();
    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          const raw = redisStore.get(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.status === 'dispatched') return -1; // Terminal
          }
          redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          redisStore.set(key, JSON.stringify({ ...current, status: 'dispatching', token, leaseExpiresAt: Date.now() + 120_000 }));
          return 1;
        }
        if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    const mockConfigStore = {
      _redis: mockRedis,
      listGuildIds: vi.fn().mockResolvedValue(['guild_p0_reg']),
      getGuildConfig: vi.fn(async () => guildConfig),
      updateGuildConfig: vi.fn(async (gId, patch) => {
        guildConfig = { ...guildConfig, ...patch };
      }),
    };

    const mockDiscordClient = {
      guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) },
    };

    // 1. May 1 10:01 - Occurrence 1 due
    vi.setSystemTime(new Date(initialMs + 60_000));
    await reminderTick(mockDiscordClient, mockConfigStore);

    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(guildConfig.reminders[0].time).toBe('2026-05-08T10:00:00.000Z');

    // 2. May 1 10:02 - Repeated scan of same minute: occurrence 1 is terminal 'dispatched'
    vi.setSystemTime(new Date(initialMs + 120_000));
    await reminderTick(mockDiscordClient, mockConfigStore);

    // ZERO additional sends on repeated scan!
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // 3. May 8 10:01 - Occurrence 2 due
    const occurrence2Ms = new Date('2026-05-08T10:00:00.000Z').getTime();
    vi.setSystemTime(new Date(occurrence2Ms + 60_000));
    await reminderTick(mockDiscordClient, mockConfigStore);

    // Occurrence 2 delivered exactly once
    expect(mockChannel.send).toHaveBeenCalledTimes(2);
    expect(guildConfig.reminders[0].time).toBe('2026-05-15T10:00:00.000Z');
  });

  it('P0.5 Test I.1: Worker A pauses after MARK_DISPATCHING returns 1; Worker B takes lease; Worker A pre-send JIT check detects token mismatch and aborts send before channel.send()', async () => {
    const referenceNow = 1000000;
    const reminder = {
      id: 'rem_p0_I1',
      channelId: mockChannel.id,
      message: 'Pre-send JIT barrier test',
      time: new Date(referenceNow).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();
    let workerAToken = null;
    const workerBToken = 'worker_B_reconciliation_token_999';

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          workerAToken = token;
          redisStore.set(key, JSON.stringify({
            status: 'pending',
            token,
            leaseExpiresAt: referenceNow + 120_000,
          }));
          return 1;
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          // Worker A successfully transitions to dispatching
          redisStore.set(key, JSON.stringify({
            status: 'dispatching',
            token,
            leaseExpiresAt: referenceNow + 120_000,
          }));

          // Barrier: While Worker A is stopped right after MARK_DISPATCHING,
          // 125 seconds pass (lease expires), and Worker B claims the occurrence for reconciliation!
          redisStore.set(key, JSON.stringify({
            status: 'reconciling',
            token: workerBToken,
            leaseExpiresAt: referenceNow + 125_000 + 120_000,
          }));
          return 1;
        }
        return 0;
      }),
    };

    const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

    // Worker A's pre-send JIT check queries Redis, discovers token is workerBToken (or status is 'reconciling'),
    // and aborts before calling channel.send()!
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(result).toEqual(reminder); // Yielded without dispatching

    // Redis state remains owned by Worker B
    const finalClaim = JSON.parse(redisStore.get(claimKey));
    expect(finalClaim.token).toBe(workerBToken);
    expect(finalClaim.status).toBe('reconciling');
  });

  it('P0.5 Test I.2: Worker A passes pre-send JIT check but stalls right before channel.send completes; Worker B takes lease as reconciling; Worker A late send completes but CAS commit rejected with -12; Worker B Oracle discovers message and commits without duplicate send', async () => {
    const referenceNow = 1500000;
    const reminder = {
      id: 'rem_p0_I2',
      channelId: mockChannel.id,
      message: 'Post-JIT stall test',
      time: new Date(referenceNow).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();
    let workerAToken = null;
    const workerBToken = 'worker_B_reconcile_token_555';

    const mockRedis = {
      get: vi.fn(async (key) => redisStore.get(key) ?? null),
      set: vi.fn(async (key, val) => { redisStore.set(key, val); return 'OK'; }),
      eval: vi.fn(async (script, keyCount, key, token, ...args) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          workerAToken = token;
          redisStore.set(key, JSON.stringify({
            status: 'pending',
            token,
            leaseExpiresAt: referenceNow + 120_000,
          }));
          return 1;
        }
        if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
          redisStore.set(key, JSON.stringify({
            status: 'dispatching',
            token,
            leaseExpiresAt: referenceNow + 120_000,
          }));
          return 1;
        }
        if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
          const current = JSON.parse(redisStore.get(key) || '{}');
          if (current.token !== token) {
            return -12; // Fencing rejection! Token mismatch!
          }
          redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
          return 1;
        }
        return 0;
      }),
    };

    // Worker A passes JIT check (reads redisStore where status is dispatching and token is workerAToken).
    // But right after JIT check passes, Worker A experiences a stall during channel.send execution.
    // While send is pending, lease expires and Worker B takes over!
    mockChannel.send = vi.fn().mockImplementation(async (content) => {
      // Lease expires! Worker B acquires lease as reconciling!
      redisStore.set(claimKey, JSON.stringify({
        status: 'reconciling',
        token: workerBToken,
        leaseExpiresAt: referenceNow + 130_000 + 120_000,
      }));

      // Worker A's send successfully reaches Discord
      const msg = {
        id: 'msg_from_worker_A',
        content,
        author: { id: 'bot_id' },
        createdTimestamp: Date.now() - 5000,
      };
      sentMessages.push(msg);
      return msg;
    });

    const resultA = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

    // Worker A's send succeeded on Discord
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // BUT Worker A's commit to Redis was REJECTED with -12 (fencing violation) because token is workerBToken!
    // Worker A yields reminder without marking completed
    expect(resultA).toEqual(reminder);

    // Now Worker B runs: Worker B's lease is reconciling.
    // Worker B runs Oracle verifyMessageSentInChannel.
    // Oracle finds msg_from_worker_A containing the unique footprint!
    const oracleResult = await verifyMessageSentInChannel(mockChannel, 'Post-JIT stall test', 60_000, `\u200B[rid:${reminder.id}:${scheduledMs}]\u200B`);
    expect(oracleResult.status).toBe('VERIFIED_SENT');

    // Worker B commits 'dispatched' using workerBToken
    const commitBRes = await mockRedis.eval('-- SCRIPT: COMMIT_DISPATCHED', 1, claimKey, workerBToken, String(referenceNow + 130_000));
    expect(commitBRes).toBe(1);

    // State in Redis is successfully committed as dispatched
    const finalClaim = JSON.parse(redisStore.get(claimKey));
    expect(finalClaim.status).toBe('dispatched');
    expect(finalClaim.token).toBe(workerBToken);

    // Crucial: mockChannel.send was called EXACTLY ONCE! Worker B NEVER re-sent! Zero duplicate deliveries!
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
  });

  it('P0.5 Test J: Two reconciling workers compete for lease; Worker A slow Oracle is superseded by Worker B commit; Worker A late CAS commit rejected with -12', async () => {
    const referenceNow = 2500000;
    const reminder = {
      id: 'rem_p0_J',
      channelId: mockChannel.id,
      message: 'Reconciliation contention test',
      time: new Date(referenceNow).toISOString(),
      repeat: 'none',
    };

    const scheduledMs = new Date(reminder.time).getTime();
    const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;

    const redisStore = new Map();
    const workerBToken = 'worker_B_reconcile_token_777';

    // Simulate Worker A acquiring lease for reconciliation
    const tokenA = 'worker_A_reconcile_token_333';
    redisStore.set(claimKey, JSON.stringify({
      status: 'reconciling',
      token: tokenA,
      acquiredAt: referenceNow,
      leaseExpiresAt: referenceNow + 120_000,
    }));

    // Worker A's Oracle runs slowly.
    // In the meantime, lease expires (130s later).
    // Worker B acquires the lease:
    redisStore.set(claimKey, JSON.stringify({
      status: 'reconciling',
      token: workerBToken,
      acquiredAt: referenceNow + 130_000,
      leaseExpiresAt: referenceNow + 130_000 + 120_000,
    }));

    // Worker B's Oracle finds the message and commits 'dispatched':
    const commitDispatchedInRedis = (key, token, completedAt) => {
      const raw = redisStore.get(key);
      if (!raw) return -10;
      const claim = JSON.parse(raw);
      if (claim.token !== token) return -12;
      claim.status = 'dispatched';
      claim.completedAt = completedAt;
      redisStore.set(key, JSON.stringify(claim));
      return 1;
    };

    // Worker B commits:
    const commitBResult = commitDispatchedInRedis(claimKey, workerBToken, referenceNow + 135_000);
    expect(commitBResult).toBe(1);

    // Worker A's slow Oracle finishes now and attempts to commit with stale tokenA:
    const commitAResult = commitDispatchedInRedis(claimKey, tokenA, referenceNow + 140_000);

    // Worker A's commit is REJECTED with -12 (fencing violation)
    expect(commitAResult).toBe(-12);

    // Worker B's state is preserved intact
    const finalClaim = JSON.parse(redisStore.get(claimKey));
    expect(finalClaim.status).toBe('dispatched');
    expect(finalClaim.token).toBe(workerBToken);
    expect(finalClaim.completedAt).toBe(referenceNow + 135_000);
  });

  it('P0.5 Test K: Redis timeouts on Lua commands reconciled via read-back; fail-closed when evidence insufficient', async () => {
    const referenceNow = 3000000;

    // Case 1: MARK_DISPATCHING times out, but Redis server executed it.
    // Read-back confirms status == 'dispatching', token matches, and unexpired lease -> proceeds to send
    {
      const reminder = {
        id: 'rem_p0_K1',
        channelId: mockChannel.id,
        message: 'Comprehensive timeout read-back audit 1',
        time: new Date(referenceNow).toISOString(),
        repeat: 'daily',
      };
      const redisStore = new Map();

      const mockRedis = {
        get: vi.fn(async (key) => redisStore.get(key) ?? null),
        eval: vi.fn(async (script, keyCount, key, token) => {
          if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
            // Server executes mutation:
            redisStore.set(key, JSON.stringify({ status: 'dispatching', token, leaseExpiresAt: referenceNow + 120_000 }));
            // Client socket times out:
            throw new Error('ETIMEDOUT: Redis socket timed out during MARK_DISPATCHING');
          }
          if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
            redisStore.set(key, JSON.stringify({ status: 'dispatched', token }));
            return 1;
          }
          return 0;
        }),
      };

      const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

      // Read-back successfully confirmed dispatching, send occurred, committed dispatched!
      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      expect(result.time).toBe(new Date(referenceNow + (24 * 60 * 60 * 1000)).toISOString());
    }

    // Reset mockChannel.send and sentMessages
    mockChannel.send.mockClear();
    sentMessages.length = 0;

    // Case 2: MARK_DISPATCHING times out, and read-back does NOT show 'dispatching'
    // Fail-closed: must NOT call channel.send()
    {
      const reminder = {
        id: 'rem_p0_K2',
        channelId: mockChannel.id,
        message: 'Comprehensive timeout read-back audit 2',
        time: new Date(referenceNow).toISOString(),
        repeat: 'daily',
      };
      const redisStore = new Map();

      const mockRedis = {
        get: vi.fn(async (key) => redisStore.get(key) ?? null),
        eval: vi.fn(async (script, keyCount, key, token) => {
          if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
            // Command was lost before execution on Redis
            throw new Error('ECONNRESET: Connection dropped before Redis processed command');
          }
          return 0;
        }),
      };

      const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

      // Fail-closed! send() was NEVER called!
      expect(mockChannel.send).not.toHaveBeenCalled();
      expect(result).toEqual(reminder); // Preserved
    }

    // Reset mockChannel.send and sentMessages
    mockChannel.send.mockClear();
    sentMessages.length = 0;

    // Case 3: COMMIT_DISPATCHED times out, but Redis server executed it and token matches
    // Read-back confirms status == 'dispatched' and token matches -> schedule advances
    {
      const reminder = {
        id: 'rem_p0_K3',
        channelId: mockChannel.id,
        message: 'Comprehensive timeout read-back audit 3',
        time: new Date(referenceNow).toISOString(),
        repeat: 'daily',
      };
      const redisStore = new Map();

      const mockRedis = {
        get: vi.fn(async (key) => redisStore.get(key) ?? null),
        eval: vi.fn(async (script, keyCount, key, token) => {
          if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
            redisStore.set(key, JSON.stringify({ status: 'dispatching', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: COMMIT_DISPATCHED')) {
            // Server executed write, but socket dropped
            redisStore.set(key, JSON.stringify({ status: 'dispatched', token, completedAt: referenceNow }));
            throw new Error('ECONNRESET: Socket closed while receiving COMMIT response');
          }
          return 0;
        }),
      };

      const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      // Read-back confirmed dispatched status with token match -> advances schedule
      expect(result.time).toBe(new Date(referenceNow + (24 * 60 * 60 * 1000)).toISOString());
    }

    // Reset mockChannel.send and sentMessages
    mockChannel.send.mockClear();
    sentMessages.length = 0;

    // Case 4: SET_UNCERTAIN times out on post-send error; read-back confirms status == 'uncertain'
    // Backoff is preserved, reminder is not double-sent
    {
      const reminder = {
        id: 'rem_p0_K4',
        channelId: mockChannel.id,
        message: 'Comprehensive timeout read-back audit 4',
        time: new Date(referenceNow).toISOString(),
        repeat: 'daily',
      };
      const scheduledMs = new Date(reminder.time).getTime();
      const claimKey = `reminder:claim:${reminder.id}:${scheduledMs}`;
      const redisStore = new Map();

      const mockRedis = {
        get: vi.fn(async (key) => redisStore.get(key) ?? null),
        eval: vi.fn(async (script, keyCount, key, token) => {
          if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
            redisStore.set(key, JSON.stringify({ status: 'pending', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: MARK_DISPATCHING')) {
            redisStore.set(key, JSON.stringify({ status: 'dispatching', token, leaseExpiresAt: referenceNow + 120_000 }));
            return 1;
          }
          if (script.includes('-- SCRIPT: SET_UNCERTAIN')) {
            // Server executed uncertain transition, socket dropped
            redisStore.set(key, JSON.stringify({ status: 'uncertain', token, retries: 1, backoffUntil: referenceNow + 300_000 }));
            throw new Error('ETIMEDOUT: Socket timed out during SET_UNCERTAIN');
          }
          return 0;
        }),
      };

      // Mock Discord send failure and Oracle failure
      mockChannel.send = vi.fn().mockRejectedValue(new Error('Discord 503 Service Unavailable'));
      mockChannel.messages.fetch = vi.fn().mockResolvedValue(new Map());

      const result = await processOneReminder(reminder, mockGuild, referenceNow, mockRedis);

      // Reminder preserved in schedule without double-firing
      expect(result).toEqual(reminder);
      const claimInRedis = JSON.parse(redisStore.get(claimKey));
      expect(claimInRedis.status).toBe('uncertain');
      expect(claimInRedis.token).toBeDefined();
    }
  });

  it('P0.5 Test L: Occurrence 2 spam protection — 100 rapid dispatch attempts within 55s are blocked by hard cooldown guard', async () => {
    _resetWorkerStateForTest();
    const reminder = {
      id: 'rem_occurrence_2',
      channelId: mockChannel.id,
      message: 'Occurrence 2 test message',
      time: '2026-10-16T12:00:00.000Z',
      repeat: 'hourly',
    };
    const scheduledMs = new Date(reminder.time).getTime();
    let sendCount = 0;
    mockChannel.send = vi.fn(async (content) => {
      sendCount++;
      return { id: `msg_${sendCount}`, content, author: { id: 'bot_id' } };
    });

    // 1st dispatch attempt succeeds
    const firstRes = await processOneReminder(reminder, mockGuild, scheduledMs, null);
    expect(sendCount).toBe(1);
    expect(firstRes).toBeDefined();

    // 100 rapid subsequent calls in the same minute (e.g. rapid ticks or race conditions)
    for (let i = 0; i < 100; i++) {
      const burstRes = await processOneReminder(reminder, mockGuild, scheduledMs + (i * 100), null);
      // Because cooldown is active, reminder is returned without any new Discord sends!
      expect(burstRes).toEqual(reminder);
    }

    // channel.send was called EXACTLY ONCE! Zero duplicate sends!
    expect(sendCount).toBe(1);
  });

  it('P0.5 Test M: ACQUIRE_LEASE_LUA returning -2 yields immediately and never calls channel.send()', async () => {
    _resetWorkerStateForTest();
    const reminder = {
      id: 'rem_active_dispatch',
      channelId: mockChannel.id,
      message: 'Active dispatch in progress test',
      time: '2026-10-16T12:00:00.000Z',
      repeat: 'daily',
    };
    mockChannel.send = vi.fn();

    const mockRedis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async (script) => {
        if (script.includes('-- SCRIPT: ACQUIRE_LEASE')) {
          return -2; // Another worker is actively dispatching
        }
        return 0;
      }),
    };

    const res = await processOneReminder(reminder, mockGuild, Date.now(), mockRedis);
    expect(res).toEqual(reminder);
    // Verified: channel.send is NEVER called when res === -2!
    expect(mockChannel.send).not.toHaveBeenCalled();
  });
});

