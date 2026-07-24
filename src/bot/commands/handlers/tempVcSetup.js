import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export async function handleVoiceControl(ctx) {
  const { command, reply, args, source, guild, actorMember, configStore } = ctx;
  if (!command) return undefined;

  // 1. Slash Command /setup-temp-vc (Admin Setup)
  if (command.name === 'setup-temp-vc') {
    if (!actorMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: '❌ Bạn cần có quyền **Administrator** để sử dụng lệnh này.', ephemeral: true });
    }

    try {
      // Auto Setup Master Category & Master Channel
      const category = await guild.channels.create({
        name: '🔊 KÊNH THOẠI TẠM THỜI',
        type: ChannelType.GuildCategory
      });

      const masterChannel = await guild.channels.create({
        name: '➕ Tạo phòng thoại',
        type: ChannelType.GuildVoice,
        parent: category.id
      });

      // Save to configStore
      await configStore.updateGuildConfig(guild.id, {
        tempVcEnabled: true,
        tempVcMasterChannelId: masterChannel.id,
        tempVcCategoryId: category.id
      });

      const embed = new EmbedBuilder()
        .setTitle('⚡ Thiết Lập Kênh Thoại Tự Động Thành Công')
        .setDescription(
          `Đã tạo thành công:\n` +
          `• Category: **${category.name}**\n` +
          `• Kênh Master: **${masterChannel.name}** (\`<#${masterChannel.id}>\`)\n\n` +
          `Thành viên chỉ cần bấm vào kênh **${masterChannel.name}** để tự tạo phòng thoại riêng!`
        )
        .setColor(0x00FF88)
        .setTimestamp();

      return reply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempVcSetup] Setup error:', err.message);
      return reply({ content: `❌ Lỗi khi tự động tạo kênh: ${err.message}`, ephemeral: true });
    }
  }

  // 2. Slash Command /voice (User Control)
  if (command.name === 'voice') {
    const action = args?.[0]?.toLowerCase();
    const value = args?.[1];
    const voiceChannel = actorMember?.voice?.channel;

    if (!voiceChannel) {
      return reply({ content: '❌ Bạn cần tham gia vào phòng thoại tạm thời của mình để dùng lệnh này.', ephemeral: true });
    }

    if (action === 'lock') {
      await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });
      return reply({ content: '🔒 Đã khóa kênh thoại! Người ngoài sẽ không thể tham gia.', ephemeral: true });
    }

    if (action === 'unlock') {
      await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, { Connect: true });
      return reply({ content: '🔓 Đã mở khóa kênh thoại!', ephemeral: true });
    }

    if (action === 'name') {
      if (!value) return reply({ content: '❌ Vui lòng nhập tên mới cho phòng thoại.', ephemeral: true });
      await voiceChannel.setName(`🔊 ${value}`.slice(0, 90));
      return reply({ content: `✏️ Đã đổi tên kênh thoại thành **${value}**!`, ephemeral: true });
    }

    if (action === 'limit') {
      const limitNum = parseInt(value, 10);
      if (isNaN(limitNum) || limitNum < 0 || limitNum > 99) {
        return reply({ content: '❌ Số người giới hạn phải từ 0 đến 99.', ephemeral: true });
      }
      await voiceChannel.setUserLimit(limitNum);
      return reply({ content: `👥 Đã đặt giới hạn số người trong phòng là **${limitNum === 0 ? 'Không giới hạn' : limitNum}**!`, ephemeral: true });
    }

    if (action === 'claim') {
      await voiceChannel.permissionOverwrites.edit(actorMember.id, {
        Connect: true, Speak: true, ManageChannels: true, MoveMembers: true
      });
      return reply({ content: `👑 <@${actorMember.id}> đã trở thành chủ phòng mới!`, ephemeral: false });
    }

    return reply({ content: '❓ Lệnh voice không hợp lệ. Hãy dùng `/voice action: lock/unlock/name/limit/claim`', ephemeral: true });
  }

  return undefined;
}
