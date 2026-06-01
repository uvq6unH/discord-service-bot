import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('src/bot.js', 'utf8').split('\n');

const newImports = `import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits
} from 'discord.js';
import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp,
  handleLolItem, handleLolRunes, handleLolPatch,
  handleLolLink, handleLolUnlink
} from '../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch,
  handleTftLink, handleTftUnlink
} from '../tftCommands.js';
import { CommandCooldowns, formatRetryAfter } from '../cooldowns.js';
import {
  canModerateMember,
  hasModerationPermission,
  memberCanUseCommand,
  sanitizeAnnouncementText
} from '../commandAccess.js';
import { buildHelpPayload } from './bot/help.js';
import { buildSlashCommands } from './bot/slash.js';
import { renderCommandResponse } from './bot/responses.js';
import {
  CURRENCIES,
  GAME_CURRENCY,
  blackjackSessions,
  pokerSessions,
  createDeck,
  createBlackjackPlayer,
  activeBlackjackPlayer,
  activeBlackjackHand,
  drawToBlackjackHand,
  advanceBlackjackHand,
  isPair,
  validateGameBet,
  parseBetCommand,
  parseBet,
  formatCurrency,
  currencyMeta,
  normalizeCurrency,
  isCurrencyToken,
  playCoinflip,
  playDice,
  playSlots,
  buildBlackjackPayload,
  buildPokerPayload,
  finishBlackjackSession,
  finishPokerSession,
  persistGameSession,
  scheduleSessionExpiry,
  getGameSession,
  handleBlackjackButton,
  handlePokerButton
} from './bot/games.js';
`;

const kept = [];
for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (n <= 34) continue;
  if (n >= 36 && n <= 214) continue;
  if (n >= 246 && n <= 1086) continue;
  kept.push(lines[i]);
}

let body = kept.join('\n');
body = body
  .replace(/\bgameCurrency\b/g, 'GAME_CURRENCY')
  .replace(/\bcurrencies\b/g, 'CURRENCIES')
  .replace(/if \(interaction\.customId\.startsWith\('bj:'\)\) \{[\s\S]*?\}\);\s*\n\s*\}\s*\n\s*if \(interaction\.customId\.startsWith\('vp:'\)\) \{[\s\S]*?\}\);\s*\n\s*\}/m,
    `if (interaction.customId.startsWith('bj:')) {
        return handleBlackjackButton(interaction, { client, config });
      }

      if (interaction.customId.startsWith('vp:')) {
        return handlePokerButton(interaction, { client, config });
      }`);

const header = `${newImports}

const commandCooldowns = new CommandCooldowns();
const autoDeferCommandTypes = new Set([
  'help', 'warnings', 'clearwarns', 'rank', 'leaderboard', 'balance', 'daily', 'economyleaderboard',
  'blackjack', 'poker', 'coinflip', 'dice', 'slots'
]);

`;

writeFileSync('src/bot.js', header + body);
console.log('Rebuilt bot.js:', (header + body).split('\n').length, 'lines');
