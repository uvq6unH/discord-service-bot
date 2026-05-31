/**
 * tftCommands.js — Teamfight Tactics command handlers
 *
 * Commands (song song với LoL):
 *   /tftlsd   [summoner] [region]         — Lịch sử 5 trận TFT gần nhất
 *   /tft      [summoner] [region]         — Hồ sơ TFT (rank, top traits)
 *   /tftmatch [summoner] [region] [index] — Chi tiết 1 trận TFT cụ thể
 *                                           (bài chơi, con, đồ, augment)
 *   /tftlink  [summoner] [region]         — Liên kết tài khoản (dùng chung với LoL)
 *   /tftunlink                            — Bỏ liên kết
 */

import { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
import {
  parseRiotId,
  getAccountByRiotId,
  getSummonerByPuuid,
  getRegionChoices,
  formatDuration,
  REGIONS,
} from './lolApi.js';
import {
  getTftRankedInfo,
  getTftMatchHistory,
  getTftMatchDetail,
  getTftItems,
  getTftTraits,
  getTftChampions,
  getTftAugments,
  getTftStaticData,
  formatTftRank,
  getTftQueueName,
  placementEmoji,
  TFT_RANK_EMOJIS,
} from './tftApi.js';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  tft:    0xc89b3c,
  win:    0x3ba55d,  // top 4
  lose:   0xed4245,  // bot 4
  gold:   0xf1c40f,
  info:   0x1a78c2,
  trait:  0x9b59b6,
};

// ── Summoner resolution (reuses linked account, same as LoL) ─────────────────
async function resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey) {
  let riotIdStr, region;

  if (isInteraction) {
    riotIdStr = source.options.getString('summoner');
    region = (source.options.getString('region') ?? 'vn2').toLowerCase();
  } else {
    const parts = args.trim().split(/\s+/);
    region = (parts[parts.length - 1]?.toLowerCase() in ({
      vn2:1, na1:1, euw1:1, kr:1, jp1:1, sg2:1, eun1:1,
      br1:1, la1:1, la2:1, oc1:1, ph2:1, ru:1, th2:1, tr1:1, tw2:1
    })) ? parts.pop() : 'vn2';
    riotIdStr = parts.join(' ');
  }

  // If no summoner given, try linked account (shared with LoL)
  if (!riotIdStr) {
    const userId = isInteraction ? source.user.id : source.author.id;
    const linked = await stateStore.getLinkedLolAccount(guildId, userId);
    if (linked) { riotIdStr = linked.riotId; region = linked.region; }
  }

  if (!riotIdStr) throw new Error('Vui lòng nhập tên người chơi (VD: PlayerName#VN2) hoặc dùng `/tftlink` để liên kết tài khoản.');

  const parsed = parseRiotId(riotIdStr);
  if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG` (VD: `PlayerName#VN2`)');

  const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
  const summoner = await getSummonerByPuuid(account.puuid, region, apiKey);
  return { account, summoner, region };
}

// ── /tftlsd — TFT match history list ─────────────────────────────────────────
export async function handleTftLsd({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const matchIds = await getTftMatchHistory(account.puuid, region, apiKey, 5);

    if (!matchIds.length) return editOrReply(source, isInteraction, {
      content: `❌ Không tìm thấy lịch sử TFT cho **${account.gameName}#${account.tagLine}** (${region.toUpperCase()}).`
    });

    const [matches, rankedEntries] = await Promise.all([
      Promise.all(matchIds.map((id) => getTftMatchDetail(id, region, apiKey))),
      getTftRankedInfo(account.puuid, region, apiKey),
    ]);

    // Load static data once for the whole batch
    const [itemsMap, champMap, augMap] = await Promise.all([
      getTftItems(), getTftChampions(), getTftAugments(),
    ]);

    const lines = matches.map((m, i) => {
      const p = m.info.participants.find((x) => x.puuid === account.puuid);
      if (!p) return '';
      const place = p.placement;
      const placeStr = `${placementEmoji(place)} **Hạng ${place}/8**`;
      const top4 = place <= 4;
      const dur = formatDuration(m.info.game_length ? Math.round(m.info.game_length) : 0);
      const queue = getTftQueueName(m.info.queue_id);
      const level = p.level ?? '?';

      // Top 3 units by tier
      const topUnits = (p.units ?? [])
        .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0))
        .slice(0, 3)
        .map((u) => {
          const champName = champMap[u.character_id]?.name ?? u.character_id ?? '?';
          const stars = '⭐'.repeat(Math.min(u.tier ?? 1, 3));
          return `${champName}${stars}`;
        }).join(', ');

      // Active augments
      const augs = (p.augments ?? [])
        .slice(0, 2)
        .map((a) => augMap[a]?.name ?? a)
        .join(' / ') || '—';

      return `\`${i + 1}\` ${placeStr} — ${queue} · ⏱ ${dur} · Lv.${level}\n` +
        `   🃏 ${topUnits || '—'} | 🔮 ${augs}`;
    }).filter(Boolean);

    const ranked = rankedEntries.find((e) => e.queueType === 'RANKED_TFT');
    const hyper  = rankedEntries.find((e) => e.queueType === 'RANKED_TFT_TURBO');

    const patch = `https://ddragon.leagueoflegends.com/cdn/img/profileicon/${summoner.profileIconId}.png`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: patch })
      .setTitle('📋 Lịch Sử 5 Trận TFT Gần Nhất')
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: '🏆 Rank TFT', value: ranked ? formatTftRank(ranked) : 'Chưa xếp hạng', inline: false },
        { name: '⚡ Hyper Roll', value: hyper ? formatTftRank(hyper) : 'Chưa xếp hạng', inline: false },
      )
      .setFooter({ text: `Region: ${region.toUpperCase()} • Dùng /tftmatch để xem chi tiết trận` })
      .setColor(C.tft)
      .setThumbnail(patch);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tft — TFT Profile ────────────────────────────────────────────────────────
