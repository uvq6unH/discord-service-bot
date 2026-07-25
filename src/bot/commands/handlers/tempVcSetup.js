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

    if (action === 'permit') {
      const targetId = value?.replace(/[<@!>]/g, '');
      if (!targetId) return reply({ content: '❌ Vui lòng tag hoặc nhập ID người dùng cần cấp quyền.', ephemeral: true });
      await voiceChannel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      return reply({ content: `🟢 Đã cấp quyền truy cập kênh cho <@${targetId}>!`, ephemeral: true });
    }

    if (action === 'reject') {
      const targetId = value?.replace(/[<@!>]/g, '');
      if (!targetId) return reply({ content: '❌ Vui lòng tag hoặc nhập ID người dùng cần cấm.', ephemeral: true });
      await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false });
      const targetMember = guild.members.cache.get(targetId);
      if (targetMember?.voice?.channelId === voiceChannel.id) {
        await targetMember.voice.disconnect().catch(() => null);
      }
      return reply({ content: `🔴 Đã cấm và ngắt kết nối <@${targetId}> khỏi phòng thoại!`, ephemeral: true });
    }

    if (action === 'kick') {
      const targetId = value?.replace(/[<@!>]/g, '');
      if (!targetId) return reply({ content: '❌ Vui lòng tag hoặc nhập ID người dùng cần đuổi.', ephemeral: true });
      const targetMember = guild.members.cache.get(targetId);
      if (targetMember?.voice?.channelId === voiceChannel.id) {
        await targetMember.voice.disconnect().catch(() => null);
        return reply({ content: `🥾 Đã đuổi <@${targetId}> ra khỏi phòng thoại!`, ephemeral: true });
      }
      return reply({ content: '❌ Thành viên này hiện không có trong phòng thoại.', ephemeral: true });
    }

    if (action === 'invite') {
      const targetId = value?.replace(/[<@!>]/g, '');
      if (!targetId) return reply({ content: '❌ Vui lòng tag thành viên muốn mời vào phòng.', ephemeral: true });
      await voiceChannel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      const targetMember = guild.members.cache.get(targetId);
      if (targetMember) {
        await targetMember.send(`📩 **${actorMember.user.tag}** đã mời bạn tham gia kênh thoại **${voiceChannel.name}** tại server **${guild.name}**!`).catch(() => null);
      }
      return reply({ content: `📩 Đã gửi lời mời tham gia phòng thoại tới <@${targetId}>!`, ephemeral: true });
    }

    if (action === 'bitrate') {
      const kbps = parseInt(value, 10);
      if (isNaN(kbps) || kbps < 8 || kbps > 384) {
        return reply({ content: '❌ Bitrate phải từ 8 kbps đến 384 kbps (phụ thuộc Boost Tier server).', ephemeral: true });
      }
      const targetBitrate = Math.min(kbps * 1000, guild.maximumBitrate || 96000);
      await voiceChannel.setBitrate(targetBitrate);
      return reply({ content: `📻 Đã điều chỉnh Bitrate âm thanh phòng thoại lên **${targetBitrate / 1000} kbps**!`, ephemeral: true });
    }

    if (action === 'transfer') {
      const targetId = value?.replace(/[<@!>]/g, '');
      if (!targetId) return reply({ content: '❌ Vui lòng tag thành viên muốn chuyển quyền chủ phòng.', ephemeral: true });
      await voiceChannel.permissionOverwrites.edit(targetId, {
        Connect: true, Speak: true, ManageChannels: true, MoveMembers: true
      });
      return reply({ content: `👑 Đã chuyển quyền chủ phòng thoại cho <@${targetId}>!`, ephemeral: false });
    }

    if (action === 'claim') {
      await voiceChannel.permissionOverwrites.edit(actorMember.id, {
        Connect: true, Speak: true, ManageChannels: true, MoveMembers: true
      });
      return reply({ content: `👑 <@${actorMember.id}> đã trở thành chủ phòng mới!`, ephemeral: false });
    }

    return reply({ content: '❓ Lệnh voice không hợp lệ. Hãy chọn các thao tác: lock, unlock, name, limit, permit, reject, kick, invite, bitrate, transfer, claim', ephemeral: true });
  }

  return undefined;
}
