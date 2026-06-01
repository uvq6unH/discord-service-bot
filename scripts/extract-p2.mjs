import { readFileSync, writeFileSync } from 'node:fs';

const botLines = readFileSync('src/bot.js', 'utf8').split('\n');
const configLines = readFileSync('src/configStore.js', 'utf8').split('\n');

let defaults = configLines.slice(5, 353).join('\n');
defaults = defaults
  .replace(/^const defaultConfig/, 'export const defaultConfig')
  .replace(/^const commandTypes/, 'export const COMMAND_TYPES')
  .replace(/^const builtInTypesByName/, 'export const builtInTypesByName');
writeFileSync('src/configDefaults.js', `${defaults}\n`);

const configHead = configLines.slice(0, 5).join('\n');
const configTail = configLines.slice(353).join('\n').replace(/\bcommandTypes\b/g, 'COMMAND_TYPES');
writeFileSync('src/configStore.js', `${configHead}
import { defaultConfig, COMMAND_TYPES, builtInTypesByName } from './configDefaults.js';
${configTail}`);

writeFileSync('src/bot/constants.js', `export const AUTO_DEFER_COMMAND_TYPES = new Set([
  'help', 'warnings', 'clearwarns', 'rank', 'leaderboard', 'balance', 'daily', 'economyleaderboard',
  'blackjack', 'poker', 'coinflip', 'dice', 'slots'
]);
`);

writeFileSync('src/bot/logging.js', `${botLines.slice(73, 102).join('\n')
  .replace(/^async function sendLog/, 'export async function sendLog')
  .replace(/^async function sendTicketLog/, 'export async function sendTicketLog')
  .replace(/^function formatMessage/, 'export function formatMessage')}\n`);

writeFileSync('src/bot/embeds.js', `import { EmbedBuilder } from 'discord.js';

${botLines.slice(104, 147).join('\n')
  .replace(/^function buildServerEmbed/, 'export function buildServerEmbed')
  .replace(/^function buildUserEmbed/, 'export function buildUserEmbed')
  .replace(/^function buildAvatarEmbed/, 'export function buildAvatarEmbed')
  .replace(/^async function resolveMentionedUser/, 'export async function resolveMentionedUser')}
`);

const commandsHeader = `import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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
import {
  canModerateMember,
  hasModerationPermission,
  memberCanUseCommand,
  sanitizeAnnouncementText
} from '../commandAccess.js';
import { AUTO_DEFER_COMMAND_TYPES } from './constants.js';
import { buildHelpPayload } from './help.js';
import { renderCommandResponse } from './responses.js';
import { buildServerEmbed, buildUserEmbed, buildAvatarEmbed, resolveMentionedUser } from './embeds.js';
import { sendLog } from './logging.js';
import {
  GAME_CURRENCY,
  blackjackSessions,
  pokerSessions,
  createDeck,
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
  persistGameSession,
  scheduleSessionExpiry
} from './games.js';

`;

writeFileSync('src/bot/commands.js', commandsHeader + botLines.slice(148, 799).join('\n')
  .replace(/^async function runBuiltInCommand/, 'export async function runBuiltInCommand')
  .replace(/autoDeferCommandTypes/g, 'AUTO_DEFER_COMMAND_TYPES'));

writeFileSync('src/bot/interactions.js', `import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { buildHelpPayload } from './help.js';
import { handleBlackjackButton, handlePokerButton } from './games.js';
import { sendTicketLog } from './logging.js';

export async function handleComponentInteraction(interaction, { client, config, stateStore }) {
  if (interaction.isStringSelectMenu()) {
    if (!interaction.customId.startsWith('help_select:')) return;
    const targetUserId = interaction.customId.slice('help_select:'.length);
    if (interaction.user.id !== targetUserId) {
      await interaction.reply({
        content: '❌ Chỉ người sử dụng lệnh ban đầu mới có thể tương tác với menu này!',
        ephemeral: true
      });
      return;
    }
    const selectedValue = interaction.values[0];
    const group = selectedValue.startsWith('help_group:') ? selectedValue.slice('help_group:'.length) : null;
    const payload = await buildHelpPayload(client, config, interaction.guild, targetUserId, group);
    await interaction.update(payload);
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('bj:')) {
    return handleBlackjackButton(interaction, { client, config });
  }

  if (interaction.customId.startsWith('vp:')) {
    return handlePokerButton(interaction, { client, config });
  }

  if (interaction.customId === 'ticket:create') {
    if (!config.ticketsEnabled) {
      await interaction.reply({ content: 'Tickets are disabled.', ephemeral: true });
      return;
    }
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'Bot needs Manage Channels permission.', ephemeral: true });
      return;
    }
    const number = await stateStore.nextTicketNumber(interaction.guild.id);
    const channel = await interaction.guild.channels.create({
      name: \`ticket-\${number}-\${interaction.user.username}\`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId || undefined,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ]
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger)
    );
    await channel.send({
      content: \`<@\${interaction.user.id}>\`,
      embeds: [new EmbedBuilder().setTitle(\`Ticket #\${number}\`).setDescription('Support will respond here.').setColor(0x2864d8)],
      components: [row]
    });
    await interaction.reply({ content: \`Ticket created: <#\${channel.id}>\`, ephemeral: true });
    await sendTicketLog(interaction.guild, config, \`Ticket #\${number} opened by \${interaction.user.tag}.\`);
    return;
  }

  if (interaction.customId === 'ticket:close') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'You need Manage Channels permission.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: 'Closing ticket in 3 seconds.', ephemeral: true });
    await sendTicketLog(interaction.guild, config, \`Ticket closed: \${interaction.channel.name}\`);
    setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
    return;
  }

  if (interaction.customId.startsWith('selfrole:')) {
    if (!config.rolesEnabled) {
      await interaction.reply({ content: 'Roles are disabled.', ephemeral: true });
      return;
    }
    const roleId = interaction.customId.slice('selfrole:'.length);
    const roleConfig = config.selfRoles.find((role) => role.roleId === roleId);
    if (!roleConfig) {
      await interaction.reply({ content: 'Role is not configured anymore.', ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: 'Bot needs Manage Roles permission.', ephemeral: true });
      return;
    }
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: \`Removed \${roleConfig.label}.\`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: \`Added \${roleConfig.label}.\`, ephemeral: true });
    }
  }
}
`);

const botHeader = `import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits
} from 'discord.js';
import { CommandCooldowns, formatRetryAfter } from './cooldowns.js';
import { buildSlashCommands } from './bot/slash.js';
import { renderCommandResponse } from './bot/responses.js';
import { formatMessage, sendLog } from './bot/logging.js';
import { runBuiltInCommand } from './bot/commands.js';
import { handleComponentInteraction } from './bot/interactions.js';

const commandCooldowns = new CommandCooldowns();

`;

const interactionHandler = `  client.on(Events.InteractionCreate, async (interaction) => {
    try {
    if ((interaction.isStringSelectMenu() || interaction.isButton()) && interaction.guild) {
      const config = await configStore.getGuildConfig(interaction.guild.id);
      await handleComponentInteraction(interaction, { client, config, stateStore });
      return;
    }

${botLines.slice(1019, 1071).join('\n')}
    } catch (error) {
      console.error('[bot] Interaction handler error:', error);
      const payload = { content: 'An unexpected error occurred while handling this interaction.', ephemeral: true };
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
    }
  });
`;

writeFileSync('src/bot.js', botHeader + botLines.slice(800, 914).join('\n') + '\n' + interactionHandler + '\n' + botLines.slice(1073, 1200).join('\n'));

console.log('P2 extract complete');
