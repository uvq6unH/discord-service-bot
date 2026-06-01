import { memberCanUseCommand } from '../../commandAccess.js';
import { AUTO_DEFER_COMMAND_TYPES } from '../constants.js';
import { renderCommandResponse } from '../responses.js';

export async function createCommandContext({ client, config, command, source, args }) {
  const isInteraction = 'isChatInputCommand' in source;
  const guild = source.guild;
  const channel = source.channel;
  const user = isInteraction ? source.user : source.author;
  const permissions = isInteraction ? source.memberPermissions : source.member?.permissions;

  const reply = async (payload) => {
    if (isInteraction) {
      if (source.deferred && !source.replied) {
        if (typeof payload === 'string') return source.editReply(payload);
        const { ephemeral, ...editablePayload } = payload;
        return source.editReply(editablePayload);
      }
      if (source.replied) return source.followUp(payload);
      return source.reply(payload);
    }
    return source.reply(payload);
  };

  const context = {
    channelId: channel.id,
    guildName: guild.name,
    userId: user.id,
    username: user.username
  };

  const actorMember = isInteraction ? source.member : source.member;
  if (!memberCanUseCommand(actorMember, command)) {
    const denied = isInteraction
      ? { content: 'You do not have permission to use this command.', ephemeral: true }
      : 'You do not have permission to use this command.';
    return { denied: true, deniedResult: reply(denied) };
  }

  if (isInteraction && AUTO_DEFER_COMMAND_TYPES.has(command.type) && !source.deferred && !source.replied) {
    await source.deferReply();
  }

  return {
    denied: false,
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  };
}
