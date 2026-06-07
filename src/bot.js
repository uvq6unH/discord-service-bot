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

// ── Emoji name → unicode resolver ─────────────────────────────────────────────
// Converts :emoji_name: tokens in a string to their unicode equivalents.
// Covers common emoji used in reminders; unknown names are left unchanged.
const EMOJI_MAP = {
  smile: '😊', grinning: '😀', laughing: '😆', joy: '😂', rofl: '🤣',
  wink: '😉', blush: '😊', heart_eyes: '😍', kissing_heart: '😘',
  yum: '😋', sunglasses: '😎', thinking: '🤔', raised_eyebrow: '🤨',
  neutral_face: '😐', expressionless: '😑', unamused: '😒', roll_eyes: '🙄',
  hushed: '😯', astonished: '😲', flushed: '😳', pleading_face: '🥺',
  cry: '😢', sob: '😭', angry: '😠', rage: '😡', skull: '💀',
  ghost: '👻', alien: '👽', robot: '🤖', poop: '💩', clown: '🤡',
  thumbsup: '👍', thumbsdown: '👎', clap: '👏', wave: '👋',
  raised_hands: '🙌', pray: '🙏', muscle: '💪', point_right: '👉',
  point_left: '👈', point_up: '☝️', point_down: '👇', ok_hand: '👌',
  v: '✌️', crossed_fingers: '🤞', metal: '🤘', call_me_hand: '🤙',
  writing_hand: '✍️', open_hands: '👐', handshake: '🤝',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚',
  blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', white_heart: '🤍',
  broken_heart: '💔', sparkling_heart: '💖', heartbeat: '💓', two_hearts: '💕',
  star: '⭐', star2: '🌟', dizzy: '💫', sparkles: '✨', fire: '🔥',
  tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁',
  trophy: '🏆', medal: '🥇', first_place: '🥇', second_place: '🥈', third_place: '🥉',
  bell: '🔔', no_bell: '🔕', alarm_clock: '⏰', stopwatch: '⏱️',
  calendar: '📅', date: '📅', spiral_calendar: '🗓️',
  memo: '📝', pencil: '✏️', pencil2: '✏️', pen: '🖊️',
  email: '📧', envelope: '✉️', mailbox: '📬', inbox_tray: '📥',
  outbox_tray: '📤', telephone: '☎️', iphone: '📱', computer: '💻',
  desktop_computer: '🖥️', printer: '🖨️', keyboard: '⌨️',
  mag: '🔍', mag_large: '🔎', lock: '🔒', unlock: '🔓', key: '🔑',
  warning: '⚠️', stop_sign: '🛑', no_entry: '⛔', x: '❌', white_check_mark: '✅',
  ballot_box_with_check: '☑️', heavy_check_mark: '✔️', heavy_plus_sign: '➕',
  heavy_minus_sign: '➖', question: '❓', grey_question: '❔',
  exclamation: '❗', grey_exclamation: '❕', bangbang: '‼️',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️',
  repeat: '🔁', repeat_one: '🔂', arrows_counterclockwise: '🔄',
  information_source: 'ℹ️', new: '🆕', up: '🆙', cool: '🆒', free: '🆓',
  sos: '🆘', ok: '🆗', ng: '🆖', id: '🆔',
  sun: '☀️', moon: '🌙', cloud: '☁️', snowflake: '❄️', umbrella: '☂️',
  rainbow: '🌈', zap: '⚡', ocean: '🌊', earth_asia: '🌏',
  cat: '🐱', dog: '🐶', fox_face: '🦊', bear: '🐻', panda_face: '🐼',
  pizza: '🍕', hamburger: '🍔', fries: '🍟', sushi: '🍣', ramen: '🍜',
  cake: '🎂', coffee: '☕', tea: '🍵', beer: '🍺', wine_glass: '🍷',
  soccer: '⚽', basketball: '🏀', football: '🏈', tennis: '🎾', golf: '⛳',
  video_game: '🎮', joystick: '🕹️', dice: '🎲', chess_pawn: '♟️',
  musical_note: '🎵', notes: '🎶', microphone: '🎤', headphones: '🎧',
  guitar: '🎸', drum: '🥁', trumpet: '🎺', violin: '🎻',
  house: '🏠', office: '🏢', school: '🏫', hospital: '🏥',
  car: '🚗', bus: '🚌', train: '🚆', airplane: '✈️', rocket: '🚀',
  moneybag: '💰', dollar: '💵', euro: '💶', gem: '💎',
  100: '💯', infinity: '♾️', recycle: '♻️', white_flag: '🏳️', crossed_flags: '🎌',
};

/**
 * Replaces :emoji_name: tokens in a string with their unicode equivalents.
 * Tries guild custom emojis first, then falls back to EMOJI_MAP.
 * Unknown names are left as-is (e.g. :lui2: stays if not found).
 */
function resolveEmojiNames(text, guild = null) {
  if (!text) return text;
  return text.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
    // 1. Try guild custom emoji (case-insensitive)
    if (guild) {
      const custom = guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
      if (custom) return custom.toString(); // renders as <:name:id> or <a:name:id>
    }
    // 2. Fallback to static unicode map
    return EMOJI_MAP[name] ?? match;
  });
}

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
import { handleMusicCommand } from './bot/commands/handlers/music.js';
import { initLavalink, forwardVoiceEvent } from './bot/music/lavalink.js';

const commandCooldowns = new CommandCooldowns();

