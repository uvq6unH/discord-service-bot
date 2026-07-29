import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

export const groupMap = {
  // Core & Utility Domain
  ping: 'core',
  help: 'core',
  config: 'core',
  system: 'core',
  info: 'core',
  server: 'core',
  user: 'core',
  avatar: 'core',
  say: 'core',
  announce: 'core',
  embed: 'core',
  poll: 'core',
  custom: 'core',

  // Moderation Domain
  warn: 'moderation',
  kick: 'moderation',
  ban: 'moderation',
  timeout: 'moderation',
  mute: 'moderation',
  unmute: 'moderation',
  purge: 'moderation',
  warnings: 'moderation',
  clearwarns: 'moderation',
  rolepanel: 'moderation',
  ticketpanel: 'moderation',

  // Members & XP Levels Domain
  rank: 'levels',
  leaderboard: 'levels',
  profile: 'levels',
  roles: 'levels',

  // Economy & Minigames Domain
  balance: 'economy',
  daily: 'economy',
  pay: 'economy',
  work: 'economy',
  economyleaderboard: 'economy',
  ecoadd: 'economy',
  ecoset: 'economy',
  ecoremove: 'economy',
  blackjack: 'economy',
  poker: 'economy',
  coinflip: 'economy',
  dice: 'economy',
  slots: 'economy',

  // Riot Games & Esports Domain
  lsd: 'riot',
  lolprofile: 'riot',
  lolmatch: 'riot',
  lolchamp: 'riot',
  lolitem: 'riot',
  lolrunes: 'riot',
  lolpatch: 'riot',
  lollink: 'riot',
  lolunlink: 'riot',
  tftlsd: 'riot',
  tftprofile: 'riot',
  tftmatch: 'riot',
  tftlink: 'riot',
  tftunlink: 'riot',
  esports: 'riot',
  lck: 'riot',
  lcp: 'riot',
  lpl: 'riot',
  lec: 'riot',
  lcs: 'riot',

  // Music & Voice Domain
  play: 'music',
  skip: 'music',
  stop: 'music',
  queue: 'music',
  volume: 'music',
  nowplaying: 'music',
  pause: 'music',
  resume: 'music',
  tempvc: 'music',

  // Reminders & AI Services Domain
  remind: 'services',
  reminders: 'services',
  ask: 'services',
  ai: 'services',
  draw: 'services'
};

const groupMetadata = {
  core: {
    title: '⚙️ ║ HỆ THỐNG & TIỆN ÍCH',
    description: 'Các lệnh cấu hình hệ thống, kiểm tra bot, hiển thị thông tin máy chủ và công cụ tiện ích.'
  },
  moderation: {
    title: '🛡️ ║ QUẢN LÝ & KIỂM DUYỆT',
    description: 'Các lệnh cấm, kích, dọn dẹp tin nhắn, cảnh cáo thành viên và cài đặt bảng Self-Role.'
  },
  levels: {
    title: '👤 ║ THÀNH VIÊN & CẤP ĐỘ',
    description: 'Các lệnh xem thẻ thông tin cá nhân, cấp độ kinh nghiệm (XP) và bảng xếp hạng thành viên.'
  },
  economy: {
    title: '💰 ║ KINH TẾ & TRÒ CHƠI',
    description: 'Các lệnh ví tiền, điểm danh hàng ngày, chuyển tiền và mini-games (Blackjack, Poker, Slots, Coinflip).'
  },
  riot: {
    title: '⚔️ ║ LEAGUE OF LEGENDS & ESPORTS',
    description: 'Tra cứu lịch sử đấu LoL/ĐTCL, thông tin tướng, bảng ngọc và cập nhật lịch thi đấu LCK, LCP, Worlds, MSI.'
  },
  music: {
    title: '🎶 ║ ÂM NHẠC & KÊNH THOẠI',
    description: 'Các lệnh phát nhạc trực tiếp (YouTube, Spotify, Soundcloud) và tạo kênh voice tự động VoiceMaster.'
  },
  services: {
    title: '⏰ ║ NHẮC NHỞ & TRÍ TUỆ AI',
    description: 'Các lệnh đặt lịch hẹn giờ nhắc nhở tự động và trò chuyện trợ lý ảo trí tuệ nhân tạo (AI).'
  }
};

