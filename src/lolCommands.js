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

import { EmbedBuilder, ApplicationCommandOptionType } from 'discord.js';
import {
  parseRiotId, getAccountByRiotId, getSummonerByPuuid, getRankedInfo,
  getMatchHistory, getMatchDetail, getTopMastery, findChampion,
  getChampionDetail, getChampionData, getItemData, getRuneData,
  getLatestPatch, formatRank, formatDuration, getQueueName,
  getRegionChoices, RANK_EMOJIS, REGIONS, batchFetch
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

// ── Summoner resolution with linked account fallback ─────────────────────────
async function resolveSummoner(source, args, isInteraction, stateStore, guildId, apiKey) {
  let riotIdStr, region;

  if (isInteraction) {
    riotIdStr = source.options.getString('summoner');
    region = (source.options.getString('region') ?? 'vn2').toLowerCase();
  } else {
    const parts = args.trim().split(/\s+/);
    region = (parts[parts.length - 1]?.toLowerCase() in ({ vn2: 1, na1: 1, euw1: 1, kr: 1, jp1: 1, sg2: 1, eun1: 1, br1: 1, la1: 1, la2: 1, oc1: 1, ph2: 1, ru: 1, th2: 1, tr1: 1, tw2: 1 }))
      ? parts.pop()
      : 'vn2';
    riotIdStr = parts.join(' ');
  }

  // If no summoner given, try linked account
  if (!riotIdStr) {
    const userId = isInteraction ? source.user.id : source.author.id;
    const linked = await stateStore.getLinkedLolAccount(guildId, userId);
    if (linked) {
      riotIdStr = linked.riotId;
      region = linked.region;
    }
  }

  if (!riotIdStr) throw new Error('Vui lòng nhập tên người chơi (VD: PlayerName#VN2) hoặc dùng `/lollink` để liên kết tài khoản.');

  const parsed = parseRiotId(riotIdStr);
  if (!parsed) throw new Error('Định dạng không hợp lệ. Dùng: `TênNgườiChơi#TAG` (VD: `Faker#KR1`)');

  const account = await getAccountByRiotId(parsed.gameName, parsed.tagLine, region, apiKey);
  const summoner = await getSummonerByPuuid(account.puuid, region, apiKey);
  return { account, summoner, region };
}

// ── /lsd — Match history list ─────────────────────────────────────────────────
export async function handleLsd({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /lol — Full profile ───────────────────────────────────────────────────────
export async function handleLolProfile({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /lolmatch — Single match detail ──────────────────────────────────────────
export async function handleLolMatch({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
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

    const embed = new EmbedBuilder()
      .setTitle(`${detail.name} — "${detail.title}"`)
      .setDescription(detail.lore?.slice(0, 300) + '...' || detail.blurb)
      .setThumbnail(iconUrl)
      .setImage(splashUrl)
      .setColor(C.champ)
      .addFields(
        { name: '📌 Loại / Tags', value: detail.tags.join(', '), inline: true },
        { name: '📊 Độ Khó', value: '⭐'.repeat(detail.info?.difficulty ?? 1), inline: true },
        { name: '🔖 Patch', value: patch, inline: true },
        { name: '📈 Chỉ Số Cơ Bản', value: stats, inline: false },
        { name: '🔮 Kỹ Năng', value: passiveLine + '\n\n' + spells, inline: false },
        { name: '💡 Mẹo Đồng Đội', value: tips, inline: false }
      )
      .setFooter({ text: `Dùng /lsd để tra lịch sử người chơi • Data Dragon ${patch}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
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
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let found = null, foundId = null;
    for (const [id, item] of Object.entries(itemData.data)) {
      const name = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /lolrunes — Rune trees ────────────────────────────────────────────────────
export async function handleLolRunes({ source, args, isInteraction, config, reply }) {
  const query = (isInteraction ? source.options.getString('tree') : args).trim().toLowerCase();

  if (isInteraction) await source.deferReply();

  try {
    const patch = await getLatestPatch();
    const runeData = await getRuneData('vi_VN');

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
        .setFooter({ text: `Patch ${patch} • Dùng /lolrunes [tên cây] để xem chi tiết` });

      return editOrReply(source, isInteraction, { embeds: [embed] });
    }

    // Find specific tree
    const tree = runeData.find((t) =>
      t.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
        query.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      )
    );

    if (!tree) return editOrReply(source, isInteraction, { content: `Không tìm thấy cây ngọc: **${query}**` });

    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`;
    const slotLines = tree.slots.map((slot, i) => {
      const runes = slot.runes.map((r) => `• **${r.name}** — ${r.shortDesc?.replace(/<[^>]+>/g, '').slice(0, 80) ?? ''}...`).join('\n');
      return `**${i === 0 ? 'Keystone' : `Hàng ${i}`}**\n${runes}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`💎 Cây Ngọc: ${tree.name}`)
      .setDescription(slotLines.slice(0, 4000))
      .setThumbnail(iconUrl)
      .setColor(C.rune)
      .setFooter({ text: `Patch ${patch}` });

    return editOrReply(source, isInteraction, { embeds: [embed] });
  } catch (err) {
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
  }
}

// ── /lollink — Link Discord ↔ Riot account ────────────────────────────────────
export async function handleLolLink({ source, args, isInteraction, stateStore, guildId, config, reply }) {
  const apiKey = config.riotApiKey;
  if (!apiKey) return reply(noApiKeyMsg(isInteraction));

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
    return editOrReply(source, isInteraction, { content: formatError(err), ephemeral: true });
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function noApiKeyMsg(isInteraction) {
  const msg = '❌ Bot chưa được cấu hình Riot API Key. Admin cần thêm `RIOT_API_KEY` vào cài đặt.';
  return isInteraction ? { content: msg, ephemeral: true } : msg;
}

function formatError(err) {
  if (err.status === 404) {
    // Champion/item/static data not found vs summoner not found
    if (err.message && (err.message.startsWith('Champion not found') || err.message.startsWith('Not found'))) {
      return `❌ Không tìm thấy dữ liệu: ${err.message}`;
    }
    return '❌ Không tìm thấy người chơi. Kiểm tra lại Riot ID và khu vực.';
  }
  if (err.status === 429) return '❌ Đã vượt giới hạn API. Vui lòng thử lại sau vài giây.';
  if (err.status === 403) {
    const isRiotApi = err.body && err.body.includes('status_code');
    if (isRiotApi) return '❌ API Key không hợp lệ hoặc đã hết hạn. Vui lòng refresh key tại developer.riotgames.com.';
    return `❌ Lỗi dữ liệu (403): ${err.message}. Thử lại hoặc kiểm tra tên tướng/account.`;
  }
  return `❌ Lỗi: ${err.message}`;
}

async function editOrReply(source, isInteraction, payload) {
  if (isInteraction) {
    if (source.deferred || source.replied) return source.editReply(payload);
    return source.reply(payload);
  }
  return source.reply(payload);
}