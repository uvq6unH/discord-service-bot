import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { buildHelpPayload } from './help.js';
import { handleBlackjackButton, handlePokerButton } from './games.js';
import { sendTicketLog } from './logging.js';

export async function handleComponentInteraction(interaction, { client, config, stateStore }) {
  if (client?.sharedRedis) {
    import('./logging.js').then(({ pushLiveLog }) => {
      pushLiveLog(client.sharedRedis, {
        type: 'CMD',
        message: `Interaction ${interaction.customId} by ${interaction.user.tag} in ${interaction.guild?.name ?? 'DM'}`,
        metadata: interaction.guild?.id ?? 'GLOBAL'
      }).catch(() => null);
    }).catch(() => null);
  }

  if (interaction.isModalSubmit()) {
    // ── VoiceMaster Modal handlers ────────────────────────────────────────
    if (interaction.customId.startsWith('vm:modal:rename:')) {
      const channelId = interaction.customId.split(':')[3];
      const newName = interaction.fields.getTextInputValue('room_name')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      if (!newName) return interaction.reply({ content: '❌ Tên không được để rỗng.', ephemeral: true });
      await channel.setName(`🔊 ${newName}`.slice(0, 90));
      return interaction.reply({ content: `✏️ Đã đổi tên thành **${newName}**`, ephemeral: true });
    }
    if (interaction.customId.startsWith('vm:modal:limit:')) {
      const channelId = interaction.customId.split(':')[3];
      const limitStr = interaction.fields.getTextInputValue('user_limit')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      const n = parseInt(limitStr, 10);
      if (isNaN(n) || n < 0 || n > 99) return interaction.reply({ content: '❌ Giới hạn: 0–99.', ephemeral: true });
      await channel.setUserLimit(n);
      return interaction.reply({ content: `👥 Giới hạn: **${n === 0 ? 'Không giới hạn' : n}**`, ephemeral: true });
    }
    if (interaction.customId.startsWith('vm:modal:permit:')) {
      const channelId = interaction.customId.split(':')[3];
      const targetStr = interaction.fields.getTextInputValue('target_user')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      const id = targetStr?.replace(/[<@!>]/g, '');
      if (!id) return interaction.reply({ content: '❌ Nhập ID hoặc @user.', ephemeral: true });
      await channel.permissionOverwrites.edit(id, { Connect: true, ViewChannel: true });
      return interaction.reply({ content: `🟢 Đã cho phép <@${id}> truy cập.`, ephemeral: true });
    }
    if (interaction.customId.startsWith('vm:modal:reject:')) {
      const channelId = interaction.customId.split(':')[3];
      const targetStr = interaction.fields.getTextInputValue('target_user')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      const id = targetStr?.replace(/[<@!>]/g, '');
      if (!id) return interaction.reply({ content: '❌ Nhập ID hoặc @user.', ephemeral: true });
      await channel.permissionOverwrites.edit(id, { Connect: false });
      const m = interaction.guild.members.cache.get(id);
      if (m?.voice?.channelId === channel.id) await m.voice.disconnect().catch(() => null);
      return interaction.reply({ content: `🔴 Đã cấm <@${id}>.`, ephemeral: true });
    }
    if (interaction.customId.startsWith('vm:modal:bitrate:')) {
      const channelId = interaction.customId.split(':')[3];
      const brStr = interaction.fields.getTextInputValue('bitrate_value')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      const kbps = parseInt(brStr, 10);
      if (isNaN(kbps) || kbps < 8 || kbps > 384) return interaction.reply({ content: '❌ Bitrate: 8–384 kbps.', ephemeral: true });
      const target = Math.min(kbps * 1000, interaction.guild.maximumBitrate || 96000);
      await channel.setBitrate(target);
      return interaction.reply({ content: `🔊 Bitrate: **${target / 1000} kbps**`, ephemeral: true });
    }
    if (interaction.customId.startsWith('vm:modal:kick:')) {
      const channelId = interaction.customId.split(':')[3];
      const targetStr = interaction.fields.getTextInputValue('target_user')?.trim();
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
      const id = targetStr?.replace(/[<@!>]/g, '');
      if (!id) return interaction.reply({ content: '❌ Nhập ID hoặc @user.', ephemeral: true });
      const m = interaction.guild.members.cache.get(id);
      if (m?.voice?.channelId === channel.id) {
        await m.voice.disconnect().catch(() => null);
        return interaction.reply({ content: `🥾 Đã đuổi <@${id}>.`, ephemeral: true });
      }
      return interaction.reply({ content: '❌ Thành viên không ở trong phòng.', ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('runes:select_menu:')) {
      const targetUserId = interaction.customId.split(':')[2];
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          content: '❌ Chỉ người sử dụng lệnh ban đầu mới có thể tương tác với menu này!',
          ephemeral: true
        });
        return;
      }
      const { handleRunesSelect } = await import('../lolCommands.js');
      return handleRunesSelect(interaction);
    }
    if (interaction.customId.startsWith('quiz:')) {
      const { handleQuizButton } = await import('./lolQuiz.js');
      return handleQuizButton(interaction);
    }
    if (interaction.customId.startsWith('vm:settings:') || interaction.customId.startsWith('vm:perms:')) {
      const parts = interaction.customId.split(':');
      const channelId = parts[2];
      const ownerId = parts[3];
      const action = interaction.values[0];
      const channel = interaction.guild?.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });

      // Direct actions
      if (action === 'lock') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
        return interaction.reply({ content: '🔒 Đã khóa kênh.', ephemeral: true });
      }
      if (action === 'unlock') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
        return interaction.reply({ content: '🔓 Đã mở khóa kênh.', ephemeral: true });
      }
      if (action === 'hide') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
        return interaction.reply({ content: '👁️ Đã ẩn kênh.', ephemeral: true });
      }
      if (action === 'unhide') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
        return interaction.reply({ content: '👁️‍🗨️ Đã hiện kênh.', ephemeral: true });
      }
      if (action === 'claim') {
        if (channel.members.has(ownerId)) {
          return interaction.reply({ content: '👑 Chủ phòng vẫn còn ở trong kênh.', ephemeral: true });
        }
        await channel.permissionOverwrites.edit(interaction.user.id, { Connect: true, Speak: true, ManageChannels: true, MoveMembers: true });
        return interaction.reply({ content: `👑 <@${interaction.user.id}> đã trở thành chủ phòng mới!` });
      }

      // Modal actions
      const modalMap = {
        rename: { id: `vm:modal:rename:${channelId}`, title: '✏️ Rename Channel', inputId: 'room_name', label: 'New Name', placeholder: 'Enter new channel name...', value: channel.name.replace(/^🔊\s*/, '') },
        limit: { id: `vm:modal:limit:${channelId}`, title: '👥 Set User Limit', inputId: 'user_limit', label: 'Max Users (0–99)', placeholder: '0 = unlimited' },
        bitrate: { id: `vm:modal:bitrate:${channelId}`, title: '🔊 Set Bitrate', inputId: 'bitrate_value', label: 'Bitrate (8–384 kbps)', placeholder: '64' },
        permit: { id: `vm:modal:permit:${channelId}`, title: '🟢 Permit Member', inputId: 'target_user', label: 'User ID or @tag', placeholder: 'Enter Discord User ID' },
        reject: { id: `vm:modal:reject:${channelId}`, title: '🔴 Reject Member', inputId: 'target_user', label: 'User ID or @tag', placeholder: 'Enter Discord User ID' },
        kick_member: { id: `vm:modal:kick:${channelId}`, title: '🥾 Kick Member', inputId: 'target_user', label: 'User ID or @tag', placeholder: 'Enter Discord User ID' },
      };
      const cfg = modalMap[action];
      if (cfg) {
        const modal = new ModalBuilder().setCustomId(cfg.id).setTitle(cfg.title).addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(cfg.inputId).setLabel(cfg.label).setStyle(TextInputStyle.Short).setPlaceholder(cfg.placeholder).setRequired(true)
          )
        );
        if (cfg.value) modal.components[0].components[0].setValue(cfg.value);
        return interaction.showModal(modal);
      }
      return;
    }
    if (!interaction.customId.startsWith('help_select:')) return;
    const targetUserId = interaction.customId.slice('help_select:'.length);
    if (interaction.user.id !== targetUserId) {
      await interaction.reply({
        content: '❌ Chỉ người sử dụng lệnh ban đầu mới có thể tương tác với menu này!',
        ephemeral: true
      });
      return;
    }
    const selectedValue = interaction.values[0];
    const group = selectedValue.startsWith('help_group:') ? selectedValue.slice('help_group:'.length) : null;
    const payload = await buildHelpPayload(client, config, interaction.guild, targetUserId, group);
    await interaction.update(payload);
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === 'config:help') {
    const { buildHelpPayload } = await import('./help.js');
    const payload = await buildHelpPayload(client, config, interaction.guild, interaction.user.id, null);
    return interaction.reply({ ...payload, ephemeral: true });
  }

  if (interaction.customId.startsWith('bj:')) {
    return handleBlackjackButton(interaction, { client, config });
  }

  if (interaction.customId.startsWith('vp:')) {
    return handlePokerButton(interaction, { client, config });
  }

  if (interaction.customId.startsWith('quiz:')) {
    const { handleQuizButton } = await import('./lolQuiz.js');
    return handleQuizButton(interaction);
  }

  if (interaction.customId.startsWith('duolingo:')) {
    const { handleDuolingoButton } = await import('./commands/handlers/duolingo.js');
    return handleDuolingoButton(interaction);
  }

  if (interaction.customId.startsWith('vm:refresh:')) {
    const parts = interaction.customId.split(':');
    const channelId = parts[2];
    const ownerId = parts[3];
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: '❌ Kênh không còn tồn tại.', ephemeral: true });
    const { buildControlPanel } = await import('./tempVoice.js');
    const panel = buildControlPanel(channelId, ownerId);
    await interaction.update(panel);
    return;
  }

  if (interaction.customId.startsWith('music:control:')) {
    const { getLavalinkManager, buildMusicControlRow } = await import('./music/lavalink.js');
    const manager = getLavalinkManager();
    const player = manager?.getPlayer(interaction.guildId);

    if (!player) {
      return interaction.reply({ content: '❌ Không có trình phát nhạc nào đang chạy.', ephemeral: true });
    }
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel || voiceChannel.id !== player.voiceChannelId) {
      return interaction.reply({ content: '❌ Bạn cần ở trong cùng **Voice Channel** với Bot để điều khiển nhạc!', ephemeral: true });
    }

    const action = interaction.customId.replace('music:control:', '');
    try {
      if (action === 'pause_resume') {
        if (player.paused) {
          if (typeof player.resume === 'function') {
            await player.resume();
          } else {
            await player.pause(false);
          }
          await interaction.reply({ content: '▶️ Đã tiếp tục phát nhạc.', ephemeral: true });
        } else {
          if (typeof player.pause === 'function') {
            await player.pause();
          } else {
            await player.pause(true);
          }
          await interaction.reply({ content: '⏸️ Đã tạm dừng phát nhạc.', ephemeral: true });
        }
        if (interaction.message?.editable) {
          const { buildMusicStatusEmbed } = await import('./commands/handlers/music.js');
          const updatedEmbed = buildMusicStatusEmbed(player, null, player.paused ? '⏸️ Tạm dừng phát nhạc' : '🎵 Now Playing', player.paused ? 0xFEE75C : 0x5865F2, { showProgress: true });
          await interaction.message.edit({ embeds: [updatedEmbed], components: [buildMusicControlRow(player)] }).catch(() => null);
        }
        return;
      }
      if (action === 'skip') {
        await player.skip();
        await interaction.reply({ content: '⏭️ Đã bỏ qua bài hát.', ephemeral: true });
        if (interaction.message?.editable) {
          const { buildMusicStatusEmbed } = await import('./commands/handlers/music.js');
          const updatedEmbed = buildMusicStatusEmbed(player, null, '🎵 Now Playing', 0x5865F2, { showProgress: true });
          await interaction.message.edit({ embeds: [updatedEmbed], components: [buildMusicControlRow(player)] }).catch(() => null);
        }
        return;
      }
      if (action === 'stop') {
        await player.destroy();
        return interaction.reply({ content: '⏹️ Đã dừng trình phát nhạc.', ephemeral: true });
      }
      if (action === 'shuffle') {
        await player.queue.shuffle();
        await interaction.reply({ content: '🔀 Đã xáo trộn danh sách phát.', ephemeral: true });
        if (interaction.message?.editable) {
          const { buildMusicStatusEmbed } = await import('./commands/handlers/music.js');
          const updatedEmbed = buildMusicStatusEmbed(player, null, '🎵 Now Playing', 0x5865F2, { showProgress: true });
          await interaction.message.edit({ embeds: [updatedEmbed], components: [buildMusicControlRow(player)] }).catch(() => null);
        }
        return;
      }
      if (action === 'autoplay') {
        const nextState = !(player.get('autoplay') ?? false);
        player.set('autoplay', nextState);
        await interaction.reply({
          content: nextState
            ? '📻 Đã BẬT chế độ Tự động phát nhạc liên quan (Radio Mode).'
            : '📻 Đã TẮT chế độ Tự động phát nhạc liên quan (Radio Mode).',
          ephemeral: true
        });
        if (interaction.message?.editable) {
          const { buildMusicStatusEmbed } = await import('./commands/handlers/music.js');
          const updatedEmbed = buildMusicStatusEmbed(player, null, player.paused ? '⏸️ Tạm dừng phát nhạc' : '🎵 Now Playing', player.paused ? 0xFEE75C : 0x5865F2, { showProgress: true });
          await interaction.message.edit({ embeds: [updatedEmbed], components: [buildMusicControlRow(player)] }).catch(() => null);
        }
        return;
      }
      if (action === 'volup') {
        const currentVol = player.volume ?? 100;
        const newVol = currentVol >= 200 ? 100 : Math.min(currentVol + 10, 200);
        await player.setVolume(newVol);
        return interaction.reply({ content: `🔊 Đã chỉnh âm lượng: **${newVol}%**`, ephemeral: true });
      }
    } catch (err) {
      return interaction.reply({ content: `❌ Lỗi điều khiển: ${err.message}`, ephemeral: true });
    }
  }

  if (interaction.customId === 'ticket:create') {
    if (!config.ticketsEnabled) {
      await interaction.reply({ content: 'Tickets are disabled.', ephemeral: true });
      return;
    }
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'Bot needs Manage Channels permission.', ephemeral: true });
      return;
    }
    try {
      const number = await stateStore.nextTicketNumber(interaction.guild.id);
      const channel = await interaction.guild.channels.create({
        name: `ticket-${number}--${interaction.user.id}`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: config.ticketCategoryId || undefined,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger)
      );
      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [new EmbedBuilder().setTitle(`Ticket #${number}`).setDescription('Support will respond here.').setColor(0x2864d8)],
        components: [row]
      });
      await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
      await sendTicketLog(interaction.guild, config, `Ticket #${number} opened by ${interaction.user.tag}.`);
    } catch (err) {
      console.error('[ticket] Failed to create ticket channel:', err.message);
      await interaction.reply({ content: 'Failed to create ticket. Check bot permissions.', ephemeral: true }).catch(() => null);
    }
    return;
  }

  if (interaction.customId === 'ticket:close') {
    // Guard: only valid inside actual ticket channels
    if (!interaction.channel?.name?.startsWith('ticket-')) {
      await interaction.reply({ content: 'This button can only be used in ticket channels.', ephemeral: true });
      return;
    }
    // Allow: staff with ManageChannels, OR the ticket opener (userId in channel name -- no substring collision)
    const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
    const isOpener = interaction.channel.name.includes(`--${interaction.user.id}`);
    if (!isStaff && !isOpener) {
      await interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
      return;
    }
    try {
      await interaction.reply({ content: 'Closing ticket in 3 seconds.', ephemeral: true });
      await sendTicketLog(interaction.guild, config, `Ticket closed: ${interaction.channel.name}`);
      setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
    } catch (err) {
      console.error('[ticket] Failed to close ticket:', err.message);
      await interaction.reply({ content: 'Failed to close ticket. Check bot permissions.', ephemeral: true }).catch(() => null);
    }
    return;
  }

  if (interaction.customId.startsWith('selfrole:')) {
    if (!config.rolesEnabled) {
      await interaction.reply({ content: 'Roles are disabled.', ephemeral: true });
      return;
    }
    const roleId = interaction.customId.slice('selfrole:'.length);
    const allRoles = (config.selfRolePanels ?? []).flatMap(p => p.roles ?? []).concat(config.selfRoles ?? []);
    const roleConfig = allRoles.find((role) => role.roleId === roleId);
    const roleName = roleConfig?.label || interaction.guild.roles.cache.get(roleId)?.name || 'Role';

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: 'Bot needs Manage Roles permission.', ephemeral: true });
      return;
    }
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      await member.roles.remove(roleId).catch((err) => console.error(`[selfrole] Failed to remove role ${roleId}:`, err.message));
      await interaction.reply({ content: `Removed ${roleName}.`, ephemeral: true });
    } else {
      await member.roles.add(roleId).catch((err) => console.error(`[selfrole] Failed to add role ${roleId}:`, err.message));
      await interaction.reply({ content: `Added ${roleName}.`, ephemeral: true });
    }
  }
}