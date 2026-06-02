import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits
} from 'discord.js';
import { CommandCooldowns, formatRetryAfter } from './cooldowns.js';
import { buildSlashCommands } from './bot/slash.js';
import { renderCommandResponse } from './bot/responses.js';
import { formatMessage, sendLog } from './bot/logging.js';
import { runBuiltInCommand } from './bot/commands.js';
import { sanitizeAnnouncementText } from './commandAccess.js';

// In-memory XP cooldown cache — prevents redundant Redis reads when levelsEnabled
// Key: `guildId:userId`, Value: timestamp of last XP grant
const xpCache = new Map();
const XP_COOLDOWN_MS = 60_000;
// Prune expired entries every 5 minutes to prevent memory leak on long-running instances
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of xpCache.entries()) {
    if (now - ts >= XP_COOLDOWN_MS) xpCache.delete(key);
  }
}, 5 * 60 * 1000).unref();
import { handleComponentInteraction } from './bot/interactions.js';

const commandCooldowns = new CommandCooldowns();

export function createBot(configStore, stateStore) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });
  client.stateStore = stateStore;

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);

    // Run async startup tasks without blocking the event loop
    (async () => {
      // 1. Wait for stores to finish loading from disk before doing anything
      await configStore.ready;
      await stateStore.ready;

      // 2. Purge stale game sessions and refund bets
      await stateStore.purgeStaleGameSessions().catch((err) =>
        console.error('[bot] Failed to purge stale game sessions:', err.message)
      );

      // 3. Sync slash commands for every guild — await each one so errors surface clearly
      const guilds = [...readyClient.guilds.cache.values()];
      console.log(`[bot] Syncing slash commands for ${guilds.length} guild(s)...`);
      let synced = 0;
      for (const guild of guilds) {
        try {
          const config = await configStore.getGuildConfig(guild.id);
          const result = await readyClient.syncGuildCommands(guild.id, config);
          console.log(`[bot] ✅ Synced ${result.count} commands → ${guild.name} (${guild.id})`);
          synced += 1;
        } catch (error) {
          console.error(`[bot] ❌ Failed to sync commands for ${guild.name} (${guild.id}): ${error.message}`);
        }
      }
      console.log(`[bot] Command sync complete: ${synced}/${guilds.length} guilds OK`);
    })().catch((err) => console.error('[bot] Startup error:', err));
  });

  // ── Resilience: log disconnects and errors instead of silently dying ────────
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[bot] Shard ${shardId} disconnected (code ${event.code}). Discord.js will auto-reconnect.`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[bot] Shard ${shardId} reconnecting…`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`[bot] Shard ${shardId} resumed (${replayedEvents} events replayed).`);
  });

  client.on(Events.ShardError, (error, shardId) => {
    console.error(`[bot] Shard ${shardId} error:`, error.message);
    // Do NOT re-throw — discord.js handles its own reconnect logic.
  });

  client.on(Events.Error, (error) => {
    console.error('[bot] Client error:', error.message);
  });

  client.on(Events.Warn, (info) => {
    console.warn('[bot] Warning:', info);
  });
  // ────────────────────────────────────────────────────────────────────────────

  client.syncGuildCommands = async (guildId, config) => {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return { synced: false, reason: 'guild_not_found' };
    }

    const commands = buildSlashCommands(config);

    // Validate: Discord requires name 1-32 chars, description 1-100 chars
    for (const cmd of commands) {
      if (!cmd.name || cmd.name.length > 32) {
        console.warn(`[sync] Skipping invalid command name: "${cmd.name}"`);
        continue;
      }
      if (!cmd.description || cmd.description.length > 100) {
        cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
      }
    }

    const validCommands = commands.filter((cmd) => cmd.name && cmd.name.length <= 32);
    await guild.commands.set(validCommands);
    return { synced: true, count: validCommands.length };
  };

  client.on(Events.GuildMemberAdd, async (member) => {
    const config = await configStore.getGuildConfig(member.guild.id);
    if (config.rolesEnabled && config.autoRoleId) {
      await member.roles.add(config.autoRoleId).catch(() => null);
    }

    if (!config.enabled || !config.welcomeEnabled || !config.welcomeChannelId) {
      return;
    }

    const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send(formatMessage(config.welcomeMessage, member)).catch(() => null);
    await sendLog(member.guild, config, `Welcomed ${member.user.tag}.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if ((interaction.isStringSelectMenu() || interaction.isButton()) && interaction.guild) {
        const config = await configStore.getGuildConfig(interaction.guild.id);
        await handleComponentInteraction(interaction, { client, config, stateStore });
        return;
      }

      if (!interaction.isChatInputCommand() || !interaction.guild) {
        return;
      }

      const config = await configStore.getGuildConfig(interaction.guild.id);
      if (!config.enabled) {
        await interaction.reply({ content: 'Bot is disabled for this server.', ephemeral: true });
        return;
      }

      const command = config.commands.find((item) => item.enabled && item.name === interaction.commandName);
      if (!command) {
        await interaction.reply({ content: 'Command is not enabled.', ephemeral: true });
        return;
      }

      const bypassCooldown =
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      const cooldown = commandCooldowns.check({
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        commandType: command.type,
        bypass: bypassCooldown
      });
      if (!cooldown.allowed) {
        await interaction.reply({
          content: `Please wait ${formatRetryAfter(cooldown.retryAfterMs)} before using this command again.`,
          ephemeral: true
        });
        return;
      }

      const args = interaction.options.getString('args') ?? '';
      await runBuiltInCommand({
        client,
        config,
        command,
        source: interaction,
        args
      });
    } catch (error) {
      console.error('[bot] Interaction handler error:', error);
      const payload = { content: 'An unexpected error occurred while handling this interaction.', ephemeral: true };
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) {
        return;
      }

      const config = await configStore.getGuildConfig(message.guild.id);
      if (!config.enabled) {
        return;
      }

      const content = message.content.trim();
      const prefix = config.prefix || '!';

      if (config.autoModEnabled && !message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
        const lowerContent = content.toLowerCase();
        const hasBadWord = config.badWords.some((word) => lowerContent.includes(word.toLowerCase()));
        const hasBlockedLink = config.antiLinkEnabled && /https?:\/\/|discord\.gg\//i.test(content);

        if (hasBadWord || hasBlockedLink) {
          if (config.deleteBlockedMessages) {
            await message.delete().catch(() => null);
          }

          const blocked = renderCommandResponse(config.blockedMessage, {
            client,
            config,
            args: '',
            context: {
              channelId: message.channel.id,
              guildName: message.guild.name,
              userId: message.author.id,
              username: message.author.username
            }
          });
          await message.channel.send(blocked).catch(() => null);
          await sendLog(message.guild, config, `AutoMod blocked ${message.author.tag}: ${hasBlockedLink ? 'link' : 'bad word'}`);
          return;
        }
      }

      if (content.startsWith(prefix)) {
        const body = content.slice(prefix.length).trim();
        const [commandName, ...argParts] = body.split(/\s+/);
        const command = config.commands.find((item) => item.enabled && item.name === commandName?.toLowerCase());

        if (command) {
          const bypassCooldown =
            message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
            message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
          const cooldown = commandCooldowns.check({
            guildId: message.guild.id,
            userId: message.author.id,
            commandType: command.type,
            bypass: bypassCooldown
          });
          if (!cooldown.allowed) {
            await message.reply(`Please wait ${formatRetryAfter(cooldown.retryAfterMs)} before using this command again.`).catch(() => null);
            return;
          }
          await runBuiltInCommand({
            client,
            config,
            command,
            source: message,
            args: argParts.join(' ')
          });
          return;
        }

        return;
      }

      if (config.levelsEnabled) {
        const xpKey = `${message.guild.id}:${message.author.id}`;
        const lastXp = xpCache.get(xpKey) ?? 0;
        if (Date.now() - lastXp < XP_COOLDOWN_MS) return;
        xpCache.set(xpKey, Date.now());
        const rank = await stateStore.addXp(message.guild.id, message.author.id, config.xpPerMessage);
        if (rank.leveledUp) {
          const levelMessage = config.levelUpMessage
            .replaceAll('{user}', `<@${message.author.id}>`)
            .replaceAll('{username}', message.author.username)
            .replaceAll('{level}', String(rank.level))
            .replaceAll('{xp}', String(rank.xp));
          await message.channel.send(levelMessage).catch(() => null);
        }
      }

      if (!config.autoReplyEnabled) {
        return;
      }

      const lowerContent = content.toLowerCase();
      const match = config.autoReplies.find((reply) => lowerContent.includes(reply.keyword.toLowerCase()));
      if (match) {
        await message.reply({ content: sanitizeAnnouncementText(match.response), allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('[bot] Message handler error:', error);
    }
  });

  // ── Self-ping keepalive ──────────────────────────────────────────────────
  // Thay thế UptimeRobot: bot tự gửi tin nhắn vào channel keepalive mỗi 14 phút
  // để Render không spin down process. Channel ID set qua env KEEPALIVE_CHANNEL_ID.
  // Nếu không có channel ID, chỉ log heartbeat để giữ event loop active.
  (function startKeepalive() {
    const INTERVAL_MS = 14 * 60 * 1000; // 14 phút — Render spin down sau 15 phút

    setInterval(async () => {
      const channelId = process.env.KEEPALIVE_CHANNEL_ID;
      if (!channelId) {
        // Không có channel → chỉ log để event loop không idle
        console.log(`[keepalive] heartbeat — uptime ${Math.floor(process.uptime())}s, ws.ping ${client.ws.ping}ms`);
        return;
      }
      try {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        // Gửi tin nhắn invisible (zero-width space) để không spam visible
        await ch.send('\u200b').catch(() => null);
        console.log(`[keepalive] sent heartbeat to #${ch.name ?? channelId}`);
      } catch (err) {
        console.warn('[keepalive] error:', err.message);
      }
    }, INTERVAL_MS).unref();
  })();

  return client;
}