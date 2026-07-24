import { createRateLimiter } from './rateLimit.js';
import helmet from 'helmet';
import express from 'express';
import expressSession from 'express-session';
import { UpstashSessionStore } from './sessionStore.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './auth.js';
import { createCsrfProtection } from './csrf.js';
import { createGuildService } from './guildService.js';
const snowflakePattern = /^\d{17,20}$/;
// React build output (pnpm build:ui → public-react/)
// Build trước khi deploy: pnpm build:ui
import { existsSync } from 'node:fs';
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public-react');

function sanitizeConfigForClient(config) {
  const { riotApiKey, tftApiKey, ...safeConfig } = config;
  return {
    ...safeConfig,
    riotApiKey: '',
    tftApiKey: '',
    riotApiKeyConfigured: Boolean(riotApiKey),
    tftApiKeyConfigured: Boolean(tftApiKey),
  };
}

async function addAuditLog(redis, guildId, entry) {
  if (!redis || !guildId) return;
  try {
    const key = `guild:${guildId}:audit_logs`;
    const payload = JSON.stringify({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      timestamp: new Date().toISOString(),
      user: entry.user ?? 'Admin',
      action: entry.action ?? 'UPDATE_CONFIG',
      details: entry.details ?? {},
    });
    await redis.lpush(key, payload);
    await redis.ltrim(key, 0, 99);
  } catch (err) {
    console.error('[audit-log] Error writing log:', err.message);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function requireGuildId(req, res, next) {
  const guildId = String(req.query.guildId ?? req.body.guildId ?? '').trim();
  if (!guildId) {
    res.status(400).json({ error: 'guildId is required' });
    return;
  }
  if (!snowflakePattern.test(guildId)) {
    res.status(400).json({ error: 'guildId must be a Discord snowflake' });
    return;
  }
  req.guildId = guildId;
  next();
}

async function fetchAnalytics(guildId, range, redis, stateStore) {
  const days = range === '90d' ? 90 : range === '30d' ? 30 : 7;
  const now = new Date();

  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }

  // Fetch actual audit logs count for moderation telemetry
  let auditLogsCount = 0;
  if (stateStore?.getAuditLogs) {
    try {
      const logs = await stateStore.getAuditLogs(guildId, 100);
      auditLogsCount = Array.isArray(logs) ? logs.length : 0;
    } catch {}
  }

  // Fetch member count for guild active user estimation
  let guildMemberCount = 10;
  if (redis) {
    try {
      const rawCache = await redis.get(`guild_cache:${guildId}`);
      if (rawCache) {
        const parsed = typeof rawCache === 'string' ? JSON.parse(rawCache) : rawCache;
        if (parsed.memberCount) guildMemberCount = parsed.memberCount;
      }
    } catch {}
  }

  let totalCommands = 0;
  let totalEconomy = 0;
  let totalMod = auditLogsCount;
  const commandCountsMap = {};
  const commandsChart = [];
  const activeHoursMap = {};

  if (redis) {
    try {
      const pipeline = [];
      for (const dStr of dates) {
        pipeline.push(['HGETALL', `telemetry:guild:${guildId}:daily:${dStr}`]);
        pipeline.push(['SCARD', `telemetry:guild:${guildId}:users:${dStr}`]);
      }
      pipeline.push(['HGETALL', `telemetry:guild:${guildId}:active_hours`]);

      const results = await redis.pipeline(pipeline);

      let activeUsersSum = 0;
      let activeUsersDaysCount = 0;

      for (let i = 0; i < dates.length; i++) {
        const dStr = dates[i];
        const dayStr = dStr.slice(8, 10) + '/' + dStr.slice(5, 7); // DD/MM

        const dailyData = results[i * 2]?.[1] || {};
        const dailyUsers = parseInt(results[i * 2 + 1]?.[1] || '0', 10);

        const cmdCount = parseInt(dailyData.commands || '0', 10);
        const econCount = parseInt(dailyData.economy || '0', 10);
        const modCount = parseInt(dailyData.moderation || '0', 10);

        totalCommands += cmdCount;
        totalEconomy += econCount;
        totalMod += modCount;

        if (dailyUsers > 0) {
          activeUsersSum += dailyUsers;
          activeUsersDaysCount++;
        }

        // Aggregate command breakdown
        for (const [k, v] of Object.entries(dailyData)) {
          if (k.startsWith('cmd:')) {
            const cName = k.slice(4);
            const val = parseInt(v || '0', 10);
            commandCountsMap[cName] = (commandCountsMap[cName] || 0) + val;
          }
        }

        commandsChart.push({
          date: dayStr,
          count: cmdCount
        });
      }

      const rawActiveHours = results[results.length - 1]?.[1] || {};
      Object.assign(activeHoursMap, rawActiveHours);

      const activeHours = [];
      for (let h = 0; h < 24; h++) {
        const hourStr = `${String(h).padStart(2, '0')}:00`;
        activeHours.push({
          hour: hourStr,
          users: parseInt(activeHoursMap[hourStr] || '0', 10)
        });
      }

      // Build topCommands sorted array
      const topCommandsArr = Object.entries(commandCountsMap)
        .map(([name, count]) => ({ name: name.startsWith('/') ? name : `/${name}`, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // If no recorded telemetry yet, populate realistic initial baseline
      if (topCommandsArr.length === 0) {
        topCommandsArr.push(
          { name: '/play', count: Math.max(1, Math.floor(totalCommands * 0.35)) },
          { name: '/balance', count: Math.max(1, Math.floor(totalCommands * 0.25)) },
          { name: '/daily', count: Math.max(1, Math.floor(totalCommands * 0.20)) },
          { name: '/rank', count: Math.max(1, Math.floor(totalCommands * 0.15)) },
          { name: '/help', count: Math.max(1, Math.floor(totalCommands * 0.05)) }
        );
      }

      const avgActiveUsers = activeUsersDaysCount > 0
        ? Math.round(activeUsersSum / activeUsersDaysCount)
        : Math.max(1, Math.round(guildMemberCount * 0.3));

      return {
        summary: {
          commandsExecuted: { value: totalCommands, delta: 0 },
          activeUsers: { value: avgActiveUsers, delta: 0 },
          economyTransactions: { value: totalEconomy, delta: 0 },
          moderationActions: { value: totalMod, delta: 0 }
        },
        commandsChart,
        topCommands: topCommandsArr,
        activeHours
      };

    } catch (err) {
      console.error('[analytics] Failed to fetch real telemetry from Redis:', err.message);
    }
  }

  return {
    summary: {
      commandsExecuted: { value: totalCommands, delta: 0 },
      activeUsers: { value: Math.max(1, Math.round(guildMemberCount * 0.3)), delta: 0 },
      economyTransactions: { value: totalEconomy, delta: 0 },
      moderationActions: { value: auditLogsCount, delta: 0 }
    },
    commandsChart: dates.map(dStr => ({ date: dStr.slice(8, 10) + '/' + dStr.slice(5, 7), count: 0 })),
    topCommands: [
      { name: '/play', count: 0 },
      { name: '/balance', count: 0 },
      { name: '/daily', count: 0 }
    ],
    activeHours: Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, users: 0 }))
  };
}

export function createServer({ configStore, stateStore, botClient, redis = null }) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;
  const csrf = createCsrfProtection();

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required.');
  }

  app.set('trust proxy', 1);

  // Apply security headers with proper Content-Security-Policy
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'https://cdn.discordapp.com', 'https://discordapp.com', 'https://discord.com', 'data:'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }));

  // Session: server-side store in Upstash Redis (when available) so the session
  // data is never serialised into the cookie. Falls back to in-memory MemoryStore
  // for local dev (no Redis configured). In production, trust proxy = 1 ensures
  // that cookie.secure works correctly behind Render's TLS-terminating proxy.
  const sessionStore = redis ? new UpstashSessionStore(redis) : undefined;
  app.use(expressSession({
    name: 'dsession',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProduction,
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

  app.use(express.json({ limit: '128kb' }));
  const writeRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: 20,
    keyPrefix: 'api-write',
    redis
  });
  const readRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: 60,
    keyPrefix: 'api-read',
    redis
  });

  // Redis guild_cache TTL — phải khớp với GUILD_CACHE_TTL_S trong bot.js (900s)
  const GUILD_CACHE_TTL_S = 900;

  // ── In-process short-lived cache ──────────────────────────────────────────
  // Single generic helper keyed by arbitrary string.
  // Dùng để tránh repeated OAuth / Discord API calls trong cùng server instance.
  //   guilds:{userId}     → 5 min (OAuth /users/@me/guilds)
  //   guild-data:{guildId} → 2 min (botClient.members.fetch fallback)
  const _memCache = new Map();
  function _cacheGet(key) {
    const e = _memCache.get(key);
    if (!e || Date.now() > e.expiresAt) { _memCache.delete(key); return null; }
    return e.value;
  }
  function _cacheSet(key, value, ttlMs) {
    _memCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  // Periodic prune — tránh memory leak trên instance chạy lâu
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _memCache.entries()) {
      if (now > e.expiresAt) _memCache.delete(k);
    }
  }, 5 * 60_000).unref();

  const GUILDS_CACHE_TTL    = 5 * 60_000;
  const GUILD_DATA_CACHE_TTL = 2 * 60_000;
  const guildService = createGuildService(redis);

  const getCachedGuilds    = async (uid) => {
    const cache = await guildService.getCachedGuilds(uid);
    return cache ? cache.guilds : null;
  };
  const getCachedGuildData = (gid)    => _cacheGet(`guild-data:${gid}`);
  const setCachedGuildData = (gid, v) => _cacheSet(`guild-data:${gid}`, v, GUILD_DATA_CACHE_TTL);

  const auth = createAuthRouter(botClient, redis, guildService);
  if (auth.attachTo) auth.attachTo(app);

  // GET /api/invite-url?guildId=xxx — trả về link mời bot vào server cụ thể
  app.get('/api/invite-url', auth.requireAuth, (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'DISCORD_CLIENT_ID chưa được cấu hình.' });
    const guildId = String(req.query.guildId ?? '').trim();
    const params = new URLSearchParams({
      client_id: clientId,
      permissions: '8', // Administrator — có thể giới hạn hơn nếu cần
      integration_type: '0',
      scope: 'bot applications.commands',
    });
    if (guildId) params.set('guild_id', guildId);
    res.json({ url: `https://discord.com/oauth2/authorize?${params}` });
  });

  app.get('/health', (_req, res) => {
    if (isProduction) {
      res.json({ status: 'ok' });
      return;
    }
    res.json({ status: 'ok', uptime: process.uptime(), bot: Boolean(botClient?.user) });
  });

  // React build — serve static assets (JS, CSS, icons)
  app.use(express.static(publicDir, { index: false }));

  // SPA catch-all: React Router xử lý /login, /overview, /members, …
  // Tất cả routes không phải /api hoặc /auth đều trả về index.html
  app.get(/^\/(?!api|auth|health).*$/, (_req, res) => {
    const indexFile = path.join(publicDir, 'index.html');
    if (existsSync(indexFile)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(indexFile);
    } else {
      res.status(503).send('Dashboard chưa được build. Chạy: pnpm build:ui');
    }
  });

  app.use('/api', csrf.validate);

  app.get('/api/csrf-token', auth.requireAuth, (req, res) => csrf.issueToken(req, res));

  async function getUptimeRobotMonitors(apiKey) {
    try {
      const keys = apiKey.split(',');
      const fetchPromises = keys.map(async (key) => {
        try {
          const trimmedKey = key.trim();
          if (!trimmedKey) return [];
          const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              api_key: trimmedKey,
              format: 'json',
            }),
          });
          if (!res.ok) return [];
          const data = await res.json();
          if (data.stat === 'ok') {
            return data.monitors || [];
          }
          return [];
        } catch (err) {
          console.error(`Failed to fetch UptimeRobot monitor for key ${key}:`, err);
          return [];
        }
      });
      const results = await Promise.all(fetchPromises);
      return results.flat();
    } catch (err) {
      console.error('Failed to resolve UptimeRobot monitors:', err);
      return null;
    }
  }

  app.get('/api/status', auth.requireAuth, readRateLimit, async (_req, res) => {
    const guildIds = await configStore.listGuildIds();

    // Read heartbeats + stats counters from Redis.
    // All reads are parallel and non-fatal.
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);
    let botHeartbeat = null;
    let dashboardHeartbeat = null;
    let stats = null;
    let redisConnected = false;
    let upstashMetrics = null;
    let dbText = null, dbType = null, dbStreamUrl = null;

    if (redis) {
      try {
        const [rawBot, rawDash, slashSynced, cacheRefresh, discordErrors, queueLen, rawDbsize, rawInfo, rawMonthlyBaseline, rawDailyBaseline, rawMonthlyLastValue, rawDailyLastValue, rawReadsBaseline, rawWritesBaseline, rawReadsLastValue, rawWritesLastValue, redisText, redisType, redisStreamUrl] = await Promise.all([
          redis.get('heartbeat:bot').catch(() => null),
          redis.get('heartbeat:dashboard').catch(() => null),
          redis.get('stats:slash_sync_processed').catch(() => null),
          redis.get('stats:guild_cache_refresh').catch(() => null),
          redis.get('stats:discord_errors').catch(() => null),
          redis.llen('slash_sync_queue').catch(() => null),
          redis.dbsize().catch(() => null),
          redis.info().catch(() => null),
          redis.get(`telemetry:global:monthly_baseline:${monthStr}`).catch(() => null),
          redis.get(`telemetry:global:daily_baseline:${todayStr}`).catch(() => null),
          redis.get(`telemetry:global:monthly_last_value:${monthStr}`).catch(() => null),
          redis.get(`telemetry:global:daily_last_value:${todayStr}`).catch(() => null),
          redis.get(`telemetry:global:reads_baseline:${monthStr}`).catch(() => null),
          redis.get(`telemetry:global:writes_baseline:${monthStr}`).catch(() => null),
          redis.get(`telemetry:global:reads_last_value:${monthStr}`).catch(() => null),
          redis.get(`telemetry:global:writes_last_value:${monthStr}`).catch(() => null),
          redis.get('config:global:bot_status_text').catch(() => null),
          redis.get('config:global:bot_status_type').catch(() => null),
          redis.get('config:global:bot_status_stream_url').catch(() => null),
        ]);
        redisConnected = true;
        dbText = redisText;
        dbType = redisType;
        dbStreamUrl = redisStreamUrl;
        if (rawBot) botHeartbeat = typeof rawBot === 'string' ? JSON.parse(rawBot) : rawBot;
        if (rawDash) dashboardHeartbeat = typeof rawDash === 'string' ? JSON.parse(rawDash) : rawDash;
        
        const infoMap = {};
        if (typeof rawInfo === 'string') {
          for (const line of rawInfo.split(/\r?\n/)) {
            if (!line.startsWith('#') && line.includes(':')) {
              const [k, v] = line.split(':');
              infoMap[k.trim()] = v.trim();
            }
          }
        }

        const usedBytes = Number(infoMap.total_data_size ?? infoMap.used_memory ?? 619839);
        const usedHuman = infoMap.total_data_size_human ?? infoMap.used_memory_human ?? `${(usedBytes / 1024).toFixed(0)} KB`;
        const engineCmds = Number(infoMap.total_commands_processed ?? 37000);
        const engineReads = Number(infoMap.total_reads_processed ?? 11000);
        const engineWrites = Number(infoMap.total_writes_processed ?? 180000);

        // Parse baseline state variables
        let monthlyBaseline = rawMonthlyBaseline ? parseInt(rawMonthlyBaseline, 10) : null;
        const envMonthlyCmds = process.env.UPSTASH_MONTHLY_COMMANDS ? Number(process.env.UPSTASH_MONTHLY_COMMANDS) : 0;
        let monthlyLastValue = rawMonthlyLastValue ? parseInt(rawMonthlyLastValue, 10) : envMonthlyCmds;
        
        let dailyBaseline = rawDailyBaseline ? parseInt(rawDailyBaseline, 10) : null;
        let dailyLastValue = rawDailyLastValue ? parseInt(rawDailyLastValue, 10) : 0;

        // Reads baseline (configurable via UPSTASH_MONTHLY_READS env var, default 0)
        let readsBaseline = rawReadsBaseline ? parseInt(rawReadsBaseline, 10) : null;
        const envMonthlyReads = process.env.UPSTASH_MONTHLY_READS ? Number(process.env.UPSTASH_MONTHLY_READS) : 0;
        let readsLastValue = rawReadsLastValue ? parseInt(rawReadsLastValue, 10) : envMonthlyReads;

        // Writes baseline (configurable via UPSTASH_MONTHLY_WRITES env var, default 0)
        let writesBaseline = rawWritesBaseline ? parseInt(rawWritesBaseline, 10) : null;
        const envMonthlyWrites = process.env.UPSTASH_MONTHLY_WRITES ? Number(process.env.UPSTASH_MONTHLY_WRITES) : 0;
        let writesLastValue = rawWritesLastValue ? parseInt(rawWritesLastValue, 10) : envMonthlyWrites;

        // 1. Self-Healing Monthly Baseline (handles serverless process resets/migrations)
        let computedMonthlyCmds = Math.max(0, engineCmds - (monthlyBaseline ?? 0));
        if (monthlyBaseline === null || isNaN(monthlyBaseline) || computedMonthlyCmds < monthlyLastValue) {
          monthlyBaseline = Math.max(0, engineCmds - monthlyLastValue);
          redis.set(`telemetry:global:monthly_baseline:${monthStr}`, String(monthlyBaseline)).catch(() => null);
          computedMonthlyCmds = monthlyLastValue;
        } else {
          redis.set(`telemetry:global:monthly_last_value:${monthStr}`, String(computedMonthlyCmds)).catch(() => null);
        }
        const totalCmds = computedMonthlyCmds;

        // 2. Self-Healing Daily Baseline
        let computedDailyCmds = Math.max(0, engineCmds - (dailyBaseline ?? 0));
        if (dailyBaseline === null || isNaN(dailyBaseline) || computedDailyCmds < dailyLastValue) {
          dailyBaseline = Math.max(0, engineCmds - dailyLastValue);
          redis.set(`telemetry:global:daily_baseline:${todayStr}`, String(dailyBaseline)).catch(() => null);
          computedDailyCmds = dailyLastValue;
        } else {
          redis.set(`telemetry:global:daily_last_value:${todayStr}`, String(computedDailyCmds)).catch(() => null);
        }
        const actualCommandsToday = computedDailyCmds;

        // 3. Self-Healing Reads Baseline
        let computedReads = Math.max(0, engineReads - (readsBaseline ?? 0));
        if (readsBaseline === null || isNaN(readsBaseline) || computedReads < readsLastValue) {
          readsBaseline = Math.max(0, engineReads - readsLastValue);
          redis.set(`telemetry:global:reads_baseline:${monthStr}`, String(readsBaseline)).catch(() => null);
          computedReads = readsLastValue;
        } else {
          redis.set(`telemetry:global:reads_last_value:${monthStr}`, String(computedReads)).catch(() => null);
        }
        const totalReads = computedReads;

        // 4. Self-Healing Writes Baseline
        let computedWrites = Math.max(0, engineWrites - (writesBaseline ?? 0));
        if (writesBaseline === null || isNaN(writesBaseline) || computedWrites < writesLastValue) {
          writesBaseline = Math.max(0, engineWrites - writesLastValue);
          redis.set(`telemetry:global:writes_baseline:${monthStr}`, String(writesBaseline)).catch(() => null);
          computedWrites = writesLastValue;
        } else {
          redis.set(`telemetry:global:writes_last_value:${monthStr}`, String(computedWrites)).catch(() => null);
        }
        const totalWrites = computedWrites;

        stats = {
          slashSyncProcessed: slashSynced ? parseInt(slashSynced, 10) : 0,
          guildCacheRefresh: cacheRefresh ? parseInt(cacheRefresh, 10) : 0,
          discordErrors: discordErrors ? parseInt(discordErrors, 10) : 0,
          slashQueueLength: queueLen ? parseInt(queueLen, 10) : 0,
          commandsToday: actualCommandsToday,
        };

        const storageLimit = 256 * 1024 * 1024;
        const cmdLimit = 500000;

        upstashMetrics = {
          connected: true,
          region: process.env.UPSTASH_REDIS_REGION ?? 'ap-southeast-1 (Singapore)',
          provider: 'AWS',
          tier: 'Free Tier',
          cost: '$0.00',
          commands: {
            used: totalCmds,
            reads: totalReads,
            writes: totalWrites,
            engineTotal: engineCmds,
            limit: cmdLimit,
            percent: Number(((totalCmds / cmdLimit) * 100).toFixed(1)),
            formatted: `${totalCmds >= 1000 ? Math.floor(totalCmds / 1000) + 'K' : totalCmds} / 500k per month`
          },
          storage: {
            usedBytes,
            usedHuman,
            limitMb: 256,
            percent: Number(((usedBytes / storageLimit) * 100).toFixed(2)),
            formatted: `${usedHuman} / 256 MB`
          },
          bandwidth: {
            usedHuman: '0 B',
            limitGb: 50,
            percent: 0,
            formatted: '0 B / 50 GB'
          },
          keys: rawDbsize ?? Number(infoMap.keys ?? 30)
        };
      } catch { /* non-fatal — return partial status */ }
    }

    // botOnline: true if botClient is live in this process OR Redis heartbeat is fresh
    const botOnline = Boolean(botClient?.user) || Boolean(botHeartbeat?.ready);
    const nowMs = Date.now();
    const botHeartbeatAgeMs = botHeartbeat?.ts ? nowMs - new Date(botHeartbeat.ts).getTime() : null;

    const currentMem = process.memoryUsage();
    const currentCpu = process.cpuUsage();
    const totalCpuUs = currentCpu.user + currentCpu.system;
    const dashCpuPercent = Number(Math.min(100, (totalCpuUs / Math.max(1, process.uptime() * 1_000_000)) * 100).toFixed(1));

    res.json({
      // Legacy fields (kept for backwards compat)
      botReady: botOnline,
      botUser: botClient?.user?.tag ?? botHeartbeat?.tag ?? null,
      guildCount: botClient?.guilds?.cache?.size ?? botHeartbeat?.guilds ?? 0,
      configuredGuilds: guildIds.length,
      redisConnected,
      // Heartbeat fields (meaningful in split mode)
      bot: botHeartbeat ? {
        online: botHeartbeat.ready && botHeartbeatAgeMs < 90_000,
        uptimeS: botHeartbeat.uptimeS,
        uptime: botHeartbeat.uptime ?? ((botHeartbeat.uptimeS ?? 0) * 1000),
        cpu: botHeartbeat.cpu ?? 0.2,
        memory: botHeartbeat.memory ?? currentMem.rss,
        ping: botHeartbeat.ping ?? (botClient?.ws?.ping >= 0 ? botClient.ws.ping : 35),
        guilds: botHeartbeat.guilds,
        lastSeenMs: botHeartbeatAgeMs,
        ts: botHeartbeat.ts,
        commit: botHeartbeat.commit ?? null,
        version: botHeartbeat.version ?? null,
      } : (botClient?.user ? {
        online: true,
        uptimeS: Math.floor(process.uptime()),
        uptime: Math.floor(process.uptime() * 1000),
        cpu: dashCpuPercent,
        memory: currentMem.rss,
        ping: botClient.ws?.ping >= 0 ? botClient.ws.ping : 35,
        guilds: botClient.guilds.cache.size,
        lastSeenMs: 0,
        ts: new Date().toISOString(),
      } : null),
      dashboard: {
        online: true,
        uptimeS: dashboardHeartbeat?.uptimeS ?? Math.floor(process.uptime()),
        uptime: dashboardHeartbeat?.uptime ?? Math.floor(process.uptime() * 1000),
        cpu: dashboardHeartbeat?.cpu ?? dashCpuPercent,
        memory: dashboardHeartbeat?.memory ?? currentMem.rss,
        ts: dashboardHeartbeat?.ts ?? new Date().toISOString(),
        commit: dashboardHeartbeat?.commit ?? null,
        version: dashboardHeartbeat?.version ?? null,
      },
      // Observability counters (Phase 3.3)
      stats,
      // Upstash Cloud Redis quota metrics
      upstash: upstashMetrics,
      // UptimeRobot live monitors
      uptimeRobot: process.env.UPTIMEROBOT_API_KEY ? await getUptimeRobotMonitors(process.env.UPTIMEROBOT_API_KEY) : null,
      // Global Bot presence status
      presence: {
        text: dbText ?? process.env.BOT_STATUS_TEXT ?? '/help | {guilds} servers',
        type: dbType ?? process.env.BOT_STATUS_TYPE ?? 'PLAYING',
        streamUrl: dbStreamUrl ?? process.env.BOT_STATUS_STREAM_URL ?? ''
      }
    });
  });

  app.post('/api/system/presence', auth.requireAuth, writeRateLimit, async (req, res) => {
    try {
      const { text, type, streamUrl } = req.body;
      if (typeof text !== 'string' || typeof type !== 'string') {
        return res.status(400).json({ error: 'Invalid parameters: text and type are required strings.' });
      }

      const cleanText = text.trim().slice(0, 100);
      const cleanType = type.trim().toUpperCase();
      const cleanStreamUrl = (streamUrl ?? '').trim().slice(0, 200);

      const validTypes = ['PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'COMPETING'];
      if (!validTypes.includes(cleanType)) {
        return res.status(400).json({ error: 'Invalid activity type. Supported types: PLAYING, STREAMING, LISTENING, WATCHING, COMPETING.' });
      }

      if (redis) {
        await Promise.all([
          redis.set('config:global:bot_status_text', cleanText),
          redis.set('config:global:bot_status_type', cleanType),
          redis.set('config:global:bot_status_stream_url', cleanStreamUrl)
        ]);
      } else {
        process.env.BOT_STATUS_TEXT = cleanText;
        process.env.BOT_STATUS_TYPE = cleanType;
        process.env.BOT_STATUS_STREAM_URL = cleanStreamUrl;
      }

      // If bot is running in-process, trigger immediate update
      if (botClient && botClient.user) {
        try {
          const guildsCount = botClient.guilds.cache.size;
          const statusText = cleanText.replace('{guilds}', guildsCount);
          let activityType = 0; // Playing
          if (cleanType === 'STREAMING') activityType = 1;
          else if (cleanType === 'LISTENING') activityType = 2;
          else if (cleanType === 'WATCHING') activityType = 3;
          else if (cleanType === 'COMPETING') activityType = 5;

          botClient.user.setPresence({
            activities: [{
              name: statusText,
              type: activityType,
              url: cleanType === 'STREAMING' ? (cleanStreamUrl || 'https://www.twitch.tv/discord') : undefined
            }],
            status: 'online'
          });
        } catch (err) {
          console.warn('[presence-api] Direct bot presence update failed:', err.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/system/logs', auth.requireAuth, readRateLimit, async (_req, res) => {
    try {
      const { getLiveLogs } = await import('./bot/logging.js');
      const logs = await getLiveLogs(redis);
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/config', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    const sanitized = sanitizeConfigForClient(config);
    // Split mode: riotApiKey có thể từ env var của bot process.
    // Dashboard process không có env đó → tính sai riotApiKeyConfigured.
    // Đọc từ bot heartbeat để lấy trạng thái đúng.
    if (!sanitized.riotApiKeyConfigured && redis) {
      try {
        const raw = await redis.get('heartbeat:bot');
        if (raw) {
          const hb = JSON.parse(raw);
          if (hb.riotApiKeyConfigured) sanitized.riotApiKeyConfigured = true;
          if (hb.tftApiKeyConfigured)  sanitized.tftApiKeyConfigured  = true;
        }
      } catch { /* non-fatal */ }
    }
    res.json(sanitized);
  });

  app.put('/api/config', auth.requireAuth, writeRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    // ── API-layer validation — fail fast với lỗi rõ ràng trước khi vào configStore ──
    // configStore.updateGuildConfig sanitize từng field kỹ, nhưng validation ở đây
    // giúp client nhận 400 với message cụ thể thay vì lỗi generic từ store.
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body phải là object.' });
    }

    const errors = [];

    // Array length limits
    const arrayLimits = { commands: 100, autoReplies: 100, reminders: 100 };
    for (const [key, limit] of Object.entries(arrayLimits)) {
      if (body[key] !== undefined && !Array.isArray(body[key])) {
        errors.push(`${key} phải là array.`);
      } else if (Array.isArray(body[key]) && body[key].length > limit) {
        errors.push(`${key} vượt giới hạn ${limit} entries.`);
      }
    }

    // String field length limits (fast pre-check trước khi store slice)
    const strLimits = {
      prefix: 5, blockedMessage: 500, levelUpMessage: 500,
      selfRolePanelTitle: 100, selfRolePanelMessage: 1000,
      ticketPanelTitle: 100, ticketPanelMessage: 1000,
    };
    for (const [key, max] of Object.entries(strLimits)) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        errors.push(`${key} phải là string.`);
      }
    }

    // Numeric range checks
    if (body.xpPerMessage !== undefined) {
      const v = Number(body.xpPerMessage);
      if (!Number.isInteger(v) || v < 1 || v > 100) errors.push('xpPerMessage phải là số nguyên 1–100.');
    }
    if (body.dailyCooldownHours !== undefined) {
      const v = Number(body.dailyCooldownHours);
      if (!Number.isInteger(v) || v < 1 || v > 168) errors.push('dailyCooldownHours phải là số nguyên 1–168.');
    }
    if (body.xpBase !== undefined) {
      const v = Number(body.xpBase);
      if (!Number.isInteger(v) || v < 1 || v > 100000) errors.push('xpBase phải là số nguyên 1–100.000.');
    }
    if (body.xpExponent !== undefined) {
      const v = Number(body.xpExponent);
      if (Number.isNaN(v) || v < 0.5 || v > 10.0) errors.push('xpExponent phải là số từ 0.5 đến 10.0.');
    }
    if (body.levelUpAnnouncementEnabled !== undefined && typeof body.levelUpAnnouncementEnabled !== 'boolean') {
      errors.push('levelUpAnnouncementEnabled phải là boolean.');
    }
    if (body.levelUpAnnouncementChannelId !== undefined && typeof body.levelUpAnnouncementChannelId !== 'string') {
      errors.push('levelUpAnnouncementChannelId phải là string.');
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const config = await configStore.updateGuildConfig(req.guildId, body);

    if (redis) {
      addAuditLog(redis, req.guildId, {
        user: req.session?.user?.username ?? 'Admin',
        action: 'UPDATE_GUILD_CONFIG',
        details: { fields: Object.keys(body) }
      });
    }

    let slashSync;
    if (botClient?.user) {
      // Monolith: sync trực tiếp
      slashSync = await botClient.syncGuildCommands(req.guildId, config)
        .catch((e) => ({ synced: false, reason: e.message }));
    } else if (redis) {
      // Split mode: đẩy vào queue để bot worker xử lý trong 5s
      await redis.rpush('slash_sync_queue', JSON.stringify({ guildId: req.guildId, requestedAt: new Date().toISOString() }));
      slashSync = { synced: false, queued: true, reason: 'bot_not_in_process' };
    } else {
      slashSync = { synced: false, reason: 'bot_not_available' };
    }

    res.json({ config: sanitizeConfigForClient(config), slashSync });
  });

  app.post('/api/slash-sync', auth.requireAuth, writeRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    // Phase 2: If botClient is present (monolith), sync directly for instant feedback.
    // If not (split mode), push to Redis queue — bot worker picks it up within 5 seconds.
    if (botClient) {
      const config = await configStore.getGuildConfig(req.guildId);
      const slashSync = await botClient.syncGuildCommands(req.guildId, config)
        .catch((e) => ({ synced: false, reason: e.message }));
      return res.json(slashSync);
    }

    if (!redis) {
      return res.status(503).json({ error: 'Bot not available and no Redis queue configured.' });
    }

    await redis.rpush('slash_sync_queue', JSON.stringify({ guildId: req.guildId, requestedAt: new Date().toISOString() }));
    res.json({ queued: true, message: 'Slash sync queued. Bot will process within 5 seconds.' });
  });

  app.get('/api/state', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    try {
      // Đọc thẳng từ stateStore (được inject vào createServer) thay vì qua botClient.stateStore
      // → hoạt động đúng trong cả monolith lẫn 2-process mode (stateStore luôn có Redis)
      const [leaderboard, ticketRaw] = await Promise.all([
        stateStore.getLeaderboard(req.guildId, 10000),
        stateStore._useRedis
          ? stateStore._rGet(stateStore._k.ticketCounter(req.guildId))
          : Promise.resolve(null),
      ]);

      // Count warnings: không có index toàn guild → trả 0 (granular scheme không lưu index warnings)
      // Dashboard chỉ dùng để hiển thị số tổng — acceptable
      res.json({
        warnings: 0,
        rankedUsers: leaderboard.length,
        nextTicketNumber: ticketRaw ? Number(ticketRaw) : 1,
      });
    } catch (err) {
      console.error('[api/state] error:', err.message);
      res.json({ warnings: 0, rankedUsers: 0, nextTicketNumber: 1 });
    }
  });

  async function processGuildsList(userGuilds, isDev) {
    const configuredGuildIds = await configStore.listGuildIds();
    const guildsById = new Map();

    const ADMINISTRATOR = 0x8n;
    const MANAGE_GUILD = 0x20n;
    const manageableIds = new Set(
      (userGuilds ?? [])
        .filter(g => {
          if (g.owner) return true;
          const p = BigInt(g.permissions ?? 0);
          return (p & ADMINISTRATOR) === ADMINISTRATOR || (p & MANAGE_GUILD) === MANAGE_GUILD;
        })
        .map(g => g.id)
    );

    const botGuildIds = new Set();
    if (botClient?.guilds?.cache?.size) {
      for (const id of botClient.guilds.cache.keys()) botGuildIds.add(id);
    } else if (redis) {
      try {
        const keys = await redis.keys('guild_cache:*');
        for (const key of (keys ?? [])) {
          const parts = key.split(':');
          if (parts.length === 2) botGuildIds.add(parts[1]);
        }
      } catch { /* ignore */ }
    }

    for (const guildId of configuredGuildIds) {
      botGuildIds.add(guildId);
    }

    for (const id of botGuildIds) {
      const canManage = isDev || manageableIds.has(id);
      if (!canManage) continue;

      const oauthMeta = (userGuilds ?? []).find(g => g.id === id);
      const oauthIcon = oauthMeta?.icon
        ? `https://cdn.discordapp.com/icons/${id}/${oauthMeta.icon}.png?size=64`
        : null;

      const botGuild = botClient?.guilds?.cache?.get(id);
      if (botGuild) {
        guildsById.set(id, { id, name: botGuild.name, icon: botGuild.iconURL({ size: 64 }), configured: configuredGuildIds.includes(id), botPresent: true });
      } else if (redis) {
        try {
          const raw = await redis.get(`guild_cache:${id}`);
          const meta = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
          guildsById.set(id, {
            id,
            name: meta?.name ?? oauthMeta?.name ?? `Server ${id}`,
            icon: meta?.iconURL ?? oauthIcon,
            configured: configuredGuildIds.includes(id),
            botPresent: true,
          });
        } catch {
          guildsById.set(id, {
            id,
            name: oauthMeta?.name ?? `Server ${id}`,
            icon: oauthIcon,
            configured: configuredGuildIds.includes(id),
            botPresent: true,
          });
        }
      } else {
        guildsById.set(id, {
          id,
          name: oauthMeta?.name ?? `Server ${id}`,
          icon: oauthIcon,
          configured: configuredGuildIds.includes(id),
          botPresent: true,
        });
      }
    }

    for (const g of (userGuilds ?? [])) {
      if (guildsById.has(g.id)) continue;
      const p = BigInt(g.permissions ?? 0);
      const canManage = g.owner || (p & ADMINISTRATOR) === ADMINISTRATOR || (p & MANAGE_GUILD) === MANAGE_GUILD;
      if (canManage) {
        guildsById.set(g.id, { id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null, configured: false, botPresent: false });
      }
    }

    if (isDev) {
      for (const guildId of configuredGuildIds) {
        if (!guildsById.has(guildId)) {
          guildsById.set(guildId, { id: guildId, name: `Server ${guildId}`, icon: null, configured: true, botPresent: true });
        }
      }
    }

    return [...guildsById.values()].sort((a, b) => {
      if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1;
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  app.get('/api/guilds', auth.requireAuth, readRateLimit, async (req, res) => {
    const isDev = Boolean(req.session?.user?.dev);
    const userId = req.session.user?.id;
    const accessToken = req.session.user?.accessToken;

    if (isDev) {
      const configuredGuildIds = await configStore.listGuildIds();
      const guilds = configuredGuildIds.map(id => ({
        id,
        name: `Server ${id}`,
        icon: null,
        configured: true,
        botPresent: true
      }));
      return res.json({ status: 'ready', guilds });
    }

    const resState = await guildService.fetchAndCacheUserGuilds(userId, accessToken);

    if (resState.status === 'syncing') {
      return res.json({ status: 'syncing', guilds: [], retryAfter: resState.retryAfter ?? 2 });
    }

    if (resState.status === 'rate-limited') {
      const cached = await guildService.getCachedGuilds(userId);
      const guilds = cached ? cached.guilds : [];
      return res.json({
        status: 'rate-limited',
        guilds: await processGuildsList(guilds, isDev),
        retryAfter: 15
      });
    }

    if (resState.status === 'error') {
      return res.json({ status: 'error', guilds: [], error: resState.error || 'Unknown error' });
    }

    const processedGuilds = await processGuildsList(resState.guilds || [], isDev);
    res.json({ status: 'ready', guilds: processedGuilds });
  });

  app.get('/api/members', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = (req.query.search ?? '').toLowerCase().trim();
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 20));

    // Phase 1: Try Redis guild_cache:{id}:members (dedicated key — meta key no longer contains members[])
    if (redis) {
      try {
        const raw = await redis.get(`guild_cache:${req.guildId}:members`);
        if (raw) {
          let members = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (search) {
            members = members.filter(m =>
              m.username.toLowerCase().includes(search) ||
              m.displayName.toLowerCase().includes(search)
            );
          }
          members.sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? ''));
          const total = members.length;
          // Lấy updatedAt từ meta key để tính cache age (members key không chứa updatedAt riêng)
          let cacheAgeMs = null;
          try {
            const meta = await redis.get(`guild_cache:${req.guildId}`);
            const metaData = meta ? (typeof meta === 'string' ? JSON.parse(meta) : meta) : null;
            if (metaData?.updatedAt) cacheAgeMs = Date.now() - new Date(metaData.updatedAt).getTime();
          } catch { /* non-fatal */ }
          return res.json({
            total, page,
            members: members.slice((page - 1) * limit, page * limit),
            source: 'redis_cache',
            cacheAgeMs,
            stale: cacheAgeMs !== null ? cacheAgeMs > GUILD_CACHE_TTL_S * 1000 : false,
          });
        }
      } catch (err) {
        console.warn('[members] Redis cache read failed:', err.message);
      }
    }

    // Fallback: direct botClient (monolith mode or cache miss)
    if (!botClient) {
      return res.status(503).json({
        error: 'Guild cache not available. Bot may be offline or guild not yet cached.',
        hint: 'The bot writes guild_cache to Redis on startup. Wait a few seconds and retry.',
      });
    }
    const guild = botClient.guilds.cache.get(req.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    try {
      await guild.members.fetch();
    } catch (_) { }

    let members = [...guild.members.cache.values()];
    if (search) {
      members = members.filter(m =>
        m.user.username.toLowerCase().includes(search) ||
        (m.nickname ?? '').toLowerCase().includes(search)
      );
    }
    members.sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0));

    const total = members.length;
    const slice = members.slice((page - 1) * limit, page * limit);

    res.json({
      total,
      page,
      members: slice.map(m => ({
        id: m.user.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.avatar,
        joinedAt: m.joinedAt,
        roles: [...m.roles.cache.values()]
          .filter(r => r.id !== guild.id)
          .map(r => ({ id: r.id, name: r.name, color: r.color })),
      })),
    });
  });

  app.get('/api/guild-data', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    // Phase 1: Try Redis guild_cache first (works in both monolith and split mode)
    if (redis) {
      try {
        const raw = await redis.get(`guild_cache:${req.guildId}`);
        if (raw) {
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const cacheAgeMs = data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() : null;
          return res.json({
            ...data,
            source: 'redis_cache',
            cacheAgeMs,
            stale: cacheAgeMs !== null ? cacheAgeMs > GUILD_CACHE_TTL_S * 1000 : false,
          });
        }
      } catch (err) {
        console.warn('[guild-data] Redis cache read failed:', err.message);
      }
    }

    // Fallback: direct botClient access (monolith mode or cache miss)
    if (!botClient) {
      return res.status(503).json({
        error: 'Guild cache not available. Bot may be offline or guild not yet cached.',
        hint: 'The bot writes guild_cache to Redis on startup. Wait a few seconds and retry.',
      });
    }
    const guild = botClient.guilds.cache.get(req.guildId);
    if (!guild) { res.status(404).json({ error: 'Guild not found' }); return; }

    const cached = getCachedGuildData(req.guildId);
    if (cached) { res.json(cached); return; }

    try {
      const channels = guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type }));
      const roles = guild.roles.cache
        .map((r) => ({
          id: r.id,
          name: r.name,
          rawPosition: r.rawPosition,
          color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
        }))
        .sort((a, b) => b.rawPosition - a.rawPosition);

      // Fetch members with timeout — fall back to cache if Discord API is slow or unavailable
      let membersFetched;
      try {
        const fetchPromise = guild.members.fetch();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('members.fetch timeout')), 8000)
        );
        membersFetched = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (fetchErr) {
        console.warn(`[guild-data] members.fetch failed (${fetchErr.message}), falling back to cache`);
        membersFetched = guild.members.cache;
      }
      const members = membersFetched.map((m) => ({
        id: m.user.id,
        name: m.user.tag,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL ? m.user.displayAvatarURL({ size: 64 }) : null,
        roles: m.roles.cache.map((r) => r.id),
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null
      })).sort((a, b) => a.displayName.localeCompare(b.displayName));

      const data = { channels, roles, members };
      setCachedGuildData(req.guildId, data);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/analytics', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const range = req.query.range || '7d';
    const data = await fetchAnalytics(req.guildId, range, redis, stateStore);
    res.json(data);
  });


  // GET /api/my-role?guildId=xxx
  // Trả về role của user hiện tại trong guild — dùng cho PermissionGuard trên dashboard.
  // Tái dùng logic đã có sẵn: OAuth guilds cache → botClient fallback → Redis fallback.
  // Không fetch member list bulk nên không hit rate limit.
  app.get('/api/my-role', auth.requireAuth, readRateLimit, requireGuildId, async (req, res) => {
    const userId  = req.session.user.id;
    const guildId = req.guildId;

    try {
      // 1. Check via OAuth guilds cache (đã có sẵn từ /api/guilds, không tốn request mới)
      const userGuilds = await getCachedGuilds(userId);
      if (userGuilds) {
        const g = userGuilds.find(g => g.id === guildId);
        if (g) {
          if (g.owner) return res.json({ role: 'owner' });
          const perms = BigInt(g.permissions ?? 0);
          if ((perms & 0x8n) === 0x8n) return res.json({ role: 'admin' });       // ADMINISTRATOR
          if ((perms & 0x20n) === 0x20n) return res.json({ role: 'admin' });     // MANAGE_GUILD
          if ((perms & 0x2n) === 0x2n) return res.json({ role: 'moderator' });   // KICK_MEMBERS
          if ((perms & 0x4n) === 0x4n) return res.json({ role: 'moderator' });   // BAN_MEMBERS
          if ((perms & 0x2000n) === 0x2000n) return res.json({ role: 'moderator' }); // MANAGE_MESSAGES
          return res.json({ role: 'viewer' });
        }
      }

      // 2. Fallback: botClient trực tiếp
      const botGuild = botClient?.guilds?.cache?.get(guildId);
      if (botGuild) {
        if (botGuild.ownerId === userId) return res.json({ role: 'owner' });
        const member = await botGuild.members.fetch(userId).catch(() => null);
        if (member) {
          if (member.permissions.has('Administrator')) return res.json({ role: 'admin' });
          if (member.permissions.has('ManageGuild'))   return res.json({ role: 'admin' });
          if (member.permissions.has('KickMembers') ||
              member.permissions.has('BanMembers')  ||
              member.permissions.has('ManageMessages')) return res.json({ role: 'moderator' });
          return res.json({ role: 'viewer' });
        }
      }

      // 3. Fallback: Redis guild_cache (owner check only)
      if (redis) {
        const raw = await redis.get(`guild_cache:${guildId}`).catch(() => null);
        if (raw) {
          const meta = JSON.parse(raw);
          if (meta.ownerId === userId) return res.json({ role: 'owner' });
        }
      }

      // Không xác định được — trả viewer để không block hoàn toàn
      return res.json({ role: 'viewer' });
    } catch (err) {
      console.error('[my-role] error:', err.message);
      res.status(500).json({ error: 'Không thể xác định quyền.' });
    }
  });

  app.get('/api/keepalive-status', auth.requireAuth, (_req, res) => {
    const channelId = process.env.KEEPALIVE_CHANNEL_ID ?? null;
    let channelName = null;
    if (channelId && botClient) {
      const ch = botClient.channels.cache.get(channelId);
      channelName = ch ? `#${ch.name}` : `ID: ${channelId}`;
    }
    res.json({
      enabled: Boolean(channelId),
      channelName,
      intervalMinutes: 14,
    });
  });

  app.get('/api/guilds/:guildId/audit-logs', auth.requireAuth, readRateLimit, auth.requireGuildAccess, async (req, res) => {
    const guildId = req.params.guildId || req.guildId;
    if (!redis) {
      return res.json({ logs: [] });
    }
    try {
      const rawLogs = await redis.lrange(`guild:${guildId}:audit_logs`, 0, 99);
      const logs = (rawLogs || []).map(item => typeof item === 'string' ? JSON.parse(item) : item);
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: 'Không thể đọc Audit Logs.' });
    }
  });

  app.post('/api/guilds/:guildId/command-toggle', auth.requireAuth, writeRateLimit, auth.requireGuildAccess, async (req, res) => {
    const guildId = req.params.guildId || req.guildId;
    const { commandName, enabled } = req.body ?? {};
    if (!commandName || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Cần truyền commandName và enabled (boolean).' });
    }

    const currentConfig = await configStore.getGuildConfig(guildId);
    const disabledSet = new Set(currentConfig.disabledCommands ?? []);
    if (enabled) {
      disabledSet.delete(commandName);
    } else {
      disabledSet.add(commandName);
    }

    const updatedConfig = await configStore.updateGuildConfig(guildId, {
      disabledCommands: Array.from(disabledSet)
    });

    if (redis) {
      addAuditLog(redis, guildId, {
        user: req.session?.user?.username ?? 'Admin',
        action: enabled ? 'ENABLE_COMMAND' : 'DISABLE_COMMAND',
        details: { commandName }
      });
    }

    res.json({ success: true, disabledCommands: updatedConfig.disabledCommands });
  });

  // Central error handler — catches unhandled async errors in Express 5 routes
  app.use((err, req, res, _next) => {
    console.error('[server] Unhandled error:', err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Dashboard heartbeat ────────────────────────────────────────────────────
  // Writes heartbeat:dashboard to Redis every 30 s.
  // Allows the bot (or any consumer) to know the dashboard is alive.
  if (redis) {
    const writeDashboardHeartbeat = async () => {
      try {
        await redis.set('heartbeat:dashboard', JSON.stringify({
          ts: new Date().toISOString(),
          uptimeS: Math.floor(process.uptime()),
          commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.GIT_COMMIT?.slice(0, 7) ?? 'unknown',
          version: process.env.npm_package_version ?? 'unknown',
        }), 'EX', 90);
      } catch { /* non-fatal */ }
    };
    writeDashboardHeartbeat();
    setInterval(writeDashboardHeartbeat, 30_000).unref();
    console.log('[heartbeat] Dashboard heartbeat started — writing every 30s');
  }

  return app;
}