import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaultConfig = {
  enabled: true,
  prefix: '!',
  commands: [
    {
      enabled: true,
      type: 'ping',
      name: 'ping',
      description: 'Check bot latency',
      response: 'Pong. {ping}ms'
    },
    {
      enabled: true,
      type: 'help',
      name: 'help',
      description: 'Show command list',
      response: 'Commands:\n{commands}'
    },
    {
      enabled: true,
      type: 'config',
      name: 'config',
      description: 'Show current server config',
      response: 'Prefix: {prefix}\nWelcome: {welcomeStatus}\nAuto reply: {autoReplyStatus}\nCommands: {commandCount}'
    },
    {
      enabled: true,
      type: 'server',
      name: 'server',
      description: 'Show server info',
      response: 'Server info'
    },
    {
      enabled: true,
      type: 'user',
      name: 'user',
      description: 'Show user info',
      response: 'User info'
    },
    {
      enabled: true,
      type: 'avatar',
      name: 'avatar',
      description: 'Show user avatar',
      response: 'Avatar'
    },
    {
      enabled: true,
      type: 'say',
      name: 'say',
      description: 'Make the bot send a message',
      response: '{args}'
    },
    {
      enabled: true,
      type: 'purge',
      name: 'purge',
      description: 'Delete recent messages',
      response: 'Deleted {count} messages.'
    },
    {
      enabled: true,
      type: 'warn',
      name: 'warn',
      description: 'Warn a user',
      response: 'Warned {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'kick',
      name: 'kick',
      description: 'Kick a user',
      response: 'Kicked {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'ban',
      name: 'ban',
      description: 'Ban a user',
      response: 'Banned {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'timeout',
      name: 'timeout',
      description: 'Timeout a user in minutes',
      response: 'Timed out {target} for {minutes} minutes. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'warnings',
      name: 'warnings',
      description: 'Show warnings for a user',
      response: 'Warnings for {target}: {count}'
    },
    {
      enabled: true,
      type: 'clearwarns',
      name: 'clearwarns',
      description: 'Clear warnings for a user',
      response: 'Cleared {count} warnings for {target}.'
    },
    {
      enabled: true,
      type: 'rank',
      name: 'rank',
      description: 'Show your XP rank',
      response: 'Rank'
    },
    {
      enabled: true,
      type: 'leaderboard',
      name: 'leaderboard',
      description: 'Show XP leaderboard',
      response: 'Leaderboard'
    },
    {
      enabled: true,
      type: 'balance',
      name: 'balance',
      description: 'Show economy balance',
      response: 'Balance'
    },
    {
      enabled: true,
      type: 'daily',
      name: 'daily',
      description: 'Claim daily rewards',
      response: 'Daily claimed'
    },
    {
      enabled: true,
      type: 'economyleaderboard',
      name: 'economy-leaderboard',
      description: 'Show economy leaderboard',
      response: 'Economy leaderboard'
    },
    {
      enabled: true,
      type: 'blackjack',
      name: 'blackjack',
      description: 'Play turn-based blackjack with buttons',
      response: 'Blackjack'
    },
    {
      enabled: true,
      type: 'poker',
      name: 'poker',
      description: 'Play Jacks or Better video poker',
      response: 'Poker'
    },
    {
      enabled: true,
      type: 'coinflip',
      name: 'coinflip',
      description: 'Flip a coin with a bet',
      response: 'Coinflip'
    },
    {
      enabled: true,
      type: 'dice',
      name: 'dice',
      description: 'Guess a dice roll with a bet',
      response: 'Dice'
    },
    {
      enabled: true,
      type: 'slots',
      name: 'slots',
      description: 'Spin slots with a bet',
      response: 'Slots'
    },
    {
      enabled: true,
      type: 'ecoadd',
      name: 'eco-add',
      description: 'Admin: add currency to a user',
      response: 'Added {amount} {currency} to {target}.'
    },
    {
      enabled: true,
      type: 'ecoset',
      name: 'eco-set',
      description: 'Admin: set a user currency balance',
      response: 'Set {target} to {amount} {currency}.'
    },
    {
      enabled: true,
      type: 'ecoremove',
      name: 'eco-remove',
      description: 'Admin: remove currency from a user',
      response: 'Removed {amount} {currency} from {target}.'
    },
    {
      enabled: true,
      type: 'announce',
      name: 'announce',
      description: 'Send an announcement',
      response: '{args}'
    },
    {
      enabled: true,
      type: 'ticketpanel',
      name: 'ticketpanel',
      description: 'Post a ticket panel',
      response: 'Need help? Open a ticket.'
    },
    {
      enabled: true,
      type: 'rolepanel',
      name: 'rolepanel',
      description: 'Post a self-role panel',
      response: 'Choose your roles.'
    },
    // ── League of Legends ───────────────────────────────────────────────────
    { enabled: true,  type: 'lsd',        name: 'lsd',       description: 'Lịch sử 5 trận đấu gần nhất' },
    { enabled: true,  type: 'lolprofile', name: 'lol',       description: 'Hồ sơ người chơi LoL (rank, mastery)' },
    { enabled: true,  type: 'lolmatch',   name: 'lolmatch',  description: 'Chi tiết một trận đấu cụ thể' },
    { enabled: true,  type: 'lolchamp',   name: 'lolchamp',  description: 'Thông tin tướng LoL' },
    { enabled: true,  type: 'lolitem',    name: 'lolitem',   description: 'Thông tin trang bị LoL' },
    { enabled: true,  type: 'lolrunes',   name: 'lolrunes',  description: 'Bảng ngọc LoL' },
    { enabled: true,  type: 'lolpatch',   name: 'lolpatch',  description: 'Phiên bản LoL mới nhất' },
    { enabled: true,  type: 'lollink',    name: 'lollink',   description: 'Liên kết tài khoản LoL với Discord' },
    { enabled: true,  type: 'lolunlink',  name: 'lolunlink', description: 'Bỏ liên kết tài khoản LoL' }
  ],
  moderationEnabled: true,
  autoModEnabled: false,
  deleteBlockedMessages: true,
  antiLinkEnabled: false,
  badWords: [],
  blockedMessage: '{user}, message blocked.',
  rolesEnabled: false,
  autoRoleId: '',
  selfRolePanelTitle: 'Choose roles',
  selfRolePanelMessage: 'Click a button to toggle a role.',
  selfRoles: [],
  ticketsEnabled: false,
  ticketCategoryId: '',
  ticketLogChannelId: '',
  ticketPanelTitle: 'Support tickets',
  ticketPanelMessage: 'Need help? Open a ticket and the team will respond.',
  levelsEnabled: false,
  xpPerMessage: 5,
  levelUpMessage: '{user} reached level {level}.',
  economyEnabled: false,
  currencySilverName: 'Bạc',
  currencySilverIcon: '🥈',
  currencyGoldName: 'Vàng',
  currencyGoldIcon: '🪙',
  currencyDiamondName: 'Kim cương',
  currencyDiamondIcon: '💎',
  dailyEnabled: true,
  dailyCooldownHours: 24,
  dailyResetUtcOffset: 420,
  riotApiKey: '',
  dailySilverAmount: 100,
  dailyGoldAmount: 5,
  dailyDiamondAmount: 0,
  blackjackEnabled: true,
  blackjackMinBet: 10,
  blackjackMaxBet: 1000,
  pokerEnabled: true,
  pokerMinBet: 10,
  pokerMaxBet: 1000,
  coinflipEnabled: true,
  coinflipMinBet: 10,
  coinflipMaxBet: 1000,
  diceEnabled: true,
  diceMinBet: 10,
  diceMaxBet: 1000,
  slotsEnabled: true,
  slotsMinBet: 10,
  slotsMaxBet: 1000,
  announcementsEnabled: false,
  announcementChannelId: '',
  announcementMention: '',
  welcomeEnabled: false,
  welcomeChannelId: '',
  welcomeMessage: 'Welcome {user} to {server}.',
  logChannelId: '',
  autoReplyEnabled: false,
  autoReplies: [
    {
      keyword: 'hello bot',
      response: 'Hello. Bot is online.'
    }
  ]
};

