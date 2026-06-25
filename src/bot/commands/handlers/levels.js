import { EmbedBuilder } from 'discord.js';
import { resolveMentionedUser } from '../../embeds.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleLevels(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  if (!['rank','leaderboard'].includes(command.type)) return;

  if (command.type === 'rank') {
    if (!config.levelsEnabled) {
      return reply(isInteraction ? { content: 'Levels are disabled.', ephemeral: true } : 'Levels are disabled.');
    }
    const targetUser = isInteraction ? source.options.getUser('target') ?? user : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const rank = await client.stateStore.getRank(guild.id, target.user.id, config.xpBase, config.xpExponent);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${target.user.username}'s rank`)
          .addFields({ name: 'Level', value: String(rank.level), inline: true }, { name: 'XP', value: String(rank.xp), inline: true })
          .setColor(0x2864d8)
      ]
    });
  }

  if (command.type === 'leaderboard') {
    if (!config.levelsEnabled) {
      return reply(isInteraction ? { content: 'Levels are disabled.', ephemeral: true } : 'Levels are disabled.');
    }
    const top = await client.stateStore.getLeaderboard(guild.id, 10, config.xpBase, config.xpExponent);
    const description = top.length
      ? top.map((entry, index) => `${index + 1}. <@${entry.userId}> - level ${entry.level}, ${entry.xp} XP`).join('\n')
      : 'No XP yet.';
    return reply({ embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription(description).setColor(0x2864d8)] });
  }
}
