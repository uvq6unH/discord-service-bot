import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

/**
 * /setup default — Create the Master "Join to Create" voice channel.
 */
async function executeSetupDefault(guild, configStore, options = {}) {
  const store = configStore || guild?.client?.configStore;
  if (!store || typeof store.updateGuildConfig !== 'function') {
    throw new Error('ConfigStore not available.');
  }

  const { categoryId, channelName = '➕ Join to Create' } = options;

  // Resolve or create category
  let category = null;
  if (categoryId) {
    category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
  }
  if (!category) {
    category = await guild.channels.create({ name: '🔊 Voice Channels', type: ChannelType.GuildCategory });
  }

  // Build permission overwrites for the master channel
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const overwrites = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] }
  ];
  if (me) {
    overwrites.push({
      id: me.id,
      allow: [
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewChannel,
      ]
    });
  }

  // Create master voice channel
  const masterChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: overwrites,
  });

  // Persist config
  await store.updateGuildConfig(guild.id, {
    tempVcEnabled: true,
    tempVcMasterChannelId: masterChannel.id,
    tempVcCategoryId: category.id,
    tempVcControlChannelId: '',
  });

  return { category, masterChannel };
}

/**
 * /setup reset — Delete master channel + clear config.
 */
async function executeSetupReset(guild, configStore) {
  const store = configStore || guild?.client?.configStore;
  if (!store || typeof store.updateGuildConfig !== 'function') {
    throw new Error('ConfigStore not available.');
  }

  const config = await store.getGuildConfig(guild.id).catch(() => null);
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

  await store.updateGuildConfig(guild.id, {
    tempVcEnabled: false,
    tempVcMasterChannelId: '',
    tempVcCategoryId: '',
    tempVcControlChannelId: '',
  });

  return { reset: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Command handler — routes /setup and /voice slash commands + prefix commands
// ─────────────────────────────────────────────────────────────────────────────

export async function handleVoiceControl(ctx) {
  const { command, reply, args, source, guild, actorMember, configStore, isInteraction } = ctx;
  if (!command) return undefined;

  // ── /setup ─────────────────────────────────────────────────────────────────
  const cmdName = command.name?.toLowerCase();
  const cmdType = command.type?.toLowerCase();

  if (cmdName === 'setup' || cmdType === 'setup') {
    if (!actorMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: '❌ Bạn cần quyền **Administrator** để dùng lệnh này.', ephemeral: true });
    }

    // Determine subcommand
    let sub = undefined;
    if (isInteraction && source?.options) {
      sub = source.options.getSubcommand(false);
    } else if (args?.length) {
      sub = args[0]?.toLowerCase();
    }

    const store = configStore || ctx.client?.configStore;

    try {
      // /setup reset
      if (sub === 'reset') {
        await executeSetupReset(guild, store);
        const embed = new EmbedBuilder()
          .setTitle('🗑️ VoiceMaster Reset')
          .setDescription('Đã xóa cấu hình VoiceMaster và kênh Master trên máy chủ.')
          .setColor(0xFF4757)
          .setTimestamp();
        return reply({ embeds: [embed] });
      }

      // /setup default (fallback when no sub or sub === 'default')
      let categoryId, channelName = '➕ Join to Create';

      if (isInteraction && source?.options) {
        const catOpt = source.options.getChannel('category');
        if (catOpt) categoryId = catOpt.id;
        const nameOpt = source.options.getString('permission');
        if (nameOpt) channelName = nameOpt;
      }

      const result = await executeSetupDefault(guild, store, { categoryId, channelName });

      const embed = new EmbedBuilder()
        .setTitle('⚡ VoiceMaster Setup Complete')
        .setDescription(
          `**Category:** ${result.category.name}\n` +
          `**Join-to-Create:** ${result.masterChannel.name} (<#${result.masterChannel.id}>)\n\n` +
          `Thành viên chỉ cần tham gia kênh **${result.masterChannel.name}** để tạo phòng thoại tạm thời!`
        )
        .setColor(0x00FF88)
        .setTimestamp();

      return reply({ embeds: [embed] });
    } catch (err) {
      console.error('[setup] Error:', err.message);
      return reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // ── /voice ─────────────────────────────────────────────────────────────────
  if (cmdName === 'voice' || cmdType === 'voice') {
    let action, value;
    if (isInteraction && source?.options) {
      action = source.options.getString('action');
      value = source.options.getString('value');
    } else if (args?.length) {
      action = args[0]?.toLowerCase();
      value = args.slice(1).join(' ');
    }

    const vc = actorMember?.voice?.channel;
    if (!vc) {
      return reply({ content: '❌ Bạn cần ở trong phòng thoại tạm thời để dùng lệnh này.', ephemeral: true });
    }

    try {
      if (action === 'lock') {
        await vc.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });
        return reply({ content: '🔒 Đã khóa kênh thoại.', ephemeral: true });
      }
      if (action === 'unlock') {
        await vc.permissionOverwrites.edit(guild.roles.everyone, { Connect: true });
        return reply({ content: '🔓 Đã mở khóa kênh thoại.', ephemeral: true });
      }
      if (action === 'name') {
        if (!value) return reply({ content: '❌ Nhập tên mới cho phòng.', ephemeral: true });
        await vc.setName(`🔊 ${value}`.slice(0, 90));
        return reply({ content: `✏️ Đã đổi tên thành **${value}**`, ephemeral: true });
      }
      if (action === 'limit') {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0 || n > 99) return reply({ content: '❌ Giới hạn phải từ 0–99.', ephemeral: true });
        await vc.setUserLimit(n);
        return reply({ content: `👥 Giới hạn: **${n === 0 ? 'Không giới hạn' : n}**`, ephemeral: true });
      }
      if (action === 'permit') {
        const id = value?.replace(/[<@!>]/g, '');
        if (!id) return reply({ content: '❌ Nhập @user hoặc ID.', ephemeral: true });
        await vc.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true });
        return reply({ content: `🟢 Đã cho phép <@${id}> truy cập.`, ephemeral: true });
      }
      if (action === 'reject') {
        const id = value?.replace(/[<@!>]/g, '');
        if (!id) return reply({ content: '❌ Nhập @user hoặc ID.', ephemeral: true });
        await vc.permissionOverwrites.edit(id, { Connect: false });
        const m = guild.members.cache.get(id);
        if (m?.voice?.channelId === vc.id) await m.voice.disconnect().catch(() => null);
        return reply({ content: `🔴 Đã cấm <@${id}>.`, ephemeral: true });
      }
      if (action === 'kick') {
        const id = value?.replace(/[<@!>]/g, '');
        if (!id) return reply({ content: '❌ Nhập @user hoặc ID.', ephemeral: true });
        const m = guild.members.cache.get(id);
        if (m?.voice?.channelId === vc.id) {
          await m.voice.disconnect().catch(() => null);
          return reply({ content: `🥾 Đã đuổi <@${id}>.`, ephemeral: true });
        }
        return reply({ content: '❌ Thành viên không ở trong phòng.', ephemeral: true });
      }
      if (action === 'invite') {
        const id = value?.replace(/[<@!>]/g, '');
        if (!id) return reply({ content: '❌ Nhập @user hoặc ID.', ephemeral: true });
        await vc.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true });
        const m = guild.members.cache.get(id);
        if (m) await m.send(`📩 **${actorMember.user.tag}** mời bạn tham gia **${vc.name}** tại **${guild.name}**`).catch(() => null);
        return reply({ content: `📩 Đã mời <@${id}>.`, ephemeral: true });
      }
      if (action === 'bitrate') {
        const kbps = parseInt(value, 10);
        if (isNaN(kbps) || kbps < 8 || kbps > 384) return reply({ content: '❌ Bitrate: 8–384 kbps.', ephemeral: true });
        const target = Math.min(kbps * 1000, guild.maximumBitrate || 96000);
        await vc.setBitrate(target);
        return reply({ content: `🔊 Bitrate: **${target / 1000} kbps**`, ephemeral: true });
      }
      if (action === 'transfer') {
        const id = value?.replace(/[<@!>]/g, '');
        if (!id) return reply({ content: '❌ Nhập @user hoặc ID.', ephemeral: true });
        await vc.permissionOverwrites.edit(id, { Connect: true, Speak: true, ManageChannels: true, MoveMembers: true });
        return reply({ content: `👑 Đã chuyển quyền chủ phòng cho <@${id}>.` });
      }
      if (action === 'claim') {
        await vc.permissionOverwrites.edit(actorMember.id, { Connect: true, Speak: true, ManageChannels: true, MoveMembers: true });
        return reply({ content: `👑 <@${actorMember.id}> đã trở thành chủ phòng mới!` });
      }
      if (action === 'hide') {
        await vc.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
        return reply({ content: '👁️ Đã ẩn kênh thoại.', ephemeral: true });
      }
      if (action === 'unhide') {
        await vc.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true });
        return reply({ content: '👁️‍🗨️ Đã hiện kênh thoại.', ephemeral: true });
      }

      return reply({ content: '❓ Hành động không hợp lệ. Dùng: lock, unlock, name, limit, permit, reject, kick, invite, bitrate, transfer, claim, hide, unhide', ephemeral: true });
    } catch (err) {
      console.error('[voice] Error:', err.message);
      return reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  return undefined;
}

export { executeSetupDefault, executeSetupReset };
