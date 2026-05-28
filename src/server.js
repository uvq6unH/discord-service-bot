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

  // ── Session (cookie-based, no DB needed) ───────────────────────────────────
  app.use(cookieSession({
    name: 'session',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true,
    sameSite: 'lax',
  }));

  app.use(express.json({ limit: '128kb' }));

  // ── Auth routes (/auth/login, /auth/callback, /auth/logout, /auth/me) ──────
  const auth = createAuthRouter(botClient);
  if (auth.attachTo) auth.attachTo(app);

  // ── Static files (dashboard HTML/CSS/JS) ───────────────────────────────────
  // Protected: must be logged in to see the dashboard
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

  app.get('/api/config',
    auth.requireAuth,
    requireGuildId,
    auth.requireGuildAccess,
    async (req, res) => {
      const config = await configStore.getGuildConfig(req.guildId);
      res.json(config);
    }
  );

  app.put('/api/config',
    auth.requireAuth,
    requireGuildId,
    auth.requireGuildAccess,
    async (req, res) => {
      const config = await configStore.updateGuildConfig(req.guildId, req.body);
      const slashSync = botClient.user
        ? await botClient.syncGuildCommands(req.guildId, config).catch((error) => ({
            synced: false,
            reason: error.message,
          }))
        : { synced: false, reason: 'bot_not_ready' };
      res.json({ ...config, slashSync });
    }
  );

  app.post('/api/slash-sync',
    auth.requireAuth,
    requireGuildId,
    auth.requireGuildAccess,
    async (req, res) => {
      const config = await configStore.getGuildConfig(req.guildId);
      const slashSync = await botClient.syncGuildCommands(req.guildId, config);
      res.json(slashSync);
    }
  );

  app.get('/api/state',
    auth.requireAuth,
    requireGuildId,
    auth.requireGuildAccess,
    async (req, res) => {
      if (!botClient.stateStore) {
        res.json({ warnings: 0, rankedUsers: 0 });
        return;
      }
      const state = await botClient.stateStore.getGuild(req.guildId);
      res.json({
        warnings: Object.values(state.warnings).reduce((total, items) => total + items.length, 0),
        rankedUsers: Object.keys(state.levels).length,
        nextTicketNumber: state.tickets.nextNumber,
      });
    }
  );

  app.get('/api/guilds', auth.requireAuth, async (req, res) => {
    const configuredGuildIds = await configStore.listGuildIds();

    // Only show guilds where this user has ManageGuild permission
    const userId = req.session?.user?.id;
    const guildsById = new Map();

    for (const [id, guild] of botClient.guilds.cache) {
      let canManage = false;
      if (userId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        canManage = member?.permissions?.has('ManageGuild') || member?.permissions?.has('Administrator') || false;
      }
      if (canManage) {
        guildsById.set(id, {
          id,
          name: guild.name,
          icon: guild.iconURL({ size: 64 }),
          configured: configuredGuildIds.includes(id),
        });
      }
    }

    // Include configured guilds the bot might not cache yet
    for (const guildId of configuredGuildIds) {
      if (!guildsById.has(guildId)) {
        guildsById.set(guildId, {
          id: guildId,
          name: `Server ${guildId}`,
          icon: null,
          configured: true,
        });
      }
    }

    const guilds = [...guildsById.values()].sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ guilds });
  });

  app.get('/api/guild-data',
    auth.requireAuth,
    requireGuildId,
    auth.requireGuildAccess,
    async (req, res) => {
      const guild = botClient.guilds.cache.get(req.guildId);
      if (!guild) {
        res.status(404).json({ error: 'Guild not found' });
        return;
      }
      try {
        const channels = guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type }));
        const roles = guild.roles.cache
          .map((r) => ({ id: r.id, name: r.name, rawPosition: r.rawPosition }))
          .sort((a, b) => b.rawPosition - a.rawPosition);
        res.json({ channels, roles });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Keep-alive endpoint for UptimeRobot
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), bot: Boolean(botClient.user) });
  });

  return app;
}
