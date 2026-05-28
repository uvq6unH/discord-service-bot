import express from 'express';
import cookieSession from 'cookie-session';
import { createAuthRouter } from './auth.js';

function requireGuildId(req, res, next) {
  const guildId = String(req.query.guildId ?? req.body.guildId ?? '').trim();
  if (!guildId) {
    res.status(400).json({ error: 'guildId is required' });
    return;
  }
  req.guildId = guildId;
  next();
}

export function createServer({ configStore, stateStore, botClient }) {
  const app = express();

  // Render (và hầu hết cloud) chạy sau reverse proxy — phải trust proxy
  // để cookie secure hoạt động đúng với HTTPS
  app.set('trust proxy', 1);

  // ── Session ────────────────────────────────────────────────────────────────
  app.use(cookieSession({
    name: 'dsession',
    keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: false,   // để false — Render tự handle HTTPS ở layer trên
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
    res.json(config);
  });

  app.put('/api/config', auth.requireAuth, requireGuildId, auth.requireGuildAccess, async (req, res) => {
    const config = await configStore.updateGuildConfig(req.guildId, req.body);
    const slashSync = botClient.user
      ? await botClient.syncGuildCommands(req.guildId, config).catch((e) => ({ synced: false, reason: e.message }))
      : { synced: false, reason: 'bot_not_ready' };
    res.json({ ...config, slashSync });
  });

  app.post('/api/slash-sync', auth.requireAuth, requireGuildId, auth.requireGuildAccess, async (req, res) => {
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

    for (const [id, guild] of botClient.guilds.cache) {
      let canManage = false;
      if (userId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        canManage = member?.permissions?.has('ManageGuild') || member?.permissions?.has('Administrator') || false;
      }
      if (canManage) {
        guildsById.set(id, { id, name: guild.name, icon: guild.iconURL({ size: 64 }), configured: configuredGuildIds.includes(id) });
      }
    }

    for (const guildId of configuredGuildIds) {
      if (!guildsById.has(guildId)) {
        guildsById.set(guildId, { id: guildId, name: `Server ${guildId}`, icon: null, configured: true });
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
        .map((r) => ({ id: r.id, name: r.name, rawPosition: r.rawPosition }))
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