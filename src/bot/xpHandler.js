/**
 * xpHandler.js — XP tracking cho MessageCreate events.
 *
 * In-memory cache với prune interval để tránh Redis read mỗi tin nhắn.
 * Tách ra khỏi bot.js để MessageCreate handler gọn hơn.
 */

const XP_COOLDOWN_MS = 60_000;

// Key: `${guildId}:${userId}`, Value: timestamp của lần XP cuối
const xpCache = new Map();

// Prune định kỳ để không leak memory trên instance chạy lâu
const _pruneHandle = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of xpCache.entries()) {
    if (now - ts >= XP_COOLDOWN_MS) xpCache.delete(key);
  }
}, 5 * 60_000);
_pruneHandle.unref();

/**
 * Xử lý XP cho một tin nhắn.
 * Trả về true nếu đã grant XP (không bị cooldown), false nếu bị throttle.
 *
 * @param {import('discord.js').Message} message
 * @param {object} config
 * @param {import('../stateStore.js').StateStore} stateStore
 */
export async function handleXp(message, config, stateStore) {
  if (!config.levelsEnabled) return false;

  const xpKey  = `${message.guild.id}:${message.author.id}`;
  const lastXp = xpCache.get(xpKey) ?? 0;
  if (Date.now() - lastXp < XP_COOLDOWN_MS) return false;

  xpCache.set(xpKey, Date.now());

  const rank = await stateStore.addXp(
    message.guild.id,
    message.author.id,
    config.xpPerMessage,
    config.xpBase,
    config.xpExponent
  );
  if (rank.leveledUp && config.levelUpAnnouncementEnabled !== false) {
    const levelMessage = config.levelUpMessage
      .replaceAll('{user}',     `<@${message.author.id}>`)
      .replaceAll('{username}', message.author.username)
      .replaceAll('{level}',    String(rank.level))
      .replaceAll('{xp}',       String(rank.xp));

    let targetChannel = message.channel;
    if (config.levelUpAnnouncementChannelId) {
      const channel = message.guild.channels.cache.get(config.levelUpAnnouncementChannelId);
      if (channel && channel.isTextBased()) {
        targetChannel = channel;
      }
    }
    await targetChannel.send(levelMessage).catch(() => null);
  }

  return true;
}
