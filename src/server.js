import express from 'express';
import cookieSession from 'cookie-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './auth.js';
import { createCsrfProtection } from './csrf.js';
import { createRateLimiter } from './rateLimit.js';

const snowflakePattern = /^\d{17,20}$/;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

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

  // Content-Security-Policy
  // Allowlist:
  //   style-src  : self + jsdelivr (Tabler icons) + Google Fonts CSS
  //   font-src   : self + gstatic (Google Fonts files) + jsdelivr
  //   img-src    : self + Discord CDN (avatars) + data URIs
  //   connect-src: self only (all fetch() goes to our API; jsdelivr .map blocked in prod is fine)
  //   script-src : self (ES modules)
  //   frame-src  : none
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' https://cdn.discordapp.com data:",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '));
    next();
  });

  app.use(cookieSession({
    name: 'dsession',
    keys: [sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
  }));

  app.use((req, _res, next) => {
    if (req.session && !req.session.regenerate) {
      req.session.regenerate = (cb) => { cb?.(); };
      req.session.save = (cb) => { cb?.(); };
    }
    next();
  });

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

  const auth = createAuthRouter(botClient);
  if (auth.attachTo) auth.attachTo(app);

  app.get('/health', (_req, res) => {
    if (isProduction) {
      res.json({ status: 'ok' });
      return;
    }
    res.json({ status: 'ok', uptime: process.uptime(), bot: Boolean(botClient.user) });
  });

  app.get('/login.html', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
  });

  app.get('/', auth.requirePage, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/index.html', auth.requirePage, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(express.static(publicDir, { index: false }));

  app.use('/api', csrf.validate);

  app.get('/api/csrf-token', auth.requireAuth, (req, res) => csrf.issueToken(req, res));

  app.get('/api/status', auth.requireAuth, readRateLimit, async (_req, res) => {
    const guildIds = await configStore.listGuildIds();
    res.json({
      botReady: Boolean(botClient.user),
      botUser: botClient.user?.tag ?? null,
      guildCount: botClient.guilds.cache.size,
      configuredGuilds: guildIds.length,
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

  app.get('/api/state', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    if (!botClient.stateStore) { res.json({ warnings: 0, rankedUsers: 0 }); return; }
    const state = await botClient.stateStore.getGuild(req.guildId);
    res.json({
      warnings: Object.values(state.warnings).reduce((t, i) => t + i.length, 0),
      rankedUsers: Object.keys(state.levels).length,
      nextTicketNumber: state.tickets.nextNumber,
    });
  });

  app.get('/api/guilds', auth.requireAuth, readRateLimit, async (req, res) => {
    const configuredGuildIds = await configStore.listGuildIds();
    const userId = req.session?.user?.id;
    const guildsById = new Map();
    const isDev = Boolean(req.session?.user?.dev);

    const guildEntries = [...botClient.guilds.cache];
    const manageableGuilds = await mapWithConcurrency(guildEntries, 5, async ([id, guild]) => {
      let canManage = isDev;
      if (!canManage && userId && botClient.user) {
        const member = await guild.members.fetch(userId).catch(() => null);
        canManage = member?.permissions?.has('ManageGuild') || member?.permissions?.has('Administrator') || false;
      }
      return canManage
        ? { id, name: guild.name, icon: guild.iconURL({ size: 64 }), configured: configuredGuildIds.includes(id) }
        : null;
    });

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

  app.get('/api/guild-data', auth.requireAuth, readRateLimit, requireGuildId, auth.requireGuildAccess, async (req, res) => {
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
        displayName: m.displayName
      })).sort((a, b) => a.displayName.localeCompare(b.displayName));

      res.json({ channels, roles, members });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/keepalive-status', auth.requireAuth, (_req, res) => {
    const channelId = process.env.KEEPALIVE_CHANNEL_ID ?? null;
    let channelName = null;
    if (channelId) {
      const ch = botClient.channels.cache.get(channelId);
      channelName = ch ? `#${ch.name}` : `ID: ${channelId}`;
    }
    res.json({
      enabled: Boolean(channelId),
      // channelId intentionally omitted — internal Discord snowflake not needed by client
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

  return app;
}