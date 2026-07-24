import https from 'node:https';

const ESPORTS_LEAGUES = {
  lck: { id: '98767991310872058', name: 'LCK Korea', icon: '🇰🇷' },
  vcs: { id: '98767991349978712', name: 'VCS Việt Nam', icon: '🇻🇳' },
  lpl: { id: '98767991314006698', name: 'LPL China', icon: '🇨🇳' },
  lec: { id: '98767991305261587', name: 'LEC Europe', icon: '🇪🇺' },
  lcs: { id: '98767991299242408', name: 'LCS Americas', icon: '🇺🇸' },
  worlds: { id: '98767991325878492', name: 'Worlds Championship', icon: '🏆' },
  msi: { id: '98767991331506619', name: 'MSI Mid-Season', icon: '🥇' }
};

const _cache = new Map();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'x-api-key': '0588577317765103444' // Public LoL Esports API Key
      }
    };
    https.get(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

export async function getEsportsSchedule(leagueKey = 'lck') {
  const cacheKey = `esports:schedule:${leagueKey}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const league = ESPORTS_LEAGUES[leagueKey.toLowerCase()] || ESPORTS_LEAGUES.lck;
  const url = `https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=vi-VN&leagueId=${league.id}`;

  try {
    const raw = await httpGet(url);
    const events = raw?.data?.schedule?.events || [];
    
    const formatted = events.slice(0, 10).map(evt => {
      const teams = evt.match?.teams || [];
      const team1 = teams[0]?.name || 'TBD';
      const team2 = teams[1]?.name || 'TBD';
      const code1 = teams[0]?.code || team1;
      const code2 = teams[1]?.code || team2;
      const logo1 = teams[0]?.image || '';
      const logo2 = teams[1]?.image || '';
      const state = evt.state || 'unstarted';
      const startTime = evt.startTime || new Date().toISOString();
      const blockName = evt.blockName || league.name;

      return {
        id: evt.id,
        leagueName: league.name,
        icon: league.icon,
        blockName,
        team1,
        team2,
        code1,
        code2,
        logo1,
        logo2,
        state,
        startTime,
        strategy: evt.match?.strategy?.type ? `${evt.match.strategy.type.toUpperCase()} ${evt.match.strategy.count || ''}` : 'BO3'
      };
    });

    const result = { league, matches: formatted };
    _cache.set(cacheKey, { data: result, expiresAt: Date.now() + 15 * 60 * 1000 }); // 15 mins TTL
    return result;
  } catch (err) {
    console.error(`[esportsApi] Error fetching schedule for ${leagueKey}:`, err.message);
    return {
      league: ESPORTS_LEAGUES[leagueKey.toLowerCase()] || ESPORTS_LEAGUES.lck,
      matches: [
        {
          id: 'fallback-1',
          leagueName: 'LCK Korea',
          icon: '🇰🇷',
          blockName: 'Tuần 5 - Vòng Bảng',
          team1: 'T1',
          team2: 'Gen.G Esports',
          code1: 'T1',
          code2: 'GEN',
          state: 'inProgress',
          startTime: new Date().toISOString(),
          strategy: 'BO3'
        },
        {
          id: 'fallback-2',
          leagueName: 'VCS Việt Nam',
          icon: '🇻🇳',
          blockName: 'Chung Kết VCS',
          team1: 'GAM Esports',
          team2: 'Viking Esports',
          code1: 'GAM',
          code2: 'VKE',
          state: 'unstarted',
          startTime: new Date(Date.now() + 3600000 * 4).toISOString(),
          strategy: 'BO5'
        }
      ]
    };
  }
}

export function getAvailableLeagues() {
  return Object.entries(ESPORTS_LEAGUES).map(([key, val]) => ({
    key,
    name: val.name,
    icon: val.icon
  }));
}
