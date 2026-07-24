/**
 * bot.js — Discord Client factory
 *
 * createBot(configStore, stateStore, redis?) → discord.js Client
 *
 * Tất cả logic phụ đã tách vào sub-modules:
 *   src/bot/emojiMap.js       → resolveEmojiNames
 *   src/bot/reminderWorker.js → startReminderWorker
 *   src/bot/xpHandler.js      → handleXp
 *   src/bot/autoMod.js        → runAutoMod, runMentionReact
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} from 'discord.js';

import { CommandCooldowns, formatRetryAfter } from './cooldowns.js';
import { buildSlashCommands }                  from './bot/slash.js';
import { renderCommandResponse }               from './bot/responses.js';
import { formatMessage, sendLog }              from './bot/logging.js';
import { runBuiltInCommand }                   from './bot/commands.js';
import { sanitizeAnnouncementText }            from './commandAccess.js';
import { handleComponentInteraction }          from './bot/interactions.js';
import { handleMusicCommand }                  from './bot/commands/handlers/music.js';
import { initLavalink, forwardVoiceEvent }     from './bot/music/lavalink.js';
import { startReminderWorker }                 from './bot/reminderWorker.js';
import { handleXp }                            from './bot/xpHandler.js';
import { runAutoMod, runMentionReact }         from './bot/autoMod.js';
import { activeQuizSessions, buildQuizEmbed }  from './bot/lolQuiz.js';
import { defaultConfig, builtInTypesByName } from './configDefaults.js';

// ── Guild Cache ───────────────────────────────────────────────────────────────
// Hai key tách biệt để tránh Upstash 1 MB REST limit trên guild lớn:
//   guild_cache:{id}         → meta (name, iconURL, channels[], roles[], memberCount)
//   guild_cache:{id}:members → members[] riêng biệt
// TTL: 15 phút. Bot refresh mỗi 10 phút + GuildCreate/GuildUpdate.

const GUILD_CACHE_KEY         = (id) => `guild_cache:${id}`;
const GUILD_CACHE_MEMBERS_KEY = (id) => `guild_cache:${id}:members`;
const GUILD_CACHE_TTL_S       = 900;
const GUILD_CACHE_REFRESH_MS  = 10 * 60_000;

async function writeGuildCache(guild, redis) {
  if (!redis) return;
  try {
    const channels = guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type }));
    const roles = guild.roles.cache
      .map((r) => ({
        id: r.id, name: r.name, rawPosition: r.rawPosition,
        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
      }))
      .sort((a, b) => b.rawPosition - a.rawPosition);

    // Key 1: meta — kích thước nhỏ, dùng cho /api/guild-data
    const metaPayload = JSON.stringify({
      name:        guild.name,
      iconURL:     guild.iconURL({ size: 64 }) ?? null,
      channels,
      roles,
      memberCount: guild.memberCount,
      ownerId:     guild.ownerId,
      updatedAt:   new Date().toISOString(),
    });
    await redis.set(GUILD_CACHE_KEY(guild.id), metaPayload, 'EX', GUILD_CACHE_TTL_S);

    // Key 2: members — scale theo kích thước guild, dùng cho /api/members
    let membersFetched;
    try {
      membersFetched = await Promise.race([
        guild.members.fetch(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8_000)),
      ]);
    } catch {
      membersFetched = guild.members.cache;
    }

    const members = [...membersFetched.values()]
      .map((m) => ({
        id:          m.user.id,
        username:    m.user.username,
        displayName: m.displayName,
        avatar:      m.user.avatar ?? null,
        joinedAt:    m.joinedAt ? m.joinedAt.toISOString() : null,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const membersPayload = JSON.stringify(members);
    await redis.set(GUILD_CACHE_MEMBERS_KEY(guild.id), membersPayload, 'EX', GUILD_CACHE_TTL_S);
    redis.incr('stats:guild_cache_refresh').catch(() => null);

    console.log(
      `[guild-cache] ✅ ${guild.name} (${guild.id})` +
      ` — meta ${Math.round(Buffer.byteLength(metaPayload) / 1024)}KB,` +
      ` members ${members.length} (${Math.round(Buffer.byteLength(membersPayload) / 1024)}KB)`
    );
  } catch (err) {
    console.error(`[guild-cache] ❌ Failed to write cache for ${guild.id}:`, err.message);
  }
}

// ── Bot factory ───────────────────────────────────────────────────────────────

export function createBot(configStore, stateStore, redis = null) {
  // Per-instance cooldown tracker — không phải module-scope singleton.
  // Đặt trong factory để mỗi bot instance có state riêng (dễ test, đúng với multiple instance).
  const commandCooldowns = new CommandCooldowns();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });
  client.stateStore = stateStore;
  client.configStore = configStore;

  // ── ClientReady ─────────────────────────────────────────────────────────────
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);
    _startHeartbeat(readyClient, redis);

    (async () => {
      await configStore.ready;
      await stateStore.ready;

      await initLavalink(readyClient).catch((err) =>
        console.error('[bot] Failed to init Lavalink:', err.message)
      );

      await stateStore.purgeStaleGameSessions().catch((err) =>
        console.error('[bot] Failed to purge stale game sessions:', err.message)
      );

      // Sync global slash commands once
      console.log(`[bot] Syncing global slash commands...`);
      try {
        const globalResult = await readyClient.syncGlobalCommands();
        console.log(`[bot] ✅ Synced ${globalResult.count} global commands`);
      } catch (error) {
        console.error(`[bot] ❌ Failed to sync global commands: ${error.message}`);
      }

      // Sync custom slash commands for each guild
      const guilds  = [...readyClient.guilds.cache.values()];
      let   synced  = 0;
      console.log(`[bot] Syncing guild-specific custom commands for ${guilds.length} guild(s)...`);
      for (const guild of guilds) {
        try {
          const config = await configStore.getGuildConfig(guild.id);
          const result = await readyClient.syncGuildCommands(guild.id, config);
          console.log(`[bot] ✅ Synced ${result.count} custom commands → ${guild.name} (${guild.id})`);
          synced += 1;
        } catch (error) {
          console.error(`[bot] ❌ Failed to sync custom commands for ${guild.name}: ${error.message}`);
        }
      }
      console.log(`[bot] Guild custom command sync complete: ${synced}/${guilds.length} guilds OK`);

      // Guild cache initial write
      if (redis) {
        console.log(`[guild-cache] Writing initial cache for ${guilds.length} guild(s)...`);
        for (const guild of guilds) await writeGuildCache(guild, redis);

        setInterval(async () => {
          for (const guild of [...readyClient.guilds.cache.values()]) {
            await writeGuildCache(guild, redis);
          }
        }, GUILD_CACHE_REFRESH_MS).unref();
      }

      // Workers
      startReminderWorker(readyClient, configStore);
      _startSlashSyncWorker(readyClient, configStore, redis);
    })().catch((err) => console.error('[bot] Startup error:', err));
  });

  // ── Resilience ──────────────────────────────────────────────────────────────
  client.on(Events.ShardDisconnect,   (ev, id) => console.warn(`[bot] Shard ${id} disconnected (code ${ev.code}). Will auto-reconnect.`));
  client.on(Events.ShardReconnecting, (id)      => console.log(`[bot] Shard ${id} reconnecting…`));
  client.on(Events.ShardResume,       (id, n)   => console.log(`[bot] Shard ${id} resumed (${n} events replayed).`));
  client.on(Events.ShardError,        (err, id) => {
    console.error(`[bot] Shard ${id} error:`, err.message);
    if (redis) redis.incr('stats:discord_errors').catch(() => null);
  });
  client.on(Events.Error, (err) => {
    console.error('[bot] Client error:', err.message);
    if (redis) redis.incr('stats:discord_errors').catch(() => null);
  });
  client.on(Events.Warn, (info) => console.warn('[bot] Warning:', info));

  // Lavalink cần VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE từ raw packet stream
  client.on(Events.Raw, (packet) => {
    if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
      forwardVoiceEvent(packet, 0);
    }
  });

  // ── Slash command sync helper ───────────────────────────────────────────────
  client.syncGlobalCommands = async () => {
    const allCommands = [
      ...(defaultConfig.core?.commands || []),
      ...(defaultConfig.moderation?.commands || []),
      ...(defaultConfig.levels?.commands || []),
      ...(defaultConfig.economy?.commands || []),
      ...(defaultConfig.riot?.commands || []),
    ].map(cmd => ({ ...cmd, enabled: true }));

    const mockConfig = { commands: allCommands };
    const commands = buildSlashCommands(mockConfig);
    const validCommands = commands.filter((cmd) => {
      if (!cmd.name || cmd.name.length > 32) return false;
      if (!cmd.description || cmd.description.length > 100) {
        cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
      }
      return true;
    });

    console.log(`[sync-global] Syncing ${validCommands.length} global commands to Discord Application...`);
    await client.application.commands.set(validCommands);
    return { synced: true, count: validCommands.length };
  };

  client.syncGuildCommands = async (guildId, config) => {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return { synced: false, reason: 'guild_not_found' };

    // Register ONLY custom commands for this guild (built-ins are global)
    const customCommands = config.commands.filter(
      (cmd) => cmd.type === 'custom' || !builtInTypesByName.has(cmd.name)
    );
    const commands = buildSlashCommands({ commands: customCommands });
    const validCommands = commands.filter((cmd) => {
      if (!cmd.name || cmd.name.length > 32) {
        console.warn(`[sync] Skipping invalid command name: "${cmd.name}"`);
        return false;
      }
      if (!cmd.description || cmd.description.length > 100) {
        cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
      }
      return true;
    });

    await guild.commands.set(validCommands);
    return { synced: true, count: validCommands.length };
  };

  // ── Guild cache: refresh on join / update ───────────────────────────────────
  client.on(Events.GuildCreate, async (guild) => {
    console.log(`[bot] Joined guild: ${guild.name} (${guild.id})`);
    if (redis) await writeGuildCache(guild, redis);
  });
  client.on(Events.GuildUpdate, async (_old, newGuild) => {
    if (redis) await writeGuildCache(newGuild, redis);
  });

  // ── Member auto-role + welcome ──────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    const config = await configStore.getGuildConfig(member.guild.id);

    if (config.rolesEnabled && config.autoRoleId) {
      await member.roles.add(config.autoRoleId).catch(() => null);
    }

    if (!config.enabled || !config.welcomeEnabled || !config.welcomeChannelId) return;

    const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    await channel.send(formatMessage(config.welcomeMessage, member)).catch(() => null);
    await sendLog(member.guild, config, `Welcomed ${member.user.tag}.`);
  });

  // ── Interaction handler ─────────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Autocomplete handling for champion names
      if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const { getChampionData } = await import('./lolApi.js');
        const champData = await getChampionData('vi_VN');
        const cleanFocused = focusedValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const filtered = Object.values(champData.data)
          .filter(champ => {
            const nameClean = champ.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return nameClean.includes(cleanFocused) || champ.name.toLowerCase().includes(focusedValue);
          })
          .slice(0, 25);

        await interaction.respond(
          filtered.map(champ => ({ name: champ.name, value: champ.name }))
        );
        return;
      }

      // Modal submit handling
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('quiz:guess_modal')) {
          const { handleQuizModalSubmit } = await import('./bot/lolQuiz.js');
          await handleQuizModalSubmit(interaction);
          return;
        }
      }

      // Component interactions (buttons, select menus)
      if ((interaction.isStringSelectMenu() || interaction.isButton()) && interaction.guild) {
        const config = await configStore.getGuildConfig(interaction.guild.id);
        await handleComponentInteraction(interaction, { client, config, stateStore });
        return;
      }

      if (!interaction.isChatInputCommand() || !interaction.guild) return;

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
        guildId:     interaction.guild.id,
        userId:      interaction.user.id,
        commandType: command.type,
        bypass:      bypassCooldown,
      });
      if (!cooldown.allowed) {
        await interaction.reply({
          content: `Please wait ${formatRetryAfter(cooldown.retryAfterMs)} before using this command again.`,
          ephemeral: true,
        });
        return;
      }

      await runBuiltInCommand({
        client,
        config,
        command,
        source: interaction,
        args: interaction.options.getString('args') ?? '',
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

  // ── Message handler ─────────────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const config = await configStore.getGuildConfig(message.guild.id);
      if (!config.enabled) return;

      const content = message.content.trim();
      const prefix  = config.prefix || '!';

      // 1. AutoMod — block nếu vi phạm
      const blocked = await runAutoMod(message, config, client);
      if (blocked) return;

      // 2. Mention react — luôn chạy, không return sớm
      await runMentionReact(message, config, client);

      // 3. Music prefix
      if (config.musicEnabled !== false) {
        const mPrefix = (config.musicPrefix || 'hb').toLowerCase();
        const lc      = content.toLowerCase();
        if (lc === mPrefix || lc.startsWith(mPrefix + ' ')) {
          const musicBody = content.slice(mPrefix.length).trim();
          const [subcommand, ...musicArgParts] = musicBody.split(/\s+/);
          await handleMusicCommand({
            message,
            subcommand: (subcommand || '').toLowerCase(),
            args: musicArgParts.join(' '),
            config,
          });
          return;
        }
      }

      // 4. Prefix command
      if (content.startsWith(prefix)) {
        const body = content.slice(prefix.length).trim();
        const [commandName, ...argParts] = body.split(/\s+/);
        const command = config.commands.find(
          (item) => item.enabled && item.name === commandName?.toLowerCase()
        );

        if (command) {
          const bypassCooldown =
            message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
            message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

          const cooldown = commandCooldowns.check({
            guildId:     message.guild.id,
            userId:      message.author.id,
            commandType: command.type,
            bypass:      bypassCooldown,
          });
          if (!cooldown.allowed) {
            await message.reply(
              `Please wait ${formatRetryAfter(cooldown.retryAfterMs)} before using this command again.`
            ).catch(() => null);
            return;
          }

          await runBuiltInCommand({ client, config, command, source: message, args: argParts.join(' ') });
          return;
        }
        // Unknown prefix → fall through to XP + autoReply
      }

      // 5. XP (với in-memory cooldown)
      await handleXp(message, config, stateStore);

      // 6. AutoReply
      if (!config.autoReplyEnabled) return;
      const lowerContent = content.toLowerCase();
      const match = config.autoReplies.find((r) => lowerContent.includes(r.keyword.toLowerCase()));
      if (match) {
        await message.reply({
          content: sanitizeAnnouncementText(match.response),
          allowedMentions: { parse: [] },
        });
      }

      // 7. Auto reposition active quiz embeds to the bottom of the channel
      //    Session keys are now `channelId:userId`, so iterate to find all sessions in this channel
      if (message.author.id !== client.user.id) {
        for (const [key, session] of activeQuizSessions) {
          if (!key.startsWith(message.channel.id + ':') || session.status !== 'active') continue;

          if (session.moveTimeout) {
            clearTimeout(session.moveTimeout);
          }
          session.moveTimeout = setTimeout(async () => {
            try {
              const currentSession = activeQuizSessions.get(key);
              if (!currentSession || currentSession.status !== 'active') return;

              // Delete old message
              if (currentSession.messageId) {
                const oldMsg = await message.channel.messages.fetch(currentSession.messageId).catch(() => null);
                if (oldMsg) {
                  await oldMsg.delete().catch(() => null);
                }
              }

              // Send new message
              const replyPayload = buildQuizEmbed(currentSession);
              const newMsg = await message.channel.send(replyPayload);
              currentSession.messageId = newMsg.id;
            } catch (err) {
              console.error('[lolQuiz] Error repositioning quiz message:', err);
            } finally {
              if (session) {
                session.moveTimeout = null;
              }
            }
          }, 1500); // 1.5s debounce
        }
      }
    } catch (error) {
      console.error('[bot] Message handler error:', error);
    }
  });

  return client;
}

// ── Internal workers (private) ────────────────────────────────────────────────

function _startSlashSyncWorker(client, configStore, redis) {
  if (!redis) return;

  const SLASH_SYNC_QUEUE = 'slash_sync_queue';
  const MAX_RETRIES      = 3;

  const handle = setInterval(async () => {
    try {
      const raw = await redis.lpop(SLASH_SYNC_QUEUE);
      if (!raw) return;

      let job;
      try { job = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }

      const { guildId, retries = 0, requestedAt } = job;
      if (!guildId) return;

      const config = await configStore.getGuildConfig(guildId).catch(() => null);
      if (!config) return;

      try {
        const result = await client.syncGuildCommands(guildId, config);
        redis.incr('stats:slash_sync_processed').catch(() => null);
        console.log(`[slash-queue] Synced ${guildId}:`, result);
      } catch (err) {
        if (retries < MAX_RETRIES) {
          await redis.rpush(SLASH_SYNC_QUEUE, JSON.stringify({
            guildId, retries: retries + 1, requestedAt,
            lastError: err.message, retriedAt: new Date().toISOString(),
          }));
          console.warn(`[slash-queue] Retry ${retries + 1}/${MAX_RETRIES} for ${guildId}: ${err.message}`);
        } else {
          console.error(`[slash-queue] Giving up on ${guildId} after ${MAX_RETRIES} retries: ${err.message}`);
          redis.incr('stats:slash_sync_failed').catch(() => null);
        }
      }
    } catch (err) {
      console.error('[slash-queue] Worker error:', err.message);
    }
  }, 5_000);

  handle.unref();
  console.log('[slash-queue] Worker started — polling every 5 s, max 3 retries');
}

function _startHeartbeat(client, redis) {
  if (!redis) return;

  const write = async () => {
    try {
      const mem = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const totalCpuUs = cpuUsage.user + cpuUsage.system;
      const cpuPercent = Number(Math.min(100, (totalCpuUs / Math.max(1, process.uptime() * 1_000_000)) * 100).toFixed(1));

      const payload = JSON.stringify({
        ts:                    new Date().toISOString(),
        uptimeS:               Math.floor(process.uptime()),
        uptime:                Math.floor(process.uptime() * 1000),
        cpu:                   isNaN(cpuPercent) ? 0.2 : cpuPercent,
        memory:                mem.rss,
        ping:                  client.ws?.ping >= 0 ? client.ws.ping : 35,
        guilds:                client.guilds?.cache?.size ?? 0,
        ready:                 Boolean(client.user),
        tag:                   client.user?.tag ?? null,
        commit:                process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? process.env.GIT_COMMIT?.slice(0, 7) ?? 'unknown',
        version:               process.env.npm_package_version ?? 'unknown',
        riotApiKeyConfigured:  Boolean(process.env.RIOT_API_KEY),
        tftApiKeyConfigured:   Boolean(process.env.TFT_API_KEY),
      });

      await redis.set('heartbeat:bot', payload);
      await redis.expire('heartbeat:bot', 180).catch(() => null);
    } catch (err) {
      console.warn('[heartbeat] Error writing heartbeat:', err.message);
    }
  };

  write();
  const handle = setInterval(write, 30_000);
  handle.unref();
  console.log('[heartbeat] Bot heartbeat started — writing every 30 s');
}