const commandTypes = new Set([
  'custom',
  'ping',
  'help',
  'config',
  'server',
  'user',
  'avatar',
  'say',
  'purge',
  'warn',
  'kick',
  'ban',
  'timeout',
  'warnings',
  'clearwarns',
  'rank',
  'leaderboard',
  'balance',
  'daily',
  'economyleaderboard',
  'blackjack',
  'poker',
  'coinflip',
  'dice',
  'slots',
  'ecoadd',
  'ecoset',
  'ecoremove',
  'announce',
  'ticketpanel',
  'rolepanel',
  // ── League of Legends ──────────────────────────────────────────────────────
  'lsd',
  'lolprofile',
  'lolmatch',
  'lolchamp',
  'lolitem',
  'lolrunes',
  'lolpatch',
  'lollink',
  'lolunlink'
]);
const builtInTypesByName = new Map(
  defaultConfig.commands.filter((command) => command.type !== 'custom').map((command) => [command.name, command.type])
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAutoReplies(autoReplies) {
  if (!Array.isArray(autoReplies)) {
    return [];
  }

  return autoReplies
    .map((item) => ({
      keyword: String(item?.keyword ?? '').trim(),
      response: String(item?.response ?? '').trim()
    }))
    .filter((item) => item.keyword && item.response)
    .slice(0, 50);
}

function normalizeStringList(items, limit = 100) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, limit);
}

