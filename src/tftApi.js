/**
 * tftApi.js — TFT wrapper using LoL endpoints (Dev API key compatible)
 *
 * Dev API keys do NOT have access to:
 *   ❌ /tft/league/v1/*
 *   ❌ /tft/match/v1/*
 *
 * Instead we use LoL endpoints available to all keys, filtering by TFT queues:
 *   ✅ /lol/league/v4/entries/by-puuid/{puuid}  → filter queueType TFT_*
 *   ✅ /lol/match/v5/matches/by-puuid/{puuid}   → filter queue 1090/1100/1130/1160
 *   ✅ /lol/match/v5/matches/{matchId}           → TFT match data lives here too
 *
 * CDragon static data (no auth needed):
 *   ✅ communitydragon.org — items, traits, champions, augments
 */

import https from 'node:https';
import { URL } from 'node:url';
import { REGIONS, cache as _cache, getRankedInfo, getMatchHistory, getMatchDetail } from './lolApi.js';

// ── Re-exports ────────────────────────────────────────────────────────────────
export {
  REGIONS,
  getAccountByRiotId,
  getSummonerByPuuid,
  parseRiotId,
  getRegionChoices,
  formatDuration,
  RANK_EMOJIS,
} from './lolApi.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CDRAGON_TFT = 'https://raw.communitydragon.org/latest/cdragon/tft';

// TFT queue IDs used in match/v5
export const TFT_QUEUE_IDS = {
  1090: 'TFT Thường',
  1091: 'TFT Thường',
  1092: 'TFT Ranked',
  1100: 'Ranked TFT',
  1130: 'TFT Hyper Roll',
  1160: 'TFT Double Up',
};

const TFT_QUEUE_SET = new Set([1090, 1091, 1092, 1100, 1130, 1160]);

const TFT_RANK_EMOJIS = {
  IRON: '⚫', BRONZE: '🟤', SILVER: '⚪', GOLD: '🟡',
  PLATINUM: '🟢', EMERALD: '💚', DIAMOND: '🔵',
  MASTER: '🟣', GRANDMASTER: '🔴', CHALLENGER: '✨',
};

const TTL = {
  cdragon: 60 * 60 * 1000,  // 1 hour
  profile: 2  * 60 * 1000,  // 2 min
  match:   5  * 60 * 1000,  // 5 min
};

// ── HTTP helper (no auth — CDragon only) ──────────────────────────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'discord-service-bot/1.0', ...headers },
    };
    const req = https.get(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 404) { reject(Object.assign(new Error('Not found'), { status: 404 })); return; }
        if (res.statusCode === 429) { reject(Object.assign(new Error('Rate limited'), { status: 429 })); return; }
        if (res.statusCode >= 400) {
          console.error(`[CDragon] HTTP ${res.statusCode} for ${url}`);
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })); return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── Riot API — reuse LoL endpoints, filter TFT queues ────────────────────────

/**
 * TFT rank info — reuses /lol/league/v4/entries/by-puuid, filters TFT queue types.
 * queueType for TFT: "RANKED_TFT" (normal ranked) and "RANKED_TFT_TURBO" (Hyper Roll).
 */
export async function getTftRankedInfo(puuid, region, apiKey) {
  // getRankedInfo fetches all ranked entries (LoL + TFT share the same endpoint)
  const allEntries = await getRankedInfo(puuid, region, apiKey);
  return allEntries.filter((e) => e.queueType?.startsWith('RANKED_TFT'));
}

/**
 * TFT match IDs — reuses /lol/match/v5, filters by TFT queue IDs.
 * Fetches a larger batch (up to 3× requested) to compensate for filtering.
 */
