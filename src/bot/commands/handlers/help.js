import { buildHelpPayload } from '../../help.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleHelp(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  if (command.type !== 'help') return;


    let selectedGroup = null;
    if (isInteraction) {
      selectedGroup = source.options.getString('group');
    } else {
      const lowerArgs = args?.trim().toLowerCase();
      if (['chung', 'general', 'custom', 'lệnh chung'].includes(lowerArgs)) {
        selectedGroup = 'general';
      } else if (['thành viên', 'user', 'member', 'levels', 'xp', 'rank', 'cấp độ'].includes(lowerArgs)) {
        selectedGroup = 'user';
      } else if (['máy chủ', 'server', 'broadcast', 'phát thanh', 'announcement'].includes(lowerArgs)) {
        selectedGroup = 'server';
      } else if (['kiểm duyệt', 'moderation', 'mod', 'security', 'bảo mật'].includes(lowerArgs)) {
        selectedGroup = 'moderation';
      } else if (['tương tác', 'interactions', 'role', 'ticket', 'nút bấm'].includes(lowerArgs)) {
        selectedGroup = 'interactions';
      } else if (['lol', 'league', 'liên minh', 'lsd', 'tướng', 'tft', 'teamfight', 'tactics', 'tftlsd', 'đấu trường'].includes(lowerArgs)) {
        selectedGroup = 'lol';
      }
    }

    const payload = await buildHelpPayload(client, config, guild, user.id, selectedGroup);
    return reply(payload);
  
}
