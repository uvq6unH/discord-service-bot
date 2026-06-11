/**
 * autoMod.js — AutoMod + mention-react middleware.
 *
 * Tách ra khỏi bot.js để MessageCreate handler dễ đọc hơn.
 * Mỗi hàm trả về `true` nếu đã xử lý (caller nên return sớm).
 */

import { PermissionFlagsBits } from 'discord.js';
import { renderCommandResponse } from './responses.js';
import { sendLog } from './logging.js';

/**
 * Kiểm tra và xử lý automod (bad words + anti-link).
 * @returns {boolean} true nếu tin nhắn bị block (caller nên return)
 */
export async function runAutoMod(message, config, client) {
  if (!config.autoModEnabled) return false;
  if (message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return false;

  const content      = message.content.trim();
  const lowerContent = content.toLowerCase();
  const hasBadWord   = config.badWords.some((w) => lowerContent.includes(w.toLowerCase()));
  // Anti-link: bỏ qua nếu user có ManageMessages (đã check ở trên) hoặc có quyền embed links.
  // Regex chỉ match URL có domain thực (tránh false-positive với "https://" bare không có domain).
  const hasBlockedLink = config.antiLinkEnabled && /https?:\/\/\S+\.\S+|discord\.gg\/\S+/i.test(content);

  if (!hasBadWord && !hasBlockedLink) return false;

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
      userId:    message.author.id,
      username:  message.author.username,
    },
  });
  await message.channel.send(blocked).catch(() => null);
  await sendLog(
    message.guild,
    config,
    `AutoMod blocked ${message.author.tag}: ${hasBlockedLink ? 'link' : 'bad word'}`
  );
  return true;
}

/**
 * Phản ứng emoji khi bot bị mention.
 * Không trả về boolean vì không cần return sớm — luôn fall-through.
 */
export async function runMentionReact(message, config, client) {
  if (!config.mentionReactEnabled || !config.mentionReactEmoji) return;

  const botId  = client.user.id;
  const content = message.content;
  const botRoles = message.guild.members.me?.roles.cache;

  const mentionedBot =
    message.mentions.users.has(botId) ||
    content.includes(`<@${botId}>`) ||
    content.includes(`<@!${botId}>`);
  const mentionedViaRole = botRoles
    ? message.mentions.roles.some((r) => botRoles.has(r.id))
    : false;

  if (!mentionedBot && !mentionedViaRole) return;

  const resolveEmoji = (raw, guild) => {
    const s = raw.trim();
    if (/^<a?:\w+:\d+>$/.test(s)) return s;
    const name  = s.replace(/^:(.+):$/, '$1');
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
