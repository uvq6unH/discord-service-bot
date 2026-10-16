/**
 * reminderWorker.js — Polls configStore mỗi 60 s, gửi reminder đến đúng channel,
 * reschedule nếu repeat, xoá nếu one-shot.
 *
 * Tách ra khỏi bot.js để ClientReady handler gọn hơn.
 *
 * DISTRIBUTED RESILIENCE & FENCING INVARIANTS:
 * 1. Single active claim via ACQUIRE_LEASE_LUA with UUID v4 fencing tokens.
 * 2. In-flight request tracking: no second send can start while prior send promise is pending.
 * 3. Atomic CAS transitions with token verification (COMMIT_DISPATCHED_LUA, SET_TERMINAL_LUA, SET_UNCERTAIN_LUA).
 * 4. Fail-closed on Redis outage in distributed mode (no silent ram bypass).
 * 5. Pre-flight Oracle and crash recovery: never blindly resend ambiguous occurrences.
 * 6. Emergency circuit breaker: quarantines occurrences exceeding dispatch thresholds.
 * 7. Idempotent worker lifecycle with singleton guard and clean shutdown.
 */

import crypto from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { resolveEmojiNames } from './emojiMap.js';
import { withRedisLock } from '../distributedLock.js';
import { isGuildInaccessible, setGuildLifecycle } from '../guildLifecycle.js';

export const REPEAT_INTERVALS_MS = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
};

export const LEASE_TTL_SEC = 120; // 120s (8x của timeout 15s để đảm bảo request TCP kết thúc trước khi lease hết hạn)
export const MAX_UNCERTAIN_RETRIES = 2; // Giới hạn tối đa 2 lần thử lại khi delivery ở trạng thái bất định
export const MAX_DISPATCHES_PER_WINDOW = 3;
export const DISPATCH_WINDOW_MS = 60_000;

// ── Singleton Worker State ──────────────────────────────────────────────────
let _activeWorkerInterval = null;
let _isTickInProgress = false;
let _currentTickPromise = null;
const _workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

// In-flight send requests deduplication: occurrenceKey -> Promise
export const _inFlightSends = new Map();

// Emergency dispatch rate-limiter tracker: occurrenceKey -> Array<timestamp>
export const _dispatchHistory = new Map();

// 55s per-reminder cooldown tracker for in-memory / local mode: reminderId -> timestamp
export const _recentlyFiredInMemory = new Map();

// In-memory claim deduplication fallback for local/single-process environments: claimKey -> JSON string
export const _inMemoryClaims = new Map();
setInterval(() => {
  if (_inMemoryClaims.size > 10_000) _inMemoryClaims.clear();
  if (_recentlyFiredInMemory.size > 10_000) _recentlyFiredInMemory.clear();
}, 24 * 60 * 60 * 1000).unref();

export function _resetWorkerStateForTest() {
  if (_activeWorkerInterval) {
    clearInterval(_activeWorkerInterval);
    _activeWorkerInterval = null;
  }
  _isTickInProgress = false;
  _currentTickPromise = null;
  _inFlightSends.clear();
  _dispatchHistory.clear();
  _recentlyFiredInMemory.clear();
  _inMemoryClaims.clear();
}

export function fingerprintToken(token) {
  if (!token) return 'none';
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 8);
}

export function logReminderEvent(event, { occurrenceId, reminderId, attempt = 1, token = null, status = null, errorClassification = null, extra = {} }) {
  console.log(`[reminder] [${event}] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    occurrenceId: occurrenceId || `rem_${reminderId}`,
    reminderId,
    workerId: _workerId,
    tokenFingerprint: fingerprintToken(token),
    attempt,
    status,
    errorClassification,
    ...extra,
  })}`);
}

// Lua Script: Compare-and-Set to commit 'dispatched' only if token matches active lease
const COMMIT_DISPATCHED_LUA = `
-- SCRIPT: COMMIT_DISPATCHED
local raw = redis.call('GET', KEYS[1])
if not raw then return -10 end -- Key expired
local claim = cjson.decode(raw)
if not claim then return -11 end -- Corrupt JSON
if claim.token ~= ARGV[1] then return -12 end -- Token mismatch (fencing violation)
if claim.status ~= 'dispatching' and claim.status ~= 'pending' and claim.status ~= 'reconciling' then return -13 end

claim.status = 'dispatched'
claim.token = ARGV[1]
claim.completedAt = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
return 1
`;

// Lua Script: Atomically transition to 'dispatching' before calling channel.send(), enforcing distributed circuit breaker with explicit time window
const MARK_DISPATCHING_LUA = `
-- SCRIPT: MARK_DISPATCHING
local raw = redis.call('GET', KEYS[1])
if not raw then return -10 end -- Key expired
local claim = cjson.decode(raw)
if not claim then return -11 end -- Corrupt JSON
if claim.token ~= ARGV[1] then return -12 end -- Token mismatch (fencing violation)
if claim.status ~= 'pending' then return -13 end -- Invariant: ONLY 'pending' can transition to 'dispatching'!

local now = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3] or 3)
local windowMs = tonumber(ARGV[4] or 60000)

local windowStart = tonumber(claim.windowStart or 0)
local attempts = 0
if windowStart > 0 and (now - windowStart) <= windowMs then
  attempts = (claim.dispatchAttempts or 0) + 1
else
  windowStart = now
  attempts = 1
end

claim.windowStart = windowStart
claim.dispatchAttempts = attempts

if attempts > maxAttempts then
  claim.status = 'dead_letter'
  claim.reason = 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED'
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 604800)
  return -20 -- Circuit breaker tripped!
end

claim.status = 'dispatching'
claim.dispatchedAt = now
redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
return 1
`;

// Lua Script: Compare-and-Delete to release lease only if token matches active lease and send was not started
const RELEASE_LEASE_LUA = `
-- SCRIPT: RELEASE_LEASE
local raw = redis.call('GET', KEYS[1])
if not raw then return 1 end
local claim = cjson.decode(raw)
if claim and claim.token == ARGV[1] then
  -- Only release if still in pending. If dispatching, reconciling, or uncertain, state must persist for Oracle/audit!
  if claim.status == 'pending' then
    return redis.call('DEL', KEYS[1])
  end
end
return 0
`;