function normalizeSelfRoles(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      label: String(item?.label ?? '').trim().slice(0, 80),
      roleId: String(item?.roleId ?? '').trim()
    }))
    .filter((item) => item.label && item.roleId)
    .slice(0, 25);
}

function normalizeCommandName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\!+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

function normalizeCommands(commands) {
  const source = Array.isArray(commands) ? commands : defaultConfig.commands;
  const seen = new Set();

  return source
    .map((item) => {
      const name = normalizeCommandName(item?.name);
      const requestedType = String(item?.type ?? '').trim().toLowerCase();
      const type = commandTypes.has(requestedType) ? requestedType : builtInTypesByName.get(name) ?? 'custom';

      return {
        enabled: item?.enabled !== false,
        type,
        name,
        description: String(item?.description ?? '').trim().slice(0, 100),
        response: String(item?.response ?? '').trim().slice(0, 1800),
        allowedRoles: Array.isArray(item?.allowedRoles) ? item.allowedRoles.map((r) => String(r).trim()).filter(Boolean) : []
      };
    })
    .filter((item) => {
      // custom commands require a response; built-in types (including LoL) do not
      if (!item.name || (item.type === 'custom' && !item.response) || seen.has(item.name)) {
        return false;
      }
      seen.add(item.name);
      return true;
    })
    .slice(0, 100);
}

function mergeWithDefaultCommands(commands) {
  if (!Array.isArray(commands)) {
    return defaultConfig.commands;
  }

  const merged = [...commands];
  const existingTypes = new Set(commands.map((command) => String(command?.type ?? '').toLowerCase()).filter(Boolean));
  const existingNames = new Set(commands.map((command) => normalizeCommandName(command?.name)).filter(Boolean));

  for (const command of defaultConfig.commands) {
    if (!existingTypes.has(command.type) && !existingNames.has(command.name)) {
      merged.push(command);
    }
  }

  return merged;
}

