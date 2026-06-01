/**
 * tftCommands.js — Teamfight Tactics command handlers
 *
 * Uses LoL match/v5 + league/v4 endpoints (Dev API key compatible).
 * TFT data sits in the same endpoints — participants have TFT-specific fields
 * (placement, traits[], units[], augments[]) when queueId is a TFT queue.
 *
 * Commands:
 *   /tftlsd   [summoner] [region]         — Lịch sử 5 trận TFT gần nhất
 *   /tft      [summoner] [region]         — Hồ sơ TFT (rank, avg placement, traits)
 *   /tftmatch [summoner] [region] [index] — Chi tiết 1 trận (bài, con, đồ, augment)
 *   /tftlink  [summoner] [region]         — Liên kết tài khoản
 *   /tftunlink                            — Bỏ liên kết
 */

import { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
import {
  parseRiotId, getAccountByRiotId, getSummonerByPuuid,
  getRegionChoices, formatDuration, REGIONS, batchFetch,
} from './lolApi.js';
import {
  getTftRankedInfo, getTftMatchHistory, getTftMatchDetail,
  getTftItems, getTftChampions, getTftAugments,
  formatTftRank, getTftQueueName, placementEmoji,
} from './tftApi.js';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = { tft: 0xc89b3c, win: 0x3ba55d, lose: 0xed4245, info: 0x1a78c2 };

// ── Summoner resolution ───────────────────────────────────────────────────────
async function resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey) {
  let riotIdStr, region;
  if (isInteraction) {
    riotIdStr = source.options.getString('summoner');
    region = (source.options.getString('region') ?? 'vn2').toLowerCase();
  } else {
    const parts = args.trim().split(/\s+/);
    const REGIONS_SET = new Set(['vn2','na1','euw1','kr','jp1','sg2','eun1','br1','la1','la2','oc1','ph2','ru','th2','tr1','tw2']);
    region = REGIONS_SET.has(parts[parts.length - 1]?.toLowerCase()) ? parts.pop() : 'vn2';
    riotIdStr = parts.join(' ');
  }

  if (!riotIdStr) {
    const userId = isInteraction ? source.user.id : source.author.id;
    const linked = await stateStore.getLinkedTftAccount(guildId, userId);
    if (linked) { riotIdStr = linked.riotId; region = linked.region; }
  }

  if (!riotIdStr) throw new Error('Vui lòng nhập tên người chơi (VD: PlayerName#VN2) hoặc dùng `/tftlink` để liên kết tài khoản.');
  const parsed = parseRiotId(riotIdStr);
  if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG`');

  const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
  const summoner = await getSummonerByPuuid(account.puuid, region, apiKey);
  return { account, summoner, region };
}

// ── Helper: extract TFT participant data from match/v5 participant ─────────────
// match/v5 stores TFT data in participant fields when queueId is TFT
function getTftParticipantData(participant) {
  // TFT fields may be nested under participant directly (match/v5 TFT format)
  // or in a metadata object depending on game version
  return {
    placement:  participant.placement  ?? participant.augments?.length ? participant.placement : null,
    traits:     participant.traits     ?? [],
    units:      participant.units      ?? [],
    augments:   participant.augments   ?? [],
    level:      participant.level      ?? participant.participantId ?? 1,
    gold_left:  participant.gold_left  ?? 0,
    last_round: participant.last_round ?? 0,
    players_eliminated: participant.players_eliminated ?? 0,
    total_damage_to_players: participant.total_damage_to_players ?? 0,
  };
}

// ── /tftlsd — History list ─────────────────────────────────────────────────────
export async function handleTftLsd({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.tftApiKey || config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));
  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);

    const [matchIds, rankedEntries] = await Promise.all([
      getTftMatchHistory(account.puuid, region, apiKey, 5),
      getTftRankedInfo(account.puuid, region, apiKey),
    ]);

    if (!matchIds.length) {
      return editOrReply(source, isInteraction, {
        content: `❌ Không tìm thấy lịch sử TFT cho **${account.gameName}#${account.tagLine}** (${region.toUpperCase()}).\n\n> Nguyên nhân có thể do:\n> • Tài khoản chưa chơi TFT gần đây\n> • Development API key giới hạn số trận có thể tìm được`
      });
    }

    const [matchResults, [itemsMap, champMap, augMap]] = await Promise.all([
      batchFetch(matchIds, (id) => getTftMatchDetail(id, region, apiKey)),
      Promise.all([getTftItems(), getTftChampions(), getTftAugments()]),
    ]);
    const matches = matchResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failCount = matchResults.filter(r => r.status === 'rejected').length;
    const firstErr = matchResults.find(r => r.status === 'rejected')?.reason;
    const isKeyError = firstErr?.status === 403 || firstErr?.status === 401;

    const lines = matches.map((m, i) => {
      const p = m.info.participants.find((x) => x.puuid === account.puuid);
      if (!p) return '';
      const tft = getTftParticipantData(p);
      const place = tft.placement ?? p.placement ?? '?';
      const top4 = typeof place === 'number' && place <= 4;
      const dur = formatDuration(m.info.gameDuration ?? m.info.game_length ?? 0);
      const queue = getTftQueueName(m.info.queueId ?? m.info.queue_id);

      // Top 3 units by stars
      const topUnits = tft.units
        .sort((a, b) => (b.tier ?? b.rarity ?? 0) - (a.tier ?? a.rarity ?? 0))
        .slice(0, 3)
        .map((u) => {
          const name = champMap[u.character_id]?.name
            ?? champMap[u.characterId]?.name
            ?? (u.character_id ?? u.characterId ?? '?');
          const stars = '⭐'.repeat(Math.min(u.tier ?? u.rarity ?? 1, 3));
          return `${name}${stars}`;
        }).join(', ') || '—';

      // Augments (short name)
      const augs = tft.augments
        .slice(0, 2)
        .map((a) => augMap[a]?.name ?? augMap[a.toLowerCase()]?.name ?? a.replace(/^TFT\d+_Augment_/i, ''))
        .join(' / ') || '—';

      const placeStr = typeof place === 'number' ? `${placementEmoji(place)} Hạng ${place}/8` : '❓';
      return `\`${i + 1}\` ${placeStr} — ${queue} · ⏱ ${dur}\n   🃏 ${topUnits} | 🔮 ${augs}`;
    }).filter(Boolean);

    const ranked = rankedEntries.find((e) => e.queueType === 'RANKED_TFT');
    const hyper  = rankedEntries.find((e) => e.queueType === 'RANKED_TFT_TURBO');
    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/img/profileicon/${summoner.profileIconId}.png`;

    if (!matches.length) {
      const reason = isKeyError
        ? '> ⚠️ API key không có quyền truy cập match-v5 (Development key).\n> Cần **Personal API key** tại developer.riotgames.com'
        : `> Không thể tải dữ liệu trận (${firstErr?.message ?? 'unknown'})`;
      return editOrReply(source, isInteraction, { content: `❌ Lấy được thông tin tài khoản nhưng không tải được chi tiết trận TFT.\n\n${reason}` });
    }

    const keyWarnLine = failCount > 0
      ? (isKeyError
        ? `\n⚠️ ${failCount} trận không tải được — dev key bị giới hạn match-v5.`
        : `\n⚠️ ${failCount} trận không tải được (rate limit/lỗi mạng).`)
      : '';

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: iconUrl })
      .setTitle('📋 Lịch Sử TFT Gần Nhất')
      .setDescription(lines.join('\n\n') + keyWarnLine || '—')
      .addFields(
        { name: '🏆 Rank TFT', value: ranked ? formatTftRank(ranked) : 'Chưa xếp hạng', inline: false },
        { name: '⚡ Hyper Roll', value: hyper ? formatTftRank(hyper) : 'Chưa xếp hạng', inline: false },
      )
      .setFooter({ text: `Region: ${region.toUpperCase()} • Dùng /tftmatch [số] để xem chi tiết` })
      .setColor(C.tft)
      .setThumbnail(iconUrl);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tft — TFT Profile ─────────────────────────────────────────────────────────
export async function handleTftProfile({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.tftApiKey || config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));
  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const [rankedEntries, matchIds] = await Promise.all([
      getTftRankedInfo(account.puuid, region, apiKey),
      getTftMatchHistory(account.puuid, region, apiKey, 10),
    ]);

    const ranked = rankedEntries.find((e) => e.queueType === 'RANKED_TFT');
    const hyper  = rankedEntries.find((e) => e.queueType === 'RANKED_TFT_TURBO');

    let avgPlace = '—';
    let topTraits = 'Chưa có dữ liệu';

    if (matchIds.length) {
      const matchResults = await batchFetch(matchIds.slice(0, 10), (id) => getTftMatchDetail(id, region, apiKey));
      const matches = matchResults.filter(r => r.status === 'fulfilled').map(r => r.value);
      const placements = matches
        .map((m) => m.info.participants.find((p) => p.puuid === account.puuid)?.placement)
        .filter((v) => typeof v === 'number');
      if (placements.length) avgPlace = (placements.reduce((a, b) => a + b, 0) / placements.length).toFixed(2);

      const traitCounts = {};
      for (const m of matches) {
        const p = m.info.participants.find((x) => x.puuid === account.puuid);
        if (!p) continue;
        for (const t of (p.traits ?? [])) {
          if ((t.tier_current ?? t.tierCurrent ?? 0) > 0) {
            const name = t.name ?? t.traitId ?? '?';
            traitCounts[name] = (traitCounts[name] ?? 0) + 1;
          }
        }
      }
      const entries = Object.entries(traitCounts).sort(([,a],[,b]) => b - a).slice(0, 5);
      if (entries.length) {
        topTraits = entries.map(([name, cnt]) => `**${name}** — ${cnt}/10 ván`).join('\n');
      }
    }

    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/img/profileicon/${summoner.profileIconId}.png`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: iconUrl })
      .setTitle('🎲 Hồ Sơ TFT')
      .setThumbnail(iconUrl)
      .addFields(
        { name: '📊 Level', value: `**${summoner.summonerLevel}**`, inline: true },
        { name: '🌏 Region', value: region.toUpperCase(), inline: true },
        { name: '📍 Avg. Placement', value: `**${avgPlace}** (${matchIds.length} ván)`, inline: true },
        { name: '🏆 Rank TFT', value: ranked ? formatTftRank(ranked) : 'Chưa xếp hạng', inline: false },
        { name: '⚡ Hyper Roll', value: hyper ? formatTftRank(hyper) : 'Chưa xếp hạng', inline: false },
        { name: '🔮 Traits hay dùng', value: topTraits, inline: false },
      )
      .setFooter({ text: 'Dùng /tftlsd để xem lịch sử • /tftmatch để xem chi tiết' })
      .setColor(C.info);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftmatch — Single match detail ───────────────────────────────────────────
