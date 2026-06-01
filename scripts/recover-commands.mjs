/**
 * Rebuilds command handler bodies from the pre-P3 monolith (embedded slices).
 * Run: node scripts/recover-commands.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

// Full runBuiltInCommand body (lines 88-699 of former src/bot/commands.js), without outer function wrapper.
const BODY = readFileSync(new URL('./commands-body.txt', import.meta.url), 'utf8');

const ctxDestructure = `  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;`;

const slices = {
  help: { start: "  if (command.type === 'help')", end: "  if (['custom', 'ping', 'config']" },
  general: { start: "  if (['custom', 'ping', 'config']", end: "  if (command.type === 'purge')" },
  moderation: { start: "  if (command.type === 'purge')", end: "  if (command.type === 'rank')" },
  levels: { start: "  if (command.type === 'rank')", end: "  if (command.type === 'balance')" },
  economy: { start: "  if (command.type === 'balance')", end: "  if (command.type === 'announce')" },
  panels: { start: "  if (command.type === 'announce')", end: "  const LOL_CMDS" },
  riot: { start: "  const LOL_CMDS", end: "" }
};

function extract(startMarker, endMarker) {
  const start = BODY.indexOf(startMarker);
  if (start < 0) throw new Error(`Slice not found: ${startMarker}`);
  const end = endMarker ? BODY.indexOf(endMarker, start) : BODY.length;
  if (end < 0) throw new Error(`Slice end not found: ${endMarker}`);
  return BODY.slice(start, end).trimEnd();
}

const headers = {
  help: `import { buildHelpPayload } from '../../help.js';\n`,
  general: `import { PermissionFlagsBits } from 'discord.js';
import { buildServerEmbed, buildUserEmbed, buildAvatarEmbed, resolveMentionedUser } from '../../embeds.js';
import { renderCommandResponse } from '../../responses.js';\n`,
  moderation: `import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { canModerateMember, hasModerationPermission } from '../../../commandAccess.js';
import { renderCommandResponse } from '../../responses.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';\n`,
  levels: `import { EmbedBuilder } from 'discord.js';
import { resolveMentionedUser } from '../../embeds.js';\n`,
  economy: `import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';
import {
  CURRENCIES, GAME_CURRENCY, blackjackSessions, pokerSessions, createDeck, createBlackjackPlayer,
  validateGameBet, parseBetCommand, parseBet, formatCurrency, currencyMeta, normalizeCurrency,
  isCurrencyToken, playCoinflip, playDice, playSlots, buildBlackjackPayload, buildPokerPayload,
  persistGameSession, scheduleSessionExpiry
} from '../../games.js';\n`,
  panels: `import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits
} from 'discord.js';
import { sanitizeAnnouncementText } from '../../../commandAccess.js';\n`,
  riot: `import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp, handleLolItem, handleLolRunes,
  handleLolPatch, handleLolLink, handleLolUnlink
} from '../../../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch, handleTftLink, handleTftUnlink
} from '../../../tftCommands.js';\n`
};

const guards = {
  help: `  if (command.type !== 'help') return;`,
  general: `  const _general = new Set(['custom','ping','config','server','user','avatar','say']);
  if (!_general.has(command.type)) return;`,
  moderation: `  const _mod = new Set(['purge','warn','kick','ban','timeout','warnings','clearwarns']);
  if (!_mod.has(command.type)) return;`,
  levels: `  if (!['rank','leaderboard'].includes(command.type)) return;`,
  economy: `  const _eco = new Set(['balance','daily','economyleaderboard','blackjack','poker','coinflip','dice','slots','ecoadd','ecoset','ecoremove']);
  if (!_eco.has(command.type)) return;`,
  panels: `  if (!['announce','ticketpanel','rolepanel'].includes(command.type)) return;`,
  riot: `  const _lol = ['lsd','lolprofile','lolmatch','lolchamp','lolitem','lolrunes','lolpatch','lollink','lolunlink'];
  const _tft = ['tftlsd','tftprofile','tftmatch','tftlink','tftunlink'];
  if (!_lol.includes(command.type) && !_tft.includes(command.type)) return;`
};

const names = {
  help: 'Help', general: 'General', moderation: 'Moderation', levels: 'Levels',
  economy: 'Economy', panels: 'Panels', riot: 'Riot'
};

for (const [key, { start, end }] of Object.entries(slices)) {
  let body = extract(start, end);
  if (key === 'help') {
    body = body.replace(/^\s*if \(command\.type === 'help'\) \{\n?/, '').replace(/\}\s*$/, '');
  }
  const file = `src/bot/commands/handlers/${key}.js`;
  writeFileSync(file, `${headers[key]}
/** @returns {Promise<unknown>|undefined} */
export async function handle${names[key]}(ctx) {
${ctxDestructure}
${guards[key]}

${body}
}
`);
  console.log('wrote', file, body.length, 'chars');
}
