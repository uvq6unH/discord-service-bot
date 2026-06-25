/**
 * lolCommands.js — League of Legends command handlers
 *
 * Commands:
 *   /lsd  [summoner] [region]  — Lịch sử đấu gần đây (5 trận)
 *   /lol  [summoner] [region]  — Hồ sơ người chơi (rank, mastery, stats)
 *   /lolmatch [summoner] [region] [index] — Chi tiết 1 trận cụ thể
 *   /lolchamp [champion]       — Thông tin tướng (stats, skills, tips)
 *   /lolitem  [item]           — Thông tin trang bị
 *   /lolrunes                  — Bảng ngọc hiện tại (theo cây)
 *   /lolpatch                  — Phiên bản mới nhất + tóm tắt patch
 *   /lollink  [summoner] [region] — Liên kết tài khoản LoL với Discord
 *   /lolunlink                 — Bỏ liên kết tài khoản
 */

import { EmbedBuilder, ApplicationCommandOptionType, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { Jimp, loadFont } from 'jimp';
import path from 'node:path';
import fs from 'node:fs';
import {
  editOrReply,
  formatRiotError,
  noApiKeyMsg,
  resolveRiotSummonerInput
} from './riot/helpers.js';
import {
  parseRiotId, getAccountByRiotId, getSummonerByPuuid, getRankedInfo,
  getMatchHistory, getMatchDetail, getTopMastery, findChampion,
  getChampionDetail, getChampionData, getItemData, getRuneData,
  getLatestPatch, formatRank, formatDuration, getQueueName,
  getRegionChoices, RANK_EMOJIS, REGIONS, batchFetch,
  getChampionRuneRecommendations, getChampionItemBuild, getPerkIconsMap
} from './lolApi.js';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  win: 0x3ba55d,
  lose: 0xed4245,
  neutral: 0xc89b3c,
  champ: 0x785a28,
  rune: 0x9b59b6,
  info: 0x1a78c2,
  patch: 0xe67e22
};

// DDragon base URL helper
const DD = (patch) => `https://ddragon.leagueoflegends.com/cdn/${patch}`;

// Strip diacritics and convert đ/Đ to d/D for accent-insensitive search
function stripAccents(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

// ── Summoner resolution with linked account fallback ─────────────────────────
async function resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey) {
  const { riotIdStr, region } = await resolveRiotSummonerInput({
    source,
    args,
    isInteraction,
    stateStore,
    guildId,
    getLinkedAccount: (g, u) => stateStore.getLinkedLolAccount(g, u)
  });

  if (!riotIdStr) {
    throw new Error('Vui lòng nhập tên người chơi (VD: PlayerName#VN2) hoặc dùng `/lollink` để liên kết tài khoản.');
  }

  const parsed = parseRiotId(riotIdStr);
  if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG` (VD: `Faker#KR1`)');

  const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
  const summoner = await getSummonerByPuuid(account.puuid, region, apiKey);
  return { account, summoner, region };
}

// ── /lsd — Match history list ─────────────────────────────────────────────────
export async function handleLsd({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) {
    return reply(noApiKeyMsg(isInteraction, '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.'));
  }

  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const patch = await getLatestPatch();
    const matchIds = await getMatchHistory(account.puuid, region, apiKey, 5);
    console.log(`[lsd] puuid=${account.puuid} region=${region} matchRouting=${REGIONS.routing[region]} matchIds=${JSON.stringify(matchIds)}`);
    if (!matchIds.length) return editOrReply(source, isInteraction, { content: `❌ Không tìm thấy lịch sử trận đấu cho **${account.gameName}#${account.tagLine}** (${region.toUpperCase()}).\n\n> Nguyên nhân có thể do:\n> • Development API key không có quyền truy cập match history\n> • Tài khoản chưa chơi trận nào gần đây\n\nThử dùng account khác hoặc nâng cấp lên Personal API key tại developer.riotgames.com` });

    const matchResults = await batchFetch(matchIds, (id) => getMatchDetail(id, region, apiKey));
    const matches = matchResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failCount = matchResults.filter(r => r.status === 'rejected').length;
    const firstErr = matchResults.find(r => r.status === 'rejected')?.reason;
    const isKeyError = firstErr?.status === 403 || firstErr?.status === 401;
    console.log(`[lsd] loaded=${matches.length} failed=${failCount}${firstErr ? ` firstErr=${firstErr.status}:${firstErr.message}` : ''}`);
    const rankedEntries = await getRankedInfo(account.puuid, region, apiKey);
    const solo = rankedEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5');

    const lines = matches.map((m, i) => {
      const p = m.info.participants.find((x) => x.puuid === account.puuid);
      if (!p) return '';
      const win = p.win ? '🟢 Thắng' : '🔴 Thua';
      const kda = `${p.kills}/${p.deaths}/${p.assists}`;
      const kdaRatio = p.deaths === 0 ? 'Perfect' : ((p.kills + p.assists) / p.deaths).toFixed(2);
      const cs = p.totalMinionsKilled + (p.neutralMinionsKilled ?? 0);
      const dur = formatDuration(m.info.gameDuration);
      const queue = getQueueName(m.info.queueId);
      const csMin = (cs / (m.info.gameDuration / 60)).toFixed(1);
      return `\`${i + 1}\` **${p.championName}** — ${win} | ${queue}\n` +
        `   KDA: \`${kda}\` (${kdaRatio}) | CS: \`${cs}\` (${csMin}/min) | ⏱ ${dur}`;
    }).filter(Boolean);

    const iconUrl = `${DD(patch)}/img/profileicon/${summoner.profileIconId}.png`;
    const rankStr = solo ? formatRank(solo) : 'Chưa xếp hạng';

    if (!matches.length) {
      const reason = isKeyError
        ? '> ⚠️ API key không có quyền truy cập match-v5 (Development key).\n> Cần **Personal API key** tại developer.riotgames.com'
        : `> Không thể tải dữ liệu trận (lỗi: ${firstErr?.message ?? 'unknown'})`;
      return editOrReply(source, isInteraction, { content: `❌ Lấy được thông tin tài khoản nhưng không tải được chi tiết trận đấu.\n\n${reason}` });
    }

    const keyWarnLine = failCount > 0
      ? (isKeyError
        ? `\n⚠️ ${failCount} trận không tải được — dev key bị giới hạn match-v5.`
        : `\n⚠️ ${failCount} trận không tải được (lỗi mạng/rate limit).`)
      : '';

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: iconUrl })
      .setTitle('📋 Lịch Sử 5 Trận Gần Nhất')
      .setDescription(lines.join('\n\n') + keyWarnLine)
      .addFields({ name: '🏆 Rank Solo/Duo', value: rankStr, inline: false })
      .setFooter({ text: `Region: ${region.toUpperCase()} • Patch ${patch} • Dùng /lolmatch để xem chi tiết` })
      .setColor(C.neutral)
      .setThumbnail(iconUrl);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lol — Full profile ───────────────────────────────────────────────────────