export async function getTftMatchHistory(puuid, region, apiKey, count = 5) {
  const cacheKey = `tft:matchids:${region}:${puuid}:${count}`;
  let cached = _cache.get(cacheKey);
  if (cached) return cached;

  // Use queue filter directly on the API — avoids downloading all match details just to
  // identify TFT games. match-v5 accepts one queue param per call, so we try queues in
  // priority order and merge until we have enough.
  const TFT_QUEUE_PRIORITY = [1100, 1090, 1130, 1160];

  const seen = new Set();
  const tftIds = [];

  for (const queueId of TFT_QUEUE_PRIORITY) {
    if (tftIds.length >= count) break;
    const needed = count - tftIds.length;
    try {
      const ids = await getMatchHistory(puuid, region, apiKey, needed, queueId);
      console.log(`[TFT] queue=${queueId} returned ${ids.length} ids`);
      for (const id of ids) {
        if (!seen.has(id)) { seen.add(id); tftIds.push(id); }
      }
    } catch (e) {
      console.warn(`[TFT] queue=${queueId} error: ${e.message} (status=${e.status ?? '?'})`);
    }
  }
  console.log(`[TFT] total tftIds after queue filter: ${tftIds.length}`);

  // Last-resort fallback: if all queue-filtered calls returned nothing (e.g. very old account),
  // fetch unfiltered IDs and check the first few details. Capped at 5 to avoid rate limits.
  if (tftIds.length === 0) {
    try {
      const allIds = await getMatchHistory(puuid, region, apiKey, 10, null);
      for (const id of allIds.slice(0, 5)) {
        if (tftIds.length >= count) break;
        try {
          const detail = await getMatchDetail(id, region, apiKey);
          if (TFT_QUEUE_SET.has(detail?.info?.queueId)) tftIds.push(id);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  _cache.set(cacheKey, tftIds, TTL.match);
  return tftIds;
}

/**
 * TFT match detail — same /lol/match/v5/matches/{id} endpoint.
 * TFT matches have participants with TFT-specific fields (placement, traits, units, augments).
 */
export async function getTftMatchDetail(matchId, region, apiKey) {
  return getMatchDetail(matchId, region, apiKey);
}

// ── CDragon TFT Static Data ───────────────────────────────────────────────────

export async function getTftStaticData() {
  const cacheKey = 'cdragon:tft:full';
  let data = _cache.get(cacheKey);
  if (data) return data;

  try {
    data = await httpGet(`${CDRAGON_TFT}/en_us.json`);
  } catch (e) {
    console.error('[CDragon] Failed to fetch TFT static data:', e.message);
    // Return empty structure — commands will gracefully show raw IDs
    data = { items: [], augments: [], sets: {} };
  }
  _cache.set(cacheKey, data, TTL.cdragon);
  return data;
}

export async function getTftItems() {
  const cacheKey = 'cdragon:tft:items';
  let data = _cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const map = {};
  for (const item of (full.items ?? [])) {
    const key = item.apiName ?? String(item.id);
    const entry = {
      id: key,
      name: item.name ?? key,
      desc: (item.desc ?? item.description ?? '').replace(/<[^>]+>/g, '').trim(),
      icon: item.icon ? normalizeCdragonPath(item.icon) : null,
      isComponent: !item.composition || item.composition.length === 0,
    };
    map[key] = entry;
    if (item.id != null) map[String(item.id)] = entry;
    if (item.name) map[item.name.toLowerCase()] = entry;
  }
  _cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

export async function getTftChampions() {
  const cacheKey = 'cdragon:tft:champions';
  let data = _cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const setKeys = Object.keys(full.sets ?? {});
  const latestSet = setKeys.length ? full.sets[setKeys[setKeys.length - 1]] : null;
  const units = latestSet?.champions ?? full.champions ?? [];

  const map = {};
  for (const unit of units) {
    const apiName = unit.apiName ?? unit.characterName ?? unit.name;
    if (!apiName) continue;
    const entry = {
      apiName,
      name: unit.name ?? apiName,
      cost: unit.cost ?? 1,
      traits: unit.traits ?? [],
      icon: unit.squareIcon ? normalizeCdragonPath(unit.squareIcon)
        : unit.tileIcon ? normalizeCdragonPath(unit.tileIcon) : null,
      ability: {
        name: unit.ability?.name ?? '',
        desc: (unit.ability?.desc ?? '').replace(/<[^>]+>/g, '').trim(),
      },
    };
    map[apiName] = entry;
    map[apiName.toLowerCase()] = entry;
    if (unit.name) map[unit.name.toLowerCase()] = entry;
  }
  _cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

export async function getTftAugments() {
  const cacheKey = 'cdragon:tft:augments';
  let data = _cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const map = {};
  for (const aug of (full.augments ?? [])) {
    if (!aug.apiName) continue;
    map[aug.apiName] = {
      apiName: aug.apiName,
      name: aug.name ?? aug.apiName,
      desc: (aug.desc ?? '').replace(/<[^>]+>/g, '').trim(),
      tier: aug.tier ?? 1,  // 1=silver, 2=gold, 3=prismatic
    };
    map[aug.apiName.toLowerCase()] = map[aug.apiName];
  }
  _cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatTftRank(entry) {
  if (!entry) return 'Chưa xếp hạng';
  const emoji = TFT_RANK_EMOJIS[entry.tier] ?? '❓';
  const games = entry.wins + entry.losses;
  const wr = games > 0 ? Math.round(entry.wins / games * 100) : 0;
  const label = entry.queueType === 'RANKED_TFT_TURBO' ? 'Hyper Roll' : 'Ranked TFT';
  return `${emoji} **${entry.tier} ${entry.rank}** — ${entry.leaguePoints} LP\n` +
    `${entry.wins}W/${entry.losses}L (${wr}% WR) · ${label}`;
}

export function getTftQueueName(queueId) {
  return TFT_QUEUE_IDS[queueId] ?? `Queue ${queueId}`;
}

export function placementEmoji(placement) {
  return ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'][placement - 1] ?? `#${placement}`;
}

function normalizeCdragonPath(path) {
  if (!path) return null;
  const lower = path.toLowerCase().replace(/\\/g, '/');
  return `https://raw.communitydragon.org/latest/game/${lower}`;
}

export { TFT_RANK_EMOJIS };