export async function handleTftMatch({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.tftApiKey || config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));
  if (isInteraction) await source.deferReply();

  try {
    const matchIndex = isInteraction ? (source.options.getInteger('index') ?? 1) - 1 : 0;
    const { account, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);

    const matchIds = await getTftMatchHistory(account.puuid, region, apiKey, Math.max(matchIndex + 1, 1));
    if (!matchIds[matchIndex]) return editOrReply(source, isInteraction, { content: `❌ Không tìm thấy trận TFT thứ ${matchIndex + 1}.` });

    let match, itemsMap, champMap, augMap;
    try {
      [match, itemsMap, champMap, augMap] = await Promise.all([
        getTftMatchDetail(matchIds[matchIndex], region, apiKey),
        getTftItems(), getTftChampions(), getTftAugments(),
      ]);
    } catch (detailErr) {
      const is403 = detailErr?.status === 403 || detailErr?.status === 401;
      return editOrReply(source, isInteraction, {
        content: is403
          ? `❌ Không tải được chi tiết trận TFT.\n> ⚠️ Development API key không có quyền truy cập match-v5.\n> Cần **Personal API key** tại developer.riotgames.com`
          : `❌ Không tải được chi tiết trận: ${detailErr.message}`
      });
    }

    const me = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!me) return editOrReply(source, isInteraction, { content: 'Không tìm thấy dữ liệu người chơi trong trận.' });

    const tft = getTftParticipantData(me);
    const place = tft.placement ?? me.placement ?? '?';
    const top4 = typeof place === 'number' && place <= 4;
    const dur = formatDuration(match.info.gameDuration ?? match.info.game_length ?? 0);
    const queue = getTftQueueName(match.info.queueId ?? match.info.queue_id);

    // ── Augments ───────────────────────────────────────────────────────────────
    const augLines = tft.augments.map((a) => {
      const aug = augMap[a] ?? augMap[a?.toLowerCase()];
      const tierLabel = !aug ? '' : aug.tier >= 3 ? '🟣 Lăng kính' : aug.tier === 2 ? '🟡 Vàng' : '⚪ Bạc';
      const displayName = aug?.name ?? a.replace(/^TFT\d+_Augment_/i, '');
      const desc = aug?.desc ? `\n> ${aug.desc.slice(0, 100)}` : '';
      return `${tierLabel} **${displayName}**${desc}`;
    }).join('\n\n') || '—';

    // ── Units (con đã mang) ───────────────────────────────────────────────────
    const unitsSorted = tft.units.sort((a, b) => (b.tier ?? b.rarity ?? 0) - (a.tier ?? a.rarity ?? 0));
    const unitLines = unitsSorted.map((u) => {
      const charId = u.character_id ?? u.characterId ?? '';
      const champ = champMap[charId] ?? champMap[charId.toLowerCase()];
      const name = champ?.name ?? charId;
      const stars = '⭐'.repeat(Math.min(u.tier ?? u.rarity ?? 1, 3));
      const cost = champ?.cost ?? 0;
      const costEmoji = ['', '⬜', '🟢', '🔵', '🟣', '🟡'][cost] ?? '';

      const unitItemNames = (u.itemNames ?? u.items ?? []).map((it) => {
        const item = typeof it === 'string'
          ? (itemsMap[it] ?? itemsMap[it.toLowerCase()])
          : itemsMap[String(it)];
        return item?.name ?? (typeof it === 'string' ? it.replace(/^TFT_Item_/i, '') : String(it));
      }).join(', ');

      return `${costEmoji}**${name}**${stars}${unitItemNames ? ` — ${unitItemNames}` : ''}`;
    }).join('\n') || '—';

    // ── Traits (bài/comp) ─────────────────────────────────────────────────────
    const activeTraits = tft.traits
      .filter((t) => (t.tier_current ?? t.tierCurrent ?? 0) > 0)
      .sort((a, b) => (b.tier_current ?? b.tierCurrent ?? 0) - (a.tier_current ?? a.tierCurrent ?? 0));

    const traitLines = activeTraits.map((t) => {
      const tier = t.tier_current ?? t.tierCurrent ?? 1;
      const star = tier >= 3 ? '🌟' : tier === 2 ? '✨' : '•';
      const numUnits = t.num_units ?? t.numUnits ?? '?';
      return `${star} **${t.name ?? t.traitId}** (${numUnits} quân)`;
    }).join('\n') || '—';

    // ── All items summary ─────────────────────────────────────────────────────
    const allItemSet = new Set();
    for (const u of tft.units) {
      for (const it of (u.itemNames ?? u.items ?? [])) {
        const item = typeof it === 'string'
          ? (itemsMap[it] ?? itemsMap[it.toLowerCase()])
          : itemsMap[String(it)];
        allItemSet.add(item?.name ?? (typeof it === 'string' ? it.replace(/^TFT_Item_/i, '') : String(it)));
      }
    }
    const itemSummary = [...allItemSet].join(', ') || '—';

    const placeStr = typeof place === 'number' ? `${placementEmoji(place)} Hạng ${place}/8` : '❓';
    const matchId = match.metadata?.matchId ?? match.metadata?.match_id ?? matchIds[matchIndex];
    const gameTime = match.info.gameStartTimestamp ?? match.info.game_datetime ?? Date.now();

    const embed = new EmbedBuilder()
      .setTitle(`${placeStr} — TFT`)
      .setDescription(`**${queue}** · Lv.${tft.level} · ⏱ ${dur}${tft.gold_left ? ` · 💰 ${tft.gold_left} vàng` : ''}`)
      .setColor(top4 ? C.win : C.lose)
      .addFields(
        { name: '🔮 Augments (Tăng cường)', value: augLines.slice(0, 1024), inline: false },
        { name: '🃏 Bài / Comp (Traits)', value: traitLines.slice(0, 1024), inline: false },
        { name: '🦸 Quân đã mang', value: unitLines.slice(0, 1024), inline: false },
        { name: '🛡️ Đồ (tổng hợp)', value: itemSummary.slice(0, 512), inline: false },
      )
      .setFooter({ text: `Match ID: ${matchId} • ${new Date(gameTime).toLocaleString('vi-VN')}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftlink ───────────────────────────────────────────────────────────────────
export async function handleTftLink({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.tftApiKey || config.riotApiKey;
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

    await stateStore.linkTftAccount(guildId, userId, {
      riotId: `${account.gameName}#${account.tagLine}`,
      puuid: account.puuid,
      region,
    });

    return editOrReply(source, isInteraction, {
      content: `✅ Đã liên kết TFT **${account.gameName}#${account.tagLine}** (${region.toUpperCase()})!\nBạn có thể dùng **/tftlsd**, **/tft**, **/tftmatch** không cần nhập tên.`,
      ephemeral: true,
    });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /tftunlink ────────────────────────────────────────────────────────────────
