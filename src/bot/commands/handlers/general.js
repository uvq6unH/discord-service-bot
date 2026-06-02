import { PermissionFlagsBits } from 'discord.js';
import { buildServerEmbed, buildUserEmbed, buildAvatarEmbed, resolveMentionedUser } from '../../embeds.js';
import { renderCommandResponse } from '../../responses.js';
import { sanitizeAnnouncementText } from '../../../commandAccess.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleGeneral(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  const _general = new Set(['custom', 'ping', 'config', 'server', 'user', 'avatar', 'say', 'announce']);
  if (!_general.has(command.type)) return;

  if (['custom', 'ping', 'config'].includes(command.type)) {
    return reply(renderCommandResponse(command.response, { client, context, config, args }));
  }

  if (command.type === 'server') {
    return reply({ embeds: [buildServerEmbed(guild)] });
  }

  if (command.type === 'user' || command.type === 'avatar') {
    const selectedUser = isInteraction ? source.options.getUser('target') ?? user : null;
    const target = selectedUser
      ? { user: selectedUser, member: await guild.members.fetch(selectedUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const embed = command.type === 'avatar' ? buildAvatarEmbed(target.user) : buildUserEmbed(target.user, target.member);
    return reply({ embeds: [embed] });
  }

  if (command.type === 'say') {
    if (!permissions?.has(PermissionFlagsBits.ManageMessages) && !permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Messages or Manage Server permission.', ephemeral: true } : 'You need Manage Messages or Manage Server permission.');
    }

    const messageText = isInteraction ? source.options.getString('message') : args;
    if (!messageText?.trim()) {
      return reply(isInteraction ? { content: 'Missing message.', ephemeral: true } : 'Missing message.');
    }
    if (isInteraction) {
      await source.reply({ content: 'Sent.', ephemeral: true });
      return channel.send(sanitizeAnnouncementText(messageText));
    }
    if (!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageMessages)) {
      return reply('Bot needs Manage Messages permission to remove the original command message.');
    }
    try {
      await source.delete();
    } catch {
      return reply('Could not delete the original command message. Check bot permissions and channel overrides.');
    }
    return channel.send(sanitizeAnnouncementText(messageText));
  }

  if (command.type === 'announce') {
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!config.announcementsEnabled || !config.announcementChannelId) {
      return reply(isInteraction ? { content: 'Announcements are not configured. Set a channel in the dashboard.', ephemeral: true } : 'Announcements are not configured.');
    }
    const messageText = isInteraction ? source.options.getString('message') : args;
    if (!messageText?.trim()) {
      return reply(isInteraction ? { content: 'Missing announcement message.', ephemeral: true } : 'Missing announcement message.');
    }
    const announcementChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!announcementChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found or invalid.', ephemeral: true } : 'Announcement channel not found.');
    }
    const mention = config.announcementMention
      ? sanitizeAnnouncementText(config.announcementMention) + ' '
      : '';
    await announcementChannel.send(mention + sanitizeAnnouncementText(messageText));
    return reply(isInteraction
      ? { content: `Announcement sent to <#${config.announcementChannelId}>.`, ephemeral: true }
      : `Announcement sent to <#${config.announcementChannelId}>.`);
  }
}