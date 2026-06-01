export function formatMessage(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name);
}

export async function sendLog(guild, config, message) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}

export async function sendTicketLog(guild, config, message) {
  const channelId = config.ticketLogChannelId || config.logChannelId;
  if (!channelId) {
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}
