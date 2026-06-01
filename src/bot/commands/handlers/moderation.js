import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { canModerateMember, hasModerationPermission } from '../../../commandAccess.js';
import { renderCommandResponse } from '../../responses.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleModeration(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  const _mod = new Set(['purge','warn','kick','ban','timeout','warnings','clearwarns']);
  if (!_mod.has(command.type)) return;

  if (command.type === 'purge') {
    const amount = isInteraction ? source.options.getInteger('amount') : Number.parseInt(args, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return reply(isInteraction ? { content: 'Amount must be between 1 and 100.', ephemeral: true } : 'Amount must be between 1 and 100.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
      return reply(isInteraction ? { content: 'You need Manage Messages permission.', ephemeral: true } : 'You need Manage Messages permission.');
    }
    if (!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageMessages)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Messages permission in this channel.', ephemeral: true } : 'Bot needs Manage Messages permission in this channel.');
    }
    const deleted = await channel.bulkDelete(amount, true);
    const skipped = amount - deleted.size;
    const content = renderCommandResponse(command.response, {
      client,
      context,
      config,
      args: String(amount)
    }).replaceAll('{count}', String(deleted.size)) +
      (skipped > 0 ? ` Skipped ${skipped} message(s) that were older than 14 days or unavailable.` : '');
    return reply(isInteraction ? { content, ephemeral: true } : content);
  }

  if (['warn', 'kick', 'ban', 'timeout'].includes(command.type)) {
    if (!config.moderationEnabled) {
      return reply(isInteraction ? { content: 'Moderation is disabled.', ephemeral: true } : 'Moderation is disabled.');
    }

    const targetUser = isInteraction ? source.options.getUser('target') : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const reason = isInteraction
      ? source.options.getString('reason') ?? 'No reason provided'
      : args.replace(/<@!?\d{17,20}>/, '').replace(/\b\d+\b/, '').trim() || 'No reason provided';

    if (!target.member && command.type !== 'warn') {
      return reply(isInteraction ? { content: 'Target member not found.', ephemeral: true } : 'Target member not found.');
    }

    if (command.type === 'kick') {
      if (!permissions?.has(PermissionFlagsBits.KickMembers)) {
        return reply(isInteraction ? { content: 'You need Kick Members permission.', ephemeral: true } : 'You need Kick Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Kick Members permission.', ephemeral: true } : 'Bot needs Kick Members permission.');
      }
      await target.member.kick(reason);
    }

    if (command.type === 'ban') {
      if (!permissions?.has(PermissionFlagsBits.BanMembers)) {
        return reply(isInteraction ? { content: 'You need Ban Members permission.', ephemeral: true } : 'You need Ban Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Ban Members permission.', ephemeral: true } : 'Bot needs Ban Members permission.');
      }
      await target.member.ban({ reason });
    }

    if (command.type === 'timeout') {
      if (!permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return reply(isInteraction ? { content: 'You need Moderate Members permission.', ephemeral: true } : 'You need Moderate Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Moderate Members permission.', ephemeral: true } : 'Bot needs Moderate Members permission.');
      }
      const minutes = isInteraction ? source.options.getInteger('minutes') : Number.parseInt(args.match(/\b\d+\b/)?.[0] ?? '10', 10);
      await target.member.timeout(Math.min(minutes, 10080) * 60 * 1000, reason);
      const content = command.response
        .replaceAll('{target}', `<@${target.user.id}>`)
        .replaceAll('{reason}', reason)
        .replaceAll('{minutes}', String(minutes));
      await sendLog(guild, config, content);
      return reply(isInteraction ? { content, ephemeral: true } : content);
    }

    const content = command.response.replaceAll('{target}', `<@${target.user.id}>`).replaceAll('{reason}', reason);
    if (command.type === 'warn') {
      await client.stateStore.addWarning(guild.id, target.user.id, user.id, reason);
    }
    await sendLog(guild, config, content);
    return reply(isInteraction ? { content, ephemeral: true } : content);
  }

  if (['warnings', 'clearwarns'].includes(command.type)) {
    if (!config.moderationEnabled) {
      return reply(isInteraction ? { content: 'Moderation is disabled.', ephemeral: true } : 'Moderation is disabled.');
    }
    const targetUser = isInteraction ? source.options.getUser('target') : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);

    if (command.type === 'clearwarns') {
      if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
        return reply(isInteraction ? { content: 'You need Manage Messages permission.', ephemeral: true } : 'You need Manage Messages permission.');
      }
      const count = await client.stateStore.clearWarnings(guild.id, target.user.id);
      const content = command.response.replaceAll('{target}', `<@${target.user.id}>`).replaceAll('{count}', String(count));
      await sendLog(guild, config, content);
      return reply(isInteraction ? { content, ephemeral: true } : content);
    }

    const warnings = await client.stateStore.getWarnings(guild.id, target.user.id);
    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${target.user.username}`)
      .setColor(0xd88928)
      .setDescription(
        warnings.length
          ? warnings
            .slice(-10)
            .map((warning, index) => `${index + 1}. <t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:R> by <@${warning.moderatorId}> - ${warning.reason}`)
            .join('\n')
          : 'No warnings.'
      );
    return reply({ embeds: [embed], ephemeral: isInteraction });
  }
}