// Lua Script: Acquire/renew lease atomically with occurrence-level fencing and unambiguous dispatch tracking
const ACQUIRE_LEASE_LUA = `
-- SCRIPT: ACQUIRE_LEASE
local raw = redis.call('GET', KEYS[1])
local newToken = ARGV[1]
local now = tonumber(ARGV[2])
local ttlSec = tonumber(ARGV[3])
local leaseExpiresAt = now + (ttlSec * 1000)

if not raw then
  local payload = cjson.encode({
    status = 'pending',
    token = newToken,
    acquiredAt = now,
    leaseExpiresAt = leaseExpiresAt,
    retries = 0,
    dispatchAttempts = 0,
    windowStart = now
  })
  redis.call('SET', KEYS[1], payload, 'EX', 86400)
  return 1
end

local claim = cjson.decode(raw)
if not claim then return 0 end

-- 1. Terminal states are permanent across 24h
if claim.status == 'dispatched' or claim.status == 'permanent_failure' or claim.status == 'dead_letter' then
  return -1
end

-- 2. Dispatching state: previous worker already invoked channel.send()!
-- Even if lease expired, we MUST NOT blindly send again. Must reconcile with Oracle.
if claim.status == 'dispatching' then
  local currentExpires = tonumber(claim.leaseExpiresAt or 0)
  if now > currentExpires then
    claim.status = 'reconciling'
    claim.token = newToken
    claim.acquiredAt = now
    claim.leaseExpiresAt = leaseExpiresAt
    redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
    return 2 -- Acquired for reconciliation only
  end
  return -2 -- Active dispatch in progress
end

-- 3. Pending state: worker claimed lease but hasn't dispatched HTTP request yet
if claim.status == 'pending' then
  local currentExpires = tonumber(claim.leaseExpiresAt or 0)
  if now < currentExpires then
    return 0 -- Active lease held by another live worker
  end
  -- Lease expired while in pending: previous worker never called channel.send()!
  -- Safe to claim because no HTTP request was dispatched to Discord.
  claim.token = newToken
  claim.acquiredAt = now
  claim.leaseExpiresAt = leaseExpiresAt
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
  return 1
end

-- 4. Uncertain state: quarantined in backoff
if claim.status == 'uncertain' then
  local backoffUntil = tonumber(claim.backoffUntil or 0)
  if now < backoffUntil then
    return 0 -- Still in backoff quarantine
  end
  -- Backoff expired: acquire for Oracle reconciliation only
  claim.status = 'reconciling'
  claim.token = newToken
  claim.acquiredAt = now
  claim.leaseExpiresAt = leaseExpiresAt
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
  return 2 -- Acquired for reconciliation
end

if claim.status == 'reconciling' then
  local currentExpires = tonumber(claim.leaseExpiresAt or 0)
  if now < currentExpires then
    return 0
  end
  claim.token = newToken
  claim.acquiredAt = now
  claim.leaseExpiresAt = leaseExpiresAt
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
  return 2 -- Acquired for reconciliation
end

return 0
`;

// Lua Script: Transition to 'uncertain' backoff state, or 'dead_letter' if max retries reached
const SET_UNCERTAIN_LUA = `
-- SCRIPT: SET_UNCERTAIN
local raw = redis.call('GET', KEYS[1])
if not raw then return -10 end -- Key expired
local claim = cjson.decode(raw)
if not claim then return -11 end -- Corrupt JSON
if claim.token ~= ARGV[1] then return -12 end -- Token mismatch (fencing violation)

local retries = (claim.retries or 0) + 1
claim.retries = retries
local maxRetries = tonumber(ARGV[2] or 2)
local now = tonumber(ARGV[3])
local backoffMs = tonumber(ARGV[4] or 300000)

if retries >= maxRetries then
  claim.status = 'dead_letter'
  claim.reason = 'MAX_UNCERTAIN_RETRIES_EXCEEDED'
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 604800)
  return -1
else
  claim.status = 'uncertain'
  claim.backoffUntil = now + backoffMs
  redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', 86400)
  return retries
end
`;

// Lua Script: Compare-and-Set to commit terminal status ('dead_letter' or 'permanent_failure') ONLY if token matches active lease
const SET_TERMINAL_LUA = `
-- SCRIPT: SET_TERMINAL
local raw = redis.call('GET', KEYS[1])
if not raw then return -10 end -- Key expired
local claim = cjson.decode(raw)
if not claim then return -11 end -- Corrupt JSON
if claim.token ~= ARGV[1] then return -12 end -- Token mismatch (fencing violation)

local status = ARGV[2] -- 'dead_letter' or 'permanent_failure'
local reason = ARGV[3] or ''
local extra = ARGV[4] or ''
local ttl = tonumber(ARGV[5] or 604800)

claim.status = status
claim.reason = reason
claim.extra = extra
redis.call('SET', KEYS[1], cjson.encode(claim), 'EX', ttl)
return 1
`;

// ── In-Memory CAS Helpers ───────────────────────────────────────────────────
export function _inMemoryAcquireLease(claimKey, newToken, now, ttlSec) {
  const raw = _inMemoryClaims.get(claimKey);
  const leaseExpiresAt = now + (ttlSec * 1000);
  if (!raw) {
    _inMemoryClaims.set(claimKey, JSON.stringify({
      status: 'pending',
      token: newToken,
      acquiredAt: now,
      leaseExpiresAt,
      retries: 0,
      dispatchAttempts: 0,
      windowStart: now,
    }));
    return 1;
  }

  const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (claim.status === 'dispatched' || claim.status === 'permanent_failure' || claim.status === 'dead_letter') {
    return -1;
  }

  if (claim.status === 'dispatching') {
    const currentExpires = Number(claim.leaseExpiresAt || 0);
    if (now > currentExpires) {
      claim.status = 'reconciling';
      claim.token = newToken;
      claim.acquiredAt = now;
      claim.leaseExpiresAt = leaseExpiresAt;
      _inMemoryClaims.set(claimKey, JSON.stringify(claim));
      return 2; // Acquired for reconciliation only
    }
    return -2; // Active dispatch in progress
  }

  if (claim.status === 'pending') {
    const currentExpires = Number(claim.leaseExpiresAt || 0);
    if (now < currentExpires) {
      return 0;
    }
    claim.token = newToken;
    claim.acquiredAt = now;
    claim.leaseExpiresAt = leaseExpiresAt;
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return 1;
  }

  if (claim.status === 'uncertain') {
    const backoffUntil = Number(claim.backoffUntil || 0);
    if (now < backoffUntil) {
      return 0;
    }
    claim.status = 'reconciling';
    claim.token = newToken;
    claim.acquiredAt = now;
    claim.leaseExpiresAt = leaseExpiresAt;
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return 2;
  }

  if (claim.status === 'reconciling') {
    const currentExpires = Number(claim.leaseExpiresAt || 0);
    if (now < currentExpires) {
      return 0;
    }
    claim.token = newToken;
    claim.acquiredAt = now;
    claim.leaseExpiresAt = leaseExpiresAt;
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return 2;
  }

  return 0;
}

export function _inMemoryMarkDispatching(claimKey, token, now, maxAttempts = 3, windowMs = 60_000) {
  const raw = _inMemoryClaims.get(claimKey);
  if (!raw) return -10;
  const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (claim.token !== token) return -12;
  if (claim.status !== 'pending') return -13; // Invariant: ONLY 'pending' can transition to 'dispatching'!

  const windowStart = Number(claim.windowStart || 0);
  let attempts = 0;
  if (windowStart > 0 && (now - windowStart) <= windowMs) {
    attempts = Number(claim.dispatchAttempts || 0) + 1;
  } else {
    claim.windowStart = now;
    attempts = 1;
  }

  claim.dispatchAttempts = attempts;
  if (attempts > maxAttempts) {
    claim.status = 'dead_letter';
    claim.reason = 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED';
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return -20;
  }

  claim.status = 'dispatching';
  claim.dispatchedAt = now;
  _inMemoryClaims.set(claimKey, JSON.stringify(claim));
  return 1;
}

export function _inMemoryCommitDispatched(claimKey, token, now) {
  const raw = _inMemoryClaims.get(claimKey);
  if (!raw) return -10;
  const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (claim.token !== token) return -12;
  if (claim.status !== 'dispatching' && claim.status !== 'pending' && claim.status !== 'reconciling') return -13;

  claim.status = 'dispatched';
  claim.completedAt = now;
  _inMemoryClaims.set(claimKey, JSON.stringify(claim));
  return 1;
}

