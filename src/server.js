import { createRateLimiter } from './rateLimit.js';
import helmet from 'helmet';
import express from 'express';
import expressSession from 'express-session';
import { UpstashSessionStore } from './sessionStore.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './auth.js';
import { createCsrfProtection } from './csrf.js';
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
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:'],
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

  // In-process guild list cache (userId -> {guilds, expiresAt}, 5-min TTL)
  // Shared between routes in this server instance.
  const _guildCache = new Map();
  const GUILD_CACHE_TTL = 5 * 60 * 1000;
  function getCachedGuilds(userId) {
    const e = _guildCache.get(userId);
    if (!e || Date.now() > e.expiresAt) { _guildCache.delete(userId); return null; }
    return e.guilds;
  }
  function setCachedGuilds(userId, guilds) {
    _guildCache.set(userId, { guilds, expiresAt: Date.now() + GUILD_CACHE_TTL });
  }

  // In-process guild-data cache (guildId -> {data, expiresAt}, 2-min TTL)
  // Avoids repeated guild.members.fetch() calls to Discord API for the same guild.
  const _guildDataCache = new Map();
  const GUILD_DATA_CACHE_TTL = 2 * 60 * 1000;
  function getCachedGuildData(guildId) {
    const e = _guildDataCache.get(guildId);
    if (!e || Date.now() > e.expiresAt) { _guildDataCache.delete(guildId); return null; }
    return e.data;
  }
  function setCachedGuildData(guildId, data) {
    _guildDataCache.set(guildId, { data, expiresAt: Date.now() + GUILD_DATA_CACHE_TTL });
  }

  const auth = createAuthRouter(botClient, redis);
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
      res.sendFile(indexFile);
    } else {
      res.status(503).send('Dashboard chưa được build. Chạy: pnpm build:ui');
    }
  });

  app.use('/api', csrf.validate);

  app.get('/api/csrf-token', auth.requireAuth, (req, res) => csrf.issueToken(req, res));

  app.get('/api/status', auth.requireAuth, readRateLimit, async (_req, res) => {
    const guildIds = await configStore.listGuildIds();

    // Read heartbeats + stats counters from Redis.
    // All reads are parallel and non-fatal.
    let botHeartbeat = null;
    let dashboardHeartbeat = null;
    let stats = null;
    if (redis) {
      try {
        const [rawBot, rawDash, slashSynced, cacheRefresh, discordErrors, queueLen] = await Promise.all([
          redis.get('heartbeat:bot').catch(() => null),
          redis.get('heartbeat:dashboard').catch(() => null),
          redis.get('stats:slash_sync_processed').catch(() => null),
          redis.get('stats:guild_cache_refresh').catch(() => null),
          redis.get('stats:discord_errors').catch(() => null),
          redis.llen('slash_sync_queue').catch(() => null),
        ]);
        if (rawBot) botHeartbeat = typeof rawBot === 'string' ? JSON.parse(rawBot) : rawBot;
        if (rawDash) dashboardHeartbeat = typeof rawDash === 'string' ? JSON.parse(rawDash) : rawDash;
        stats = {
          slashSyncProcessed: slashSynced ? parseInt(slashSynced, 10) : 0,
          guildCacheRefresh: cacheRefresh ? parseInt(cacheRefresh, 10) : 0,
          discordErrors: discordErrors ? parseInt(discordErrors, 10) : 0,
          slashQueueLength: queueLen ? parseInt(queueLen, 10) : 0,
        };
      } catch { /* non-fatal — return partial status */ }
    }

    // botOnline: true if botClient is live in this process OR Redis heartbeat is fresh
    const botOnline = Boolean(botClient?.user) || Boolean(botHeartbeat?.ready);
    const nowMs = Date.now();
    const botHeartbeatAgeMs = botHeartbeat?.ts ? nowMs - new Date(botHeartbeat.ts).getTime() : null;

    res.json({
      // Legacy fields (kept for backwards compat)
      botReady: botOnline,
      botUser: botClient?.user?.tag ?? null,
      guildCount: botClient?.guilds?.cache?.size ?? botHeartbeat?.guilds ?? 0,
      configuredGuilds: guildIds.length,
      // Heartbeat fields (meaningful in split mode)
      bot: botHeartbeat ? {
        online: botHeartbeat.ready && botHeartbeatAgeMs < 90_000,
        uptimeS: botHeartbeat.uptimeS,
        guilds: botHeartbeat.guilds,
        lastSeenMs: botHeartbeatAgeMs,
        ts: botHeartbeat.ts,
        commit: botHeartbeat.commit ?? null,
        version: botHeartbeat.version ?? null,
      } : null,
      dashboard: dashboardHeartbeat ? {
        uptimeS: dashboardHeartbeat.uptimeS,
        ts: dashboardHeartbeat.ts,
        commit: dashboardHeartbeat.commit ?? null,
        version: dashboardHeartbeat.version ?? null,
      } : null,
      // Observability counters (Phase 3.3)
      stats,
    });
  });

  app.get('/api/config', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    res.json(sanitizeConfigForClient(config));
  });

  app.put('/api/config', auth.requireAuth, writeRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const limits = { commands: 100, autoReplies: 100, reminders: 100 };
    for (const [key, limit] of Object.entries(limits)) {
      if (Array.isArray(req.body?.[key]) && req.body[key].length > limit) {
        return res.status(400).json({ error: `${key} exceeds limit ${limit}` });
      }
    }

    const config = await configStore.updateGuildConfig(req.guildId, req.body);

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

  app.get('/api/guilds', auth.requireAuth, readRateLimit, async (req, res) => {
    const configuredGuildIds = await configStore.listGuildIds();
    const isDev = Boolean(req.session?.user?.dev);
    const guildsById = new Map();

    // Lấy danh sách guilds user có quyền quản lý từ OAuth (cache trong session)
    const _uid = req.session.user?.id;
    let userGuilds = _uid ? getCachedGuilds(_uid) : null;
    if (!userGuilds && !isDev) {
      const accessToken = req.session.user?.accessToken;
      if (accessToken) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10_000);
          const oauthRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          }).finally(() => clearTimeout(t));
          if (oauthRes.ok) {
            userGuilds = await oauthRes.json();
            if (_uid) setCachedGuilds(_uid, userGuilds);
          }
        } catch { /* fallback to empty */ }
      }
    }

    // Build set của guild IDs user có ManageGuild hoặc Administrator
    const ADMINISTRATOR = 0x8n;
    const MANAGE_GUILD = 0x20n;
    const manageableIds = new Set(
      (userGuilds ?? [])
        .filter(g => {
          if (g.owner) return true; // server owner
          const p = BigInt(g.permissions ?? 0);
          return (p & ADMINISTRATOR) === ADMINISTRATOR || (p & MANAGE_GUILD) === MANAGE_GUILD;
        })
        .map(g => g.id)
    );

    // Guilds bot đang có mặt — lấy từ botClient cache (monolith) hoặc Redis guild_cache (split mode)
    const botGuildIds = new Set();
    if (botClient?.guilds?.cache?.size) {
      for (const id of botClient.guilds.cache.keys()) botGuildIds.add(id);
    } else if (redis) {
      // Split mode: bot đã write guild_cache:{id} khi khởi động
      try {
        const keys = await redis.keys('guild_cache:*');
        for (const key of (keys ?? [])) {
          // Chỉ lấy key dạng guild_cache:{id} (không phải guild_cache:{id}:members)
          const parts = key.split(':');
          if (parts.length === 2) botGuildIds.add(parts[1]);
        }
      } catch { /* fallback: botGuildIds rỗng */ }
    }

    // Fallback: guild đã có config = bot đã từng vào và setup → coi là botPresent
    // Điều này tránh false-negative khi Redis TTL expire hoặc bot đang khởi động
    for (const guildId of configuredGuildIds) {
      botGuildIds.add(guildId);
    }

    for (const id of botGuildIds) {
      const canManage = isDev || manageableIds.has(id);
      if (!canManage) continue;
      // Lấy meta từ botClient cache (monolith) > Redis (split mode) > OAuth userGuilds (fallback)
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
        // Không có Redis — lấy meta từ OAuth
        guildsById.set(id, {
          id,
          name: oauthMeta?.name ?? `Server ${id}`,
          icon: oauthIcon,
          configured: configuredGuildIds.includes(id),
          botPresent: true,
        });
      }
    }

    // Guilds user có quyền nhưng bot chưa có mặt — hiện để user có thể invite
    for (const g of (userGuilds ?? [])) {
      if (guildsById.has(g.id)) continue; // đã có rồi
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

    const guilds = [...guildsById.values()].sort((a, b) => {
      // Ưu tiên: bot có mặt + đã configured > bot có mặt > chưa có bot
      if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1;
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ guilds });
  });

  app.get('/api/members', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = (req.query.search ?? '').toLowerCase().trim();
    const PAGE_SIZE = 20;

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
            members: members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
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
    const slice = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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