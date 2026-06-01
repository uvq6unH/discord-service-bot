import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const cmdLines = readFileSync('src/bot/commands.js', 'utf8').split('\n');
const appLines = readFileSync('public/app.js', 'utf8').split('\n');

function slice(lines, start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function joinRanges(lines, ranges) {
  return ranges.map(([a, b]) => slice(lines, a, b)).join('\n\n');
}

const ctxDestructure = `  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;`;

const handlerImports = {
  help: `import { buildHelpPayload } from '../../help.js';`,
  general: `import { PermissionFlagsBits } from 'discord.js';
import { buildServerEmbed, buildUserEmbed, buildAvatarEmbed, resolveMentionedUser } from '../../embeds.js';
import { renderCommandResponse } from '../../responses.js';`,
  moderation: `import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { canModerateMember, hasModerationPermission } from '../../../commandAccess.js';
import { renderCommandResponse } from '../../responses.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';`,
  levels: `import { EmbedBuilder } from 'discord.js';
import { resolveMentionedUser } from '../../embeds.js';`,
  economy: `import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';
import {
  CURRENCIES, GAME_CURRENCY, blackjackSessions, pokerSessions, createDeck, createBlackjackPlayer,
  validateGameBet, parseBetCommand, parseBet, formatCurrency, currencyMeta, normalizeCurrency,
  isCurrencyToken, playCoinflip, playDice, playSlots, buildBlackjackPayload, buildPokerPayload,
  persistGameSession, scheduleSessionExpiry
} from '../../games.js';`,
  panels: `import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits
} from 'discord.js';
import { sanitizeAnnouncementText } from '../../../commandAccess.js';`,
  riot: `import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp, handleLolItem, handleLolRunes,
  handleLolPatch, handleLolLink, handleLolUnlink
} from '../../../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch, handleTftLink, handleTftUnlink
} from '../../../tftCommands.js';`
};

function writeHandler(name, guard, body, extraImports = '') {
  const content = `${handlerImports[name]}
${extraImports}

/** @returns {Promise<unknown>|undefined} */
export async function handle${name.charAt(0).toUpperCase() + name.slice(1)}(ctx) {
${ctxDestructure}
${guard}

${body}
}
`;
  writeFileSync(`src/bot/commands/handlers/${name}.js`, content);
}

mkdirSync('src/bot/commands/handlers', { recursive: true });

writeHandler('help', `  if (command.type !== 'help') return;`, slice(cmdLines, 89, 110));

writeHandler('general', `  const generalTypes = new Set(['custom', 'ping', 'config', 'server', 'user', 'avatar', 'say']);
  if (!generalTypes.has(command.type)) return;`, joinRanges(cmdLines, [[113, 152]]));

writeHandler('moderation', `  const modTypes = new Set(['purge', 'warn', 'kick', 'ban', 'timeout', 'warnings', 'clearwarns']);
  if (!modTypes.has(command.type)) return;`, joinRanges(cmdLines, [[154, 286]]));

writeHandler('levels', `  if (!['rank', 'leaderboard'].includes(command.type)) return;`, slice(cmdLines, 288, 316));

writeHandler('economy', `  const economyTypes = new Set([
    'balance', 'daily', 'economyleaderboard', 'blackjack', 'poker', 'coinflip', 'dice', 'slots',
    'ecoadd', 'ecoset', 'ecoremove'
  ]);
  if (!economyTypes.has(command.type)) return;`, slice(cmdLines, 318, 592));

writeHandler('panels', `  if (!['announce', 'ticketpanel', 'rolepanel'].includes(command.type)) return;`, slice(cmdLines, 594, 666));

writeHandler('riot', `  const LOL = ['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink'];
  const TFT = ['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'];
  if (!LOL.includes(command.type) && !TFT.includes(command.type)) return;`, slice(cmdLines, 668, 697));

const runtime = `import { memberCanUseCommand } from '../../commandAccess.js';
import { AUTO_DEFER_COMMAND_TYPES } from '../constants.js';
import { renderCommandResponse } from '../responses.js';

export async function createCommandContext({ client, config, command, source, args }) {
  const isInteraction = 'isChatInputCommand' in source;
  const guild = source.guild;
  const channel = source.channel;
  const user = isInteraction ? source.user : source.author;
  const permissions = isInteraction ? source.memberPermissions : source.member?.permissions;

  const reply = async (payload) => {
    if (isInteraction) {
      if (source.deferred && !source.replied) {
        if (typeof payload === 'string') return source.editReply(payload);
        const { ephemeral, ...editablePayload } = payload;
        return source.editReply(editablePayload);
      }
      if (source.replied) return source.followUp(payload);
      return source.reply(payload);
    }
    return source.reply(payload);
  };

  const context = {
    channelId: channel.id,
    guildName: guild.name,
    userId: user.id,
    username: user.username
  };

  const actorMember = isInteraction ? source.member : source.member;
  if (!memberCanUseCommand(actorMember, command)) {
    const denied = isInteraction
      ? { content: 'You do not have permission to use this command.', ephemeral: true }
      : 'You do not have permission to use this command.';
    return { denied: true, deniedResult: reply(denied) };
  }

  if (isInteraction && AUTO_DEFER_COMMAND_TYPES.has(command.type) && !source.deferred && !source.replied) {
    await source.deferReply();
  }

  return {
    denied: false,
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  };
}
`;

writeFileSync('src/bot/commands/runtime.js', runtime);

const index = `import { renderCommandResponse } from '../responses.js';
import { createCommandContext } from './runtime.js';
import { handleHelp } from './handlers/help.js';
import { handleGeneral } from './handlers/general.js';
import { handleModeration } from './handlers/moderation.js';
import { handleLevels } from './handlers/levels.js';
import { handleEconomy } from './handlers/economy.js';
import { handlePanels } from './handlers/panels.js';
import { handleRiot } from './handlers/riot.js';

const HANDLERS = [
  handleHelp,
  handleGeneral,
  handleModeration,
  handleLevels,
  handleEconomy,
  handlePanels,
  handleRiot
];

export async function runBuiltInCommand(params) {
  const ctx = await createCommandContext(params);
  if (ctx.denied) return ctx.deniedResult;

  for (const handler of HANDLERS) {
    const result = await handler(ctx);
    if (result !== undefined) return result;
  }

  return ctx.reply(renderCommandResponse(ctx.command.response, {
    client: ctx.client,
    context: ctx.context,
    config: ctx.config,
    args: ctx.args
  }));
}
`;

writeFileSync('src/bot/commands/index.js', index);
writeFileSync('src/bot/commands.js', `export { runBuiltInCommand } from './commands/index.js';\n`);

// Fix moderation handler - remove erroneous buildServerEmbed import if unused
const mod = readFileSync('src/bot/commands/handlers/moderation.js', 'utf8')
  .replace("import { buildServerEmbed } from '../embeds.js';\n", '');
writeFileSync('src/bot/commands/handlers/moderation.js', mod);

console.log('P3 command handlers written');