export async function buildHelpPayload(client, config, guild, userId, selectedGroup = null) {
  const guildCommands = await guild.commands.fetch().catch(() => new Map());
  const cmdMap = new Map();
  for (const cmd of guildCommands.values()) {
    cmdMap.set(cmd.name, cmd.id);
  }

  const prefix = config.prefix || '/';

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`help_select:${userId}`)
    .setPlaceholder('Chọn danh mục câu lệnh...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Hệ Thống & Tiện Ích')
        .setValue('help_group:core')
        .setDescription('Lệnh cấu hình, thông tin server, tiện ích')
        .setEmoji('⚙️')
        .setDefault(selectedGroup === 'core'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Quản Lý & Kiểm Duyệt')
        .setValue('help_group:moderation')
        .setDescription('Ban, kick, dọn tin nhắn, cảnh cáo, self-role')
        .setEmoji('🛡️')
        .setDefault(selectedGroup === 'moderation'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Thành Viên & Cấp Độ')
        .setValue('help_group:levels')
        .setDescription('Hồ sơ cá nhân, cấp độ XP, bảng xếp hạng')
        .setEmoji('👤')
        .setDefault(selectedGroup === 'levels'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Kinh Tế & Trò Chơi')
        .setValue('help_group:economy')
        .setDescription('Ví tiền, điểm danh, Blackjack, Poker, Slots')
        .setEmoji('💰')
        .setDefault(selectedGroup === 'economy'),
      new StringSelectMenuOptionBuilder()
        .setLabel('League of Legends & Esports')
        .setValue('help_group:riot')
        .setDescription('Tra cứu LoL, ĐTCL, lịch thi đấu LCK, LCP, Worlds')
        .setEmoji('⚔️')
        .setDefault(selectedGroup === 'riot'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Âm Nhạc & Kênh Thoại')
        .setValue('help_group:music')
        .setDescription('Phát nhạc High Quality, kênh voice tự động')
        .setEmoji('🎶')
        .setDefault(selectedGroup === 'music'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Nhắc Nhở & Trí Tuệ AI')
        .setValue('help_group:services')
        .setDescription('Hẹn giờ nhắc nhở, trợ lý trí tuệ nhân tạo AI')
        .setEmoji('⏰')
        .setDefault(selectedGroup === 'services')
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setThumbnail(guild.iconURL({ size: 256 }) || client.user.displayAvatarURL());

  if (!selectedGroup) {
    embed.setTitle(`🎮 ║ HƯỚNG DẪN SỬ DỤNG BOT — ${guild.name.toUpperCase()}`)
      .setDescription(
        `> 📜 *Chào mừng bạn đến với bảng hướng dẫn! Tiền tố mặc định của máy chủ là \`${prefix}\`.*\n\n` +
        `✦ ───────────────────────────── ✦\n` +
        `### 📌 **DANH MỤC CÂU LỆNH HỆ THỐNG:**\n` +
        `• ⚙️ **Hệ Thống & Tiện Ích**: Các lệnh cấu hình, thông tin máy chủ, công cụ.\n` +
        `• 🛡️ **Quản Lý & Kiểm Duyệt**: Ban, kick, dọn tin nhắn, cảnh cáo, self-role.\n` +
        `• 👤 **Thành Viên & Cấp Độ**: Thẻ cá nhân, bảng xếp hạng XP, danh sách vai trò.\n` +
        `• 💰 **Kinh Tế & Trò Chơi**: Ví tiền, điểm danh, Blackjack, Poker, Slots.\n` +
        `• ⚔️ **League of Legends & Esports**: Tra cứu LoL/ĐTCL, lịch đấu LCK, LCP, Worlds.\n` +
        `• 🎶 **Âm Nhạc & Kênh Thoại**: Phát nhạc YouTube/Spotify, kênh voice tự động.\n` +
        `• ⏰ **Nhắc Nhở & Trí Tuệ AI**: Đặt hẹn giờ nhắc nhở, trò chuyện trợ lý AI.\n` +
        `✦ ───────────────────────────── ✦`
      )
      .setFooter({ text: '💡 Vui lòng sử dụng trình đơn Select Menu bên dưới để chọn nhóm câu lệnh' })
      .setTimestamp();
  } else {
    const meta = groupMetadata[selectedGroup] || groupMetadata.core;
    const groupCommands = (config.commands || []).filter((cmd) => cmd.enabled && groupMap[cmd.type] === selectedGroup);

    embed.setTitle(meta.title)
      .setDescription(
        `> 📜 *${meta.description}*\n\n` +
        `✦ ───────────────────────────── ✦\n` +
        (groupCommands.length ? '' : '*Chưa có câu lệnh nào được bật trong nhóm này.*')
      );

    for (const cmd of groupCommands) {
      const isSlash = cmdMap.has(cmd.name);
      const cmdDisplay = isSlash ? `</${cmd.name}:${cmdMap.get(cmd.name)}>` : `\`${prefix}${cmd.name}\``;
      embed.addFields({
        name: `🔹 ${cmdDisplay}`,
        value: `> *${cmd.description || 'Không có mô tả.'}*`,
        inline: false
      });
    }

    embed.setFooter({ text: `Danh mục: ${meta.title} | Tổng số: ${groupCommands.length} câu lệnh` }).setTimestamp();
  }

  return { embeds: [embed], components: [row] };
}
