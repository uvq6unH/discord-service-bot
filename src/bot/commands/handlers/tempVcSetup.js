import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export async function executeAutoVoiceMasterSetup(guild, configStore, options = {}) {
  const targetStore = configStore || guild?.client?.configStore;
  if (!targetStore || typeof targetStore.updateGuildConfig !== 'function') {
    throw new Error('Hệ thống chưa sẵn sàng: Không tìm thấy ConfigStore.');
  }

  const { categoryId, masterName = '➕ Join to Create', createInterface = false } = options;

  let category = null;
  if (categoryId) {
    category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
  }

  // If no category specified, create "🔊 Voice Channels" category only if needed
  if (!category) {
    category = await guild.channels.create({
      name: '🔊 Voice Channels',
      type: ChannelType.GuildCategory
    });
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const masterOverwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel]
    }
  ];
  if (me) {
    masterOverwrites.push({
      id: me.id,
      allow: [
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewChannel
      ]
    });
  }

  // Create Master Join Voice Channel
  const masterChannel = await guild.channels.create({
    name: masterName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: masterOverwrites
  });

  let controlChannel = null;
  if (createInterface) {
    controlChannel = await guild.channels.create({
      name: '🎛️-voice-interface',
      type: ChannelType.GuildText,
      parent: category.id,
      topic: '🔒 Control Panel điều khiển phòng thoại tạm thời VoiceMaster'
    });

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
  }

  // Save to targetStore
  await targetStore.updateGuildConfig(guild.id, {
    tempVcEnabled: true,
    tempVcMasterChannelId: masterChannel.id,
    tempVcCategoryId: category.id,
    tempVcControlChannelId: controlChannel ? controlChannel.id : ''
  });

  return {
    category,
    masterChannel,
    controlChannel
  };
}

export async function executeVoiceMasterReset(guild, configStore) {
  const targetStore = configStore || guild?.client?.configStore;
  if (!targetStore || typeof targetStore.updateGuildConfig !== 'function') {
    throw new Error('Hệ thống chưa sẵn sàng: Không tìm thấy ConfigStore.');
  }

  const config = await targetStore.getGuildConfig(guild.id).catch(() => null);
  if (config) {
    if (config.tempVcMasterChannelId) {
      const ch = guild.channels.cache.get(config.tempVcMasterChannelId);
      if (ch) await ch.delete('VoiceMaster reset').catch(() => null);
    }
    if (config.tempVcControlChannelId) {
      const ch = guild.channels.cache.get(config.tempVcControlChannelId);
      if (ch) await ch.delete('VoiceMaster reset').catch(() => null);
    }
  }

  await targetStore.updateGuildConfig(guild.id, {
    tempVcEnabled: false,
    tempVcMasterChannelId: '',
    tempVcCategoryId: '',
    tempVcControlChannelId: ''
  });

  return { reset: true };
}

export async function handleVoiceControl(ctx) {
  const { command, reply, args, source, guild, actorMember, configStore, isInteraction } = ctx;
  if (!command) return undefined;

  // 1. Setup Commands: /setup, /vcsetup, /setup-temp-vc, hb setup, hb vcsetup
  const isSetupCmd = ['setup', 'vcsetup', 'setup-temp-vc'].includes(command.name?.toLowerCase());
  if (isSetupCmd) {
    if (!actorMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: '❌ Bạn cần có quyền **Administrator** để sử dụng lệnh này.', ephemeral: true });
    }

    try {
      let subCmd = undefined;
      if (isInteraction && source?.options) {
        subCmd = source.options.getSubcommand(false);
      } else if (args && args.length > 0) {
        subCmd = args[0]?.toLowerCase();
      }

      if (subCmd === 'reset') {
        await executeVoiceMasterReset(guild, configStore || ctx.client?.configStore);
        const embed = new EmbedBuilder()
          .setTitle('🗑️ VoiceMaster Reset Completed')
          .setDescription('Đã đặt lại và xóa bỏ cấu hình VoiceMaster thành công trên máy chủ!')
          .setColor(0xFF4757)
          .setTimestamp();
        return reply({ embeds: [embed] });
      }

      let categoryId = undefined;
      let masterName = '➕ Join to Create';
      let createInterface = false;

      if (isInteraction && source?.options) {
        const catOption = source.options.getChannel('category');
        if (catOption) categoryId = catOption.id;

        const permOpt = source.options.getString('permission');
        const nameOpt = source.options.getString('name') || source.options.getString('channel_name');
        if (permOpt) masterName = permOpt;
        else if (nameOpt) masterName = nameOpt;

        const interfaceOpt = source.options.getBoolean('create_interface');
        if (typeof interfaceOpt === 'boolean') createInterface = interfaceOpt;
      }

      const result = await executeAutoVoiceMasterSetup(guild, configStore || ctx.client?.configStore, {
        categoryId,
        masterName,
        createInterface
      });

      const embed = new EmbedBuilder()
        .setTitle('⚡ VoiceMaster Setup Completed')
        .setDescription(
          `Đã tạo kênh Master Voice thành công:\n\n` +
          `• **Category:** ${result.category.name}\n` +
          `• **Kênh Join-to-Create:** **${result.masterChannel.name}** (<#${result.masterChannel.id}>)\n` +
          (result.controlChannel ? `• **Bảng điều khiển:** **#${result.controlChannel.name}** (<#${result.controlChannel.id}>)\n\n` : '\n') +
          `Thành viên chỉ cần tham gia kênh **${result.masterChannel.name}** để tự động khởi tạo và được tự động chuyển vào phòng thoại riêng!`
        )
        .setColor(0x00FF88)
        .setTimestamp();

      return reply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempVcSetup] Setup error:', err.message);
      return reply({ content: `❌ Lỗi khi thiết lập VoiceMaster: ${err.message}`, ephemeral: true });
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
