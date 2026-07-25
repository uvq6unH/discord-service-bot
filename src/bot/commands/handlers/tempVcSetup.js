import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export async function executeAutoVoiceMasterSetup(guild, configStore) {
  const targetStore = configStore || guild?.client?.configStore;
  if (!targetStore || typeof targetStore.updateGuildConfig !== 'function') {
    throw new Error('Hệ thống chưa sẵn sàng: Không tìm thấy ConfigStore.');
  }

  // 1. Create Voice Category
  const category = await guild.channels.create({
    name: '🔊 VoiceMaster Channels',
    type: ChannelType.GuildCategory
  });

  // 2. Create Master Join Voice Channel
  const masterChannel = await guild.channels.create({
    name: '➕ Join to Create',
    type: ChannelType.GuildVoice,
    parent: category.id
  });

  // 3. Create Voice Control Panel Text Channel
  const controlChannel = await guild.channels.create({
    name: '🎛️-voice-interface',
    type: ChannelType.GuildText,
    parent: category.id,
    topic: '🔒 Control Panel điều khiển phòng thoại tạm thời VoiceMaster'
  });

  // 4. Build & send Control Panel embed in controlChannel
  const panelEmbed = new EmbedBuilder()
    .setTitle('🎛️ VoiceMaster Control Interface')
    .setDescription(
      `Chào mừng đến với hệ thống **VoiceMaster**!\n\n` +
      `Tham gia kênh **${masterChannel.name}** (<#${masterChannel.id}>) để tự động khởi tạo phòng thoại riêng.\n` +
      `Sử dụng các nút bấm bên dưới hoặc lệnh \`/voice\` / \`hb voice\` để quản lý phòng thoại của bạn:`
    )
    .addFields(
      { name: '🔒 Khóa / 🔓 Mở', value: `\`hb voice lock\` / \`hb voice unlock\``, inline: true },
      { name: '👥 Giới hạn người', value: `\`hb voice limit <số>\``, inline: true },
      { name: '✏️ Đổi tên phòng', value: `\`hb voice name <tên>\``, inline: true },
      { name: '🟢 Cho phép / 🔴 Cấm', value: `\`hb voice permit @user\` / \`hb voice reject @user\``, inline: true },
      { name: '👑 Nhận chủ phòng', value: `\`hb voice claim\``, inline: true }
    )
    .setColor(0x00FF88)
    .setFooter({ text: 'VoiceMaster Automated Engine' });

  const { buildTempVcControlPanel } = await import('../../tempVoice.js');
  const controlMsg = await controlChannel.send({
    embeds: [panelEmbed],
    components: [
      buildTempVcControlPanel({ id: 'template' }, '0')
    ]
  }).catch(() => null);

  if (controlMsg) {
    await controlMsg.pin().catch(() => null);
  }

  // 5. Save to targetStore
  await targetStore.updateGuildConfig(guild.id, {
    tempVcEnabled: true,
    tempVcMasterChannelId: masterChannel.id,
    tempVcCategoryId: category.id,
    tempVcControlChannelId: controlChannel.id
  });

  return {
    category,
    masterChannel,
    controlChannel
  };
}

export async function handleVoiceControl(ctx) {
  const { command, reply, args, source, guild, actorMember, configStore } = ctx;
  if (!command) return undefined;

  // 1. Setup Commands: /setup, /vcsetup, /setup-temp-vc, hb setup, hb vcsetup
  const isSetupCmd = ['setup', 'vcsetup', 'setup-temp-vc'].includes(command.name?.toLowerCase());
  if (isSetupCmd) {
    if (!actorMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: '❌ Bạn cần có quyền **Administrator** để sử dụng lệnh này.', ephemeral: true });
    }

    try {
      const result = await executeAutoVoiceMasterSetup(guild, configStore);

      const embed = new EmbedBuilder()
        .setTitle('⚡ VoiceMaster Automated Setup Completed')
        .setDescription(
          `Đã tạo thành công toàn bộ hệ thống VoiceMaster:\n\n` +
          `• **Danh mục (Category):** ${result.category.name}\n` +
          `• **Kênh tạo phòng:** **${result.masterChannel.name}** (<#${result.masterChannel.id}>)\n` +
          `• **Bảng điều khiển:** **#${result.controlChannel.name}** (<#${result.controlChannel.id}>)\n\n` +
          `Thành viên chỉ cần bấm vào kênh **${result.masterChannel.name}** để tự động tạo phòng thoại riêng!`
        )
        .setColor(0x00FF88)
        .setTimestamp();

      return reply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempVcSetup] Setup error:', err.message);
      return reply({ content: `❌ Lỗi khi tự động tạo hệ thống VoiceMaster: ${err.message}`, ephemeral: true });
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
