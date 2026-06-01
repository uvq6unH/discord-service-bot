import express from 'express';
import cookieSession from 'cookie-session';
import { createAuthRouter } from './auth.js';

const snowflakePattern = /^\d{17,20}$/;

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

function createRateLimiter({ windowMs, max, keyPrefix = 'global' }) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}:${req.session?.user?.id ?? 'anon'}`;
    const record = hits.get(key);

    if (!record || record.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    record.count += 1;
    if (record.count > max) {
      res.set('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    next();
  };
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

export function createServer({ configStore, stateStore, botClient }) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;

  if (isProduction && !sessionSecret) {
    throw new Error('Missing SESSION_SECRET in production.');
  }

  // Render (và hầu hết cloud) chạy sau reverse proxy — phải trust proxy
  // để cookie secure hoạt động đúng với HTTPS
  app.set('trust proxy', 1);

  // ── Session ────────────────────────────────────────────────────────────────
  app.use(cookieSession({
    name: 'dsession',
    keys: [sessionSecret || 'dev-secret-change-me'],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
  }));

  // cookie-session cần middleware này để hoạt động đúng với req.session = null
  app.use((req, _res, next) => {
    if (req.session && !req.session.regenerate) {
      req.session.regenerate = (cb) => { cb?.(); };
      req.session.save = (cb) => { cb?.(); };
    }
    next();
  });

  app.use(express.json({ limit: '128kb' }));
  const writeRateLimit = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'api-write' });

  // ── Auth routes ────────────────────────────────────────────────────────────
  const auth = createAuthRouter(botClient);
  if (auth.attachTo) auth.attachTo(app);

  // ── Static ─────────────────────────────────────────────────────────────────
  app.use(express.static('public'));

  // ── API routes ─────────────────────────────────────────────────────────────
  app.get('/api/status', async (_req, res) => {
    const guildIds = await configStore.listGuildIds();
    res.json({
      botReady: Boolean(botClient.user),
      botUser: botClient.user?.tag ?? null,
      guildCount: botClient.guilds.cache.size,
      configuredGuilds: guildIds.length,
    });
  });

  app.get('/api/config', auth.requireAuth, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    res.json(sanitizeConfigForClient(config));
  });

  app.put('/api/config', auth.requireAuth, writeRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.updateGuildConfig(req.guildId, req.body);
    const slashSync = botClient.user
      ? await botClient.syncGuildCommands(req.guildId, config).catch((e) => ({ synced: false, reason: e.message }))
      : { synced: false, reason: 'bot_not_ready' };
    res.json({ ...sanitizeConfigForClient(config), slashSync });
  });

  app.post('/api/slash-sync', auth.requireAuth, writeRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    const slashSync = await botClient.syncGuildCommands(req.guildId, config);
    res.json(slashSync);
  });

  app.get('/api/state', auth.requireAuth, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    if (!botClient.stateStore) { res.json({ warnings: 0, rankedUsers: 0 }); return; }
    const state = await botClient.stateStore.getGuild(req.guildId);
    res.json({
      warnings: Object.values(state.warnings).reduce((t, i) => t + i.length, 0),
      rankedUsers: Object.keys(state.levels).length,
      nextTicketNumber: state.tickets.nextNumber,
    });
  });

  app.get('/api/guilds', auth.requireAuth, async (req, res) => {
    const configuredGuildIds = await configStore.listGuildIds();
    const userId = req.session?.user?.id;
    const guildsById = new Map();
    const isDev = Boolean(req.session?.user?.dev);

    const manageableGuilds = await Promise.all([...botClient.guilds.cache].map(async ([id, guild]) => {
      let canManage = isDev;
      if (!canManage && userId && botClient.user) {
        const member = await guild.members.fetch(userId).catch(() => null);
        canManage = member?.permissions?.has('ManageGuild') || member?.permissions?.has('Administrator') || false;
      }
      return canManage
        ? { id, name: guild.name, icon: guild.iconURL({ size: 64 }), configured: configuredGuildIds.includes(id) }
        : null;
    }));

    for (const guild of manageableGuilds) {
      if (guild) guildsById.set(guild.id, guild);
    }

    if (isDev) {
      for (const guildId of configuredGuildIds) {
        if (!guildsById.has(guildId)) {
          guildsById.set(guildId, { id: guildId, name: `Server ${guildId}`, icon: null, configured: true });
        }
      }
    }

    const guilds = [...guildsById.values()].sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ guilds });
  });

  app.get('/api/guild-data', auth.requireAuth, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const guild = botClient.guilds.cache.get(req.guildId);
    if (!guild) { res.status(404).json({ error: 'Guild not found' }); return; }
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
      res.json({ channels, roles });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), bot: Boolean(botClient.user) });
  });

  // ── Keepalive config API ──────────────────────────────────────────────────
  // Trả về danh sách text channels của tất cả guilds để chọn keepalive channel
  app.get('/api/keepalive-status', auth.requireAuth, (_req, res) => {
    const channelId = process.env.KEEPALIVE_CHANNEL_ID ?? null;
    let channelName = null;
    if (channelId) {
      const ch = botClient.channels.cache.get(channelId);
      channelName = ch ? `#${ch.name}` : `ID: ${channelId}`;
    }
    res.json({
      enabled: Boolean(channelId),
      channelId,
      channelName,
      intervalMinutes: 14,
    });
  });

  return app;
}
