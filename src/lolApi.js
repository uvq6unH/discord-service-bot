/**
 * lolApi.js — Riot API + Data Dragon wrapper
 *
 * Endpoints covered:
 *   Riot API  — Account-v1, Summoner-v4, League-v4, Match-v5, Champion-Mastery-v4
 *   DDragon   — champions, items, runes, patch notes (latest version)
 *
 * All DDragon / static data is cached in memory (TTL 1 hour by default).
 * Riot API responses for profiles and match history are cached for 2 minutes
 * to respect rate limits on the free tier (20 req/s, 100 req/2min).
 */

import https from 'node:https';
import { URL } from 'node:url';

// ── Constants ────────────────────────────────────────────────────────────────

export const REGIONS = {
  // Routing for Account-v1 (uses asia for VN2/SEA accounts)
  accountRouting: {
    br1: 'americas', eun1: 'europe', euw1: 'europe',
    jp1: 'asia',     kr: 'asia',     la1: 'americas',
    la2: 'americas', na1: 'americas', oc1: 'sea',
    ph2: 'asia',     ru: 'europe',   sg2: 'asia',
    th2: 'asia',     tr1: 'europe',  tw2: 'asia',
    vn2: 'asia'
  },
  // Routing for Match-v5 (VN2 uses sea)
  routing: {
    br1: 'americas', eun1: 'europe', euw1: 'europe',
    jp1: 'asia',     kr: 'asia',     la1: 'americas',
    la2: 'americas', na1: 'americas', oc1: 'sea',
    ph2: 'sea',      ru: 'europe',   sg2: 'sea',
    th2: 'sea',      tr1: 'europe',  tw2: 'sea',
    vn2: 'sea'
  },
  // Display names
  display: {
    br1: 'BR',   eun1: 'EUNE', euw1: 'EUW',  jp1: 'JP',
    kr: 'KR',    la1: 'LAN',   la2: 'LAS',    na1: 'NA',
    oc1: 'OCE',  ph2: 'PH',    ru: 'RU',      sg2: 'SG',
    th2: 'TH',   tr1: 'TR',    tw2: 'TW',     vn2: 'VN'
  }
};

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const CDRAGON_BASE = 'https://raw.communitydragon.org/latest';

const QUEUE_IDS = {
  400:  'Normal Draft',     420: 'Ranked Solo/Duo', 430: 'Normal Blind',
  440:  'Ranked Flex',      450: 'ARAM',             490: 'Quickplay',
  700:  'Clash',            830: 'Co-op Intro',      840: 'Co-op Beginner',
  850:  'Co-op Intermediate', 900: 'URF',            1020: 'One for All',
  1300: 'Nexus Blitz',      1400: 'Ultimate Spellbook', 1900: 'URF',
  2000: 'Tutorial 1',       2010: 'Tutorial 2',         2020: 'Tutorial 3'
};

const RANK_EMOJIS = {
  IRON: '⚫', BRONZE: '🟤', SILVER: '⚪', GOLD: '🟡',
  PLATINUM: '🟢', EMERALD: '💚', DIAMOND: '🔵',
  MASTER: '🟣', GRANDMASTER: '🔴', CHALLENGER: '✨'
};

// ── Simple in-memory cache ────────────────────────────────────────────────────

class Cache {
  constructor() { this._store = new Map(); }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null; }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key) { this._store.delete(key); }

  // Remove all keys matching a prefix (used to invalidate a summoner's data)
  deletePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }
}

export const cache = new Cache();

const TTL = {
  ddragon: 60 * 60 * 1000,     // 1 hour  – static data
  profile: 2 * 60 * 1000,      // 2 min   – summoner / rank
  match:   5 * 60 * 1000,      // 5 min   – match history
  mastery: 10 * 60 * 1000,     // 10 min  – champion mastery
};

// ── Generic HTTP fetch (Node built-in, no extra deps) ────────────────────────

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
          console.error(`[RiotAPI] HTTP ${res.statusCode} for ${url} | body: ${body.slice(0, 200)}`);
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
  // Debug: log key prefix and length so we can verify it's correct without exposing full key
  const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...(len=${apiKey.length})` : 'EMPTY';
  console.log(`[RiotAPI] ${platform} ${path.split('?')[0]} | key: ${keyPreview}`);
  return httpGet(url, { 'X-Riot-Token': apiKey });
}

// ── Data Dragon helpers ───────────────────────────────────────────────────────

export async function getLatestPatch() {
  const cacheKey = 'ddragon:versions';
  let versions = cache.get(cacheKey);
  if (!versions) {
    versions = await httpGet(`${DDRAGON_BASE}/api/versions.json`);
    cache.set(cacheKey, versions, TTL.ddragon);
  }
  return versions[0];
}

export async function getChampionData(lang = 'vi_VN') {
  const patch = await getLatestPatch();
  const cacheKey = `ddragon:champions:${patch}:${lang}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/${lang}/champion.json`);
    cache.set(cacheKey, data, TTL.ddragon);
  }
  return data;
}

export async function getChampionDetail(championId, lang = 'vi_VN') {
  const patch = await getLatestPatch();
  const cacheKey = `ddragon:champion:${championId}:${patch}:${lang}`;
  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/${lang}/champion/${championId}.json`);
    } catch {
      // Fallback to English if Vietnamese not available
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/en_US/champion/${championId}.json`);
    }
    cache.set(cacheKey, data, TTL.ddragon);
  }
  return data.data[championId];
}

export async function getItemData(lang = 'vi_VN') {
  const patch = await getLatestPatch();
  const cacheKey = `ddragon:items:${patch}:${lang}`;
  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/${lang}/item.json`);
    } catch {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/en_US/item.json`);
    }
    cache.set(cacheKey, data, TTL.ddragon);
  }
  return data;
}

export async function getRuneData(lang = 'vi_VN') {
  const patch = await getLatestPatch();
  const cacheKey = `ddragon:runes:${patch}:${lang}`;
  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/${lang}/runesReforged.json`);
    } catch {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/en_US/runesReforged.json`);
    }
    cache.set(cacheKey, data, TTL.ddragon);
  }
  return data;
}

export async function getSummonerSpellData(lang = 'vi_VN') {
  const patch = await getLatestPatch();
  const cacheKey = `ddragon:summSpells:${patch}:${lang}`;
  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/${lang}/summoner.json`);
    } catch {
      data = await httpGet(`${DDRAGON_BASE}/cdn/${patch}/data/en_US/summoner.json`);
    }
    cache.set(cacheKey, data, TTL.ddragon);
  }
  return data;
}