export function createBot(configStore, stateStore) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
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

      // 1b. Init Lavalink manager (must run after client is ready)
      await initLavalink(readyClient).catch(err =>
        console.error('[bot] Failed to init Lavalink:', err.message)
      );

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
      // 4. Start reminder worker
      setInterval(async () => {
        const now = new Date();
        const guildIds = await configStore.listGuildIds();
        for (const guildId of guildIds) {
          try {
            const config = await configStore.getGuildConfig(guildId);
            if (!config.enabled || !config.remindersEnabled || !config.reminders?.length) continue;

            let modified = false;
            const nextReminders = [];
            for (const reminder of config.reminders) {
              const time = new Date(reminder.time);
              if (!isNaN(time) && time <= now) {
                modified = true;
                const guild = await readyClient.guilds.fetch(guildId).catch(() => null);
                if (guild) {
                  const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
                  if (channel?.isTextBased()) {
                    // Support both legacy userId and new userIds array
                    const ids = Array.isArray(reminder.userIds) && reminder.userIds.length
                      ? reminder.userIds
                      : (reminder.userId ? [reminder.userId] : []);
                    const mentions = ids.map(id => `<@${id}>`).join(' ');
                    const repeatLabel = { hourly: ' 🔁 (mỗi giờ)', daily: ' 🔁 (mỗi ngày)', weekly: ' 🔁 (mỗi tuần)' }[reminder.repeat] ?? '';
                    const resolvedMessage = resolveEmojiNames(reminder.message, guild);
                    await channel.send(`${mentions} ${resolvedMessage}${repeatLabel}`).catch(() => null);
                  }
                }
                // ── Reschedule if repeat is set ──
                const repeat = reminder.repeat || 'none';
                if (repeat !== 'none') {
                  const intervals = { hourly: 60 * 60 * 1000, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
                  const ms = intervals[repeat];
                  if (ms) {
                    // Advance time by N intervals so next fire is always in the future
                    let nextTime = time.getTime() + ms;
                    while (nextTime <= now.getTime()) nextTime += ms;
                    const nextTimeStr = new Date(nextTime).toISOString();
                    nextReminders.push({ ...reminder, time: nextTimeStr });
                  }
                }
                // If repeat === 'none', we don't push → reminder is consumed and removed
              } else {
                nextReminders.push(reminder);
              }
            }
            if (modified) {
              await configStore.updateGuildConfig(guildId, { reminders: nextReminders });
            }
          } catch (err) {
            console.error(`[reminder] Error processing guild ${guildId}:`, err.message);
          }
        }
      }, 60 * 1000).unref();
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

  // ── Lavalink: forward raw voice gateway events ─────────────────────────────
  // Lavalink needs VOICE_STATE_UPDATE and VOICE_SERVER_UPDATE to manage
  // voice connections. discord.js does not expose these as typed events,
  // so we listen on the raw packet stream.
  client.on(Events.Raw, (packet) => {
    if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
      forwardVoiceEvent(packet, '0');
    }
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

      // ── Mention react ────────────────────────────────────────────────────
      // Chạy trước mọi early-return để mention luôn được xử lý
      if (config.mentionReactEnabled && config.mentionReactEmoji) {
        const botId = client.user.id;
        const botRoles = message.guild.members.me?.roles.cache;
        const mentionedBot =
          message.mentions.users.has(botId) ||
          content.includes(`<@${botId}>`) ||
          content.includes(`<@!${botId}>`);
        const mentionedViaRole = botRoles
          ? message.mentions.roles.some((r) => botRoles.has(r.id))
          : false;
        if (mentionedBot || mentionedViaRole) {
          const resolveEmoji = (raw, guild) => {
            const s = raw.trim();
            if (/^<a?:\w+:\d+>$/.test(s)) return s;
            const name = s.replace(/^:(.+):$/, '$1');
            const found = guild.emojis.cache.find(
              (e) => e.name.toLowerCase() === name.toLowerCase()
            );
            return found ?? s;
          };
          const emoji = resolveEmoji(config.mentionReactEmoji, message.guild);
          await message.react(emoji).catch((err) => {
            console.error('[mention-react] Failed:', err.message, '| raw:', config.mentionReactEmoji);
          });
        }
      }

      // ── Music prefix ───────────────────────────────────────────────────────
      if (config.musicEnabled !== false) { // default true nếu chưa có trong config
        const mPrefix = (config.musicPrefix || 'hb').toLowerCase();
        const lc = content.toLowerCase();
        if (lc === mPrefix || lc.startsWith(mPrefix + ' ')) {
          const musicBody = content.slice(mPrefix.length).trim();
          const [subcommand, ...musicArgParts] = musicBody.split(/\s+/);
          await handleMusicCommand({
            message,
            subcommand: (subcommand || '').toLowerCase(),
            args: musicArgParts.join(' '),
            config
          });
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

  return client;
}

// ── Self-ping keepalive (export riêng) ────────────────────────────────────────
// Render free tier spin down sau 15 phút không có HTTP traffic.
// Gọi startKeepalive() từ entry point SAU KHI HTTP server đã listen.
// index.js (monolith) gọi nó. index.bot.js KHÔNG gọi vì không có HTTP server.
export function startKeepalive(port = process.env.PORT ?? 10000) {
  const INTERVAL_MS = 5 * 60 * 1000;
  const RETRY_DELAY_MS = 10_000;
  const MAX_RETRIES = 3;

  async function ping(attempt = 1) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      console.log(`[keepalive] /health → ${res.status}, uptime ${Math.floor(process.uptime())}s`);
      if (!res.ok && attempt < MAX_RETRIES) {
        setTimeout(() => ping(attempt + 1), RETRY_DELAY_MS);
      }
    } catch (err) {
      console.warn(`[keepalive] attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        setTimeout(() => ping(attempt + 1), RETRY_DELAY_MS);
      }
    }
  }

  const handle = setInterval(() => ping(), INTERVAL_MS);
  handle.unref();
  console.log(`[keepalive] Started — pinging /health every ${INTERVAL_MS / 60000} min on port ${port}`);
  return handle;
}