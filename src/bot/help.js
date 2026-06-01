import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

export const groupMap = {
  ping: 'general',
  help: 'general',
  custom: 'general',
  user: 'user',
  avatar: 'user',
  rank: 'user',
  leaderboard: 'user',
  balance: 'user',
  daily: 'user',
  economyleaderboard: 'user',
  blackjack: 'games',
  poker: 'games',
  coinflip: 'games',
  dice: 'games',
  slots: 'games',
  server: 'server',
  say: 'server',
  purge: 'server',
  announce: 'server',
  warn: 'moderation',
  kick: 'moderation',
  ban: 'moderation',
  timeout: 'moderation',
  warnings: 'moderation',
  clearwarns: 'moderation',
  ecoadd: 'moderation',
  ecoset: 'moderation',
  ecoremove: 'moderation',
  ticketpanel: 'interactions',
  rolepanel: 'interactions',
  lsd: 'lol',
  lolprofile: 'lol',
  lolmatch: 'lol',
  lolchamp: 'lol',
  lolitem: 'lol',
  lolrunes: 'lol',
  lolpatch: 'lol',
  lollink: 'lol',
  lolunlink: 'lol',
  tftlsd: 'lol',
  tftprofile: 'lol',
  tftmatch: 'lol',
  tftlink: 'lol',
  tftunlink: 'lol'
};

const groupMetadata = {
  general: {
    title: '⚙️ Lệnh Chung & Custom',
    description: 'Các lệnh cơ bản và lệnh tùy chỉnh trên máy chủ.'
  },
  user: {
    title: '👤 Thành Viên & Cấp Độ',
    description: 'Các lệnh xem hồ sơ thành viên, hình đại diện và hệ thống cấp độ XP.'
  },
  server: {
    title: '🖥️ Máy Chủ & Phát Thanh',
    description: 'Các lệnh hiển thị thông tin máy chủ, phát thông báo và dọn dẹp.'
  },
  moderation: {
    title: '🛡️ Kiểm Duyệt & Bảo Mật',
    description: 'Các lệnh xử phạt thành viên vi phạm (ban, kick, timeout, cảnh cáo).'
  },
  interactions: {
    title: '🔔 Tương Tác & Nút Bấm',
    description: 'Các lệnh đăng bảng chọn vai trò tự động và tạo kênh hỗ trợ (ticket).'
  },
  games: {
    title: '🎮 Trò Chơi',
    description: 'Blackjack, Poker, Coinflip, Dice và Slots — đặt cược bằng tiền ảo của server.'
  },
  lol: {
    title: '⚔️ League of Legends & TFT',
    description: 'Tra cứu lịch sử đấu LoL/TFT, hồ sơ người chơi, thông tin tướng, trang bị, bảng ngọc và chi tiết trận TFT.'
  }
};

export async function buildHelpPayload(client, config, guild, userId, selectedGroup = null) {
  const guildCommands = await guild.commands.fetch().catch(() => new Map());
  const cmdMap = new Map();
  for (const cmd of guildCommands.values()) {
    cmdMap.set(cmd.name, cmd.id);
  }

  const prefix = config.prefix || '!';

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`help_select:${userId}`)
    .setPlaceholder('Chọn danh mục câu lệnh...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Lệnh Chung & Custom')
        .setValue('help_group:general')
        .setDescription('Các lệnh cơ bản và lệnh tự tạo')
        .setEmoji('⚙️')
        .setDefault(selectedGroup === 'general'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Thành Viên & Cấp Độ')
        .setValue('help_group:user')
        .setDescription('Xem thông tin, avatar và điểm XP')
        .setEmoji('👤')
        .setDefault(selectedGroup === 'user'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Máy Chủ & Phát Thanh')
        .setValue('help_group:server')
        .setDescription('Thông tin server và phát thông báo')
        .setEmoji('🖥️')
        .setDefault(selectedGroup === 'server'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Kiểm Duyệt')
        .setValue('help_group:moderation')
        .setDescription('Các lệnh ban, kick, timeout bảo mật')
        .setEmoji('🛡️')
        .setDefault(selectedGroup === 'moderation'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Tương Tác & Nút Bấm')
        .setValue('help_group:interactions')
        .setDescription('Đăng bảng ticket hỗ trợ và tự chọn role')
        .setEmoji('🔔')
        .setDefault(selectedGroup === 'interactions'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Trò Chơi')
        .setValue('help_group:games')
        .setDescription('Blackjack, Poker, Coinflip, Dice, Slots')
        .setEmoji('🎮')
        .setDefault(selectedGroup === 'games'),
      new StringSelectMenuOptionBuilder()
        .setLabel('League of Legends & TFT')
        .setValue('help_group:lol')
        .setDescription('Tra cứu đấu LoL/TFT, hồ sơ, tướng, trang bị, bảng ngọc')
        .setEmoji('⚔️')
        .setDefault(selectedGroup === 'lol' || selectedGroup === 'tft')
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setThumbnail(guild.iconURL({ size: 256 }) || client.user.displayAvatarURL());

  if (!selectedGroup) {
    embed.setTitle(`Hướng Dẫn Sử Dụng Bot - ${guild.name}`)
      .setDescription(
        `Chào mừng bạn đến với bảng hướng dẫn! Máy chủ đang sử dụng tiền tố là \`${prefix}\`.\n\n` +
        `Vui lòng chọn một danh mục câu lệnh từ trình đơn bên dưới để xem chi tiết các lệnh.\n\n` +
        `**Các danh mục khả dụng:**\n` +
        `• ⚙️ **Lệnh Chung & Custom**: Các lệnh cơ bản.\n` +
        `• 👤 **Thành Viên & Cấp Độ**: Thẻ thông tin, cấp độ XP.\n` +
        `• 🖥️ **Máy Chủ & Phát Thanh**: Thông tin server, gửi thông báo.\n` +
        `• 🛡️ **Kiểm Duyệt**: Ban, kick, dọn tin nhắn.\n` +
        `• 🔔 **Tương Tác**: Tự nhận vai trò, kênh Ticket.\n` +
        `• 🎮 **Trò Chơi**: Blackjack, Poker, Coinflip, Dice, Slots.\n` +
        `• ⚔️ **League of Legends**: Tra cứu hồ sơ, tướng, lịch sử đấu.`
      )
      .setFooter({ text: 'Sử dụng select menu bên dưới để duyệt lệnh' });
  } else {
    const meta = groupMetadata[selectedGroup];
    const groupCommands = config.commands.filter((cmd) => cmd.enabled && groupMap[cmd.type] === selectedGroup);

    embed.setTitle(meta.title)
      .setDescription(meta.description + '\n\n' + (groupCommands.length ? '' : '*Không có lệnh nào được bật trong nhóm này.*'));

    for (const cmd of groupCommands) {
      const isSlash = cmdMap.has(cmd.name);
      const cmdDisplay = isSlash ? `</${cmd.name}:${cmdMap.get(cmd.name)}>` : `\`${prefix}${cmd.name}\``;
      embed.addFields({
        name: cmdDisplay,
        value: cmd.description || 'Không có mô tả.',
        inline: false
      });
    }

    embed.setFooter({ text: `Danh mục: ${meta.title} | Tổng số: ${groupCommands.length} lệnh` });
  }

  return { embeds: [embed], components: [row] };
}
