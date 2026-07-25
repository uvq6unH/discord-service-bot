import https from 'node:https';

const ESPORTS_LEAGUES = {
  lck: { id: '98767991310872058', name: 'LCK Korea', icon: '🇰🇷', logoUrl: 'http://static.lolesports.com/leagues/lck-color-on-black.png' },
  lcp: { id: '113476371197627891', name: 'LCP Pacific', icon: '🌏', logoUrl: 'http://static.lolesports.com/leagues/1733468139601_lcp-color-golden.png' },
  lpl: { id: '98767991314006698', name: 'LPL China', icon: '🇨🇳', logoUrl: 'http://static.lolesports.com/leagues/1592516115322_LPL-01-FullonDark.png' },
  lec: { id: '98767991302996019', name: 'LEC Europe', icon: '🇪🇺', logoUrl: 'http://static.lolesports.com/leagues/1592516184297_LEC-01-FullonDark.png' },
  lcs: { id: '98767991299243165', name: 'LCS Americas', icon: '🇺🇸', logoUrl: 'http://static.lolesports.com/leagues/1706356907418_LCSNew-01-FullonDark.png' },
  cblol: { id: '98767991332355509', name: 'CBLOL Brazil', icon: '🇧🇷', logoUrl: 'http://static.lolesports.com/leagues/1592516115322_LPL-01-FullonDark.png' },
  vcs: { id: '107213827295848783', name: 'VCS Vietnam', icon: '🇻🇳', logoUrl: 'http://static.lolesports.com/leagues/1592516184297_LEC-01-FullonDark.png' },
  worlds: { id: '98767975604431411', name: 'Worlds Championship', icon: '🏆', logoUrl: 'http://static.lolesports.com/leagues/1592594612171_WorldsDarkBG.png' },
  msi: { id: '98767991325878492', name: 'MSI Mid-Season', icon: '🥇', logoUrl: 'http://static.lolesports.com/leagues/1592594634248_MSIDarkBG.png' },
  first_stand: { id: '113464388705111224', name: 'First Stand', icon: '🥊', logoUrl: 'http://static.lolesports.com/leagues/1740042025201_RG_LOL_FIRST_STAND_LOGO_VOLT_ALPHA.png' },
  ewc: { id: '116838530616006090', name: 'Esports World Cup', icon: '🇸🇦', logoUrl: 'http://static.lolesports.com/leagues/1782814488205_EWC26_PRIMARY_ABBREVIATED_LOGO_WHITE.png' }
};

const _cache = new Map();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'x-api-key': '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'
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

/**
 * Fetch schedule for a given league key.
 * Returns relevant events sorted: inProgress -> upcoming (closest to now) -> recent completed.
 */
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
    const now = Date.now();

    // Filter valid matches with team info or state
    const validEvents = events.filter(evt => evt.startTime || evt.match);

    // Sort by relevance to current time
    validEvents.sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();

      // 1. inProgress comes first
      if (a.state === 'inProgress' && b.state !== 'inProgress') return -1;
      if (b.state === 'inProgress' && a.state !== 'inProgress') return 1;

      // 2. unstarted (upcoming) comes before completed
      if (a.state === 'unstarted' && b.state === 'completed') return -1;
      if (b.state === 'unstarted' && a.state === 'completed') return 1;

      // 3. For unstarted: closest to now first
      if (a.state === 'unstarted' && b.state === 'unstarted') {
        return Math.abs(aTime - now) - Math.abs(bTime - now);
      }

      // 4. For completed: most recent first
      if (a.state === 'completed' && b.state === 'completed') {
        return bTime - aTime;
      }

      return aTime - bTime;
    });

    const formatted = validEvents.slice(0, 10).map(evt => {
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
    _cache.set(cacheKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 mins TTL
    return result;
  } catch (err) {
    console.error(`[esportsApi] Error fetching schedule for ${leagueKey}:`, err.message);
    return {
      league: ESPORTS_LEAGUES[leagueKey.toLowerCase()] || ESPORTS_LEAGUES.lck,
      matches: []
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

/**
 * Fetch all matches taking place on a target date (YYYY-MM-DD in UTC+7 / Asia/Ho_Chi_Minh).
 */
export async function getDailyMatchesForLeagues(leagueKeys = ['lck', 'lcp', 'worlds', 'msi', 'lpl', 'lec', 'lcs'], targetDateStr) {
  const results = [];

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const targetYMD = targetDateStr || dateFormatter.format(new Date());

  for (const key of leagueKeys) {
    try {
      const league = ESPORTS_LEAGUES[key.toLowerCase()];
      if (!league) continue;

      const url = `https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=vi-VN&leagueId=${league.id}`;
      const raw = await httpGet(url).catch(() => null);
      const events = raw?.data?.schedule?.events || [];

      const matchesOnDate = events.filter(e => {
        if (!e.startTime) return false;
        const matchYMD = dateFormatter.format(new Date(e.startTime));
        return matchYMD === targetYMD || e.state === 'inProgress';
      }).map(evt => {
        const teams = evt.match?.teams || [];
        const team1 = teams[0]?.name || 'TBD';
        const team2 = teams[1]?.name || 'TBD';
        const code1 = teams[0]?.code || team1;
        const code2 = teams[1]?.code || team2;
        return {
          id: evt.id,
          team1,
          team2,
          code1,
          code2,
          logo1: teams[0]?.image || '',
          logo2: teams[1]?.image || '',
          state: evt.state || 'unstarted',
          startTime: evt.startTime,
          blockName: evt.blockName || league.name,
          strategy: evt.match?.strategy?.type ? `${evt.match.strategy.type.toUpperCase()} ${evt.match.strategy.count || ''}` : 'BO3'
        };
      });

      if (matchesOnDate.length > 0) {
        // Sort chronologically by startTime
        matchesOnDate.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        results.push({
          league,
          matches: matchesOnDate
        });
      }
    } catch (err) {
      console.error(`[esportsApi] Error compiling daily matches for ${key}:`, err.message);
    }
  }

  return results;
}