export async function handleTftProfile({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const [rankedEntries, recentIds] = await Promise.all([
      getTftRankedInfo(account.puuid, region, apiKey),
      getTftMatchHistory(account.puuid, region, apiKey, 10),
    ]);

    const ranked = rankedEntries.find((e) => e.queueType === 'RANKED_TFT');
    const hyper  = rankedEntries.find((e) => e.queueType === 'RANKED_TFT_TURBO');

    // Compute avg placement from last 10 matches
    let avgPlace = '—';
    if (recentIds.length) {
      const recentMatches = await Promise.all(recentIds.slice(0, 10).map((id) => getTftMatchDetail(id, region, apiKey)));
      const placements = recentMatches
        .map((m) => m.info.participants.find((p) => p.puuid === account.puuid)?.placement)
        .filter(Boolean);
      if (placements.length) {
        avgPlace = (placements.reduce((a, b) => a + b, 0) / placements.length).toFixed(2);
      }
    }

    // Trait frequency from last 10 matches
    const traitCounts = {};
    if (recentIds.length) {
      const recentMatches = await Promise.all(recentIds.slice(0, 10).map((id) => getTftMatchDetail(id, region, apiKey)));
      for (const m of recentMatches) {
        const p = m.info.participants.find((x) => x.puuid === account.puuid);
        if (!p) continue;
        for (const t of (p.traits ?? [])) {
          if ((t.tier_current ?? 0) > 0) {
            traitCounts[t.name] = (traitCounts[t.name] ?? 0) + 1;
          }
        }
      }
    }
    const topTraits = Object.entries(traitCounts)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 5)
      .map(([name, cnt]) => `**${name}** — ${cnt}/10 ván`)
      .join('\n') || 'Chưa có dữ liệu';

    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/img/profileicon/${summoner.profileIconId}.png`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: iconUrl })
      .setTitle('🎮 Hồ Sơ TFT')
      .setThumbnail(iconUrl)
      .addFields(
        { name: '📊 Level', value: `**${summoner.summonerLevel}**`, inline: true },
        { name: '🌏 Region', value: region.toUpperCase(), inline: true },
        { name: '📍 Avg. Placement (10 ván)', value: `**${avgPlace}**`, inline: true },
        { name: '🏆 Rank TFT', value: ranked ? formatTftRank(ranked) : 'Chưa xếp hạng', inline: false },
        { name: '⚡ Hyper Roll', value: hyper ? formatTftRank(hyper) : 'Chưa xếp hạng', inline: false },
        { name: '🔮 Traits hay dùng (10 ván)', value: topTraits, inline: false },
      )
      .setFooter({ text: 'Dùng /tftlsd để xem lịch sử trận đấu • /tftmatch để xem chi tiết' })
      .setColor(C.info);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftmatch — Single TFT match detail ──────────────────────────────────────
// Hiển thị: bài (comp/traits), con đã mang (units + stars), đồ (items), augment
export async function handleTftMatch({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

  if (isInteraction) await source.deferReply();

  try {
    const matchIndex = isInteraction
      ? (source.options.getInteger('index') ?? 1) - 1
      : 0;

    const { account, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const matchIds = await getTftMatchHistory(account.puuid, region, apiKey, Math.max(matchIndex + 1, 1));

    if (!matchIds[matchIndex]) return editOrReply(source, isInteraction, { content: 'Không tìm thấy trận đấu.' });

    const [match, itemsMap, champMap, augMap] = await Promise.all([
      getTftMatchDetail(matchIds[matchIndex], region, apiKey),
      getTftItems(), getTftChampions(), getTftAugments(),
    ]);

    const me = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!me) return editOrReply(source, isInteraction, { content: 'Không tìm thấy dữ liệu người chơi trong trận.' });

    const { info } = match;
    const place = me.placement;
    const top4 = place <= 4;
    const dur = formatDuration(info.game_length ? Math.round(info.game_length) : 0);
    const queue = getTftQueueName(info.queue_id);
    const level = me.level ?? '?';
    const gold = me.gold_left ?? 0;

    // ── Augments ───────────────────────────────────────────────────────────
    const augLines = (me.augments ?? []).map((a, i) => {
      const aug = augMap[a];
      const tier = aug?.tier === 3 ? '🟣 Lăng kính' : aug?.tier === 2 ? '🟡 Vàng' : '⚪ Bạc';
      return `${tier} **${aug?.name ?? a}**${aug?.desc ? `\n> ${aug.desc.slice(0, 120)}` : ''}`;
    }).join('\n\n') || '—';

    // ── Units (con đã mang) ────────────────────────────────────────────────
    const unitsSorted = (me.units ?? []).sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (b.rarity ?? 0) - (a.rarity ?? 0));
    const unitLines = unitsSorted.map((u) => {
      const champ = champMap[u.character_id];
      const name = champ?.name ?? u.character_id ?? '?';
      const stars = '⭐'.repeat(Math.min(u.tier ?? 1, 3));
      const cost = champ?.cost ?? 1;
      const costColor = ['', '⬜', '🟢', '🔵', '🟣', '🟡'][cost] ?? '';
      // Items on this unit
      const unitItems = (u.itemNames ?? u.items ?? [])
        .map((it) => {
          const item = typeof it === 'string' ? itemsMap[it] : itemsMap[String(it)];
          return item?.name ?? it;
        }).join(', ');
      return `${costColor} **${name}**${stars}${unitItems ? ` — 🛡️ ${unitItems}` : ''}`;
    }).join('\n') || '—';

    // ── Traits (bài/comp) ─────────────────────────────────────────────────
    const activeTraits = (me.traits ?? [])
      .filter((t) => (t.tier_current ?? 0) > 0)
      .sort((a, b) => (b.tier_current ?? 0) - (a.tier_current ?? 0) || (b.num_units ?? 0) - (a.num_units ?? 0));
    const traitLines = activeTraits.map((t) => {
      const tierStars = t.tier_current >= 3 ? '🌟' : t.tier_current === 2 ? '✨' : '•';
      return `${tierStars} **${t.name}** (${t.num_units ?? '?'} quân)`;
    }).join('\n') || '—';

    // ── All items on the board (unique) ────────────────────────────────────
    const allItemNames = new Set();
    for (const u of (me.units ?? [])) {
      for (const it of (u.itemNames ?? u.items ?? [])) {
        const item = typeof it === 'string' ? itemsMap[it] : itemsMap[String(it)];
        allItemNames.add(item?.name ?? it);
      }
    }
    const itemSummary = [...allItemNames].join(', ') || '—';

    // ── Leaderboard of all 8 players ──────────────────────────────────────
    const allPlayers = info.participants
      .sort((a, b) => a.placement - b.placement)
      .map((p) => {
        const isMe = p.puuid === account.puuid;
        const topTraitName = (p.traits ?? [])
          .filter((t) => (t.tier_current ?? 0) > 0)
          .sort((a, b) => (b.tier_current ?? 0) - (a.tier_current ?? 0))[0]?.name ?? '—';
        const tag = isMe ? ' **← bạn**' : '';
        return `${placementEmoji(p.placement)} ${p.puuid === account.puuid ? `__${p.augments?.length ? 'Bạn' : 'Bạn'}__` : ''}${topTraitName}${tag}`;
      }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`${placementEmoji(place)} Hạng ${place}/8 — TFT`)
      .setDescription(`**${queue}** · Lv.${level} · ⏱ ${dur} · 💰 ${gold} vàng còn lại`)
      .setColor(top4 ? C.win : C.lose)
      .addFields(
        { name: '🔮 Augments (Tăng cường)', value: augLines.slice(0, 1024), inline: false },
        { name: '🃏 Bài / Comp (Traits)', value: traitLines.slice(0, 1024), inline: false },
        { name: '🦸 Quân đã mang', value: unitLines.slice(0, 1024), inline: false },
        { name: '🛡️ Đồ (tổng hợp)', value: itemSummary.slice(0, 512), inline: false },
      )
      .setFooter({ text: `Match ID: ${match.metadata.match_id} • ${new Date(info.game_datetime ?? Date.now()).toLocaleString('vi-VN')}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftlink — Link Discord ↔ Riot (shared storage with LoL) ─────────────────
export async function handleTftLink({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

  const riotIdStr = (isInteraction ? source.options.getString('summoner') : args).trim();
  const region = ((isInteraction ? source.options.getString('region') : null) ?? 'vn2').toLowerCase();

  if (!riotIdStr) return reply(isInteraction
    ? { content: 'Nhập Riot ID của bạn. VD: `/tftlink PlayerName#VN2`', ephemeral: true }
    : 'Nhập Riot ID của bạn.');

  if (isInteraction) await source.deferReply({ ephemeral: true });

  try {
    const parsed = parseRiotId(riotIdStr);
    if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG`');

    const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
    const userId = isInteraction ? source.user.id : source.author.id;

    await stateStore.linkLolAccount(guildId, userId, {
      riotId: `${account.gameName}#${account.tagLine}`,
      puuid: account.puuid,
      region
    });

    return editOrReply(source, isInteraction, {
      content: `✅ Đã liên kết tài khoản **${account.gameName}#${account.tagLine}** (${region.toUpperCase()}) với Discord!\nBây giờ bạn có thể dùng **/tftlsd**, **/tft**, **/tftmatch** (và cả **/lsd**, **/lol**) mà không cần nhập tên.`,
      ephemeral: true
    });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftunlink ────────────────────────────────────────────────────────────────
export async function handleTftUnlink({ source, isInteraction, stateStore, guildId, reply }) {
  const userId = isInteraction ? source.user.id : source.author.id;
  await stateStore.unlinkLolAccount(guildId, userId);
  const msg = '✅ Đã xoá liên kết tài khoản (TFT + LoL).';
  return reply(isInteraction ? { content: msg, ephemeral: true } : msg);
}

// ── Slash command option builders ─────────────────────────────────────────────
export function buildTftSlashOptions(commandType) {
  const summonerOpt = {
    name: 'summoner',
    description: 'Tên người chơi (VD: PlayerName#VN2) — bỏ trống nếu đã liên kết',
    type: ApplicationCommandOptionType.String,
    required: false,
  };
  const regionOpt = {
    name: 'region',
    description: 'Server khu vực',
    type: ApplicationCommandOptionType.String,
    required: false,
    choices: getRegionChoices(),
  };

  switch (commandType) {
    case 'tftlsd':
    case 'tftprofile':
      return [summonerOpt, regionOpt];
    case 'tftmatch':
      return [
        summonerOpt,
        regionOpt,
        {
          name: 'index',
          description: 'Số thứ tự trận (1–10)',
          type: ApplicationCommandOptionType.Integer,
          required: false,
          minValue: 1,
          maxValue: 10,
        },
      ];
    case 'tftlink':
      return [
        { ...summonerOpt, required: true, description: 'Riot ID của bạn (VD: PlayerName#VN2)' },
        regionOpt,
      ];
    case 'tftunlink':
      return [];
    default:
      return [];
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function noApiKeyMsg(isInteraction) {
  const msg = '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.';
  return isInteraction ? { content: msg, ephemeral: true } : msg;
}

function formatError(err) {
  if (err.status === 404) return '❌ Không tìm thấy người chơi. Kiểm tra lại Riot ID và khu vực.';
  if (err.status === 429) return '❌ Đã vượt giới hạn API. Vui lòng thử lại sau vài giây.';
  if (err.status === 403) return '❌ API Key không hợp lệ hoặc đã hết hạn. Vui lòng refresh key tại developer.riotgames.com.';
  return `❌ Lỗi: ${err.message}`;
}

async function editOrReply(source, isInteraction, payload) {
  if (isInteraction) {
    if (source.deferred || source.replied) return source.editReply(payload);
    return source.reply(payload);
  }
  return source.reply(payload);
}
