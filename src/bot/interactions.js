import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { buildHelpPayload } from './help.js';
import { handleBlackjackButton, handlePokerButton } from './games.js';
import { sendTicketLog } from './logging.js';

export async function handleComponentInteraction(interaction, { client, config, stateStore }) {
  if (interaction.isStringSelectMenu()) {
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
        name: `ticket-${number}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
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
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'You need Manage Channels permission.', ephemeral: true });
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