import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/bot.js', 'utf8');
const lines = src.split('\n');

const gamesHeader = `import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { createMutexPool } from '../asyncMutex.js';

const gameSessionMutex = createMutexPool();

export const CURRENCIES = ['silver', 'gold', 'diamond'];
export const GAME_CURRENCY = 'silver';
export const blackjackSessions = new Map();
export const pokerSessions = new Map();
export const GAME_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

`;

// bot.js lines 257-789 (1-based) -> index 256-788
let gamesBody = lines.slice(256, 789).join('\n');
gamesBody = gamesBody
  .replace(/^const currencies = .*$/m, '')
  .replace(/^const gameCurrency = .*$/m, '')
  .replace(/^const gameSessionTtlMs = .*$/m, '')
  .replace(/\bgameSessionTtlMs\b/g, 'GAME_SESSION_TTL_MS')
  .replace(/\bgameCurrency\b/g, 'GAME_CURRENCY')
  .replace(/\bcurrencies\b/g, 'CURRENCIES');

// Session helpers 406-485 (index 405-484) - append with exports
let sessionBody = lines.slice(405, 485).join('\n');
sessionBody = sessionBody
  .replace(/\bgameSessionTtlMs\b/g, 'GAME_SESSION_TTL_MS')
  .replace(/^function withGameSessionLock/, 'export function withGameSessionLock')
  .replace(/^async function validateGameBet/, 'export async function validateGameBet')
  .replace(/^async function expireSessionWithRefund/, 'export async function expireSessionWithRefund')
  .replace(/^function expireSession/, 'export function expireSession')
  .replace(/^async function deletePersistedSession/, 'export async function deletePersistedSession')
  .replace(/^async function persistGameSession/, 'export async function persistGameSession')
  .replace(/^async function getGameSession/, 'export async function getGameSession')
  .replace(/^function refreshSessionExpiry/, 'export function refreshSessionExpiry')
  .replace(/^function normalizeCurrency/, 'export function normalizeCurrency')
  .replace(/^function isCurrencyToken/, 'export function isCurrencyToken')
  .replace(/^function currencyMeta/, 'export function currencyMeta')
  .replace(/^function formatCurrency/, 'export function formatCurrency')
  .replace(/^function parseBet/, 'export function parseBet')
  .replace(/^function parseBetCommand/, 'export async function parseBetCommand')
  .replace(/^function playCoinflip/, 'export function playCoinflip')
  .replace(/^function playDice/, 'export function playDice')
  .replace(/^function playSlots/, 'export function playSlots')
  .replace(/^function createDeck/, 'export function createDeck')
  .replace(/^function buildBlackjackPayload/, 'export function buildBlackjackPayload')
  .replace(/^async function finishBlackjackSession/, 'export async function finishBlackjackSession')
  .replace(/^function buildPokerPayload/, 'export function buildPokerPayload')
  .replace(/^async function finishPokerSession/, 'export async function finishPokerSession')
  .replace(/^function createBlackjackPlayer/, 'export function createBlackjackPlayer')
  .replace(/^function activeBlackjackPlayer/, 'export function activeBlackjackPlayer')
  .replace(/^function activeBlackjackHand/, 'export function activeBlackjackHand')
  .replace(/^function drawToBlackjackHand/, 'export function drawToBlackjackHand')
  .replace(/^function advanceBlackjackHand/, 'export function advanceBlackjackHand')
  .replace(/^function isPair/, 'export function isPair');

// Remove playBlackjack dead code block from gamesBody if present
gamesBody = gamesBody.replace(/function playBlackjack\(\) \{[\s\S]*?return \{ player, dealer[\s\S]*?\};\n\}\n\n/, '');

writeFileSync('src/bot/games.js', gamesHeader + gamesBody + '\n\n' + sessionBody + '\n');
console.log('Wrote src/bot/games.js');