export async function handleTftUnlink({ source, isInteraction, stateStore, guildId, reply }) {
  const userId = isInteraction ? source.user.id : source.author.id;
  await stateStore.unlinkTftAccount(guildId, userId);
  const msg = '✅ Đã xoá liên kết tài khoản TFT.';
  return reply(isInteraction ? { content: msg, ephemeral: true } : msg);
}

// ── Slash options builder ─────────────────────────────────────────────────────
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
        summonerOpt, regionOpt,
        { name: 'index', description: 'Số thứ tự trận (1–10)', type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: 10 },
      ];
    case 'tftlink':
      return [{ ...summonerOpt, required: true, description: 'Riot ID của bạn (VD: PlayerName#VN2)' }, regionOpt];
    case 'tftunlink':
      return [];
    default:
      return [];
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function noApiKeyMsg(isInteraction) {
  const msg = '❌ Bot chưa được cấu hình Riot API Key.';
  return isInteraction ? { content: msg, ephemeral: true } : msg;
}

function formatError(err) {
  if (err.status === 404) return '❌ Không tìm thấy người chơi. Kiểm tra lại Riot ID và khu vực.';
  if (err.status === 429) return '❌ Đã vượt giới hạn API. Vui lòng thử lại sau vài giây.';
  if (err.status === 403) return '❌ API Key không hợp lệ hoặc hết hạn. Refresh key tại developer.riotgames.com.';
  return `❌ Lỗi: ${err.message}`;
}

async function editOrReply(source, isInteraction, payload) {
  if (isInteraction) {
    if (source.deferred || source.replied) return source.editReply(payload);
    return source.reply(payload);
  }
  return source.reply(payload);
}