export async function handleLolProfile({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) {
    return reply(noApiKeyMsg(isInteraction, '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.'));
  }

  if (isInteraction) await source.deferReply();

  try {
    const { account, summoner, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const patch = await getLatestPatch();

    const [rankedEntries, masteries, champData] = await Promise.all([
      getRankedInfo(account.puuid, region, apiKey),
      getTopMastery(account.puuid, region, apiKey, 5),
      getChampionData('vi_VN')
    ]);

    // Build champion id->name map
    const champById = {};
    for (const c of Object.values(champData.data)) {
      champById[Number(c.key)] = c.name;
    }

    const solo = rankedEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
    const flex = rankedEntries.find((e) => e.queueType === 'RANKED_FLEX_SR');
    const iconUrl = `${DD(patch)}/img/profileicon/${summoner.profileIconId}.png`;

    const masteryLines = masteries.slice(0, 5).map((m, i) => {
      const name = champById[m.championId] ?? `Champ #${m.championId}`;
      const pts = m.championPoints.toLocaleString();
      const lvl = m.championLevel;
      return `${i + 1}. **${name}** — Cấp ${lvl} · ${pts} điểm`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${account.gameName}#${account.tagLine}`, iconURL: iconUrl })
      .setTitle('🎮 Hồ Sơ League of Legends')
      .setThumbnail(iconUrl)
      .addFields(
        { name: '📊 Cấp Độ', value: `Level **${summoner.summonerLevel}**`, inline: true },
        { name: '🌏 Region', value: region.toUpperCase(), inline: true },
        { name: '🔖 Patch', value: patch, inline: true },
        { name: '🏆 Rank Solo/Duo', value: solo ? formatRank(solo) : 'Chưa xếp hạng', inline: false },
        { name: '🔄 Rank Flex', value: flex ? formatRank(flex) : 'Chưa xếp hạng', inline: false },
        { name: '⭐ Top Tướng Yêu Thích', value: masteryLines || 'Chưa có dữ liệu', inline: false }
      )
      .setFooter({ text: 'Dùng /lsd để xem lịch sử trận đấu' })
      .setColor(C.info);

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lolmatch — Single match detail ──────────────────────────────────────────
export async function handleLolMatch({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) {
    return reply(noApiKeyMsg(isInteraction, '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.'));
  }

  if (isInteraction) await source.deferReply();

  try {
    const matchIndex = isInteraction
      ? (source.options.getInteger('index') ?? 1) - 1
      : 0;

    const { account, region } = await resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey);
    const patch = await getLatestPatch();
    const matchIds = await getMatchHistory(account.puuid, region, apiKey, Math.max(matchIndex + 1, 1));

    if (!matchIds[matchIndex]) return editOrReply(source, isInteraction, { content: 'Không tìm thấy trận đấu.' });

    let match;
    try {
      match = await getMatchDetail(matchIds[matchIndex], region, apiKey);
    } catch (detailErr) {
      const is403 = detailErr?.status === 403 || detailErr?.status === 401;
      return editOrReply(source, isInteraction, {
        content: is403
          ? `❌ Không tải được chi tiết trận đấu.\n> ⚠️ Development API key không có quyền truy cập match-v5.\n> Cần **Personal API key** tại developer.riotgames.com`
          : `❌ Không tải được chi tiết trận đấu: ${detailErr.message}`
      });
    }
    const me = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!me) return editOrReply(source, isInteraction, { content: 'Không tìm thấy dữ liệu người chơi trong trận.' });

    const { info } = match;
    const win = me.win;
    const kda = `${me.kills}/${me.deaths}/${me.assists}`;
    const kdaRatio = me.deaths === 0 ? '∞' : ((me.kills + me.assists) / me.deaths).toFixed(2);
    const cs = me.totalMinionsKilled + (me.neutralMinionsKilled ?? 0);
    const dur = formatDuration(info.gameDuration);
    const csMin = (cs / (info.gameDuration / 60)).toFixed(1);
    const dmg = (me.totalDamageDealtToChampions ?? 0).toLocaleString();
    const vision = me.visionScore ?? 0;
    const gold = (me.goldEarned ?? 0).toLocaleString();

    const champIcon = `${DD(patch)}/img/champion/${me.championName}.png`;

    // Team summary
    const teams = { 100: [], 200: [] };
    for (const p of info.participants) {
      teams[p.teamId].push(`${p.win ? '✅' : '❌'} **${p.championName}** — ${p.kills}/${p.deaths}/${p.assists}`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`${win ? '🟢 Chiến Thắng' : '🔴 Thất Bại'} — ${me.championName}`)
      .setDescription(`**${getQueueName(info.queueId)}** · ${dur}`)
      .setThumbnail(champIcon)
      .setColor(win ? C.win : C.lose)
      .addFields(
        { name: '⚔️ KDA', value: `**${kda}** (${kdaRatio})`, inline: true },
        { name: '🌾 CS', value: `${cs} (${csMin}/min)`, inline: true },
        { name: '💰 Gold', value: gold, inline: true },
        { name: '💥 Sát Thương', value: dmg, inline: true },
        { name: '👁️ Vision', value: String(vision), inline: true },
        { name: '🏅 Cấp', value: String(me.champLevel), inline: true },
        { name: '🔵 Đội Xanh', value: teams[100].join('\n') || '—', inline: true },
        { name: '🔴 Đội Đỏ', value: teams[200].join('\n') || '—', inline: true }
      )
      .setFooter({ text: `Match ID: ${match.metadata.matchId} • ${new Date(info.gameStartTimestamp).toLocaleString('vi-VN')}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lolchamp — Champion info ─────────────────────────────────────────────────
export async function handleLolChamp({ source, args, isInteraction, config, reply }) {
  const champName = isInteraction ? source.options.getString('champion') : args.trim();
  if (!champName) return reply(isInteraction ? { content: 'Nhập tên tướng. VD: `/lolchamp Ahri`', ephemeral: true } : 'Nhập tên tướng.');

  if (isInteraction) await source.deferReply();

  try {
    const found = await findChampion(champName);
    if (!found) return editOrReply(source, isInteraction, { content: `Không tìm thấy tướng: **${champName}**` });

    const patch = await getLatestPatch();
    const detail = await getChampionDetail(found.alias, 'vi_VN');
    const s = detail.stats;

    // Use cdragon for images — DDragon CDN can block server IPs
    const iconUrl = found.iconUrl
      ?? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${detail.id}.png`;
    const splashUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/${detail.id}/${detail.id}000.jpg`;

    const stats = [
      `❤️ HP: ${s.hp} (+${s.hpperlevel}/lv)`,
      `🔵 Mana: ${s.mp} (+${s.mpperlevel}/lv)`,
      `🛡️ Giáp: ${s.armor} (+${s.armorperlevel}/lv)`,
      `✨ Kháng phép: ${s.spellblock} (+${s.spellblockperlevel}/lv)`,
      `⚔️ AD: ${s.attackdamage} (+${s.attackdamageperlevel}/lv)`,
      `🎯 Tốc đánh: ${s.attackspeed}`,
      `💨 Tốc chạy: ${s.movespeed}`,
      `📏 Tầm đánh: ${s.attackrange}`
    ].join('\n');

    const spells = detail.spells.map((sp, i) => {
      const key = ['Q', 'W', 'E', 'R'][i] ?? i;
      return `**[${key}] ${sp.name}** — ${sp.description.replace(/<[^>]+>/g, '').slice(0, 120)}...`;
    }).join('\n\n');

    const passiveLine = `**[P] ${detail.passive.name}** — ${detail.passive.description.replace(/<[^>]+>/g, '').slice(0, 150)}...`;

    const tips = detail.allytips?.slice(0, 2).join('\n') || 'Chưa có mẹo.';

    // ── Runes and Items integration ──────────────────────────────────────────
    let runeRecs = [];
    try {
      runeRecs = await getChampionRuneRecommendations(detail.id);
    } catch (e) {
      console.error('[lolchamp] failed to fetch rune recommendations:', e.message);
    }

    const posMap = {
      'MIDDLE': 'mid',
      'TOP': 'top',
      'JUNGLE': 'jungle',
      'BOTTOM': 'adc',
      'UTILITY': 'support'
    };

    let defaultPosition = 'mid';
    if (runeRecs.length > 0) {
      const defaultRec = runeRecs.find(r => r.isDefaultPosition) || runeRecs[0];
      if (defaultRec) {
        defaultPosition = posMap[defaultRec.position] || 'mid';
      }
    } else {
      const tag = detail.tags?.[0]?.toLowerCase();
      if (tag === 'marksman') defaultPosition = 'adc';
      else if (tag === 'support') defaultPosition = 'support';
      else if (tag === 'tank') defaultPosition = 'top';
      else if (tag === 'fighter') defaultPosition = 'jungle';
    }

    let itemBuild = null;
    try {
      itemBuild = await getChampionItemBuild(found.alias, defaultPosition);
    } catch (e) {
      console.error('[lolchamp] failed to fetch item build:', e.message);
    }

    const runeTrees = await getRuneData('vi_VN');
    const runeMap = new Map();
    const styleMap = new Map();
    for (const tree of runeTrees) {
      styleMap.set(tree.id, tree.name);
      for (const slot of tree.slots) {
        for (const r of slot.runes) {
          runeMap.set(r.id, r.name);
        }
      }
    }
    const shardNames = {
      5001: 'Máu theo cấp',
      5002: 'Giáp',
      5003: 'Kháng phép',
      5005: 'Tốc độ đánh',
      5007: 'Điểm hồi kỹ năng',
      5008: 'Sức mạnh thích ứng',
      5010: 'Tốc độ di chuyển',
      5011: 'Máu phẳng',
      5013: 'Kháng hiệu ứng & Kháng làm chậm'
    };
    for (const [id, name] of Object.entries(shardNames)) {
      runeMap.set(Number(id), name);
    }

    const positionNames = {
      'mid': 'Đường Giữa',
      'top': 'Đường Trên',
      'jungle': 'Rừng',
      'adc': 'Đường Dưới (ADC)',
      'support': 'Hỗ Trợ'
    };

    const extraFields = [];
    for (let i = 0; i < Math.min(runeRecs.length, 3); i++) {
      const rec = runeRecs[i];
      const primaryStyle = styleMap.get(rec.primaryPerkStyleId) || rec.primaryPerkStyleId;
      const secondaryStyle = styleMap.get(rec.secondaryPerkStyleId) || rec.secondaryPerkStyleId;
      
      const perks = rec.perkIds.map(id => runeMap.get(id) || `ID:${id}`);
      const keystone = perks[0];
      const primaryPerks = perks.slice(1, 4).join(', ');
      const secondaryPerks = perks.slice(4, 6).join(', ');
      const shards = perks.slice(6, 9).join(', ');
      
      const posText = positionNames[posMap[rec.position]] || rec.position;
      
      extraFields.push({
        name: `🔮 Bảng Ngọc Khuyên Dùng ${i + 1} (${posText})`,
        value: `• **Chính: ${primaryStyle}** (Siêu cấp: __${keystone}__)\n  └ ${primaryPerks}\n• **Phụ: ${secondaryStyle}**\n  └ ${secondaryPerks}\n• **Mảnh chỉ số:**\n  └ ${shards}`,
        inline: true
      });
    }

    if (itemBuild) {
      const starter = itemBuild.starter_items.names.join(' + ') || 'Không rõ';
      const boots = itemBuild.boots.names.join(' / ') || 'Không rõ';
      const core = itemBuild.core_items.names.join(' ➔ ') || 'Không rõ';

      const formatSlot = (items) => {
        if (!items || items.length === 0) return 'Không rõ';
        return items.slice(0, 3).map(item => {
          const pct = item.pick_rate ? ` (${(item.pick_rate * 100).toFixed(0)}%)` : '';
          return `__${item.name}__${pct}`;
        }).join(', ');
      };

      const slot4 = formatSlot(itemBuild.fourth_items);
      const slot5 = formatSlot(itemBuild.fifth_items);
      const slot6 = formatSlot(itemBuild.last_items);

      extraFields.push({
        name: `🛒 Lối Lên Đồ Khuyên Dùng (${positionNames[defaultPosition] || defaultPosition})`,
        value: [
          `• **Khởi đầu:** ${starter}`,
          `• **Giày:** ${boots}`,
          `• **Cốt lõi (3 món):** ${core}`,
          `• **Món thứ 4:** ${slot4}`,
          `• **Món thứ 5:** ${slot5}`,
          `• **Món thứ 6:** ${slot6}`
        ].join('\n'),
        inline: false
      });
    }

    // Generate build card image
    const attachmentName = `build_card_${detail.id}.png`;
    let attachment = null;
    try {
      const buildCardPath = await getOrCreateChampBuildCardImage(detail, defaultPosition, runeRecs, itemBuild, patch);
      if (buildCardPath) {
        attachment = new AttachmentBuilder(buildCardPath, { name: attachmentName });
      }
    } catch (e) {
      console.error('[lolchamp] failed to generate build card image:', e.message);
    }

    const embed = new EmbedBuilder()
      .setTitle(`${detail.name} — "${detail.title}"`)
      .setDescription(detail.lore?.slice(0, 400) + '...' || detail.blurb)
      .setThumbnail(iconUrl)
      .setImage(attachment ? `attachment://${attachmentName}` : splashUrl)
      .setColor(C.champ)
      .addFields(
        { name: '📌 Loại / Tags', value: detail.tags.join(', '), inline: true },
        { name: '📊 Độ Khó', value: '⭐'.repeat(detail.info?.difficulty ?? 1), inline: true },
        { name: '🔖 Patch', value: patch, inline: true }
      )
      .setFooter({ text: `Dùng /lsd để tra lịch sử người chơi • Data Dragon ${patch}` });

    const replyOptions = { embeds: [embed] };
    if (attachment) {
      replyOptions.files = [attachment];
    }

    return editOrReply(source, isInteraction, replyOptions);
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lolitem — Item info ──────────────────────────────────────────────────────
export async function handleLolItem({ source, args, isInteraction, config, reply }) {
  const query = (isInteraction ? source.options.getString('item') : args).trim();
  if (!query) return reply(isInteraction ? { content: 'Nhập tên trang bị.', ephemeral: true } : 'Nhập tên trang bị.');

  if (isInteraction) await source.deferReply();

  try {
    const patch = await getLatestPatch();
    const itemData = await getItemData('vi_VN');
    const q = stripAccents(query);

    let found = null, foundId = null;
    for (const [id, item] of Object.entries(itemData.data)) {
      const name = stripAccents(item.name);
      if (name.includes(q)) { found = item; foundId = id; break; }
    }

    if (!found) return editOrReply(source, isInteraction, { content: `Không tìm thấy trang bị: **${query}**` });

    const desc = found.description?.replace(/<[^>]+>/g, '').trim() ?? 'Không có mô tả.';
    const iconUrl = `${DD(patch)}/img/item/${foundId}.png`;

    const statsLines = Object.entries(found.stats ?? {})
      .map(([k, v]) => `• ${k}: +${v}`)
      .join('\n') || 'Xem mô tả bên dưới.';

    const embed = new EmbedBuilder()
      .setTitle(`🛒 ${found.name}`)
      .setThumbnail(iconUrl)
      .setColor(C.neutral)
      .addFields(
        { name: '💰 Giá', value: `${(found.gold?.total ?? 0).toLocaleString()} vàng (bán: ${(found.gold?.sell ?? 0).toLocaleString()})`, inline: false },
        { name: '📊 Chỉ Số', value: statsLines, inline: false },
        { name: '📖 Mô Tả', value: desc.slice(0, 1024), inline: false }
      )
      .setFooter({ text: `Item ID: ${foundId} • Patch ${patch}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lolrunes — Rune trees ────────────────────────────────────────────────────
export async function handleLolRunes({ source, args, isInteraction, config, reply }) {
  const rawQuery = isInteraction ? source.options.getString('tree') : args;
  const query = (rawQuery ?? '').trim().toLowerCase();

  if (isInteraction) await source.deferReply();

  try {
    const patch = await getLatestPatch();
    const runeData = await getRuneData('vi_VN');
    const targetUserId = source.user?.id ?? source.author?.id;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`runes:select_menu:${targetUserId}`)
      .setPlaceholder('👉 Chọn cây ngọc để xem chi tiết...');

    if (!query) {
      // Show all trees overview
      const desc = runeData.map((tree) => {
        const keystone = tree.slots[0]?.runes.map((r) => r.name).join(', ');
        return `**${tree.name}** — Keystone: ${keystone}`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('💎 Bảng Ngọc League of Legends')
        .setDescription(desc)
        .setColor(C.rune)
        .setFooter({ text: `Patch ${patch} • Chọn cây ngọc bên dưới để xem chi tiết kèm hình ảnh` });

      selectMenu.addOptions(
        runeData.map(tree => ({
          label: `Hệ ${tree.name}`,
          description: `Xem các ngọc thuộc nhánh ${tree.name}`,
          value: String(tree.id)
        }))
      );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return editOrReply(source, isInteraction, { embeds: [embed], components: [row] });
    }

    // Find specific tree by:
    // 1. Vietnamese Name (e.g. "Áp Đảo")
    // 2. English Key (e.g. "Domination")
    // 3. Name or key of any individual rune inside slots (e.g. "Chinh Phục" / "Conqueror")
    const queryNorm = stripAccents(query);
    const tree = runeData.find((t) => {
      const nameNorm = stripAccents(t.name);
      const keyNorm = stripAccents(t.key ?? '');
      if (nameNorm.includes(queryNorm) || keyNorm.includes(queryNorm)) return true;

      return t.slots.some(slot =>
        slot.runes.some(r => {
          const rNameNorm = stripAccents(r.name);
          const rKeyNorm = stripAccents(r.key ?? '');
          return rNameNorm.includes(queryNorm) || rKeyNorm.includes(queryNorm);
        })
      );
    });

    if (!tree) return editOrReply(source, isInteraction, { content: `Không tìm thấy cây ngọc hoặc ngọc nào tên là: **${query}**` });

    const imagePath = await getOrCreateRuneTreeImage(tree, patch);
    const attachment = imagePath ? new AttachmentBuilder(imagePath) : null;
    const iconFilename = imagePath ? path.basename(imagePath) : null;

    const slotLines = tree.slots.map((slot, i) => {
      const runes = slot.runes.map((r) => `• **${r.name}** — ${r.shortDesc?.replace(/<[^>]+>/g, '').slice(0, 80) ?? ''}...`).join('\n');
      return `**${i === 0 ? 'Keystone' : `Hàng ${i}`}**\n${runes}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`💎 Cây Ngọc: ${tree.name}`)
      .setDescription(slotLines.slice(0, 4000))
      .setColor(C.rune)
      .setFooter({ text: `Patch ${patch}` });

    if (iconFilename) {
      embed.setImage(`attachment://${iconFilename}`);
    }

    selectMenu.addOptions(
      runeData.map(t => ({
        label: `Hệ ${t.name}`,
        description: `Xem các ngọc thuộc nhánh ${t.name}`,
        value: String(t.id),
        default: t.id === tree.id
      }))
    );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const payload = { embeds: [embed], components: [row] };
    if (attachment) payload.files = [attachment];

    return editOrReply(source, isInteraction, payload);
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

function drawStyledPanel(image, x, y, w, h, titleText, font) {
  const bgColor = 0x10121aff;
  const borderColor = 0x242838ff;
  const headerBgColor = 0x171a26ff;
  
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const isBorder = (px === 0 || px === w - 1 || py === 0 || py === h - 1);
      let color;
      if (isBorder) {
        color = borderColor;
      } else if (py < 40) {
        color = headerBgColor;
      } else {
        color = bgColor;
      }
      image.setPixelColor(color, x + px, y + py);
    }
  }
  
  if (titleText) {
    image.print({
      font: font,
      x: x + 15,
      y: y + 10,
      text: titleText
    });
  }
}

function drawGoldBorder(image, x, y, w, h) {
  const goldColor = 0xc79a3cff;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (px < 2 || px >= w - 2 || py < 2 || py >= h - 2) {
        image.setPixelColor(goldColor, x + px, y + py);
      }
    }
  }
}

function drawBox(image, x, y, w, h, bgColor, borderColor) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const isBorder = (px === 0 || px === w - 1 || py === 0 || py === h - 1);
      const color = isBorder ? borderColor : bgColor;
      image.setPixelColor(color, x + px, y + py);
    }
  }
}

function stripAccentsForCard(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^ -~]/g, '');
}

/**
 * Generates and caches a detailed build card image for the champion (1200x650px)
 */
async function getOrCreateChampBuildCardImage(detail, defaultPosition, runeRecs, itemBuild, patch) {
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const runeHash = runeRecs.map(r => r.perkIds[0]).join('-');
  const itemHash = itemBuild ? [...(itemBuild.starter_items.ids || []), ...(itemBuild.boots.ids || []), ...(itemBuild.core_items.ids || [])].join('-') : 'noitems';
  const outPath = path.join(tempDir, `build_card_h_${detail.id}_${defaultPosition}_${patch}_${runeHash}_${itemHash}.png`);
  
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  try {
    const baseImage = new Jimp({ width: 1200, height: 650 });

    // Diagonal gradient background from top-left (dark indigo) to bottom-right (slate)
    const colorStart = { r: 9, g: 10, b: 15 };
    const colorEnd = { r: 22, g: 25, b: 38 };
    for (let y = 0; y < 650; y++) {
      for (let x = 0; x < 1200; x++) {
        const factor = (x / 1200 + y / 650) / 2;
        const r = Math.round(colorStart.r + (colorEnd.r - colorStart.r) * factor);
        const g = Math.round(colorStart.g + (colorEnd.g - colorStart.g) * factor);
        const b = Math.round(colorStart.b + (colorEnd.b - colorStart.b) * factor);
        const color = (r << 24) | (g << 16) | (b << 8) | 0xff;
        baseImage.setPixelColor(color, x, y);
      }
    }

    // Load fonts
    const font32 = await loadFont(path.resolve(process.cwd(), 'assets/fonts/open-sans-32-white/open-sans-32-white.fnt'));
    const font16 = await loadFont(path.resolve(process.cwd(), 'assets/fonts/open-sans-16-white/open-sans-16-white.fnt'));
    const font8 = await loadFont(path.resolve(process.cwd(), 'assets/fonts/open-sans-8-white/open-sans-8-white.fnt'));

    // Draw panels
    drawStyledPanel(baseImage, 25, 25, 360, 600, 'THONG TIN & KY NANG', font16);
    drawStyledPanel(baseImage, 410, 25, 380, 600, 'BANG NGOC DE XUAT', font16);
    drawStyledPanel(baseImage, 815, 25, 360, 600, 'LOI LEN DO KHUYEN DUNG', font16);

    const runeTrees = await getRuneData('vi_VN');
    const runeMap = new Map();
    const styleMap = new Map();
    for (const tree of runeTrees) {
      styleMap.set(tree.id, tree.name);
      for (const slot of tree.slots) {
        for (const r of slot.runes) {
          runeMap.set(r.id, r.name);
        }
      }
    }
    const shardNames = {
      5001: 'Mau theo cap', 5002: 'Giap', 5003: 'Khang phep', 5005: 'Toc do danh',
      5007: 'Hoi ky nang', 5008: 'Suc manh thich ung', 5010: 'Toc do di chuyen',
      5011: 'Mau phang', 5013: 'Khang hieu ung'
    };
    for (const [id, name] of Object.entries(shardNames)) {
      runeMap.set(Number(id), name);
    }

    const perkMap = await getPerkIconsMap();
    const promises = [];

    // ── COLUMN 1: Champion Details & Spells ─────────────────────────────────────
    drawGoldBorder(baseImage, 43, 83, 84, 84);
    const portraitUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${detail.id}.png`;
    promises.push(
      Jimp.read(portraitUrl).then(img => {
        img.resize({ w: 80, h: 80 });
        baseImage.composite(img, 45, 85);
      }).catch(e => console.error('Failed to load champion portrait:', e.message))
    );

    baseImage.print({ font: font32, x: 140, y: 80, text: stripAccentsForCard(detail.name).toUpperCase() });
    baseImage.print({ font: font16, x: 140, y: 120, text: `"${stripAccentsForCard(detail.title).toUpperCase()}"` });
    baseImage.print({ font: font8, x: 140, y: 148, text: `TAGS: ${detail.tags.map(t => stripAccentsForCard(t).toUpperCase()).join(', ')} | DO KHO: ${'⭐'.repeat(detail.info?.difficulty ?? 1)}` });

    const statsY = 180;
    baseImage.print({ font: font16, x: 45, y: statsY, text: `HP: ${detail.stats.hp} (+${detail.stats.hpperlevel}/LV) | AD: ${detail.stats.attackdamage} (+${detail.stats.attackdamageperlevel}/LV)` });
    baseImage.print({ font: font16, x: 45, y: statsY + 22, text: `GIAP: ${detail.stats.armor} (+${detail.stats.armorperlevel}/LV) | K.PHEP: ${detail.stats.spellblock} (+${detail.stats.spellblockperlevel}/LV)` });

    const spellsList = [
      { key: 'P', name: detail.passive.name, description: detail.passive.description, isPassive: true, imgName: detail.passive.image },
      ...detail.spells.map((sp, idx) => ({
        key: ['Q', 'W', 'E', 'R'][idx] || '?',
        name: sp.name,
        description: sp.description,
        isPassive: false,
        imgName: sp.image
      }))
    ];

    spellsList.forEach((sp, idx) => {
      const y = 245 + idx * 70;
      const url = sp.isPassive
        ? `https://ddragon.leagueoflegends.com/cdn/${patch}/img/passive/${sp.imgName}`
        : `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${sp.imgName}`;

      drawBox(baseImage, 43, y - 2, 52, 52, 0x171a26ff, 0x242838ff);

      promises.push(
        Jimp.read(url).then(img => {
          img.resize({ w: 48, h: 48 });
          baseImage.composite(img, 45, y);
        }).catch(e => console.error(`Failed to load spell icon ${sp.key}:`, e.message))
      );

      baseImage.print({ font: font16, x: 105, y: y - 2, text: `[${sp.key}] ${stripAccentsForCard(sp.name).toUpperCase()}` });
      
      let descClean = stripAccentsForCard(sp.description).replace(/\s+/g, ' ').trim();
      if (descClean.length > 42) {
        descClean = descClean.slice(0, 39) + '...';
      }
      baseImage.print({ font: font8, x: 105, y: y + 20, text: descClean });
    });

    // ── COLUMN 2: Recommended Runes ─────────────────────────────────────────────
    const styleIcons = {
      8000: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png',
      8100: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7200_Domination.png',
      8200: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7202_Sorcery.png',
      8300: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7203_Whimsy.png',
      8400: 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7204_Resolve.png'
    };

    for (let i = 0; i < Math.min(runeRecs.length, 2); i++) {
      const rec = runeRecs[i];
      const pageY = 85 + i * 255;
      const laneText = rec.position ? ` (${stripAccentsForCard(rec.position).toUpperCase()})` : '';

      baseImage.print({ font: font16, x: 430, y: pageY, text: `${i + 1}. BANG NGOC DE XUAT${laneText}` });
      drawBox(baseImage, 430, pageY + 25, 340, 205, 0x161822ff, 0x242838ff);

      const relativeY = pageY + 25;

      const priUrl = styleIcons[rec.primaryPerkStyleId];
      if (priUrl) {
        promises.push(
          Jimp.read(priUrl).then(img => {
            img.resize({ w: 40, h: 40 });
            baseImage.composite(img, 445, relativeY + 15);
          }).catch(e => console.error('Failed to load primary style:', e.message))
        );
      }

      const keystoneId = rec.perkIds[0];
      const keystoneUrl = perkMap.get(keystoneId);
      if (keystoneUrl) {
        promises.push(
          Jimp.read(keystoneUrl).then(img => {
            img.resize({ w: 56, h: 56 });
            baseImage.composite(img, 495, relativeY + 7);
          }).catch(e => console.error('Failed to load keystone:', e.message))
        );
      }

      for (let j = 0; j < 3; j++) {
        const perkId = rec.perkIds[j + 1];
        const perkUrl = perkMap.get(perkId);
        if (perkUrl) {
          promises.push(
            Jimp.read(perkUrl).then(img => {
              img.resize({ w: 32, h: 32 });
              baseImage.composite(img, 565 + j * 38, relativeY + 19);
            }).catch(e => console.error('Failed to load sub-perk:', e.message))
          );
        }
      }

      const secUrl = styleIcons[rec.secondaryPerkStyleId];
      if (secUrl) {
        promises.push(
          Jimp.read(secUrl).then(img => {
            img.resize({ w: 40, h: 40 });
            baseImage.composite(img, 445, relativeY + 85);
          }).catch(e => console.error('Failed to load secondary style:', e.message))
        );
      }

      for (let j = 0; j < 2; j++) {
        const perkId = rec.perkIds[j + 4];
        const perkUrl = perkMap.get(perkId);
        if (perkUrl) {
          promises.push(
            Jimp.read(perkUrl).then(img => {
              img.resize({ w: 32, h: 32 });
              baseImage.composite(img, 495 + j * 38, relativeY + 89);
            }).catch(e => console.error('Failed to load sub-perk:', e.message))
          );
        }
      }

      for (let j = 0; j < 3; j++) {
        const shardId = rec.perkIds[j + 6];
        const shardUrl = perkMap.get(shardId);
        if (shardUrl) {
          promises.push(
            Jimp.read(shardUrl).then(img => {
              img.resize({ w: 20, h: 20 });
              baseImage.composite(img, 585 + j * 28, relativeY + 95);
            }).catch(e => console.error('Failed to load shard:', e.message))
          );
        }
      }

      const primaryName = stripAccentsForCard(styleMap.get(rec.primaryPerkStyleId) || '').toUpperCase();
      const secondaryName = stripAccentsForCard(styleMap.get(rec.secondaryPerkStyleId) || '').toUpperCase();
      const perks = rec.perkIds.map(id => stripAccentsForCard(runeMap.get(id) || `ID:${id}`).toUpperCase());
      const keystoneName = perks[0];
      const secSubnames = perks.slice(4, 6).join(', ');

      baseImage.print({
        font: font8,
        x: 445,
        y: relativeY + 145,
        text: `CHINH: ${primaryName} (${keystoneName})`,
        maxWidth: 310
      });
      baseImage.print({
        font: font8,
        x: 445,
        y: relativeY + 165,
        text: `PHU: ${secondaryName} - ${secSubnames}`,
        maxWidth: 310
      });
    }

    // ── COLUMN 3: Recommended Items ─────────────────────────────────────────────
    if (itemBuild) {
      // 1. Starter Items
      let itemY = 85;
      baseImage.print({ font: font16, x: 830, y: itemY, text: 'KHOI DAU' });
      const starterIds = itemBuild.starter_items.ids || [];
      const starterNames = itemBuild.starter_items.names || [];
      
      starterIds.forEach((id, idx) => {
        const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`;
        const drawX = 830 + idx * 75;
        const drawY = itemY + 25;
        
        drawBox(baseImage, drawX - 1, itemY + 24, 50, 50, 0x171a26ff, 0x242838ff);
        
        promises.push(
          Jimp.read(url).then(img => {
            img.resize({ w: 48, h: 48 });
            baseImage.composite(img, drawX, drawY);
          }).catch(e => console.error('Failed to load item:', e.message))
        );

        const name = starterNames[idx] || `Item:${id}`;
        baseImage.print({
          font: font8,
          x: drawX - 5,
          y: itemY + 77,
          text: stripAccentsForCard(name).toUpperCase(),
          maxWidth: 70
        });
      });

      // 2. Boots
      itemY = 205;
      baseImage.print({ font: font16, x: 830, y: itemY, text: 'GIAY' });
      const bootIds = itemBuild.boots.ids || [];
      const bootNames = itemBuild.boots.names || [];
      
      bootIds.forEach((id, idx) => {
        const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`;
        const drawX = 830 + idx * 75;
        const drawY = itemY + 25;
        
        drawBox(baseImage, drawX - 1, itemY + 24, 50, 50, 0x171a26ff, 0x242838ff);
        
        promises.push(
          Jimp.read(url).then(img => {
            img.resize({ w: 48, h: 48 });
            baseImage.composite(img, drawX, drawY);
          }).catch(e => console.error('Failed to load boot:', e.message))
        );

        const name = bootNames[idx] || `Item:${id}`;
        baseImage.print({
          font: font8,
          x: drawX - 5,
          y: itemY + 77,
          text: stripAccentsForCard(name).toUpperCase(),
          maxWidth: 70
        });
      });

      // 3. Core Items (3 Items with Arrows)
      itemY = 325;
      baseImage.print({ font: font16, x: 830, y: itemY, text: 'COT LOI (3 MON)' });
      const coreIds = itemBuild.core_items.ids || [];
      const coreNames = itemBuild.core_items.names || [];
      
      coreIds.forEach((id, idx) => {
        const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`;
        const drawX = 830 + idx * 95;
        const drawY = itemY + 25;
        
        drawBox(baseImage, drawX - 1, itemY + 24, 50, 50, 0x171a26ff, 0x242838ff);
        
        promises.push(
          Jimp.read(url).then(img => {
            img.resize({ w: 48, h: 48 });
            baseImage.composite(img, drawX, drawY);
          }).catch(e => console.error('Failed to load core item:', e.message))
        );

        if (idx < 2) {
          baseImage.print({ font: font16, x: drawX + 63, y: itemY + 38, text: '->' });
        }

        const name = coreNames[idx] || `Item:${id}`;
        baseImage.print({
          font: font8,
          x: drawX - 8,
          y: itemY + 77,
          text: stripAccentsForCard(name).toUpperCase(),
          maxWidth: 80
        });
      });

      // 4. Situational Items (5 Items with Pick Rates)
      itemY = 445;
      baseImage.print({ font: font16, x: 830, y: itemY, text: 'TINH HUONG (MON 4, 5, 6)' });

      const situationalList = [];
      const addUniques = (items) => {
        (items || []).forEach(item => {
          const id = item.ids?.[0];
          if (id && !situationalList.some(x => x.id === id)) {
            situationalList.push({ id, name: item.name, pickRate: item.pick_rate });
          }
        });
      };
      addUniques(itemBuild.fourth_items);
      addUniques(itemBuild.fifth_items);
      addUniques(itemBuild.last_items);

      situationalList.slice(0, 5).forEach((item, idx) => {
        const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${item.id}.png`;
        const drawX = 830 + idx * 64;
        const drawY = itemY + 25;
        
        drawBox(baseImage, drawX - 1, itemY + 24, 50, 50, 0x171a26ff, 0x242838ff);
        
        promises.push(
          Jimp.read(url).then(img => {
            img.resize({ w: 48, h: 48 });
            baseImage.composite(img, drawX, drawY);
          }).catch(e => console.error('Failed to load situational item:', e.message))
        );

        const rateText = item.pickRate ? `${(item.pickRate * 100).toFixed(0)}%` : '';
        const name = item.name || `Item:${item.id}`;
        const cleanName = stripAccentsForCard(name).toUpperCase();
        
        baseImage.print({
          font: font8,
          x: drawX - 6,
          y: itemY + 77,
          text: `${cleanName.slice(0, 7)}..\n(${rateText})`,
          maxWidth: 60
        });
      });
    }

    await Promise.all(promises);
    await baseImage.write(outPath);
    return outPath;
  } catch (err) {
    console.error(`[lolchamp] Failed to generate build card image:`, err);
    return null;
  }
}

