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
            const embeds = dailyData.map((group, idx) => {
              const matchesText = group.matches.map((m) => {
                const unixSec = Math.floor(new Date(m.startTime).getTime() / 1000);
                const timeTag = `<t:${unixSec}:t>`;
                const relativeTag = `<t:${unixSec}:R>`;
                const stateBadge = m.state === 'inProgress' ? '🔴 **ĐANG THI ĐẤU**' : (m.state === 'completed' ? '✅ **ĐÃ KẾT THÚC**' : '📅 **SẮP BẮT ĐẦU**');
                return (
                  `⚔️ **${m.team1}** 🆚 **${m.team2}**\n` +
                  `⏰ **Thời gian:** ${timeTag} (${relativeTag}) | 🎮 **Thể thức:** \`${m.strategy || 'BO3'}\` | ${stateBadge}\n`
                );
              }).join('\n');

              const card = new EmbedBuilder()
                .setTitle(`${group.league.icon} ${group.league.name.toUpperCase()}`)
                .setDescription(matchesText || 'Không có trận đấu nào.')
                .setColor(idx % 2 === 0 ? 0xFF4655 : 0x00FF88);

              const firstLogo = group.matches.find(m => m.logo1)?.logo1;
              if (firstLogo) card.setThumbnail(firstLogo);

              if (idx === dailyData.length - 1) {
                card.setFooter({ text: `Riot LoL Esports Pipeline • Today (${todayYMD})` }).setTimestamp();
              }
              return card;
            });

            await channel.send({ content: `📅 **[LỊCH THI ĐẤU HÀNG NGÀY - ${todayYMD}]**`, embeds }).catch((err) => console.error('[esportsWorker] Send daily error:', err.message));

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
                const unixSec = Math.floor(new Date(match.startTime).getTime() / 1000);

                const alertEmbed = new EmbedBuilder()
                  .setTitle(`⚔️ TRẬN ĐẤU SẮP DIỄN RA TRONG 15 PHÚT!`)
                  .setDescription(
                    `### ${scheduleData.league.icon} ${scheduleData.league.name.toUpperCase()}\n\n` +
                    `🔥 **Trận đấu:** **${match.team1}** 🆚 **${match.team2}**\n` +
                    `⏰ **Thời gian:** <t:${unixSec}:t> (<t:${unixSec}:R>)\n` +
                    `🎮 **Thể thức:** \`${match.strategy || 'BO3'}\``
                  )
                  .setColor(0xFF0055)
                  .setTimestamp();

                if (match.logo1) alertEmbed.setThumbnail(match.logo1);

                const leagueRole = config.esportsLeagueRoles?.[leagueKey.toLowerCase()];
                const pingText = leagueRole ? `<@&${leagueRole}>` : '';

                await channel.send({
                  content: `🚨 **[ESPORTS LIVE ALERT]** ${pingText}`.trim(),
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
