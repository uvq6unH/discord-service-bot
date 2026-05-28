import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
    }
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
  'announce',
  'ticketpanel',
  'rolepanel'
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
      if (!item.name || !item.response || seen.has(item.name)) {
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

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.cache, null, 2)}\n`, 'utf8');
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
