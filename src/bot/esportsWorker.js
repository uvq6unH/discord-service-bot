import { EmbedBuilder } from 'discord.js';
import { getDailyMatchesForLeagues, getEsportsSchedule } from '../esportsApi.js';

const _postedDailyCache = new Set();
const _postedPre15Cache = new Set();

export function startEsportsWorker(client, configStore, redis) {
  console.log('[esportsWorker] Starting Automated Esports Daily Broadcast & 15-Min Pre-Match Alert Worker...');

  // Check every 60 seconds
  setInterval(async () => {
    try {
      await processEsportsWorkerCycle(client, configStore, redis);
    } catch (err) {
      console.error('[esportsWorker] Error in worker cycle:', err.message);
    }
  }, 60 * 1000).unref();
}

async function processEsportsWorkerCycle(client, configStore, redis) {
  const now = new Date();
  const todayYMD = now.toISOString().slice(0, 10);
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await configStore.getGuildConfig(guild.id);
      if (!config || !config.esportsNotifyEnabled || !config.esportsChannelId) {
        continue;
      }

      const channel = guild.channels.cache.get(config.esportsChannelId);
      if (!channel || !channel.isTextBased()) {
        continue;
      }

      const targetLeagues = Array.isArray(config.esportsLeagues) && config.esportsLeagues.length > 0
        ? config.esportsLeagues
        : ['lck', 'lcp', 'worlds', 'msi', 'lpl', 'lec', 'lcs'];

      // ── Job 1: Daily Schedule Broadcast ───────────────────────────────────
      const configuredDailyTime = config.esportsDailyTime || '08:00';
      if (currentHHMM === configuredDailyTime) {
        const dailyKey = `guild:${guild.id}:esports_daily:${todayYMD}`;
        const alreadyPosted = redis
          ? await redis.get(dailyKey).catch(() => null)
          : _postedDailyCache.has(dailyKey);

        if (!alreadyPosted) {
          const dailyData = await getDailyMatchesForLeagues(targetLeagues, todayYMD);
          if (dailyData && dailyData.length > 0) {
            const embed = new EmbedBuilder()
              .setTitle(`📅 LỊCH THI ĐẤU ESPORTS NỔI BẬT HÔM NAY (${todayYMD})`)
              .setDescription(`Tổng hợp lịch thi đấu của các giải đấu: **${targetLeagues.map(l => l.toUpperCase()).join(', ')}**`)
              .setColor(0xFF4655)
              .setTimestamp()
              .setFooter({ text: 'Riot LoL Esports Live Schedule Pipeline' });

            for (const group of dailyData) {
              const matchesText = group.matches.map((m, idx) => {
                const timeStr = new Date(m.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                return `• **${m.team1}** vs **${m.team2}** — \`${timeStr}\` (${m.strategy || 'BO3'})`;
              }).join('\n');

              embed.addFields({
                name: `${group.league.icon} ${group.league.name}`,
                value: matchesText || 'Không có trận đấu nào.',
                inline: false
              });
            }

            await channel.send({ embeds: [embed] }).catch((err) => console.error('[esportsWorker] Send daily error:', err.message));

            if (redis) {
              await redis.set(dailyKey, '1', { ex: 86400 * 2 }).catch(() => null);
            } else {
              _postedDailyCache.add(dailyKey);
            }
          }
        }
      }

      // ── Job 2: 15-Minute Pre-Match Live Alert ──────────────────────────────
      if (config.esportsPreMatchAlert !== false) {
        for (const leagueKey of targetLeagues) {
          const scheduleData = await getEsportsSchedule(leagueKey).catch(() => null);
          const matches = scheduleData?.matches || [];

          for (const match of matches) {
            if (!match.startTime) continue;
            const matchTime = new Date(match.startTime).getTime();
            const diffMinutes = (matchTime - Date.now()) / (60 * 1000);

            // Trigger alert if match starts in 0 - 16 minutes
            if (diffMinutes >= 0 && diffMinutes <= 16) {
              const matchId = match.id || `${leagueKey}_${match.team1}_${match.team2}_${match.startTime}`;
              const preKey = `guild:${guild.id}:esports_pre15:${matchId}`;

              const alreadyAlerted = redis
                ? await redis.get(preKey).catch(() => null)
                : _postedPre15Cache.has(preKey);

              if (!alreadyAlerted) {
                const timeStr = new Date(match.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                const alertEmbed = new EmbedBuilder()
                  .setTitle(`⚔️ TRẬN ĐẤU SẮP DIỄN RA TRONG 15 PHÚT!`)
                  .setDescription(`Trận đấu thuộc giải **${scheduleData.league.icon} ${scheduleData.league.name}** sắp khởi tranh!`)
                  .addFields(
                    { name: '🔥 Trận đấu', value: `**${match.team1}** 🆚 **${match.team2}**`, inline: true },
                    { name: '⏰ Thời gian', value: `\`${timeStr}\` (${Math.round(diffMinutes)} phút nữa)`, inline: true },
                    { name: '🎮 Thể thức', value: match.strategy || 'BO3', inline: true }
                  )
                  .setColor(0xFF0055)
                  .setTimestamp();

                if (match.logo1) alertEmbed.setThumbnail(match.logo1);

                await channel.send({
                  content: `🚨 **[ESPORTS LIVE ALERT]** <@&everyone>`,
                  embeds: [alertEmbed]
                }).catch((err) => console.error('[esportsWorker] Send pre-match alert error:', err.message));

                if (redis) {
                  await redis.set(preKey, '1', { ex: 86400 * 2 }).catch(() => null);
                } else {
                  _postedPre15Cache.add(preKey);
                }
              }
            }
          }
        }
      }

    } catch (guildErr) {
      console.error(`[esportsWorker] Guild ${guild.id} error:`, guildErr.message);
    }
  }
}
