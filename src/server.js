import express from 'express';

function requireGuildId(req, res, next) {
  const guildId = String(req.query.guildId ?? req.body.guildId ?? '').trim();
  if (!guildId) {
    res.status(400).json({ error: 'guildId is required' });
    return;
  }

  req.guildId = guildId;
  next();
}

export function createServer({ configStore, botClient }) {
  const app = express();

  app.use(express.json({ limit: '128kb' }));
  app.use(express.static('public'));

  app.get('/api/status', async (_req, res) => {
    const guildIds = await configStore.listGuildIds();
    res.json({
      botReady: Boolean(botClient.user),
      botUser: botClient.user?.tag ?? null,
      guildCount: botClient.guilds.cache.size,
      configuredGuilds: guildIds.length
    });
  });

  app.get('/api/config', requireGuildId, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    res.json(config);
  });

  app.put('/api/config', requireGuildId, async (req, res) => {
    const config = await configStore.updateGuildConfig(req.guildId, req.body);
    const slashSync = botClient.user
      ? await botClient.syncGuildCommands(req.guildId, config).catch((error) => ({
          synced: false,
          reason: error.message
        }))
      : { synced: false, reason: 'bot_not_ready' };

    res.json({ ...config, slashSync });
  });

  app.post('/api/slash-sync', requireGuildId, async (req, res) => {
    const config = await configStore.getGuildConfig(req.guildId);
    const slashSync = await botClient.syncGuildCommands(req.guildId, config);
    res.json(slashSync);
  });

  app.get('/api/state', requireGuildId, async (req, res) => {
    if (!botClient.stateStore) {
      res.json({ warnings: 0, rankedUsers: 0 });
      return;
    }
    const state = await botClient.stateStore.getGuild(req.guildId);
    res.json({
      warnings: Object.values(state.warnings).reduce((total, items) => total + items.length, 0),
      rankedUsers: Object.keys(state.levels).length,
      nextTicketNumber: state.tickets.nextNumber
    });
  });

  app.get('/api/guilds', async (_req, res) => {
    const configuredGuildIds = await configStore.listGuildIds();
    const guildsById = new Map(
      botClient.guilds.cache.map((guild) => [
        guild.id,
        {
          id: guild.id,
          name: guild.name,
          configured: configuredGuildIds.includes(guild.id)
        }
      ])
    );

    for (const guildId of configuredGuildIds) {
      if (!guildsById.has(guildId)) {
        guildsById.set(guildId, {
          id: guildId,
          name: `Configured server ${guildId}`,
          configured: true
        });
      }
    }

    const guilds = [...guildsById.values()].sort((a, b) => {
      if (a.configured !== b.configured) {
        return a.configured ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({ guilds });
  });

  app.get('/api/guild-data', requireGuildId, async (req, res) => {
    const guild = botClient.guilds.cache.get(req.guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    try {
      const channels = guild.channels.cache.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type
      }));
      const roles = guild.roles.cache.map((r) => ({
        id: r.id,
        name: r.name,
        rawPosition: r.rawPosition
      })).sort((a, b) => b.rawPosition - a.rawPosition);

      res.json({ channels, roles });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


  // Keep-alive endpoint for UptimeRobot (free Render tier sleeps after 15min idle)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), bot: Boolean(botClient.user) });
  });

  return app;
}
