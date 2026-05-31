/**
 * tftApi.js — Riot API wrapper for Teamfight Tactics
 *
 * Endpoints covered:
 *   Riot API  — Account-v1, Summoner-v4, League-v4 (TFT), Match-v1 (TFT)
 *   CDragon   — TFT sets, augments, traits, units, items (latest)
 *
 * Reuses the same routing maps, Cache class, and httpGet/riotGet helpers
 * from lolApi.js to avoid duplication.
 */

import https from 'node:https';
import { URL } from 'node:url';

// ── Re-export shared constants from lolApi (routing, regions) ────────────────
export {
  REGIONS,
  cache,
  getLatestPatch,
  getAccountByRiotId,
  getSummonerByPuuid,
  parseRiotId,
  getRegionChoices,
  formatDuration,
  RANK_EMOJIS,
} from './lolApi.js';

// ── TFT-specific constants ────────────────────────────────────────────────────

const CDRAGON_TFT = 'https://raw.communitydragon.org/latest/cdragon/tft';

const TFT_RANK_EMOJIS = {
  IRON: '⚫', BRONZE: '🟤', SILVER: '⚪', GOLD: '🟡',
  PLATINUM: '🟢', EMERALD: '💚', DIAMOND: '🔵',
  MASTER: '🟣', GRANDMASTER: '🔴', CHALLENGER: '✨'
};

// TFT queue IDs
const TFT_QUEUE_IDS = {
  1090: 'Ranked TFT',
  1091: 'TFT Thường',
  1092: 'TFT Ranked (old)',
  1100: 'Ranked TFT',
  1130: 'TFT Hyper Roll',
  1160: 'TFT Double Up',
};

// ── Simple in-memory cache (shared instance via import) ───────────────────────
// We import `cache` from lolApi.js above, so no separate cache needed.

const TTL = {
  cdragon: 60 * 60 * 1000,   // 1 hour  – static CDragon data
  profile: 2 * 60 * 1000,    // 2 min   – summoner / rank
  match:   5 * 60 * 1000,    // 5 min   – match history
};

// ── Generic HTTP fetch ────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'discord-service-bot/1.0', ...headers }
    };
    const req = https.get(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 404) {
          reject(Object.assign(new Error('Not found'), { status: 404 }));
          return;
        }
        if (res.statusCode === 429) {
          reject(Object.assign(new Error('Rate limited'), { status: 429 }));
          return;
        }
        if (res.statusCode >= 400) {
          console.error(`[TFT API] HTTP ${res.statusCode} for ${url} | body: ${body.slice(0, 200)}`);
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode, body }));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function riotGet(path, platform, apiKey) {
  const url = `https://${platform}.api.riotgames.com${path}`;
  const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...(len=${apiKey.length})` : 'EMPTY';
  console.log(`[TFT API] ${platform} ${path.split('?')[0]} | key: ${keyPreview}`);
  return httpGet(url, { 'X-Riot-Token': apiKey });
}

// ── TFT Static Data (CDragon) ─────────────────────────────────────────────────

/**
 * Fetch the full TFT data blob from CDragon (en_us as base, vn fallback).
 * Returns an object with { sets, items, augments, traits, champions, ... }
 */
export async function getTftStaticData() {
  const { cache } = await import('./lolApi.js');
  const cacheKey = 'cdragon:tft:full';
  let data = cache.get(cacheKey);
  if (data) return data;

  // CDragon provides a single JSON with all TFT set data
  data = await httpGet(`${CDRAGON_TFT}/en_us.json`);
  cache.set(cacheKey, data, TTL.cdragon);
  return data;
}

/**
 * Get TFT set items map: id → { id, name, desc, icon }
 */
export async function getTftItems() {
  const { cache } = await import('./lolApi.js');
  const cacheKey = 'cdragon:tft:items';
  let data = cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const map = {};
  for (const item of (full.items ?? [])) {
    map[item.apiName ?? item.id] = {
      id: item.apiName ?? item.id,
      name: item.name ?? `Item ${item.id}`,
      desc: (item.desc ?? item.description ?? '').replace(/<[^>]+>/g, '').trim(),
      icon: item.icon ? normalizeCdragonPath(item.icon) : null,
      isComponent: !item.composition || item.composition.length === 0,
      composition: item.composition ?? [],
    };
    // Also index by numeric id
    if (item.id != null) map[String(item.id)] = map[item.apiName ?? item.id];
  }
  cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

/**
 * Get TFT traits map: apiName → { apiName, name, desc, sets }
 */
export async function getTftTraits() {
  const { cache } = await import('./lolApi.js');
  const cacheKey = 'cdragon:tft:traits';
  let data = cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const map = {};
  for (const trait of (full.sets?.[Object.keys(full.sets ?? {}).pop()]?.traits ?? full.traits ?? [])) {
    map[trait.apiName] = {
      apiName: trait.apiName,
      name: trait.name ?? trait.apiName,
      desc: (trait.desc ?? '').replace(/<[^>]+>/g, '').trim(),
      icon: trait.icon ? normalizeCdragonPath(trait.icon) : null,
      sets: trait.sets ?? [],
    };
  }
  cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

/**
 * Get TFT champions map: apiName → { apiName, name, cost, traits, ability, stats }
 */
export async function getTftChampions() {
  const { cache } = await import('./lolApi.js');
  const cacheKey = 'cdragon:tft:champions';
  let data = cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  // Latest set is the last key in full.sets
  const setKeys = Object.keys(full.sets ?? {});
  const latestSet = setKeys.length ? full.sets[setKeys[setKeys.length - 1]] : null;
  const units = latestSet?.champions ?? full.champions ?? [];

  const map = {};
  for (const unit of units) {
    const apiName = unit.apiName ?? unit.characterName ?? unit.name;
    map[apiName] = {
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
      stats: unit.stats ?? {},
    };
    // index by display name (lowercased)
    map[unit.name?.toLowerCase()] = map[apiName];
  }
  cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

/**
 * Get TFT augments map: apiName → { name, desc, tier, icon }
 */
export async function getTftAugments() {
  const { cache } = await import('./lolApi.js');
  const cacheKey = 'cdragon:tft:augments';
  let data = cache.get(cacheKey);
  if (data) return data;

  const full = await getTftStaticData();
  const map = {};
  for (const aug of (full.augments ?? [])) {
    map[aug.apiName] = {
      apiName: aug.apiName,
      name: aug.name ?? aug.apiName,
      desc: (aug.desc ?? '').replace(/<[^>]+>/g, '').trim(),
      tier: aug.tier ?? 1, // 1=silver, 2=gold, 3=prismatic
      icon: aug.icon ? normalizeCdragonPath(aug.icon) : null,
    };
  }
  cache.set(cacheKey, map, TTL.cdragon);
  return map;
}

// Convert CDragon path like "ASSETS/Maps/..." to a full URL
function normalizeCdragonPath(path) {
  if (!path) return null;
  const lower = path.toLowerCase().replace(/\\/g, '/');
  return `https://raw.communitydragon.org/latest/game/${lower}`;
}