// Find champion by partial name (Vietnamese or English) 
export async function findChampion(query) {
  const data = await getChampionData('vi_VN');
  const q = query.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip diacritics for accent-insensitive match

  // Exact key match first
  for (const [champKey, champ] of Object.entries(data.data)) {
    if (champKey.toLowerCase() === query) return { key: champKey, ...champ };
  }
  // Partial name match
  for (const [champKey, champ] of Object.entries(data.data)) {
    const name = champ.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (name.includes(q) || champKey.toLowerCase().includes(q)) return { key: champKey, ...champ };
  }
  return null;
}

// ── Riot API — Account / Summoner ────────────────────────────────────────────

export async function getAccountByRiotId(gameName, tagLine, region, apiKey) {
  const routing = REGIONS.accountRouting[region] ?? 'asia';
  const cacheKey = `account:${routing}:${gameName}:${tagLine}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await riotGet(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      routing, apiKey
    );
    cache.set(cacheKey, data, TTL.profile);
  }
  return data;
}

export async function getSummonerByPuuid(puuid, region, apiKey) {
  const cacheKey = `summoner:${region}:${puuid}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await riotGet(`/lol/summoner/v4/summoners/by-puuid/${puuid}`, region, apiKey);
    cache.set(cacheKey, data, TTL.profile);
  }
  return data;
}

export async function getRankedInfo(puuid, region, apiKey) {
  const cacheKey = `ranked:${region}:${puuid}`;
  let data = cache.get(cacheKey);
  if (!data) {
    // Use puuid-based endpoint (by-summoner/{summonerId} is deprecated as of 2024)
    data = await riotGet(`/lol/league/v4/entries/by-puuid/${puuid}`, region, apiKey);
    cache.set(cacheKey, data, TTL.profile);
  }
  return data;
}

export async function getMatchHistory(puuid, region, apiKey, count = 10, queueId = null) {
  const routing = REGIONS.routing[region] ?? 'sea';
  const queueParam = queueId ? `&queue=${queueId}` : '';
  const cacheKey = `matches:${routing}:${puuid}:${count}:${queueId ?? 'all'}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await riotGet(
      `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${queueParam}`,
      routing, apiKey
    );
    cache.set(cacheKey, data, TTL.match);
  }
  return data;
}

export async function getMatchDetail(matchId, region, apiKey) {
  const routing = REGIONS.routing[region] ?? 'sea';
  const cacheKey = `match:${matchId}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await riotGet(`/lol/match/v5/matches/${matchId}`, routing, apiKey);
    cache.set(cacheKey, data, TTL.match);
  }
  return data;
}

export async function getTopMastery(puuid, region, apiKey, count = 5) {
  const cacheKey = `mastery:${region}:${puuid}:${count}`;
  let data = cache.get(cacheKey);
  if (!data) {
    data = await riotGet(
      `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`,
      region, apiKey
    );
    cache.set(cacheKey, data, TTL.mastery);
  }
  return data;
}

// ── High-level helpers ────────────────────────────────────────────────────────

/**
 * Parse "GameName#TAG" or "GameName TAG" formats.
 * Returns { gameName, tagLine } or null.
 */
export function parseRiotId(input) {
  const clean = input.trim();
  // Prefer '#' separator
  const hashIdx = clean.indexOf('#');
  if (hashIdx > 0) {
    return {
      gameName: clean.slice(0, hashIdx).trim(),
      tagLine: clean.slice(hashIdx + 1).trim()
    };
  }
  // Space separator fallback (last token is tag if it looks like a tag)
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    const tag = parts[parts.length - 1];
    if (/^[a-zA-Z0-9]{2,5}$/.test(tag)) {
      return { gameName: parts.slice(0, -1).join(' '), tagLine: tag };
    }
  }
  return null;
}

export function formatRank(entry) {
  if (!entry) return 'Chưa xếp hạng';
  const emoji = RANK_EMOJIS[entry.tier] ?? '❓';
  const wr = entry.wins + entry.losses > 0
    ? Math.round(entry.wins / (entry.wins + entry.losses) * 100)
    : 0;
  return `${emoji} **${entry.tier} ${entry.rank}** — ${entry.leaguePoints} LP\n` +
         `${entry.wins}W/${entry.losses}L (${wr}% WR)`;
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function getQueueName(queueId) {
  return QUEUE_IDS[queueId] ?? `Queue ${queueId}`;
}

export function getRegionChoices() {
  return Object.entries(REGIONS.display).map(([value, name]) => ({ name, value }));
}

export { RANK_EMOJIS };