export function _inMemorySetUncertain(claimKey, token, maxRetries, now, backoffMs = 300_000) {
  const raw = _inMemoryClaims.get(claimKey);
  if (!raw) return -10;
  const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (claim.token !== token) return -12;

  const retries = (claim.retries || 0) + 1;
  claim.retries = retries;
  if (retries >= maxRetries) {
    claim.status = 'dead_letter';
    claim.reason = 'MAX_UNCERTAIN_RETRIES_EXCEEDED';
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return -1;
  } else {
    claim.status = 'uncertain';
    claim.backoffUntil = now + backoffMs;
    _inMemoryClaims.set(claimKey, JSON.stringify(claim));
    return retries;
  }
}

export function _inMemorySetTerminal(claimKey, token, status, reason, extra) {
  const raw = _inMemoryClaims.get(claimKey);
  if (!raw) return -10;
  const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (claim.token !== token) return -12;

  claim.status = status;
  claim.reason = reason;
  claim.extra = extra;
  _inMemoryClaims.set(claimKey, JSON.stringify(claim));
  return 1;
}

export async function releaseLease(redis, claimKey, token) {
  if (!token) return 0;
  if (redis) {
    try {
      const res = await redis.eval(RELEASE_LEASE_LUA, 1, claimKey, token);
      return res === 1 ? 1 : 0;
    } catch (err) {
      console.warn(`[reminder] releaseLease Redis error for ${claimKey}: ${err.message}`);
      return 0;
    }
  } else {
    const raw = _inMemoryClaims.get(claimKey);
    if (!raw) return 1;
    const claim = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (claim?.token === token && claim?.status === 'pending') {
      _inMemoryClaims.delete(claimKey);
      return 1;
    }
    return 0;
  }
}

function _checkAndRecordDispatchAttempt(occurrenceId) {
  const now = Date.now();
  const history = _dispatchHistory.get(occurrenceId) || [];
  const recent = history.filter((t) => now - t <= DISPATCH_WINDOW_MS);
  recent.push(now);
  _dispatchHistory.set(occurrenceId, recent);
  return recent.length <= MAX_DISPATCHES_PER_WINDOW;
}

/**
 * Tính thời điểm tiếp theo cho reminder lặp lại.
 * Hỗ trợ: hourly, daily, weekly, monthly.
 * @param {string} currentTimeIso Thời điểm hiện tại của reminder (ISO 8601)
 * @param {string} repeat 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly'
 * @param {number|Date} [referenceNow] Thời điểm tham chiếu (mặc định Date.now())
 * @returns {string|null} Thời điểm tiếp theo (ISO 8601), hoặc null nếu không lặp
 */
export function calculateNextReminderTime(currentTimeIso, repeat = 'none', referenceNow = Date.now()) {
  const nowMs = typeof referenceNow === 'number' ? referenceNow : new Date(referenceNow).getTime();

  if (repeat === 'hourly' || repeat === 'daily' || repeat === 'weekly') {
    const ms = REPEAT_INTERVALS_MS[repeat];
    let nextTime = new Date(currentTimeIso).getTime() + ms;
    while (nextTime <= nowMs) nextTime += ms;
    return new Date(nextTime).toISOString();
  }

  if (repeat === 'monthly') {
    const date = new Date(currentTimeIso);
    if (isNaN(date.getTime())) return null;
    const targetDay = date.getDate();

    while (date.getTime() <= nowMs) {
      const curYear = date.getFullYear();
      const curMonth = date.getMonth();
      const nextMonth = (curMonth + 1) % 12;
      const nextYear = curMonth === 11 ? curYear + 1 : curYear;

      const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInNextMonth);

      date.setFullYear(nextYear, nextMonth, clampedDay);
    }
    return date.toISOString();
  }

  return null;
}

export async function dispatchAdminAlert(guild, reminder, reasonCode, message, configStore = null) {
  try {
    console.error(`[reminder] [ALERT_ADMIN] Failure for reminder ${reminder.id} in guild ${guild?.name || 'unknown'}: ${reasonCode} (${message})`);
    if (configStore && guild?.id) {
      const config = await configStore.getGuildConfig(guild.id).catch(() => null);
      if (config?.logChannelId) {
        const { sendLog } = await import('./logging.js');
        await sendLog(guild, config, {
          embeds: [{
            title: '⚠️ Reminder Alert: Quarantined / Delivery Failure',
            description: `Reminder **${reminder.id}** (${reminder.message?.slice(0, 50)}) failed with code **${reasonCode}**:\n${message}`,
            color: 0xff0000,
            timestamp: new Date().toISOString(),
          }]
        }).catch((err) => console.warn('[reminder] Warning: sendLog failed:', err.message));
        return;
      }
    }
    if (guild?.systemChannel?.isTextBased?.()) {
      await guild.systemChannel.send({
        embeds: [{
          title: '⚠️ Reminder Alert: Delivery Failure',
          description: `Reminder **${reminder.id}** could not be delivered: **${reasonCode}** (${message}). Please check bot permissions.`,
          color: 0xff0000,
        }]
      }).catch((err) => console.warn('[reminder] Warning: systemChannel send failed:', err.message));
    }
  } catch (err) {
    console.warn(`[reminder] Warning: dispatchAdminAlert error: ${err.message}`);
  }
}

/**
 * Oracle kiểm chứng tin nhắn:
 * - 'VERIFIED_SENT': Tìm thấy tin nhắn chứa footprint định danh duy nhất của bot vừa gửi trong kênh.
 * - 'UNCERTAIN': Không tìm thấy footprint trong tập tin nhắn fetch giới hạn (hoặc lỗi fetch/thiếu quyền/rate limit).
 * Tuyệt đối không bao giờ trả về 'NOT_SENT' để tránh phỏng đoán sai lệch khi thiếu bằng chứng.
 */
