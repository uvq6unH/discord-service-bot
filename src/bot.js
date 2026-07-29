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
  ActivityType,
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
import { startEsportsWorker }                  from './bot/esportsWorker.js';
import { handleVoiceStateUpdate }             from './bot/tempVoice.js';
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
    let fetchedChannels;
    try {
      fetchedChannels = await guild.channels.fetch();
    } catch (err) {
      fetchedChannels = guild.channels.cache;
    }
    const channels = [...fetchedChannels.values()].map((c) => ({ id: c.id, name: c.name, type: c.type }));

    let fetchedRoles;
    try {
      fetchedRoles = await guild.roles.fetch();
    } catch (err) {
      fetchedRoles = guild.roles.cache;
    }

    const roles = fetchedRoles
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
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
      Partials.User
    ],
  });
  client.stateStore = stateStore;
  client.configStore = configStore;

  // ── Reaction Roles (Add & Remove) ──────────────────────────────────────────────
  const handleReactionRoleToggle = async (reaction, user, isAdd) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const guildId = reaction.message.guildId;
      if (!guildId) return;

      const config = await configStore.getGuildConfig(guildId).catch(() => null);
      if (!config || !config.rolesEnabled) return;

      const panels = config.selfRolePanels ?? [];
      const legacyRoles = config.selfRoles ?? [];
      const allRoles = panels.flatMap(p => p.roles ?? []).concat(legacyRoles);

      const emojiName = reaction.emoji.name;
      const emojiId = reaction.emoji.id;

      const matchedRole = allRoles.find(r => {
        if (!r.roleId) return false;
        if (!r.emoji) return false;
        const clean = r.emoji.trim();
        if (clean === emojiName) return true;
        if (clean.includes(':')) {
          const parts = clean.split(':');
          const lastPart = parts[parts.length - 1].replace('>', '');
          if (lastPart === emojiId || lastPart === emojiName) return true;
        }
        return false;
      });

      if (!matchedRole) return;

      const guild = reaction.message.guild;
      if (!guild) return;
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      if (isAdd) {
        if (!member.roles.cache.has(matchedRole.roleId)) {
          await member.roles.add(matchedRole.roleId).catch(err => console.error(`[reaction-role] Error adding role ${matchedRole.roleId}:`, err.message));
        }
      } else {
        if (member.roles.cache.has(matchedRole.roleId)) {
          await member.roles.remove(matchedRole.roleId).catch(err => console.error(`[reaction-role] Error removing role ${matchedRole.roleId}:`, err.message));
        }
      }
    } catch (err) {
      console.error('[reaction-role] Error handling reaction toggle:', err.message);
    }
  };

  client.on(Events.MessageReactionAdd, (reaction, user) => handleReactionRoleToggle(reaction, user, true));
  client.on(Events.MessageReactionRemove, (reaction, user) => handleReactionRoleToggle(reaction, user, false));

  // ── ClientReady ─────────────────────────────────────────────────────────────
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);
    _startHeartbeat(readyClient, redis);
    _updatePresence(readyClient);

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
      startEsportsWorker(readyClient, configStore, redis);
      _startEventQueueWorker(readyClient, configStore, redis);

    })().catch((err) => console.error('[bot] Startup error:', err));
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState, configStore, redis).catch((err) =>
      console.error('[tempVoice] Event error:', err.message)
    );
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
  const builtInCommandsMap = new Map();
  const builtInSources = [
    ...(defaultConfig.core?.commands || []),
    ...(defaultConfig.moderation?.commands || []),
    ...(defaultConfig.levels?.commands || []),
    ...(defaultConfig.economy?.commands || []),
    ...(defaultConfig.riot?.commands || [])
  ];
  for (const cmd of builtInSources) {
    if (cmd.name) builtInCommandsMap.set(cmd.name, { ...cmd, enabled: true });
  }

  client.syncGlobalCommands = async () => {
    const allCommands = [...builtInCommandsMap.values()];
    const commands = buildSlashCommands({ commands: allCommands });
    const validCommands = commands.filter((cmd) => {
      if (!cmd.name || cmd.name.length > 32) {
        console.warn(`[sync-global] Skipping invalid command name: "${cmd.name}"`);
        return false;
      }
      if (!cmd.description || cmd.description.length > 100) {
        cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
      }
      return true;
    });

    await client.application.commands.set(validCommands);
    return { synced: true, count: validCommands.length };
  };

  client.syncGuildCommands = async (guildId, config) => {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return { synced: false, reason: 'guild_not_found' };

    // Guild-specific commands ONLY for custom commands not already registered globally
    const customCommands = (config?.commands || []).filter(cmd => cmd.enabled && cmd.name && !builtInCommandsMap.has(cmd.name));

    if (customCommands.length > 0) {
      const commands = buildSlashCommands({ commands: customCommands });
      const validCommands = commands.filter((cmd) => {
        if (!cmd.name || cmd.name.length > 32) {
          console.warn(`[sync-guild] Skipping invalid custom command name: "${cmd.name}"`);
          return false;
        }
        if (!cmd.description || cmd.description.length > 100) {
          cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
        }
        return true;
      });
      await guild.commands.set(validCommands);
      return { synced: true, count: validCommands.length };
    } else {
      // Clear all guild-level duplicate commands so Discord ONLY displays Global commands!
      await guild.commands.set([]);
      return { synced: true, count: 0 };
    }
  };

  // ── Guild cache: refresh on join / update ───────────────────────────────────
  client.on(Events.GuildCreate, async (guild) => {
    console.log(`[bot] Joined guild: ${guild.name} (${guild.id})`);
    if (redis) {
      await writeGuildCache(guild, redis).catch(err => console.error(`[bot] Error caching new guild ${guild.id}:`, err.message));
    }
    
    // Auto-initialize config for new guild
    try {
      await configStore.getGuildConfig(guild.id);
    } catch (err) {
      console.error(`[bot] Error initializing config for guild ${guild.id}:`, err.message);
    }

    // Auto-register slash commands for newly joined server
    try {
      const res = await registerGuildCommands(guild);
      console.log(`[bot] Registered ${res.count} slash commands for new guild "${guild.name}" (${guild.id})`);
    } catch (err) {
      console.error(`[bot] Error syncing commands for new guild "${guild.name}":`, err.message);
    }

    _updatePresence(client);
  });
  client.on(Events.GuildDelete, async (guild) => {
    console.log(`[bot] Left or deleted guild: ${guild.name} (${guild.id})`);
    if (redis) {
      await redis.del(`guild_cache:${guild.id}`).catch(() => null);
      await redis.del(`guild_cache:${guild.id}:members`).catch(() => null);
    }
    _updatePresence(client);
  });
  client.on(Events.GuildUpdate, async (_old, newGuild) => {
    if (redis) await writeGuildCache(newGuild, redis).catch(err => console.error(`[bot] Error updating guild cache:`, err.message));
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
        configStore,
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

          await runBuiltInCommand({ client, config, configStore, command, source: message, args: argParts.join(' ') });
          return;
        }
        // Unknown prefix → fall through to XP + autoReply
      }

      // 5. XP (với in-memory cooldown)
      await handleXp(message, config, stateStore);

      // 6. AutoReply
      const isAutoReplyActive = (config.autoReplyEnabled !== false || (Array.isArray(config.autoReplies) && config.autoReplies.length > 0));
      if (isAutoReplyActive && Array.isArray(config.autoReplies) && config.autoReplies.length > 0) {
        const lowerContent = content.toLowerCase();
        const match = config.autoReplies.find((r) => r.keyword && lowerContent.includes(r.keyword.toLowerCase()));
        if (match) {
          await message.reply({
            content: sanitizeAnnouncementText(match.response),
            allowedMentions: { parse: [] },
          }).catch(() => null);
        }
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

function _startEventQueueWorker(client, configStore, redis) {
  if (!redis) return;

  const EVENT_QUEUE = 'event_queue';
  const LEGACY_SLASH_SYNC_QUEUE = 'slash_sync_queue';
  const MAX_RETRIES = 3;
  let isRunning = true;

  const processJob = async (job) => {
    if (!job || typeof job !== 'object') return;
    const type = job.type || 'sync_commands';
    const guildId = job.guildId;

    if (type === 'sync_commands') {
      if (!guildId) return;
      const config = await configStore.getGuildConfig(guildId).catch(() => null);
      if (!config) return;

      try {
        const result = await client.syncGuildCommands(guildId, config);
        redis.incr('stats:slash_sync_processed').catch(() => null);
        console.log(`[event-queue] Synced commands for ${guildId}:`, result);
      } catch (err) {
        const retries = job.retries || 0;
        if (retries < MAX_RETRIES) {
          await redis.rpush(EVENT_QUEUE, JSON.stringify({
            ...job,
            retries: retries + 1,
            lastError: err.message,
            retriedAt: new Date().toISOString(),
          }));
          console.warn(`[event-queue] Retry ${retries + 1}/${MAX_RETRIES} for ${guildId}: ${err.message}`);
        } else {
          console.error(`[event-queue] Giving up on ${guildId} after ${MAX_RETRIES} retries: ${err.message}`);
          redis.incr('stats:slash_sync_failed').catch(() => null);
        }
      }
    } else if (type === 'refresh_guild') {
      if (!guildId) return;
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        await writeGuildCache(guild, redis).catch(() => null);
        console.log(`[event-queue] Refreshed guild cache for ${guildId}`);
      }
    } else if (type === 'purge_sessions') {
      await stateStore.purgeStaleGameSessions().catch(() => null);
      console.log('[event-queue] Purged stale game sessions');
    } else if (type === 'esports_test_notify') {
      if (!guildId || !job.channelId) return;
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      const channel = guild.channels.cache.get(job.channelId);
      if (!channel || !channel.isTextBased()) return;

      const { EmbedBuilder } = await import('discord.js');
      const nowSec = Math.floor(Date.now() / 1000);
      const match1Time = `<t:${nowSec}:t>`;
      const match1Rel = `<t:${nowSec}:R>`;
      const match2Time = `<t:${nowSec + 7200}:t>`;
      const match2Rel = `<t:${nowSec + 7200}:R>`;

      const embed1 = new EmbedBuilder()
        .setTitle('🇰🇷 LCK KOREA 2026 — TRẬN 1')
        .setDescription(
          `⚔️ **T1** 🆚 **Gen.G Esports**\n\n` +
          `⏰ **Thời gian:** ${match1Time} (${match1Rel})\n` +
          `🎮 **Thể thức:** \`BO3\` | 🔴 **TRỰC TIẾP**`
        )
        .setThumbnail('http://static.lolesports.com/leagues/lck-color-on-black.png')
        .setColor(0xFF4655);

      const embedResult = new EmbedBuilder()
        .setTitle('🏆 KẾT QUẢ THI ĐẤU — 🇰🇷 LCK KOREA')
        .setDescription(
          `### 🇰🇷 **T1** [ **2** ] 🆚 [ **1** ] **Gen.G Esports**\n\n` +
          `> 🏆 **CHIẾN THẮNG:** **T1**\n` +
          `> ⏰ **Thời gian:** ${match1Time}\n` +
          `> 🎮 **Thể thức:** \`BO3\` | 🏁 **KẾT THÚC**`
        )
        .setThumbnail('http://static.lolesports.com/leagues/lck-color-on-black.png')
        .setColor(0x00FF88)
        .setFooter({ text: 'Riot Games LoL Esports Pipeline • Real-time Test Result' })
        .setTimestamp();

      await channel.send({
        content: '🧪 **[TEST ESPORTS NOTIFICATION & MATCH RESULT]**',
        embeds: [embed1, embedResult]
      }).catch((err) => console.error('[esportsTest] Error sending test alert:', err.message));
    } else if (type === 'post_selfrole_panel') {
      if (!guildId || !job.panelId) return;
      const config = await configStore.getGuildConfig(guildId).catch(() => null);
      if (!config) return;
      const panels = config.selfRolePanels ?? [];
      const panel = panels.find(p => p.id === job.panelId);
      if (!panel || !panel.channelId || !panel.roles || panel.roles.length === 0) return;

      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      const channel = guild.channels.cache.get(panel.channelId) || await guild.channels.fetch(panel.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const { EmbedBuilder } = await import('discord.js');
      const colorInt = Number.parseInt((panel.color || '#5865F2').replace('#', ''), 16) || 0x5865F2;

      // Build ultra-premium formatted role list text
      const rolesListText = (panel.roles ?? []).map(r => {
        const emojiStr = r.emoji && r.emoji.trim() ? `${r.emoji.trim()} ` : '🔹 ';
        const roleMention = r.roleId ? `<@&${r.roleId}>` : r.label;
        const labelStr = r.label && r.label !== r.roleId ? `  •  \`${r.label.toUpperCase()}\`` : '';
        return `> ${emojiStr}┊ ${roleMention}${labelStr}`;
      }).join('\n');

      const divider = '✦ ───────────────────────────── ✦';

      const fullDescription = [
        panel.description ? `> 📜 *${panel.description}*` : '',
        '',
        divider,
        `### 📌 **DANH SÁCH ROLE & REACTION:**`,
        rolesListText || '> *Chưa cấu hình Role nào*',
        divider,
      ].filter(Boolean).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(panel.title ? `🎮 ║ ${panel.title.toUpperCase()}` : '🎮 ║ SELF ROLE SELECTOR')
        .setDescription(fullDescription)
        .setColor(colorInt)
        .setFooter({
          text: '💡 Thả cảm xúc bên dưới để nhận Role • Gỡ cảm xúc để hủy Role',
          iconURL: guild?.iconURL({ size: 64 }) ?? undefined
        })
        .setTimestamp();

      if (panel.thumbnailUrl) {
        embed.setThumbnail(panel.thumbnailUrl);
      }
      if (panel.imageUrl) {
        embed.setImage(panel.imageUrl);
      }

      try {
        const msg = await channel.send({ embeds: [embed] });
        console.log(`[event-queue] Posted reaction self-role panel "${panel.title}" to ${panel.channelId}`);

        // React with each configured emoji
        for (const r of panel.roles) {
          if (r.emoji && r.emoji.trim()) {
            await msg.react(r.emoji.trim()).catch(err => console.warn(`[reaction-role] Failed to react ${r.emoji}:`, err.message));
          }
        }
      } catch (err) {
        console.error('[event-queue] Error posting reaction selfrole panel:', err.message);
      }
    }
  };

  const loop = async () => {
    while (isRunning) {
      try {
        let raw = await redis.lpop(EVENT_QUEUE).catch(() => null);

        if (!raw) {
          raw = await redis.lpop(LEGACY_SLASH_SYNC_QUEUE).catch(() => null);
        }

        if (raw) {
          let job;
          try {
            job = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch {
            job = null;
          }
          if (job) {
            await processJob(job);
          }
          await new Promise(resolve => setImmediate(resolve));
        } else {
          // Optimized idle sleep 15s — reduces Upstash REST requests down to ~5,700/day
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      } catch (err) {
        console.error('[event-queue] Worker error:', err.message);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  };

  loop();
  console.log('[event-queue] Unified Real-time IPC Worker started (BLPOP / Fast-drain active)');

  return () => { isRunning = false; };
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

      // Periodically sync global bot presence from Redis if available
      try {
        const [dbText, dbType, dbStreamUrl] = await redis.mget(
          'config:global:bot_status_text',
          'config:global:bot_status_type',
          'config:global:bot_status_stream_url'
        ).catch(() => [null, null, null]);
        if (dbText !== null) process.env.BOT_STATUS_TEXT = dbText;
        if (dbType !== null) process.env.BOT_STATUS_TYPE = dbType;
        if (dbStreamUrl !== null) process.env.BOT_STATUS_STREAM_URL = dbStreamUrl;
        _updatePresence(client);
      } catch (err) {
        console.warn('[heartbeat-presence] Error syncing bot status from Redis:', err.message);
      }
    } catch (err) {
      console.warn('[heartbeat] Error writing heartbeat:', err.message);
    }
  };

  write();
  const handle = setInterval(write, 60_000);
  handle.unref();
  console.log('[heartbeat] Bot heartbeat started — writing every 60 s');
}

function _updatePresence(client) {
  try {
    const guildsCount = client.guilds?.cache?.size ?? 0;
    let usersCount = 0;
    try {
      usersCount = client.guilds?.cache?.reduce((acc, g) => acc + (g.memberCount || 0), 0) ?? 0;
    } catch {}

    const ping = Math.round(client.ws?.ping >= 0 ? client.ws.ping : 35);
    const uptimeMs = client.uptime || (process.uptime() * 1000);
    const s = Math.floor(uptimeMs / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const uptimeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

    const rawText = process.env.BOT_STATUS_TEXT || '/help | {guilds} servers';
    const statusText = rawText
      .replace(/\{guilds\}/gi, guildsCount)
      .replace(/\{servers\}/gi, guildsCount)
      .replace(/\{users\}/gi, usersCount.toLocaleString())
      .replace(/\{members\}/gi, usersCount.toLocaleString())
      .replace(/\{ping\}/gi, `${ping}ms`)
      .replace(/\{uptime\}/gi, uptimeStr)
      .replace(/\{prefix\}/gi, '!');

    const rawType = (process.env.BOT_STATUS_TYPE || 'PLAYING').toUpperCase();
    let activityType = ActivityType.Playing;
    if (rawType === 'STREAMING') activityType = ActivityType.Streaming;
    else if (rawType === 'LISTENING') activityType = ActivityType.Listening;
    else if (rawType === 'WATCHING') activityType = ActivityType.Watching;
    else if (rawType === 'COMPETING') activityType = ActivityType.Competing;

    client.user.setPresence({
      activities: [{
        name: statusText,
        type: activityType,
        url: rawType === 'STREAMING' ? (process.env.BOT_STATUS_STREAM_URL || 'https://www.twitch.tv/discord') : undefined
      }],
      status: 'online'
    });
    console.log(`[bot] Presence updated: ${rawType} "${statusText}"`);
  } catch (err) {
    console.error('[bot] Failed to set presence:', err.message);
  }
}