/**
 * Generates and caches a layout image of a rune tree path
 */
async function getOrCreateRuneTreeImage(tree, patch) {
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const outPath = path.join(tempDir, `runes_tree_${tree.id}_${patch}.png`);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  try {
    const canvasWidth = 360;
    const canvasHeight = 350;
    const baseImage = new Jimp({ width: canvasWidth, height: canvasHeight, color: 0x111217ff }); // Dark Discord background

    const rowSpacing = 80;
    const itemSpacing = 15;

    const promises = [];

    tree.slots.forEach((slot, rowIdx) => {
      const isKeystone = rowIdx === 0;
      const iconSize = isKeystone ? 64 : 48;
      const count = slot.runes.length;

      const totalWidth = count * iconSize + (count - 1) * itemSpacing;
      const startX = (canvasWidth - totalWidth) / 2;
      const y = 15 + rowIdx * rowSpacing + (isKeystone ? 0 : 8);

      slot.runes.forEach((rune, colIdx) => {
        const x = startX + colIdx * (iconSize + itemSpacing);
        const url = `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;

        promises.push(
          Jimp.read(url)
            .then(img => {
              img.resize({ w: iconSize, h: iconSize });
              baseImage.composite(img, x, y);
            })
            .catch(err => {
              console.error(`[lolrunes] Failed to load rune icon for ${rune.name}:`, err.message);
            })
        );
      });
    });

    await Promise.all(promises);
    await baseImage.write(outPath);
    return outPath;
  } catch (err) {
    console.error(`[lolrunes] Failed to generate rune tree image for ${tree.name}:`, err);
    return null;
  }
}

/**
 * Handle dropdown interaction for runes select menu
 */
export async function handleRunesSelect(interaction) {
  const treeId = parseInt(interaction.values[0], 10);
  await interaction.deferUpdate();

  try {
    const patch = await getLatestPatch();
    const runeData = await getRuneData('vi_VN');
    const tree = runeData.find(t => t.id === treeId);
    if (!tree) return;

    const imagePath = await getOrCreateRuneTreeImage(tree, patch);
    const attachment = imagePath ? new AttachmentBuilder(imagePath) : null;
    const iconFilename = imagePath ? path.basename(imagePath) : null;

    const slotLines = tree.slots.map((slot, i) => {
      const runes = slot.runes.map((r) => `• **${r.name}** — ${r.shortDesc?.replace(/<[^>]+>/g, '').slice(0, 80) ?? ''}...`).join('\n');
      return `**${i === 0 ? 'Keystone' : `Hàng ${i}`}**\n${runes}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`💎 Cây Ngọc: ${tree.name}`)
      .setDescription(slotLines.slice(0, 4000))
      .setColor(C.rune)
      .setFooter({ text: `Patch ${patch}` });

    if (iconFilename) {
      embed.setImage(`attachment://${iconFilename}`);
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(interaction.customId)
      .setPlaceholder(`Hệ ${tree.name}`)
      .addOptions(
        runeData.map(t => ({
          label: `Hệ ${t.name}`,
          description: `Xem các ngọc thuộc nhánh ${t.name}`,
          value: String(t.id),
          default: t.id === tree.id
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const payload = {
      embeds: [embed],
      components: [row]
    };
    if (attachment) {
      payload.files = [attachment];
    }

    await interaction.editReply(payload);
  } catch (err) {
    console.error('[lolrunes] Error handling runes select menu:', err);
  }
}

// ── /lolpatch — Latest patch info ────────────────────────────────────────────
export async function handleLolPatch({ source, isInteraction, config, reply }) {
  if (isInteraction) await source.deferReply();

  try {
    const patch = await getLatestPatch();
    const [major, minor] = patch.split('.');

    // Lấy changelog URL từ Riot website (chỉ link, không scrape)
    const patchNoteUrl = `https://www.leagueoflegends.com/vi-vn/news/game-updates/patch-${major}-${minor}-notes/`;
    const enPatchUrl = `https://www.leagueoflegends.com/en-us/news/game-updates/patch-${major}-${minor}-notes/`;

    const embed = new EmbedBuilder()
      .setTitle(`📰 Phiên Bản Mới Nhất: ${patch}`)
      .setColor(C.patch)
      .setDescription(
        `Patch **${patch}** đang hoạt động trên tất cả server.\n\n` +
        `📖 **Patch Notes (Tiếng Việt)**\n${patchNoteUrl}\n\n` +
        `📖 **Patch Notes (English)**\n${enPatchUrl}`
      )
      .addFields(
        { name: '🗓️ Chu Kỳ Patch', value: 'Mỗi 2 tuần (thứ 4)', inline: true },
        { name: '🔗 OP.GG', value: 'https://op.gg', inline: true },
        { name: '🔗 U.GG', value: 'https://u.gg', inline: true }
      )
      .setFooter({ text: 'Dữ liệu từ Data Dragon API' });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lollink — Link Discord ↔ Riot account ────────────────────────────────────
export async function handleLolLink({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) {
    return reply(noApiKeyMsg(isInteraction, '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.'));
  }

  const riotIdStr = (isInteraction ? source.options.getString('summoner') : args).trim();
  const region = ((isInteraction ? source.options.getString('region') : null) ?? 'vn2').toLowerCase();

  if (!riotIdStr) return reply(isInteraction
    ? { content: 'Nhập Riot ID của bạn. VD: `/lollink PlayerName#VN2`', ephemeral: true }
    : 'Nhập Riot ID của bạn.');

  if (isInteraction) await source.deferReply({ ephemeral: true });

  try {
    const parsed = parseRiotId(riotIdStr);
    if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG`');

    // Verify account exists
    const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
    const userId = isInteraction ? source.user.id : source.author.id;

    await stateStore.linkLolAccount(guildId, userId, {
      riotId: `${account.gameName}#${account.tagLine}`,
      puuid: account.puuid,
      region
    });

    return editOrReply(source, isInteraction, {
      content: `✅ Đã liên kết tài khoản **${account.gameName}#${account.tagLine}** (${region.toUpperCase()}) với Discord của bạn!\nBây giờ bạn có thể dùng **/lsd**, **/lol**, **/lolmatch** mà không cần nhập tên.`,
      ephemeral: true
    });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatRiotError(err), ephemeral: true });
  }
}

// ── /lolunlink ────────────────────────────────────────────────────────────────
export async function handleLolUnlink({ source, isInteraction, stateStore, guildId, reply }) {
  const userId = isInteraction ? source.user.id : source.author.id;
  await stateStore.unlinkLolAccount(guildId, userId);
  const msg = '✅ Đã xoá liên kết tài khoản LoL.';
  return reply(isInteraction ? { content: msg, ephemeral: true } : msg);
}

// ── Slash command option builders ─────────────────────────────────────────────
export function buildLolSlashOptions(commandType) {
  const summonerOpt = {
    name: 'summoner', description: 'Tên người chơi (VD: PlayerName#VN2) — bỏ trống nếu đã liên kết',
    type: ApplicationCommandOptionType.String, required: false
  };
  const regionOpt = {
    name: 'region', description: 'Server khu vực',
    type: ApplicationCommandOptionType.String, required: false,
    choices: getRegionChoices()
  };
  const champOpt = {
    name: 'champion', description: 'Tên tướng (tiếng Việt hoặc tiếng Anh)',
    type: ApplicationCommandOptionType.String, required: true
  };
  const itemOpt = {
    name: 'item', description: 'Tên trang bị',
    type: ApplicationCommandOptionType.String, required: true
  };
  const treeOpt = {
    name: 'tree', description: 'Tên cây ngọc (bỏ trống để xem tổng quan)',
    type: ApplicationCommandOptionType.String, required: false
  };
  const summonerRequired = { ...summonerOpt, required: true };

  switch (commandType) {
    case 'lsd':
    case 'lolprofile': return [summonerOpt, regionOpt];
    case 'lolmatch': return [
      summonerOpt, regionOpt,
      { name: 'index', description: 'Số thứ tự trận (1–10)', type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: 10 }
    ];
    case 'lolchamp': return [champOpt];
    case 'lolitem': return [itemOpt];
    case 'lolrunes': return [treeOpt];
    case 'lolpatch': return [];
    case 'lollink': return [{ ...summonerRequired, description: 'Riot ID của bạn (VD: PlayerName#VN2)' }, regionOpt];
    case 'lolunlink': return [];
    default: return [];
  }
}