export async function verifyMessageSentInChannel(channel, text, maxAgeMs = 60_000, footprint = null) {
  if (!channel?.isTextBased?.()) {
    return { status: 'UNCERTAIN', reason: 'CHANNEL_NOT_TEXT_BASED' };
  }

  try {
    const botMember = channel.guild?.members?.me || channel.guild?.members?.cache?.get(channel.client?.user?.id);
    if (botMember && channel.permissionsFor) {
      const perms = channel.permissionsFor(botMember);
      if (perms && !perms.has(PermissionFlagsBits.ReadMessageHistory)) {
        return { status: 'UNCERTAIN', reason: 'MISSING_READ_MESSAGE_HISTORY_PERMISSION' };
      }
    }
  } catch {
    // Không thể xác minh quyền -> tiếp tục với fallback an toàn
  }

  try {
    // Page 1: Fetch tối đa 100 tin nhắn gần nhất (giới hạn tối đa của Discord API)
    let fetched;
    try {
      fetched = await channel.messages.fetch({ limit: 100 });
    } catch (fetchErr) {
      const code = fetchErr?.status || fetchErr?.code;
      if (code === 403 || code === 50001) {
        return { status: 'UNCERTAIN', reason: 'MISSING_READ_MESSAGE_HISTORY_PERMISSION' };
      }
      if (code === 429) {
        return { status: 'UNCERTAIN', reason: 'RATE_LIMITED' };
      }
      return { status: 'UNCERTAIN', reason: fetchErr.message || 'FETCH_FAILED' };
    }

    if (!fetched?.size) return { status: 'UNCERTAIN', reason: 'FETCH_EMPTY_OR_FAILED' };
    const now = Date.now();
    let msgList = Array.from(fetched.values());

    const isMatch = (m) => {
      const isRecent = footprint ? (now - m.createdTimestamp) <= (86400 * 1000) : (now - m.createdTimestamp) <= maxAgeMs;
      const isBot = m.author?.id === channel.client?.user?.id;
      const matches = footprint ? m.content?.includes(footprint) : m.content === text;
      return isRecent && isBot && matches;
    };

    if (msgList.some(isMatch)) {
      return { status: 'VERIFIED_SENT' };
    }

    // Page 2: Phân trang tìm tiếp nếu kênh có lưu lượng lớn và tin cũ nhất vẫn nằm trong cửa sổ thời gian
    if (footprint && msgList.length === 100) {
      const oldestMsg = msgList[msgList.length - 1];
      if (oldestMsg?.id && (now - oldestMsg.createdTimestamp) < (86400 * 1000)) {
        try {
          const page2 = await channel.messages.fetch({ limit: 100, before: oldestMsg.id });
          if (page2?.size) {
            const page2List = Array.from(page2.values());
            if (page2List.some(isMatch)) {
              return { status: 'VERIFIED_SENT' };
            }
          }
        } catch {
          // Lỗi ở page 2 không làm crash, giữ nguyên kết quả UNCERTAIN
        }
      }
    }

    return { status: 'UNCERTAIN', reason: 'NOT_FOUND_IN_BOUNDED_FETCH' };
  } catch (err) {
    return { status: 'UNCERTAIN', reason: err.message };
  }
}

/**
 * Bọc một promise với timeout cứng (fencing guard).
 */