// ── Riot API — TFT-specific endpoints ────────────────────────────────────────

import { REGIONS, cache as _cache } from './lolApi.js';

/**
 * TFT rank info for a summoner (by PUUID).
 * Returns array of rank entries (RANKED_TFT, RANKED_TFT_TURBO, etc.)
 */
export async function getTftRankedInfo(puuid, region, apiKey) {
  const cacheKey = `tft:ranked:${region}:${puuid}`;
  let data = _cache.get(cacheKey);
  if (!data) {
    data = await riotGet(`/tft/league/v1/entries/by-puuid/${puuid}`, region, apiKey);
    _cache.set(cacheKey, data, TTL.profile);
  }
  return data;
}

/**
 * TFT match IDs list.
 */
export async function getTftMatchHistory(puuid, region, apiKey, count = 10) {
  const routing = REGIONS.routing[region] ?? 'sea';
  const cacheKey = `tft:matches:${routing}:${puuid}:${count}`;
  let data = _cache.get(cacheKey);
  if (!data) {
    data = await riotGet(
      `/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
      routing, apiKey
    );
    _cache.set(cacheKey, data, TTL.match);
  }
  return data;
}

/**
 * Full TFT match detail.
 */
export async function getTftMatchDetail(matchId, region, apiKey) {
  const routing = REGIONS.routing[region] ?? 'sea';
  const cacheKey = `tft:match:${matchId}`;
  let data = _cache.get(cacheKey);
  if (!data) {
    data = await riotGet(`/tft/match/v1/matches/${matchId}`, routing, apiKey);
    _cache.set(cacheKey, data, TTL.match);
  }
  return data;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatTftRank(entry) {
  if (!entry) return 'Chưa xếp hạng';
  const emoji = TFT_RANK_EMOJIS[entry.tier] ?? '❓';
  const wr = entry.wins + entry.losses > 0
    ? Math.round(entry.wins / (entry.wins + entry.losses) * 100)
    : 0;
  const queueLabel = entry.queueType === 'RANKED_TFT_TURBO' ? 'Hyper Roll' : 'Ranked TFT';
  return `${emoji} **${entry.tier} ${entry.rank}** — ${entry.leaguePoints} LP\n` +
    `${entry.wins}W/${entry.losses}L (${wr}% WR) · ${queueLabel}`;
}

export function getTftQueueName(queueId) {
  return TFT_QUEUE_IDS[queueId] ?? `Queue ${queueId}`;
}

/**
 * Placement medal: 1st → 🥇, 2nd → 🥈, etc.
 */
export function placementEmoji(placement) {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  return medals[placement - 1] ?? `#${placement}`;
}

export { TFT_RANK_EMOJIS };
