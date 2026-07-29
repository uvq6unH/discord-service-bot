import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getEsportsSchedule, getAvailableLeagues } from '../../../esportsApi.js';

export async function handleEsports(ctx) {
  const { command, reply, args } = ctx;
  if (!command || !['esports', 'lcs', 'lck', 'lcp', 'lpl', 'lec'].includes(command.name)) return undefined;

  let leagueKey = args?.[0] || command.name;
  if (leagueKey === 'esports') leagueKey = 'lck';

  const data = await getEsportsSchedule(leagueKey);
  const matches = data.matches || [];

  const embed = new EmbedBuilder()
    .setTitle(`${data.league.icon} Lịch Thi Đấu Esports — ${data.league.name}`)
    .setDescription(`Danh sách các trận đấu mới nhất của giải **${data.league.name}**:`)
    .setColor(0x0099FF)
    .setTimestamp()
    .setFooter({ text: 'Riot Esports Official Schedule • XeNon Bot' });

  if (matches.length === 0) {
    embed.addFields({ name: '📭 Thông báo', value: 'Hiện chưa có lịch thi đấu mới cho giải đấu này.' });
  } else {
    matches.slice(0, 6).forEach(m => {
      let statusIcon = m.state === 'inProgress' ? '🔴 **ĐANG DIỄN RA**' : (m.state === 'completed' ? '✅ **ĐÃ KẾT THÚC**' : '⏰ **SẮP DIỄN RA**');
      const timeStr = `<t:${Math.floor(new Date(m.startTime).getTime() / 1000)}:R>`;

      let vsStr = `**${m.team1}** vs **${m.team2}**`;
      if (m.state === 'completed') {
        const scorePart = (m.score1 !== null && m.score2 !== null) ? `[ **${m.score1}** ] 🆚 [ **${m.score2}** ]` : 'vs';
        vsStr = `**${m.team1}** ${scorePart} **${m.team2}**`;
        if (m.winnerName) {
          statusIcon += ` • 🏆 **${m.winnerName} WIN**`;
        }
      }

      const matchText = `⚔️ ${vsStr} (${m.strategy})\nTrạng thái: ${statusIcon} • ${timeStr}`;
      embed.addFields({ name: `🏆 ${m.blockName}`, value: matchText, inline: false });
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('esports:lck').setLabel('🇰🇷 LCK').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('esports:lcp').setLabel('🌏 LCP').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('esports:worlds').setLabel('🏆 Worlds').setStyle(ButtonStyle.Danger)
  );

  return reply({ embeds: [embed], components: [row] });
}