function withTimeout(promise, timeoutMs = 15_000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Xử lý một reminder đến hạn với cơ chế Fencing Token & Tri-State Reliability
 */
export async function processOneReminder(reminder, guild, referenceNow = Date.now(), redis = null, configStore = null) {
  const scheduledTimeMs = new Date(reminder.time).getTime();
  const occurrenceId = `${reminder.id}:${scheduledTimeMs}`;
  const claimKey = `reminder:claim:${occurrenceId}`;
  const cooldownKey = `reminder:cooldown:${reminder.id}`;

  // 1. Kiểm tra deduplication các request đang in-flight trong process này
  if (_inFlightSends.has(occurrenceId)) {
    console.warn(`[reminder] Occurrence ${occurrenceId} already has an in-flight send request. Yielding to avoid duplicate dispatch.`);
    return reminder;
  }

  // 1b. Distributed & in-process 55s hard cooldown per reminder.id
  // Strictly eliminates burst duplicates or multi-fire loops within 1 minute
  if (redis) {
    try {
      const cd = await redis.set(cooldownKey, '1', 'NX', 'EX', '55');
      if (cd !== 'OK') {
        console.log(`[reminder] Hard cooldown active for reminder ${reminder.id} (already dispatched within 55s). Skipping duplicate burst.`);
        return reminder;
      }
    } catch {
      // If Redis cooldown check encounters error, fall through to CAS lease check
    }
  } else {
    const lastFired = _recentlyFiredInMemory.get(reminder.id);
    if (lastFired && (referenceNow - lastFired) < 55_000) {
      console.log(`[reminder] In-memory cooldown active for reminder ${reminder.id} (last: ${lastFired}). Skipping duplicate.`);
      return reminder;
    }
    _recentlyFiredInMemory.set(reminder.id, referenceNow);
  }

  // 2. Đọc claim hiện thời
  let rawClaim = null;
  if (redis) {
    try {
      rawClaim = await redis.get(claimKey);
    } catch (err) {
      console.warn(`[reminder] Redis get claim error for ${reminder.id}: ${err.message}. Yielding reminder safely to prevent duplicate dispatch.`);
      return reminder;
    }
  } else {
    const isDistributedExpected = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.NODE_ENV === 'production');
    if (isDistributedExpected) {
      console.error(`[reminder] Distributed mode active but Redis instance missing. Yielding reminder ${reminder.id} safely to fail closed.`);
      return reminder;
    }
    rawClaim = _inMemoryClaims.get(claimKey);
  }

  let claimData = null;
  if (rawClaim) {
    try {
      claimData = typeof rawClaim === 'string' ? JSON.parse(rawClaim) : rawClaim;
    } catch {
      claimData = { status: rawClaim };
    }
  }

  // 3. Kiểm tra trạng thái kết thúc (Terminal State)
  if (claimData?.status === 'dispatched' || claimData?.status === 'permanent_failure' || claimData?.status === 'dead_letter') {
    console.log(`[reminder] Reminder "${reminder.id}" terminal state is ${claimData.status}. Advancing schedule without duplicate send.`);
    const repeat = reminder.repeat ?? 'none';
    const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
    return nextTime ? { ...reminder, time: nextTime } : null;
  }

  // 4. Nếu đang 'pending' và lease chưa hết hạn, hoặc còn trong backoff 'uncertain': bỏ qua tick này
  if (claimData?.status === 'pending') {
    const expiresAt = Number(claimData.leaseExpiresAt || 0);
    if (expiresAt && referenceNow < expiresAt) {
      console.log(`[reminder] Active lease for "${reminder.id}" (pending). Skipping concurrent run.`);
      return reminder;
    }
  }
  if (claimData?.status === 'uncertain' && referenceNow < (claimData.backoffUntil || 0)) {
    console.log(`[reminder] Active backoff for "${reminder.id}" (until ${new Date(claimData.backoffUntil).toISOString()}). Skipping tick.`);
    return reminder;
  }

  // 5. Acquire/renew lease với Cryptographically Secure Token (UUID v4)
  const leaseToken = crypto.randomUUID();
  let leaseAcquired = false;
  let isReconciliation = false;

  if (redis) {
    try {
      const res = await redis.eval(
        ACQUIRE_LEASE_LUA,
        1,
        claimKey,
        leaseToken,
        String(referenceNow),
        String(LEASE_TTL_SEC)
      );
      if (res === -1) {
        const repeat = reminder.repeat ?? 'none';
        const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
        return nextTime ? { ...reminder, time: nextTime } : null;
      }
      if (res === 2) {
        // Expired lease safely claimed for Oracle reconciliation
        isReconciliation = true;
        leaseAcquired = true;
      } else if (res === 1) {
        leaseAcquired = true;
      } else if (res === -2) {
        // Active dispatching in progress by another live worker! Yield immediately!
        console.log(`[reminder] Active dispatch in progress by another worker for ${reminder.id}. Yielding.`);
        return reminder;
      } else {
        leaseAcquired = false;
      }
    } catch (err) {
      console.warn(`[reminder] Redis eval error on ACQUIRE_LEASE_LUA for ${reminder.id}: ${err.message}. Checking read-back...`);
      try {
        const check = await redis.get(claimKey);
        const parsed = check ? (typeof check === 'string' ? JSON.parse(check) : check) : null;
        if (parsed?.token === leaseToken) {
          console.log(`[reminder] Read-back confirmed lease acquired despite Redis network error for ${reminder.id}`);
          leaseAcquired = true;
          isReconciliation = parsed.status === 'reconciling';
        } else {
          return reminder;
        }
      } catch (readBackErr) {
        console.warn(`[reminder] Read-back check also failed for ${reminder.id}: ${readBackErr.message}. Failing closed.`);
        return reminder;
      }
    }
  } else {
    const res = _inMemoryAcquireLease(claimKey, leaseToken, referenceNow, LEASE_TTL_SEC);
    if (res === -1) {
      const repeat = reminder.repeat ?? 'none';
      const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
      return nextTime ? { ...reminder, time: nextTime } : null;
    }
    if (res === 2) {
      isReconciliation = true;
      leaseAcquired = true;
    } else if (res === 1) {
      leaseAcquired = true;
    } else if (res === -2) {
      console.log(`[reminder] In-memory active dispatch in progress for ${reminder.id}. Yielding.`);
      return reminder;
    } else {
      leaseAcquired = false;
    }
  }

  if (!leaseAcquired) {
    return reminder;
  }

  const leaseAcquiredWallTime = Date.now();

  logReminderEvent('CLAIM_ACQUIRED', { occurrenceId, reminderId: reminder.id, token: leaseToken, status: isReconciliation ? 'reconciling' : 'pending' });

  // 6. Emergency circuit breaker: kiểm tra tần suất dispatch bất thường (In-process guard)
  if (!_checkAndRecordDispatchAttempt(occurrenceId)) {
    console.error(`[reminder] [EMERGENCY_PROTECTION] Occurrence ${occurrenceId} exceeded ${MAX_DISPATCHES_PER_WINDOW} dispatches within ${DISPATCH_WINDOW_MS}ms. Quarantining occurrence.`);
    await dispatchAdminAlert(guild, reminder, 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED', 'Occurrence exceeded dispatch rate limit', configStore);
    if (redis) {
      await redis.eval(SET_TERMINAL_LUA, 1, claimKey, leaseToken, 'dead_letter', 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED', '', '604800').catch(() => null);
    } else {
      _inMemorySetTerminal(claimKey, leaseToken, 'dead_letter', 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED', '');
    }
    const repeat = reminder.repeat ?? 'none';
    const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
    return nextTime ? { ...reminder, time: nextTime } : null;
  }

  // 7. Thẩm định kênh gửi
  let terminalOutcome = null;
  const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);

  if (!channel || !channel.isTextBased?.()) {
    console.error(`[reminder] [ALERT_ADMIN] Target channel ${reminder.channelId} missing or invalid in guild ${guild.name}.`);
    await dispatchAdminAlert(guild, reminder, 'CHANNEL_NOT_FOUND', `Target channel ${reminder.channelId} missing or invalid in guild`, configStore);
    terminalOutcome = 'permanent_failure';
    if (redis) {
      await redis.eval(SET_TERMINAL_LUA, 1, claimKey, leaseToken, 'permanent_failure', 'CHANNEL_NOT_FOUND', '', '86400').catch(() => null);
    } else {
      _inMemorySetTerminal(claimKey, leaseToken, 'permanent_failure', 'CHANNEL_NOT_FOUND', '');
    }
    return reminder;
  }

  // 8. Chuẩn bị payload & footprint
  const ids = Array.isArray(reminder.userIds) && reminder.userIds.length
    ? reminder.userIds
    : (reminder.userId ? [reminder.userId] : []);
  const userMentions = ids.map((id) => `<@${id}>`).join(' ');

  const roleIds = Array.isArray(reminder.roleIds) ? reminder.roleIds : [];
  const roleMentions = roleIds.map((id) => `<@&${id}>`).join(' ');

  const mentions = [userMentions, roleMentions].filter(Boolean).join(' ');
  const resolvedMsg = resolveEmojiNames(reminder.message, guild);
  const footprint = `\u200B[rid:${reminder.id}:${scheduledTimeMs}]\u200B`;
  const bodyWithFootprint = `${resolvedMsg} ${footprint}`;
  const finalText = mentions ? `${mentions} ${bodyWithFootprint}` : bodyWithFootprint;

  // 9. Oracle Check (Pre-flight check or Reconciliation flow)
  const preCheck = await verifyMessageSentInChannel(channel, finalText, 60_000, footprint);
  if (preCheck.status === 'VERIFIED_SENT') {
    console.log(`[reminder] Oracle detected message already delivered for ${reminder.id}. Skipping duplicate send.`);
    terminalOutcome = 'dispatched';
  } else if (isReconciliation) {
    // Luồng Reconciliation: Tuyệt đối không resend mù khi kết quả chưa rõ!
    if (preCheck.reason === 'MISSING_READ_MESSAGE_HISTORY_PERMISSION') {
      console.warn(`[reminder] Cannot verify prior attempt for ${reminder.id} due to missing ReadMessageHistory. Quarantining to dead_letter.`);
      await dispatchAdminAlert(guild, reminder, 'CANNOT_PROVE_NO_HISTORY_PERMISSION', 'Bot lacks ReadMessageHistory permission', configStore);
      terminalOutcome = 'dead_letter';
      if (redis) {
        await redis.eval(SET_TERMINAL_LUA, 1, claimKey, leaseToken, 'dead_letter', 'CANNOT_PROVE_NO_HISTORY_PERMISSION', '', '604800').catch(() => null);
      } else {
        _inMemorySetTerminal(claimKey, leaseToken, 'dead_letter', 'CANNOT_PROVE_NO_HISTORY_PERMISSION', '');
      }
      return reminder;
    } else {
      // Tăng số lần thử hoặc chuyển dead_letter nếu vượt ngưỡng
      if (redis) {
        const res = await redis.eval(SET_UNCERTAIN_LUA, 1, claimKey, leaseToken, String(MAX_UNCERTAIN_RETRIES), String(referenceNow), String(300_000)).catch(() => null);
        if (res === -1) {
          console.error(`[reminder] [ALERT_ADMIN] Reminder ${reminder.id} quarantined in dead_letter after exceeding ${MAX_UNCERTAIN_RETRIES} uncertain retries.`);
          await dispatchAdminAlert(guild, reminder, 'DEAD_LETTER_EXCEEDED_RETRIES', `Quarantined in dead_letter after exceeding ${MAX_UNCERTAIN_RETRIES} retries without delivery confirmation`, configStore);
          terminalOutcome = 'dead_letter';
        } else {
          console.log(`[reminder] Occurrence ${occurrenceId} remains uncertain after reconciliation check. Backoff extended.`);
          return reminder;
        }
      } else {
        const res = _inMemorySetUncertain(claimKey, leaseToken, MAX_UNCERTAIN_RETRIES, referenceNow, 300_000);
        if (res === -1) {
          await dispatchAdminAlert(guild, reminder, 'DEAD_LETTER_EXCEEDED_RETRIES', `Quarantined in dead_letter after exceeding ${MAX_UNCERTAIN_RETRIES} retries without delivery confirmation`, configStore);
          terminalOutcome = 'dead_letter';
        } else {
          return reminder;
        }
      }
    }
  }

  // 10. Gửi Discord có bảo vệ In-Flight tracking & Distributed Circuit Breaker
  if (terminalOutcome !== 'dispatched' && !isReconciliation) {
    // Atomic transition sang 'dispatching' trong Redis trước khi gọi channel.send()
    if (redis) {
      let markRes = null;
      try {
        markRes = await redis.eval(
          MARK_DISPATCHING_LUA,
          1,
          claimKey,
          leaseToken,
          String(referenceNow),
          String(MAX_DISPATCHES_PER_WINDOW),
          String(DISPATCH_WINDOW_MS)
        );
      } catch (err) {
        console.warn(`[reminder] Failed to mark dispatching for ${reminder.id}: ${err.message}. Reconciling...`);
        try {
          const check = await redis.get(claimKey);
          const parsed = check ? (typeof check === 'string' ? JSON.parse(check) : check) : null;
          const currentExpires = Number(parsed?.leaseExpiresAt || 0);
          if (
            parsed?.token === leaseToken &&
            parsed?.status === 'dispatching' &&
            (!currentExpires || referenceNow < currentExpires - 5_000)
          ) {
            markRes = 1;
          } else {
            console.warn(`[reminder] Read-back after MARK_DISPATCHING failed to prove valid unexpired lease for ${reminder.id}. Failing closed.`);
            return reminder;
          }
        } catch {
          return reminder;
        }
      }

      if (markRes === -20) {
        console.error(`[reminder] [EMERGENCY_PROTECTION] Occurrence ${occurrenceId} tripped distributed circuit breaker in Redis.`);
        await dispatchAdminAlert(guild, reminder, 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED', 'Occurrence exceeded distributed dispatch rate limit', configStore);
        const repeat = reminder.repeat ?? 'none';
        const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
        return nextTime ? { ...reminder, time: nextTime } : null;
      }

      if (markRes === -12) {
        console.warn(`[reminder] Fencing rejection: Token mismatch in MARK_DISPATCHING_LUA for ${reminder.id}. Stale worker aborting send.`);
        return reminder;
      }

      if (markRes !== 1) {
        console.warn(`[reminder] Could not transition to dispatching for ${reminder.id} (code: ${markRes}). Yielding.`);
        return reminder;
      }
    } else {
      const markRes = _inMemoryMarkDispatching(claimKey, leaseToken, referenceNow, MAX_DISPATCHES_PER_WINDOW, DISPATCH_WINDOW_MS);
      if (markRes === -20) {
        await dispatchAdminAlert(guild, reminder, 'EMERGENCY_CIRCUIT_BREAKER_TRIPPED', 'Occurrence exceeded distributed dispatch rate limit', configStore);
        const repeat = reminder.repeat ?? 'none';
        const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
        return nextTime ? { ...reminder, time: nextTime } : null;
      }
      if (markRes !== 1) return reminder;
    }

    // Pre-send Fencing Guard: Check if process was suspended/paused (e.g. SIGSTOP, GC pause, lag)
    // between lease acquisition and send execution.
    // If elapsed wall-clock time exceeded lease TTL minus 5s safety margin,
    // our lease has expired and may have been claimed by another worker; abort send immediately!
    const elapsedSinceAcquiredMs = Date.now() - leaseAcquiredWallTime;
    if (elapsedSinceAcquiredMs >= (LEASE_TTL_SEC * 1000) - 5_000) {
      console.warn(`[reminder] Fencing abort: Process pause detected before channel.send for ${reminder.id} (elapsed: ${elapsedSinceAcquiredMs}ms). Aborting send.`);
      return reminder;
    }

    // Just-In-Time Pre-Send Fencing Check (Strict ALLOW-LIST):
    // Directly verify that Redis (or in-memory store) still assigns the active lease to our token,
    // that status is strictly 'dispatching', and that lease has not expired under the lease time convention.
    // NOTE: Redis cannot 2PC with Discord REST API; this check guarantees at-most-once authorization,
    // not revocation of an HTTP request once it reaches the network stack.
    if (redis) {
      try {
        const rawCheck = await redis.get(claimKey);
        const parsedCheck = rawCheck ? (typeof rawCheck === 'string' ? JSON.parse(rawCheck) : rawCheck) : null;
        const currentExpires = Number(parsedCheck?.leaseExpiresAt || 0);
        if (
          !parsedCheck ||
          parsedCheck.token !== leaseToken ||
          parsedCheck.status !== 'dispatching' ||
          (currentExpires && referenceNow >= currentExpires - 3_000)
        ) {
          console.warn(`[reminder] Fencing abort: Pre-send JIT check failed for ${reminder.id} (status: ${parsedCheck?.status}, token mismatch: ${parsedCheck?.token !== leaseToken}). Aborting send.`);
          return reminder;
        }
      } catch (jitErr) {
        console.warn(`[reminder] JIT Redis check error for ${reminder.id}: ${jitErr.message}. Failing closed to avoid duplicate.`);
        return reminder;
      }
    } else {
      const isDistributedExpected = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.NODE_ENV === 'production');
      if (isDistributedExpected) {
        console.error(`[reminder] Distributed mode active but Redis instance missing during JIT check for ${reminder.id}. Failing closed.`);
        return reminder;
      }
      const rawCheck = _inMemoryClaims.get(claimKey);
      const parsedCheck = rawCheck ? (typeof rawCheck === 'string' ? JSON.parse(rawCheck) : rawCheck) : null;
      const currentExpires = Number(parsedCheck?.leaseExpiresAt || 0);
      if (
        !parsedCheck ||
        parsedCheck.token !== leaseToken ||
        parsedCheck.status !== 'dispatching' ||
        (currentExpires && referenceNow >= currentExpires - 3_000)
      ) {
        console.warn(`[reminder] Fencing abort: In-memory pre-send check failed for ${reminder.id}. Aborting send.`);
        return reminder;
      }
    }

    logReminderEvent('DISPATCH_STARTED', { occurrenceId, reminderId: reminder.id, token: leaseToken });
    const sendPromise = channel.send(finalText);
    _inFlightSends.set(occurrenceId, sendPromise);
    sendPromise.catch(() => {}).finally(() => {
      _inFlightSends.delete(occurrenceId);
    });

    try {
      await withTimeout(sendPromise, 15_000);
      terminalOutcome = 'dispatched';
      logReminderEvent('DISPATCH_SUCCESS', { occurrenceId, reminderId: reminder.id, token: leaseToken, status: 'dispatched' });
      console.log(`[reminder] ✅ Sent reminder "${reminder.message}" to #${channel.name} (${reminder.channelId}) in guild ${guild.name}`);
    } catch (sendErr) {
      console.warn(`[reminder] Discord send error for ${reminder.id}: ${sendErr.message}. Checking channel oracle...`);
      const oracle = await verifyMessageSentInChannel(channel, finalText, 60_000, footprint);
      if (oracle.status === 'VERIFIED_SENT') {
        console.log(`[reminder] Oracle verified message was posted on Discord for ${reminder.id}.`);
        terminalOutcome = 'dispatched';
      } else {
        const isPermMissing = sendErr?.status === 403 || sendErr?.code === 50001;
        const isChannelMissing = sendErr?.status === 404 || sendErr?.code === 10003;
        const isInvalidBody = sendErr?.code === 50035;

        if (isPermMissing || isChannelMissing || isInvalidBody) {
          terminalOutcome = 'permanent_failure';
          const reasonCode = isPermMissing ? 'MISSING_PERMISSIONS' : isChannelMissing ? 'CHANNEL_NOT_FOUND' : 'INVALID_PAYLOAD';
          await dispatchAdminAlert(guild, reminder, reasonCode, sendErr.message, configStore);

          if (redis) {
            const res = await redis.eval(
              SET_TERMINAL_LUA,
              1,
              claimKey,
              leaseToken,
              'permanent_failure',
              reasonCode,
              sendErr.message || '',
              '86400'
            ).catch(() => null);
            if (res !== 1) {
              console.warn(`[reminder] Fencing warning: SET_TERMINAL_LUA rejected for ${reminder.id} (code: ${res}). Stale worker yielding lease.`);
              return reminder;
            }
          } else {
            const res = _inMemorySetTerminal(claimKey, leaseToken, 'permanent_failure', reasonCode, sendErr.message || '');
            if (res !== 1) return reminder;
          }
          const repeat = reminder.repeat ?? 'none';
          const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
          return nextTime ? { ...reminder, time: nextTime } : null;
        } else {
          logReminderEvent('DISPATCH_UNCERTAIN', { occurrenceId, reminderId: reminder.id, token: leaseToken, status: 'uncertain', errorClassification: sendErr.message });
          if (oracle.reason === 'MISSING_READ_MESSAGE_HISTORY_PERMISSION') {
            await dispatchAdminAlert(guild, reminder, 'CANNOT_PROVE_NO_HISTORY_PERMISSION', 'Bot lacks ReadMessageHistory permission', configStore);
            terminalOutcome = 'dead_letter';
            if (redis) {
              const res = await redis.eval(
                SET_TERMINAL_LUA,
                1,
                claimKey,
                leaseToken,
                'dead_letter',
                'CANNOT_PROVE_NO_HISTORY_PERMISSION',
                '',
                '604800'
              ).catch(() => null);
              if (res !== 1) {
                console.warn(`[reminder] Fencing warning: SET_TERMINAL_LUA rejected for ${reminder.id} (code: ${res}). Stale worker yielding lease.`);
                return reminder;
              }
            } else {
              _inMemorySetTerminal(claimKey, leaseToken, 'dead_letter', 'CANNOT_PROVE_NO_HISTORY_PERMISSION', '');
            }
            return reminder;
          }

          if (redis) {
            let res = null;
            try {
              res = await redis.eval(
                SET_UNCERTAIN_LUA,
                1,
                claimKey,
                leaseToken,
                String(MAX_UNCERTAIN_RETRIES),
                String(referenceNow),
                String(300_000)
              );
            } catch (redisErr) {
              console.error(`[reminder] Redis execution error during SET_UNCERTAIN_LUA for ${reminder.id}:`, redisErr.message);
              try {
                const check = await redis.get(claimKey);
                const parsed = check ? (typeof check === 'string' ? JSON.parse(check) : check) : null;
                if (parsed?.token === leaseToken && (parsed?.status === 'uncertain' || parsed?.status === 'dead_letter')) {
                  console.log(`[reminder] Read-back confirmed uncertain/dead_letter state for ${reminder.id}`);
                  if (parsed.status === 'dead_letter') {
                    terminalOutcome = 'dead_letter';
                    const repeat = reminder.repeat ?? 'none';
                    const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
                    return nextTime ? { ...reminder, time: nextTime } : null;
                  }
                  return reminder;
                }
              } catch {
                // Fail closed on read-back failure
              }
              return reminder;
            }

            if (res === -1) {
              console.error(`[reminder] [ALERT_ADMIN] Reminder ${reminder.id} quarantined in dead_letter state after exceeding ${MAX_UNCERTAIN_RETRIES} uncertain retries.`);
              await dispatchAdminAlert(guild, reminder, 'DEAD_LETTER_EXCEEDED_RETRIES', `Quarantined in dead_letter after exceeding ${MAX_UNCERTAIN_RETRIES} retries without delivery confirmation`, configStore);
              terminalOutcome = 'dead_letter';
              const repeat = reminder.repeat ?? 'none';
              const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
              return nextTime ? { ...reminder, time: nextTime } : null;
            } else if (res > 0) {
              console.log(`[reminder] Uncertain delivery state for ${reminder.id}. Backoff registered (retry #${res}).`);
              return reminder;
            } else {
              const reason = res === -10 ? 'KEY_EXPIRED' : res === -12 ? 'TOKEN_MISMATCH' : res === -11 ? 'CORRUPT_JSON' : 'CAS_REJECTED';
              console.warn(`[reminder] CAS rejected in SET_UNCERTAIN_LUA for ${reminder.id} (${reason}, code: ${res}). Yielding lease.`);
              return reminder;
            }
          } else {
            const res = _inMemorySetUncertain(claimKey, leaseToken, MAX_UNCERTAIN_RETRIES, referenceNow, 300_000);
            if (res === -1) {
              await dispatchAdminAlert(guild, reminder, 'DEAD_LETTER_EXCEEDED_RETRIES', `Quarantined in dead_letter after exceeding ${MAX_UNCERTAIN_RETRIES} retries without delivery confirmation`, configStore);
              terminalOutcome = 'dead_letter';
              const repeat = reminder.repeat ?? 'none';
              const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
              return nextTime ? { ...reminder, time: nextTime } : null;
            } else {
              return reminder;
            }
          }
        }
      }
    }
  }

  // 11. Phase 2: Commit vĩnh viễn 'dispatched' sử dụng CAS Fencing Script
  if (terminalOutcome === 'dispatched') {
    if (redis) {
      let isConfirmedCommitted = false;
      try {
        const committed = await redis.eval(COMMIT_DISPATCHED_LUA, 1, claimKey, leaseToken, String(Date.now()));
        if (committed === 1) {
          isConfirmedCommitted = true;
          console.log(`[reminder] Successfully committed dispatched status for ${reminder.id}`);
        } else {
          const reason = committed === -10 ? 'KEY_EXPIRED' : committed === -12 ? 'TOKEN_MISMATCH' : committed === -13 ? 'NOT_IN_PENDING_STATE' : 'CAS_REJECTED';
          console.warn(`[reminder] Fencing warning: COMMIT_DISPATCHED_LUA rejected (${reason}, code: ${committed}) for ${reminder.id}.`);
        }
      } catch (err) {
        console.error(`[reminder] Redis execution error during COMMIT_DISPATCHED_LUA for ${reminder.id}:`, err.message);
        try {
          const rawAfterErr = await redis.get(claimKey);
          if (rawAfterErr) {
            const parsedAfterErr = typeof rawAfterErr === 'string' ? JSON.parse(rawAfterErr) : rawAfterErr;
            if (parsedAfterErr?.status === 'dispatched' && parsedAfterErr?.token === leaseToken) {
              isConfirmedCommitted = true;
              console.log(`[reminder] Read-back confirmed dispatched status was committed despite Redis network error for ${reminder.id}`);
            }
          }
        } catch (readBackErr) {
          console.warn(`[reminder] Read-back check also failed for ${reminder.id}:`, readBackErr.message);
        }
      }

      if (!isConfirmedCommitted) {
        terminalOutcome = null; // Fencing violation: yield outcome to active lease owner
      }
    } else {
      const res = _inMemoryCommitDispatched(claimKey, leaseToken, Date.now());
      if (res !== 1) {
        terminalOutcome = null;
      }
    }
  }

  // 12. Reschedule hoặc consume reminder khi đã đạt trạng thái kết thúc (Terminal Outcome)
  if (!terminalOutcome) {
    return reminder;
  }

  const repeat = reminder.repeat ?? 'none';
  const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
  if (!nextTime) return null; // one-shot -> xoá khỏi config

  return { ...reminder, time: nextTime };
}

async function _executeReminderTick(discordClient, configStore, redis = null) {
  const now = new Date();
  const guildIds = await configStore.listGuildIds();

  for (const guildId of guildIds) {
    try {
      const config = await configStore.getGuildConfig(guildId, { fresh: true });
      if (!config.enabled || !config.remindersEnabled || !config.reminders?.length) continue;
      if (config.archived) continue; // Skip administratively archived guilds

      // Check if guild is known to be inaccessible before calling Discord API
      const inaccessible = await isGuildInaccessible(redis, guildId, discordClient);
      if (inaccessible) {
        continue;
      }

      let modified = false;
      const nextReminders = [];
      const processedOccurrencesInTick = new Set();

      for (const reminder of config.reminders) {
        const time = new Date(reminder.time);
        if (!isNaN(time) && time <= now) {
          const scheduledMs = time.getTime();
          const tickOccurrenceKey = `${reminder.id}:${scheduledMs}`;
          if (processedOccurrencesInTick.has(tickOccurrenceKey)) {
            console.warn(`[reminder] Duplicate reminder instance ${reminder.id} detected in tick. Skipping duplicate dispatch.`);
            modified = true;
            continue;
          }
          processedOccurrencesInTick.add(tickOccurrenceKey);

          // Skip reminders that are too stale (e.g. bot was down for more than 1 hour)
          const staleMs = now.getTime() - scheduledMs;
          const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes (1 hour)

          if (staleMs > STALE_THRESHOLD_MS) {
            modified = true;
            const repeat = reminder.repeat ?? 'none';
            const nextTime = calculateNextReminderTime(reminder.time, repeat, now.getTime());
            if (nextTime) {
              nextReminders.push({ ...reminder, time: nextTime });
              console.log(`[reminder] Skipped stale recurring reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late), rescheduled to ${nextTime}`);
            } else {
              console.log(`[reminder] Discarded stale one-shot reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late)`);
            }
            continue;
          }

          let guild = null;
          try {
            guild = discordClient?.guilds?.cache?.get(guildId) || await discordClient.guilds.fetch(guildId);
          } catch (fetchErr) {
            const status = fetchErr?.status || fetchErr?.code;
            if (status === 404 || status === 10004 || status === 403 || status === 50001) {
              console.warn(`[reminder] Guild ${guildId} confirmed inaccessible (HTTP ${status}). Updating lifecycle and skipping reminders.`);
              if (redis) {
                await setGuildLifecycle(redis, guildId, false, now.getTime(), 'kicked').catch(() => null);
              }
            } else {
              console.warn(`[reminder] Transient Discord error fetching guild ${guildId}: ${fetchErr.message}. Preserving reminder ${reminder.id} for next tick.`);
            }
          }

          if (!guild) {
            nextReminders.push(reminder);
            continue;
          }

          const updated = await processOneReminder(reminder, guild, now.getTime(), redis, configStore);
          if (updated) {
            nextReminders.push(updated);
            if (updated !== reminder) {
              modified = true;
            }
          } else {
            // updated === null: one-shot reminder dispatched, consumed from config
            modified = true;
          }
        } else {
          nextReminders.push(reminder);
        }
      }

      if (modified) {
        await configStore.updateGuildConfig(guildId, { reminders: nextReminders });
      }
    } catch (err) {
      console.error(`[reminder] Error processing guild ${guildId}:`, err.message);
    }
  }
}

/**
 * Tick chạy mỗi 60 s.
 * Đã bọc distributed lock và idempotency claim an toàn chống double-firing trên môi trường multi-instance.
 * @param {import('discord.js').Client} discordClient
 * @param {import('../configStore.js').ConfigStore} configStore
 */
export async function reminderTick(discordClient, configStore) {
  if (_isTickInProgress) {
    console.warn('[reminder] Prior tick execution still in progress. Skipping overlapping invocation.');
    return;
  }

  _isTickInProgress = true;
  _currentTickPromise = (async () => {
    const redis = configStore?._redis;
    if (redis) {
      let lockAcquired = false;
      try {
        // TTL 50s đảm bảo tự nhả trước chu kỳ tick kế tiếp (60s)
        return await withRedisLock(redis, 'lock:reminder-worker:tick', 50, async () => {
          lockAcquired = true;
          await _executeReminderTick(discordClient, configStore, redis);
        }, { waitMs: 150 });
      } catch (err) {
        if (!lockAcquired && err.message?.includes('Could not acquire distributed lock')) {
          // Multi-instance deduplication: một instance khác đã nhận tick này
          return;
        }
        console.error('[reminder] CRITICAL: Tick execution failed:', {
          error: err.message,
          stack: err.stack,
          time: new Date().toISOString(),
        });
        return;
      }
    }

    // Single-instance fallback when Redis is intentionally not used (local/mock)
    const isDistributedExpected = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.NODE_ENV === 'production');
    if (isDistributedExpected) {
      console.error('[reminder] Distributed mode active but Redis instance missing on configStore. Skipping tick to fail closed.');
      return;
    }

    try {
      await _executeReminderTick(discordClient, configStore, null);
    } catch (err) {
      console.error('[reminder] Single-instance tick execution error:', err.message, err.stack);
    }
  })();

  try {
    await _currentTickPromise;
  } finally {
    _isTickInProgress = false;
    _currentTickPromise = null;
  }
}

/**
 * Khởi động reminder worker.
 * Đảm bảo idempotent: nếu worker đã chạy trong process này, không khởi tạo thêm polling interval thứ 2.
 * @param {import('discord.js').Client} discordClient
 * @param {import('../configStore.js').ConfigStore} configStore
 * @returns {NodeJS.Timeout|null}
 */
export function startReminderWorker(discordClient, configStore) {
  if (process.env.DISABLE_REMINDER_WORKER === 'true') {
    console.log('[reminder] Reminder worker disabled via DISABLE_REMINDER_WORKER.');
    return null;
  }

  if (_activeWorkerInterval) {
    console.warn('[reminder] startReminderWorker called but worker is already running. Returning existing handle.');
    return _activeWorkerInterval;
  }

  // Execute first tick immediately on startup
  reminderTick(discordClient, configStore).catch(err => console.error('[reminder] Initial tick error:', err.message));

  _activeWorkerInterval = setInterval(() => reminderTick(discordClient, configStore), 60_000);
  _activeWorkerInterval.unref();
  console.log('[reminder] Worker started — polling every 60 s');
  return _activeWorkerInterval;
}

/**
 * Dừng reminder worker và đợi tick hiện tại hoàn tất.
 */
export async function stopReminderWorker() {
  if (_activeWorkerInterval) {
    clearInterval(_activeWorkerInterval);
    _activeWorkerInterval = null;
    console.log('[reminder] Worker stopped.');
  }
  if (_currentTickPromise) {
    await _currentTickPromise.catch(() => null);
  }
}
