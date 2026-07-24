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
    if (interaction.customId.startsWith('tempvc_settings:') || interaction.customId.startsWith('tempvc_permissions:')) {
      const [, channelId, ownerId] = interaction.customId.split(':');
      const action = interaction.values[0];
      const channel = interaction.guild?.channels.cache.get(channelId);

      if (!channel) {
        return interaction.reply({ content: '❌ Kênh thoại tạm không còn tồn tại.', ephemeral: true });
      }

      if (action === 'lock') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
        return interaction.reply({ content: '🔒 Đã khóa kênh thoại! Người ngoài sẽ không thể tham gia.', ephemeral: true });
      }
      if (action === 'unlock') {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
        return interaction.reply({ content: '🔓 Đã mở khóa kênh thoại!', ephemeral: true });
      }
      if (action === 'rename') {
        return interaction.reply({ content: '✏️ Vui lòng dùng lệnh `/voice name [tên_mới]` để đổi tên kênh.', ephemeral: true });
      }
      if (action === 'limit') {
        return interaction.reply({ content: '👥 Vui lòng dùng lệnh `/voice limit [số_người]` để đặt giới hạn số người.', ephemeral: true });
      }
      if (action === 'permit') {
        return interaction.reply({ content: '🟢 Vui lòng dùng lệnh `/voice permit [@thành_viên]` để cấp quyền.', ephemeral: true });
      }
      if (action === 'reject') {
        return interaction.reply({ content: '🔴 Vui lòng dùng lệnh `/voice reject [@thành_viên]` để kick và chặn thành viên.', ephemeral: true });
      }
      if (action === 'claim') {
        if (channel.members.has(ownerId)) {
          return interaction.reply({ content: '👑 Chủ phòng vẫn còn ở trong kênh thoại.', ephemeral: true });
        }
        await channel.permissionOverwrites.edit(interaction.user.id, {
          Connect: true, Speak: true, ManageChannels: true, MoveMembers: true
        });
        return interaction.reply({ content: `👑 <@${interaction.user.id}> đã trở thành chủ phòng mới!`, ephemeral: false });
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

  if (interaction.customId.startsWith('tempvc_refresh:')) {
    const [, channelId, ownerId] = interaction.customId.split(':');
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: '❌ Kênh thoại không còn tồn tại.', ephemeral: true });
    const { buildTempVcControlPanel } = await import('./tempVoice.js');
    const panel = buildTempVcControlPanel(channel, ownerId);
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
    const roleConfig = config.selfRoles.find((role) => role.roleId === roleId);
    if (!roleConfig) {
      await interaction.reply({ content: 'Role is not configured anymore.', ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: 'Bot needs Manage Roles permission.', ephemeral: true });
      return;
    }
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `Removed ${roleConfig.label}.`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `Added ${roleConfig.label}.`, ephemeral: true });
    }
  }
}