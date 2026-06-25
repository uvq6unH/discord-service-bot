import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChampionData, getChampionDetail, getLatestPatch } from '../lolApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

// Load static json datasets
let championMeta = {};
let emojiClues = {};
try {
  championMeta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'champion_meta.json'), 'utf8'));
  emojiClues = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'emoji_champions.json'), 'utf8'));
} catch (err) {
  console.error('[lolQuizData] Failed to load static quiz JSONs:', err);
}

/**
 * Returns complete list of candidates (normal champion keys from DDragon + meta)
 */
export async function getQuizCandidates() {
  const cdData = await getChampionData('vi_VN');
  const candidates = [];

  for (const [alias, c] of Object.entries(cdData.data)) {
    // Normalize key to match championMeta structure
    const metaKey = normalizeKey(alias);
    const meta = championMeta[metaKey] || championMeta[alias] || null;

    candidates.push({
      alias,            // DDragon alias, e.g. "AurelionSol", "JarvanIV"
      key: c.key,       // numeric ID
      name: c.name,     // Display name (Vietnamese)
      iconUrl: c.iconUrl,
      meta: meta || {
        gender: 'Unknown',
        position: ['Mid'],
        species: ['Human'],
        resource: 'Mana',
        range: 'Ranged',
        region: 'Runeterra',
        releaseYear: 2015
      }
    });
  }

  // Sort candidates alphabetically by alias for deterministic daily quiz indexing
  candidates.sort((a, b) => a.alias.localeCompare(b.alias));

  return candidates;
}

/**
 * Normalizes name to lookup in championMeta
 */
export function normalizeKey(alias) {
  let key = alias.replace(/[\s'.&]/g, '');
  if (key === 'MonkeyKing') return 'Wukong';
  return key;
}

/**
 * Get random champion candidate for a quiz
 */
export async function getRandomCandidate() {
  const candidates = await getQuizCandidates();
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Returns ability options for a candidate. Fetch spells and passive.
 */
export async function getCandidateAbilities(champKey) {
  try {
    const detail = await getChampionDetail(champKey, 'vi_VN');
    const patch = await getLatestPatch();
    const abilities = [];

    // Add passive
    if (detail.passive && detail.passive.image) {
      abilities.push({
        type: 'Passive',
        name: detail.passive.name || 'Passive',
        description: detail.passive.description || '',
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${patch}/img/passive/${detail.passive.image}`
      });
    } else if (detail.passive) {
      // Fallback
      abilities.push({
        type: 'Passive',
        name: detail.passive.name || 'Passive',
        description: detail.passive.description || '',
        iconUrl: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/${champKey.toLowerCase()}/hud/passive.png`
      });
    }

    // Add Q, W, E, R spells
    const spellKeys = ['Q', 'W', 'E', 'R'];
    if (detail.spells && detail.spells.length) {
      detail.spells.forEach((s, idx) => {
        const key = spellKeys[idx] || 'Spell';
        if (s.image) {
          abilities.push({
            type: key,
            name: s.name || `Ability ${key}`,
            description: s.description || '',
            iconUrl: `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${s.image}`
          });
        } else {
          abilities.push({
            type: key,
            name: s.name || `Ability ${key}`,
            description: s.description || '',
            iconUrl: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/${champKey.toLowerCase()}/hud/spell${idx}.png`
          });
        }
      });
    }

    return abilities;
  } catch (err) {
    console.error(`[lolQuizData] Failed to get abilities for ${champKey}:`, err);
    return [];
  }
}

/**
 * Returns emoji clues for a champion
 */
export function getEmojiClues(alias) {
  const metaKey = normalizeKey(alias);
  return emojiClues[metaKey] || emojiClues[alias] || ['❓', '❓', '❓'];
}

/**
 * Deep compare two candidates attributes for Classic Mode
 * Returns {
 *   gender: 'correct' | 'wrong',
 *   position: 'correct' | 'partial' | 'wrong',
 *   species: 'correct' | 'partial' | 'wrong',
 *   resource: 'correct' | 'wrong',
 *   range: 'correct' | 'wrong',
 *   region: 'correct' | 'partial' | 'wrong',
 *   releaseYear: 'correct' | 'higher' | 'lower'
 * }
 */
export function compareAttributes(guessMeta, targetMeta) {
  const compareArray = (arrA, arrB) => {
    const setA = new Set(arrA.map(s => s.toLowerCase()));
    const setB = new Set(arrB.map(s => s.toLowerCase()));
    let matches = 0;
    for (const item of setA) {
      if (setB.has(item)) matches++;
    }
    if (matches === 0) return 'wrong';
    if (matches === setA.size && setA.size === setB.size) return 'correct';
    return 'partial';
  };

  const compareSingle = (valA, valB) => {
    return String(valA).toLowerCase() === String(valB).toLowerCase() ? 'correct' : 'wrong';
  };

  const speciesA = Array.isArray(guessMeta.species) ? guessMeta.species : [guessMeta.species];
  const speciesB = Array.isArray(targetMeta.species) ? targetMeta.species : [targetMeta.species];

  const posA = Array.isArray(guessMeta.position) ? guessMeta.position : [guessMeta.position];
  const posB = Array.isArray(targetMeta.position) ? targetMeta.position : [targetMeta.position];

  const regA = Array.isArray(guessMeta.region) ? guessMeta.region : [guessMeta.region];
  const regB = Array.isArray(targetMeta.region) ? targetMeta.region : [targetMeta.region];

  let yearStatus = 'correct';
  if (guessMeta.releaseYear < targetMeta.releaseYear) {
    yearStatus = 'lower'; // Guess year is lower than target (so target is newer/higher)
  } else if (guessMeta.releaseYear > targetMeta.releaseYear) {
    yearStatus = 'higher'; // Guess year is higher than target (so target is older/lower)
  }

  return {
    gender: compareSingle(guessMeta.gender, targetMeta.gender),
    position: compareArray(posA, posB),
    species: compareArray(speciesA, speciesB),
    resource: compareSingle(guessMeta.resource, targetMeta.resource),
    range: compareSingle(guessMeta.range, targetMeta.range),
    region: compareArray(regA, regB),
    releaseYear: yearStatus
  };
}
