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
      if (['core', 'chung', 'general', 'custom', 'hệ thống', 'tiện ích'].includes(lowerArgs)) {
        selectedGroup = 'core';
      } else if (['mod', 'moderation', 'kiểm duyệt', 'quản lý', 'security', 'bảo mật'].includes(lowerArgs)) {
        selectedGroup = 'moderation';
      } else if (['user', 'levels', 'member', 'rank', 'thành viên', 'cấp độ', 'xp'].includes(lowerArgs)) {
        selectedGroup = 'levels';
      } else if (['economy', 'eco', 'game', 'games', 'kinh tế', 'trò chơi', 'money'].includes(lowerArgs)) {
        selectedGroup = 'economy';
      } else if (['riot', 'lol', 'tft', 'esports', 'liên minh', 'lck', 'lcp'].includes(lowerArgs)) {
        selectedGroup = 'riot';
      } else if (['music', 'voice', 'audio', 'nhạc', 'âm nhạc', 'kênh thoại'].includes(lowerArgs)) {
        selectedGroup = 'music';
      } else if (['services', 'remind', 'ai', 'nhắc nhở', 'trí tuệ nhân tạo'].includes(lowerArgs)) {
        selectedGroup = 'services';
      }
    }

    const payload = await buildHelpPayload(client, config, guild, user.id, selectedGroup);
    return reply(payload);
  
}
