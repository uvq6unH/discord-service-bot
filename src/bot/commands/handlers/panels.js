import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits
} from 'discord.js';
import { sanitizeAnnouncementText } from '../../../commandAccess.js';

/** @returns {Promise<unknown>|undefined} */
export async function handlePanels(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  if (!['announce','ticketpanel','rolepanel'].includes(command.type)) return;

  if (command.type === 'announce') {
    if (!config.announcementsEnabled || !config.announcementChannelId) {
      return reply(isInteraction ? { content: 'Announcements are not configured.', ephemeral: true } : 'Announcements are not configured.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    const announcement = sanitizeAnnouncementText(isInteraction ? source.options.getString('message') : args);
    const targetChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!targetChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found.', ephemeral: true } : 'Announcement channel not found.');
    }
    const mentionPrefix = String(config.announcementMention ?? '').trim();
    if (/@(?:everyone|here)\b/.test(mentionPrefix) &&
        !guild.members.me?.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return reply(isInteraction ? { content: 'Bot needs Mention Everyone permission for @everyone/@here announcements.', ephemeral: true } : 'Bot needs Mention Everyone permission for @everyone/@here announcements.');
    }
    await targetChannel.send({
      content: mentionPrefix || undefined,
      embeds: [new EmbedBuilder().setTitle('Announcement').setDescription(announcement).setColor(0x2864d8)]
    });
    return reply(isInteraction ? { content: 'Announcement sent.', ephemeral: true } : 'Announcement sent.');
  }

  if (command.type === 'ticketpanel') {
    if (!config.ticketsEnabled) {
      return reply(isInteraction ? { content: 'Tickets are disabled.', ephemeral: true } : 'Tickets are disabled.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Channels permission.', ephemeral: true } : 'Bot needs Manage Channels permission.');
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:create').setLabel('Open ticket').setStyle(ButtonStyle.Primary)
    );
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(config.ticketPanelTitle).setDescription(config.ticketPanelMessage).setColor(0x2864d8)],
      components: [row]
    });
    return reply(isInteraction ? { content: 'Ticket panel posted.', ephemeral: true } : 'Ticket panel posted.');
  }

  if (command.type === 'rolepanel') {
    if (!config.rolesEnabled || config.selfRoles.length === 0) {
      return reply(isInteraction ? { content: 'Self roles are not configured.', ephemeral: true } : 'Self roles are not configured.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Roles permission.', ephemeral: true } : 'Bot needs Manage Roles permission.');
    }
    const rows = [];
    for (let i = 0; i < config.selfRoles.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          config.selfRoles.slice(i, i + 5).map((role) =>
            new ButtonBuilder()
              .setCustomId(`selfrole:${role.roleId}`)
              .setLabel(role.label)
              .setStyle(ButtonStyle.Secondary)
          )
        )
      );
    }
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(config.selfRolePanelTitle).setDescription(config.selfRolePanelMessage).setColor(0x2864d8)],
      components: rows
    });
    return reply(isInteraction ? { content: 'Role panel posted.', ephemeral: true } : 'Role panel posted.');
  }

  // ΓöÇΓöÇ League of Legends commands ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
}