export class ConfigStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.cache = {};
    this._saveQueue = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Config file could not be read. Starting with empty config. ${error.message}`);
      }
      this.cache = {};
      await this.save();
    }
  }

  async _writeToDisk() {
    const tmp = `${this.filePath}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(this.cache, null, 2)}\n`, 'utf8');
    await rename(tmp, this.filePath);
  }

  save() {
    this._saveQueue = this._saveQueue
      .then(() => this._writeToDisk())
      .catch((err) => console.error('[ConfigStore] Save error:', err));
    return this._saveQueue;
  }

  async getGuildConfig(guildId) {
    await this.ready;
    const stored = this.cache[guildId] ?? {};
    return {
      guildId,
      ...clone(defaultConfig),
      ...clone(stored),
      commands: normalizeCommands(mergeWithDefaultCommands(stored.commands)),
      badWords: normalizeStringList(stored.badWords ?? defaultConfig.badWords),
      selfRoles: normalizeSelfRoles(stored.selfRoles ?? defaultConfig.selfRoles),
      autoReplies: normalizeAutoReplies(stored.autoReplies ?? defaultConfig.autoReplies)
    };
  }

  async updateGuildConfig(guildId, patch) {
    await this.ready;
    const current = await this.getGuildConfig(guildId);
    const next = {
      ...current,
      enabled: Boolean(patch.enabled),
      prefix: String(patch.prefix ?? current.prefix).trim().slice(0, 5) || '!',
      commands: normalizeCommands(patch.commands ?? current.commands),
      moderationEnabled: Boolean(patch.moderationEnabled),
      autoModEnabled: Boolean(patch.autoModEnabled),
      deleteBlockedMessages: patch.deleteBlockedMessages !== false,
      antiLinkEnabled: Boolean(patch.antiLinkEnabled),
      badWords: normalizeStringList(patch.badWords ?? current.badWords),
      blockedMessage: String(patch.blockedMessage ?? '').trim().slice(0, 500) || defaultConfig.blockedMessage,
      rolesEnabled: Boolean(patch.rolesEnabled),
      autoRoleId: String(patch.autoRoleId ?? '').trim(),
      selfRolePanelTitle: String(patch.selfRolePanelTitle ?? '').trim().slice(0, 100) || defaultConfig.selfRolePanelTitle,
      selfRolePanelMessage: String(patch.selfRolePanelMessage ?? '').trim().slice(0, 1000) || defaultConfig.selfRolePanelMessage,
      selfRoles: normalizeSelfRoles(patch.selfRoles ?? current.selfRoles),
      ticketsEnabled: Boolean(patch.ticketsEnabled),
      ticketCategoryId: String(patch.ticketCategoryId ?? '').trim(),
      ticketLogChannelId: String(patch.ticketLogChannelId ?? '').trim(),
      ticketPanelTitle: String(patch.ticketPanelTitle ?? '').trim().slice(0, 100) || defaultConfig.ticketPanelTitle,
      ticketPanelMessage: String(patch.ticketPanelMessage ?? '').trim().slice(0, 1000) || defaultConfig.ticketPanelMessage,
      levelsEnabled: Boolean(patch.levelsEnabled),
      xpPerMessage: Math.max(1, Math.min(100, Number.parseInt(patch.xpPerMessage, 10) || defaultConfig.xpPerMessage)),
      levelUpMessage: String(patch.levelUpMessage ?? '').trim().slice(0, 500) || defaultConfig.levelUpMessage,
      economyEnabled: Boolean(patch.economyEnabled),
      currencySilverName: String(patch.currencySilverName ?? '').trim().slice(0, 40) || defaultConfig.currencySilverName,
      currencySilverIcon: String(patch.currencySilverIcon ?? '').trim().slice(0, 8) || defaultConfig.currencySilverIcon,
      currencyGoldName: String(patch.currencyGoldName ?? '').trim().slice(0, 40) || defaultConfig.currencyGoldName,
      currencyGoldIcon: String(patch.currencyGoldIcon ?? '').trim().slice(0, 8) || defaultConfig.currencyGoldIcon,
      currencyDiamondName: String(patch.currencyDiamondName ?? '').trim().slice(0, 40) || defaultConfig.currencyDiamondName,
      currencyDiamondIcon: String(patch.currencyDiamondIcon ?? '').trim().slice(0, 8) || defaultConfig.currencyDiamondIcon,
      dailyEnabled: patch.dailyEnabled !== false,
      dailyCooldownHours: Math.max(1, Math.min(168, Number.parseInt(patch.dailyCooldownHours, 10) || defaultConfig.dailyCooldownHours)),
      dailyResetUtcOffset: Number.isFinite(Number(patch.dailyResetUtcOffset))
        ? Math.max(-720, Math.min(840, Math.round(Number(patch.dailyResetUtcOffset))))
        : (current.dailyResetUtcOffset ?? defaultConfig.dailyResetUtcOffset),
      riotApiKey: typeof patch.riotApiKey === 'string'
        ? patch.riotApiKey.trim().slice(0, 60)
        : (current.riotApiKey ?? ''),
      dailySilverAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailySilverAmount, 10) || 0)),
      dailyGoldAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailyGoldAmount, 10) || 0)),
      dailyDiamondAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailyDiamondAmount, 10) || 0)),
      blackjackEnabled: patch.blackjackEnabled !== false,
      blackjackMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.blackjackMinBet, 10) || defaultConfig.blackjackMinBet)),
      blackjackMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.blackjackMaxBet, 10) || defaultConfig.blackjackMaxBet)),
      pokerEnabled: patch.pokerEnabled !== false,
      pokerMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.pokerMinBet, 10) || defaultConfig.pokerMinBet)),
      pokerMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.pokerMaxBet, 10) || defaultConfig.pokerMaxBet)),
      coinflipEnabled: patch.coinflipEnabled !== false,
      coinflipMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.coinflipMinBet, 10) || defaultConfig.coinflipMinBet)),
      coinflipMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.coinflipMaxBet, 10) || defaultConfig.coinflipMaxBet)),
      diceEnabled: patch.diceEnabled !== false,
      diceMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.diceMinBet, 10) || defaultConfig.diceMinBet)),
      diceMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.diceMaxBet, 10) || defaultConfig.diceMaxBet)),
      slotsEnabled: patch.slotsEnabled !== false,
      slotsMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.slotsMinBet, 10) || defaultConfig.slotsMinBet)),
      slotsMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.slotsMaxBet, 10) || defaultConfig.slotsMaxBet)),
      announcementsEnabled: Boolean(patch.announcementsEnabled),
      announcementChannelId: String(patch.announcementChannelId ?? '').trim(),
      announcementMention: String(patch.announcementMention ?? '').trim().slice(0, 100),
      welcomeEnabled: Boolean(patch.welcomeEnabled),
      welcomeChannelId: String(patch.welcomeChannelId ?? '').trim(),
      welcomeMessage: String(patch.welcomeMessage ?? '').trim().slice(0, 500) || defaultConfig.welcomeMessage,
      logChannelId: String(patch.logChannelId ?? '').trim(),
      autoReplyEnabled: Boolean(patch.autoReplyEnabled),
      autoReplies: normalizeAutoReplies(patch.autoReplies ?? current.autoReplies)
    };

    delete next.guildId;
    this.cache[guildId] = next;
    await this.save();
    return this.getGuildConfig(guildId);
  }

  async listGuildIds() {
    await this.ready;
    return Object.keys(this.cache);
  }
}
