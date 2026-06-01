import { EmbedBuilder } from 'discord.js';

export function buildServerEmbed(guild) {
  return new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Members', value: String(guild.memberCount ?? 'Unknown'), inline: true },
      { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
    )
    .setColor(0x2864d8);
}

export function buildUserEmbed(user, member = null) {
  const embed = new EmbedBuilder()
    .setTitle(user.tag ?? user.username)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User ID', value: user.id, inline: true },
      { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
    )
    .setColor(0x2864d8);

  if (member?.joinedTimestamp) {
    embed.addFields({ name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
  }

  return embed;
}

export function buildAvatarEmbed(user) {
  return new EmbedBuilder()
    .setTitle(`${user.username}'s avatar`)
    .setImage(user.displayAvatarURL({ size: 1024 }))
    .setColor(0x2864d8);
}

export async function resolveMentionedUser(client, guild, args, fallbackUser) {
  const id = args.match(/\d{17,20}/)?.[0] ?? fallbackUser.id;
  const member = await guild.members.fetch(id).catch(() => null);
  const user = member?.user ?? (await client.users.fetch(id).catch(() => null)) ?? fallbackUser;
  return { user, member };
}
