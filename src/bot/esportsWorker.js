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

  // Get current HH:MM in Asia/Ho_Chi_Minh (UTC+7)
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const currentHHMM = timeFormatter.format(now);

  // Get YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7)
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayYMD = dateFormatter.format(now);

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
        : ['lck', 'lcp', 'lpl', 'lec', 'lcs', 'worlds', 'msi', 'first_stand', 'ewc'];

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

              if (group.league?.logoUrl) card.setThumbnail(group.league.logoUrl);

              if (idx === dailyData.length - 1) {
                card.setFooter({ text: `Riot LoL Esports Pipeline • Today (${todayYMD})` }).setTimestamp();
              }
              return card;
            });

            await channel.send({ content: `📅 **[LỊCH THI ĐẤU HÀNG NGÀY - ${todayYMD}]**`, embeds }).catch((err) => console.error('[esportsWorker] Send daily error:', err.message));
          } else {
            // Không có trận đấu — vẫn gửi thông báo để user biết bot hoạt động
            const noMatchEmbed = new EmbedBuilder()
              .setTitle('📅 Lịch thi đấu hôm nay')
              .setDescription(`Hôm nay (**${todayYMD}**) không có trận đấu nào trong các giải đang theo dõi.\n\n🔍 Các giải: ${targetLeagues.map(l => `\`${l.toUpperCase()}\``).join(', ')}`)
              .setColor(0x95A5A6)
              .setFooter({ text: 'Riot LoL Esports Pipeline' })
              .setTimestamp();
            await channel.send({ embeds: [noMatchEmbed] }).catch((err) => console.error('[esportsWorker] Send no-match daily error:', err.message));
          }

          // Mark as posted for today (both cases)
          if (redis) {
            await redis.set(dailyKey, '1', { ex: 86400 * 2 }).catch(() => null);
          } else {
            _postedDailyCache.add(dailyKey);
          }
        }
      }

      // ── Job 2: Pre-Match Live Alert (15m, 10m, 5m) ─────────────────────────
      if (config.esportsPreMatchAlert !== false) {
        for (const leagueKey of targetLeagues) {
          const scheduleData = await getEsportsSchedule(leagueKey).catch(() => null);
          const matches = scheduleData?.matches || [];

          for (const match of matches) {
            if (!match.startTime || match.state === 'completed') continue;

            const matchTime = new Date(match.startTime).getTime();
            const diffMinutes = (matchTime - Date.now()) / (60 * 1000);

            // Calculate alert milestone: 15m (14-15.9m), 10m (9-10.9m), 5m (4-5.9m)
            let stage = null;
            let stageLabel = '';
            let stageColor = 0xFF0055;

            if (diffMinutes >= 14.0 && diffMinutes <= 15.9) {
              stage = '15m';
              stageLabel = '15 PHÚT';
              stageColor = 0xFF4655;
            } else if (diffMinutes >= 9.0 && diffMinutes <= 10.9) {
              stage = '10m';
              stageLabel = '10 PHÚT';
              stageColor = 0xFF8800;
            } else if (diffMinutes >= 4.0 && diffMinutes <= 5.9) {
              stage = '5m';
              stageLabel = '5 PHÚT';
              stageColor = 0xFF0055;
            }

            if (!stage) continue;

            // Normalize match ID to prevent false key misses
            const cleanTeam1 = (match.team1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanTeam2 = (match.team2 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchMin = Math.floor(matchTime / 60000);
            const matchId = match.id || `${leagueKey}_${cleanTeam1}_${cleanTeam2}_${matchMin}`;

            const preKey = `guild:${guild.id}:esports_alert:${stage}:${matchId}`;

            const alreadyAlerted = redis
              ? await redis.get(preKey).catch(() => null)
              : _postedPre15Cache.has(preKey);

            if (!alreadyAlerted) {
              const unixSec = Math.floor(matchTime / 1000);

              const alertEmbed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU SẮP DIỄN RA TRONG ${stageLabel}!`)
                .setDescription(
                  `### ${scheduleData.league.icon} ${scheduleData.league.name.toUpperCase()}\n\n` +
                  `🔥 **Trận đấu:** **${match.team1}** 🆚 **${match.team2}**\n` +
                  `⏰ **Thời gian:** <t:${unixSec}:t> (<t:${unixSec}:R>)\n` +
                  `🎮 **Thể thức:** \`${match.strategy || 'BO3'}\``
                )
                .setColor(stageColor)
                .setTimestamp();

              if (scheduleData?.league?.logoUrl) alertEmbed.setThumbnail(scheduleData.league.logoUrl);

              const leagueRole = config.esportsLeagueRoles?.[leagueKey.toLowerCase()];
              const pingText = leagueRole ? `<@&${leagueRole}>` : '';

              await channel.send({
                content: `🚨 **[ESPORTS LIVE ALERT - ${stageLabel}]** ${pingText}`.trim(),
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

    } catch (guildErr) {
      console.error(`[esportsWorker] Guild ${guild.id} error:`, guildErr.message);
    }
  }
}
