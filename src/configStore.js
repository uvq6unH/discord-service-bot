import { pickBoolean, pickFlag } from './configPatch.js';
import { createUpstashFromEnv } from './upstash.js';

import { defaultConfig, COMMAND_TYPES, builtInTypesByName } from './configDefaults.js';
import { createMutexPool } from './asyncMutex.js';
const snowflakePattern = /^\d{17,20}$/;

function clone(value) {
  return structuredClone(value);
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

function normalizeQuizScoring(val) {
  const d = defaultConfig.quizScoring;
  if (!val || typeof val !== 'object' || Array.isArray(val)) return d;
  return {
    guess1: Math.max(0, Math.min(10000, Number.parseInt(val.guess1, 10) ?? d.guess1)),
    guess2: Math.max(0, Math.min(10000, Number.parseInt(val.guess2, 10) ?? d.guess2)),
    guess3: Math.max(0, Math.min(10000, Number.parseInt(val.guess3, 10) ?? d.guess3)),
    guess4: Math.max(0, Math.min(10000, Number.parseInt(val.guess4, 10) ?? d.guess4)),
    guess5: Math.max(0, Math.min(10000, Number.parseInt(val.guess5, 10) ?? d.guess5)),
    guess6: Math.max(0, Math.min(10000, Number.parseInt(val.guess6, 10) ?? d.guess6)),
    guess7: Math.max(0, Math.min(10000, Number.parseInt(val.guess7, 10) ?? d.guess7)),
    guess8: Math.max(0, Math.min(10000, Number.parseInt(val.guess8, 10) ?? d.guess8)),
    fail: Math.max(0, Math.min(10000, Number.parseInt(val.fail, 10) ?? d.fail))
  };
}

function normalizeMusic(val) {
  const d = defaultConfig.music;
  if (!val || typeof val !== 'object' || Array.isArray(val)) return d;
  return {
    defaultVolume: Math.max(0, Math.min(100, Number.parseInt(val.defaultVolume, 10) ?? d.defaultVolume))
  };
}

function normalizeModeration(val) {
  const d = defaultConfig.moderation;
  if (!val || typeof val !== 'object' || Array.isArray(val)) return d;
  return {
    enabled: pickBoolean(val, 'enabled', d),
    antiSpam: pickBoolean(val, 'antiSpam', d),
    antiLink: pickBoolean(val, 'antiLink', d),
    antiRaid: pickBoolean(val, 'antiRaid', d),
    warnThreshold: Math.max(1, Math.min(100, Number.parseInt(val.warnThreshold, 10) ?? d.warnThreshold))
  };
}

function normalizeReminders(reminders) {
  if (!Array.isArray(reminders)) {
    return [];
  }

  return reminders
    .map((item) => {
      // Backward-compat: migrate legacy single userId → userIds array
      let userIds;
      if (Array.isArray(item?.userIds)) {
        userIds = item.userIds.map(normalizeSnowflakeId).filter(Boolean);
      } else if (item?.userId) {
        const single = normalizeSnowflakeId(item.userId);
        userIds = single ? [single] : [];
      } else {
        userIds = [];
      }

      let roleIds;
      if (Array.isArray(item?.roleIds)) {
        roleIds = item.roleIds.map(normalizeSnowflakeId).filter(Boolean);
      } else if (item?.roleId) {
        const single = normalizeSnowflakeId(item.roleId);
        roleIds = single ? [single] : [];
      } else {
        roleIds = [];
      }

      return {
        id: String(item?.id ?? '').trim(),
        userIds,
        roleIds,
        channelId: normalizeSnowflakeId(item?.channelId),
        message: String(item?.message ?? '').trim(),
        time: String(item?.time ?? '').trim(),
        repeat: ['none', 'hourly', 'daily', 'weekly'].includes(item?.repeat) ? item.repeat : 'none',
      };
    })
    .filter((item) => item.id && (item.userIds.length || item.roleIds.length) && item.channelId && item.message && item.time)
    .slice(0, 50);
}

function normalizeStringList(items, limit = 100) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, limit);
}

function normalizeSnowflakeId(value) {
  const id = String(value ?? '').trim();
  return snowflakePattern.test(id) ? id : '';
}

function normalizeSelfRoles(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      label: String(item?.label ?? '').trim().slice(0, 80),
      roleId: normalizeSnowflakeId(item?.roleId)
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

function normalizeCommands(commands, defaultFallback = []) {
  const source = Array.isArray(commands) ? commands : defaultFallback;
  const seen = new Set();
  const seenBuiltInTypes = new Set();

  return source
    .map((item) => {
      const name = normalizeCommandName(item?.name);
      const requestedType = String(item?.type ?? '').trim().toLowerCase();
      const builtInType = builtInTypesByName.get(name);
      const type = builtInType ?? (COMMAND_TYPES.has(requestedType) ? requestedType : 'custom');

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
      // custom commands require a name, but can be saved with an empty response while being drafted
      if (!item.name || seen.has(item.name)) {
        return false;
      }
      if (item.type !== 'custom') {
        if (seenBuiltInTypes.has(item.type)) return false;
        seenBuiltInTypes.add(item.type);
      }
      seen.add(item.name);
      return true;
    })
    .slice(0, 100);
}

const COMMAND_TO_MODULE = {
  // core
  ping: 'core',
  help: 'core',
  config: 'core',
  server: 'core',
  user: 'core',
  avatar: 'core',
  say: 'core',
  announce: 'core',
  translate: 'core',
  duolingo: 'core',
  
  // moderation
  purge: 'moderation',
  warn: 'moderation',
  kick: 'moderation',
  ban: 'moderation',
  timeout: 'moderation',
  warnings: 'moderation',
  clearwarns: 'moderation',
  ticketpanel: 'moderation',
  rolepanel: 'moderation',
  
  // levels
  rank: 'levels',
  leaderboard: 'levels',
  
  // economy
  balance: 'economy',
  daily: 'economy',
  economyleaderboard: 'economy',
  blackjack: 'economy',
  poker: 'economy',
  coinflip: 'economy',
  dice: 'economy',
  slots: 'economy',
  ecoadd: 'economy',
  ecoset: 'economy',
  ecoremove: 'economy',
  
  // riot
  lsd: 'riot',
  lolprofile: 'riot',
  lolmatch: 'riot',
  lolchamp: 'riot',
  lolitem: 'riot',
  lolrunes: 'riot',
  lolpatch: 'riot',
  lollink: 'riot',
  lolunlink: 'riot',
  tftlsd: 'riot',
  tftprofile: 'riot',
  tftmatch: 'riot',
  tftlink: 'riot',
  tftunlink: 'riot',
  lolquiz: 'riot',
  
  // music
  musicplay: 'music',
  musicskip: 'music',
  musicstop: 'music',
  musicpause: 'music',
  musicresume: 'music',
  musicloop: 'music',
  musicqueue: 'music',
  musicnp: 'music',
  musicvolume: 'music'
};

function getModuleCommands(stored, moduleName, defaultModuleCommands) {
  if (stored?.[moduleName] && Array.isArray(stored[moduleName].commands)) {
    return stored[moduleName].commands;
  }
  
  if (Array.isArray(stored?.commands) && stored.commands.length > 0) {
    const moduleCommands = stored.commands.filter((cmd) => {
      const type = String(cmd?.type ?? '').trim().toLowerCase();
      const mappedModule = COMMAND_TO_MODULE[type] || (type === 'custom' ? 'core' : 'core');
      return mappedModule === moduleName;
    });
    if (moduleCommands.length > 0) {
      return moduleCommands;
    }
  }
  
  return defaultModuleCommands;
}

function mergeModuleCommands(storedCommands, defaultModuleCommands, moduleName) {
  const merged = [...(Array.isArray(storedCommands) ? storedCommands : (defaultModuleCommands || []))];
  const existingTypes = new Set(merged.map((command) => String(command?.type ?? '').toLowerCase()).filter(Boolean));
  const existingNames = new Set(merged.map((command) => normalizeCommandName(command?.name)).filter(Boolean));

  for (const command of (defaultModuleCommands || [])) {
    if (!existingTypes.has(command.type) && !existingNames.has(command.name)) {
      merged.push(command);
    }
  }

  if (moduleName === 'core') {
    for (const command of merged) {
      if (command.type === 'config' && command.response && !command.response.includes('{riotKeyStatus}')) {
        command.response = command.response + '\nRiot API: {riotKeyStatus}\nTFT API: {tftKeyStatus}';
      }
    }
  }

  return merged;
}

function resolveSecretPatch(patchValue, currentValue) {
  if (typeof patchValue !== 'string') {
    return currentValue ?? '';
  }

  const nextValue = patchValue.trim();
  return nextValue ? nextValue.slice(0, 100) : (currentValue ?? '');
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

  // Upgrade existing config command response to include Riot key status if not already present
  for (const command of merged) {
    if (command.type === 'config' && command.response && !command.response.includes('{riotKeyStatus}')) {
      command.response = command.response + '\nRiot API: {riotKeyStatus}\nTFT API: {tftKeyStatus}';
    }
  }

  return merged;
}

function readStoredApiSecrets(stored) {
  const riotApiKey = String(stored?.riotApiKey ?? '').trim();
  const tftApiKey = String(stored?.tftApiKey ?? '').trim();
  return {
    riotApiKey: riotApiKey || undefined,
    tftApiKey: tftApiKey || undefined
  };
}

export class ConfigStore {
  constructor(_filePath) {
    // _filePath kept for API compat but ignored — storage is Upstash Redis.
    this._redis = createUpstashFromEnv();
    if (!this._redis) {
      throw new Error('ConfigStore requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    this._KEY_INDEX = 'config:_index';        // SET of guildIds
    this._keyFor = (guildId) => `config:guild:${guildId}`;
    this.cache = {};
    /** @type {Map<string, { riotApiKey?: string, tftApiKey?: string }>} */
    this._runtimeSecrets = new Map();
    this._saveQueue = Promise.resolve();
    this._withLock = createMutexPool();
    this.ready = this.load();
  }

  _applyRuntimeSecrets(guildId, config) {
    const runtime = this._runtimeSecrets.get(guildId);
    if (runtime?.riotApiKey) {
      config.riotApiKey = runtime.riotApiKey;
    }
    if (runtime?.tftApiKey) {
      config.tftApiKey = runtime.tftApiKey;
    }
    if (!config.riotApiKey && process.env.RIOT_API_KEY) {
      config.riotApiKey = process.env.RIOT_API_KEY.trim();
    }
    if (!config.tftApiKey && process.env.TFT_API_KEY) {
      config.tftApiKey = process.env.TFT_API_KEY.trim();
    }
    return config;
  }

  _migrateSecretsOffDisk() {
    let migrated = false;
    for (const [guildId, stored] of Object.entries(this.cache)) {
      const secrets = readStoredApiSecrets(stored);
      if (!secrets.riotApiKey && !secrets.tftApiKey) {
        continue;
      }
      const existing = this._runtimeSecrets.get(guildId) ?? {};
      this._runtimeSecrets.set(guildId, {
        riotApiKey: secrets.riotApiKey ?? existing.riotApiKey,
        tftApiKey: secrets.tftApiKey ?? existing.tftApiKey
      });
      delete stored.riotApiKey;
      delete stored.tftApiKey;
      migrated = true;
    }
    if (migrated) {
      console.warn('[ConfigStore] Riot API keys were removed from disk config and kept in memory only. Use RIOT_API_KEY/TFT_API_KEY env vars for persistence across restarts.');
    }
    return migrated;
  }

  // Serialize one guild's config for storage (strip secrets, add status flags)
  _serializeForStorage(guildId, stored) {
    const { riotApiKey, tftApiKey, ...rest } = stored;
    return {
      ...rest,
      riotApiKeyConfigured: Boolean(this._runtimeSecrets.get(guildId)?.riotApiKey ?? riotApiKey),
      tftApiKeyConfigured: Boolean(this._runtimeSecrets.get(guildId)?.tftApiKey ?? tftApiKey)
    };
  }

  async _fetchGuildWithRetry(guildId, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        const val = await this._redis.get(this._keyFor(guildId));
        if (!val) return null;
        const stored = JSON.parse(val);
        delete stored.riotApiKeyConfigured;
        delete stored.tftApiKeyConfigured;
        return [guildId, stored];
      } catch (err) {
        if (i < attempts - 1) {
          const delay = 500 * (i + 1);
          console.warn(`[ConfigStore] Retrying guild ${guildId} load (attempt ${i + 2}/${attempts}) after ${delay}ms: ${err.message}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.error(`[ConfigStore] Failed to load guild ${guildId} after ${attempts} attempts: ${err.message}`);
        }
      }
    }
    return null;
  }

  async load() {
    try {
      // Load the index of all known guild IDs
      const raw = await this._redis.get(this._KEY_INDEX).catch(() => null);
      const guildIds = raw ? JSON.parse(raw) : [];

      if (guildIds.length === 0) {
        console.log('[ConfigStore] No guild configs in index — fresh start.');
        this.cache = {};
        return;
      }

      // Fetch each guild config with retry (sequential to avoid overwhelming cold Upstash)
      const entries = [];
      for (const guildId of guildIds) {
        const entry = await this._fetchGuildWithRetry(guildId);
        if (entry) entries.push(entry);
      }

      this.cache = Object.fromEntries(entries);
      if (this._migrateSecretsOffDisk()) {
        await this._flushAll();
      }
      console.log(`[ConfigStore] Loaded ${Object.keys(this.cache).length}/${guildIds.length} guild config(s) from Redis.`);
    } catch (error) {
      console.warn(`[ConfigStore] Failed to load from Redis, starting empty. ${error.message}`);
      this.cache = {};
    }
  }

  async _flushAll() {
    const guildIds = Object.keys(this.cache);
    await Promise.all(
      guildIds.map((guildId) =>
        this._redis.set(this._keyFor(guildId), JSON.stringify(this._serializeForStorage(guildId, this.cache[guildId])))
      )
    );
    await this._redis.set(this._KEY_INDEX, JSON.stringify(guildIds));
  }

  // Save a single guild config to Redis (much cheaper than flushing all)
  async _saveGuild(guildId) {
    const stored = this.cache[guildId];
    if (!stored) return;
    await this._redis.set(this._keyFor(guildId), JSON.stringify(this._serializeForStorage(guildId, stored)));
    // Update index (re-read to avoid racing on multi-guild concurrent saves)
    const raw = await this._redis.get(this._KEY_INDEX).catch(() => null);
    const ids = new Set(raw ? JSON.parse(raw) : []);
    ids.add(guildId);
    await this._redis.set(this._KEY_INDEX, JSON.stringify([...ids]));
  }

  save(guildId) {
    this._saveQueue = this._saveQueue
      .then(() => (guildId ? this._saveGuild(guildId) : this._flushAll()))
      .catch((err) => console.error('[ConfigStore] Save error:', err));
    return this._saveQueue;
  }

  async getGuildConfig(guildId) {
    await this.ready;
    let stored = null;
    if (this._redis) {
      try {
        const val = await this._redis.get(this._keyFor(guildId));
        if (val) {
          stored = typeof val === 'string' ? JSON.parse(val) : val;
          this.cache[guildId] = stored;
        }
      } catch (err) {
        console.warn(`[ConfigStore] Failed to fetch fresh config for guild ${guildId}: ${err.message}`);
      }
    }
    if (!stored) {
      stored = this.cache[guildId] ?? {};
    }

    const coreCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'core', defaultConfig.core?.commands), defaultConfig.core?.commands, 'core'),
      defaultConfig.core?.commands
    );
    const modCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'moderation', defaultConfig.moderation?.commands), defaultConfig.moderation?.commands, 'moderation'),
      defaultConfig.moderation?.commands
    );
    const levelsCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'levels', defaultConfig.levels?.commands), defaultConfig.levels?.commands, 'levels'),
      defaultConfig.levels?.commands
    );
    const ecoCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'economy', defaultConfig.economy?.commands), defaultConfig.economy?.commands, 'economy'),
      defaultConfig.economy?.commands
    );
    const riotCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'riot', defaultConfig.riot?.commands), defaultConfig.riot?.commands, 'riot'),
      defaultConfig.riot?.commands
    );
    const musicCmds = normalizeCommands(
      mergeModuleCommands(getModuleCommands(stored, 'music', defaultConfig.music?.commands), defaultConfig.music?.commands, 'music'),
      defaultConfig.music?.commands
    );

    const base = {
      guildId,
      ...clone(defaultConfig),
      ...clone(stored),
      core: {
        ...(defaultConfig.core ?? {}),
        ...(stored.core ?? {}),
        commands: coreCmds
      },
      moderation: {
        ...normalizeModeration(stored.moderation ?? defaultConfig.moderation),
        commands: modCmds
      },
      levels: {
        ...(defaultConfig.levels ?? {}),
        ...(stored.levels ?? {}),
        commands: levelsCmds
      },
      economy: {
        ...(defaultConfig.economy ?? {}),
        ...(stored.economy ?? {}),
        commands: ecoCmds
      },
      riot: {
        ...(defaultConfig.riot ?? {}),
        ...(stored.riot ?? {}),
        commands: riotCmds
      },
      music: {
        ...normalizeMusic(stored.music ?? defaultConfig.music),
        commands: musicCmds
      },
      commands: [
        ...coreCmds,
        ...modCmds,
        ...levelsCmds,
        ...ecoCmds,
        ...riotCmds,
        ...musicCmds
      ],
      badWords: normalizeStringList(stored.badWords ?? defaultConfig.badWords),
      selfRoles: normalizeSelfRoles(stored.selfRoles ?? defaultConfig.selfRoles),
      autoReplies: normalizeAutoReplies(stored.autoReplies ?? defaultConfig.autoReplies),
      reminders: normalizeReminders(stored.reminders ?? defaultConfig.reminders),
      quizScoring: normalizeQuizScoring(stored.quizScoring ?? defaultConfig.quizScoring),
      lolEnabled: pickBoolean(stored, 'lolEnabled', defaultConfig),
      tftEnabled: pickBoolean(stored, 'tftEnabled', defaultConfig),
      autoModEnabled: (stored.moderation ?? defaultConfig.moderation)?.enabled ?? defaultConfig.autoModEnabled,
      antiLinkEnabled: (stored.moderation ?? defaultConfig.moderation)?.antiLink ?? defaultConfig.antiLinkEnabled,
      riotApiKey: '',
      tftApiKey: '',
      // musicEnabled defaulted false in older versions — force true unless admin
      // explicitly disabled it after the feature was properly introduced.
      musicEnabled: stored.musicEnabled ?? true,
    };
    return this._applyRuntimeSecrets(guildId, base);
  }

  async updateGuildConfig(guildId, rawPatch) {
    // Guard against prototype pollution from JSON body
    if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
      throw new Error('Invalid patch');
    }
    const patch = Object.fromEntries(
      Object.entries(rawPatch).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k))
    );
    return this._withLock(guildId, async () => {
      await this.ready;
      const runtimeCurrent = this._runtimeSecrets.get(guildId) ?? {};
      const current = await this.getGuildConfig(guildId);
      const nextRiotKey = resolveSecretPatch(patch.riotApiKey, runtimeCurrent.riotApiKey ?? '');
      const nextTftKey = resolveSecretPatch(patch.tftApiKey, runtimeCurrent.tftApiKey ?? '');
      const runtimeNext = { ...runtimeCurrent };
      if (typeof patch.riotApiKey === 'string') {
        if (nextRiotKey) runtimeNext.riotApiKey = nextRiotKey;
        else delete runtimeNext.riotApiKey;
      }
      if (typeof patch.tftApiKey === 'string') {
        if (nextTftKey) runtimeNext.tftApiKey = nextTftKey;
        else delete runtimeNext.tftApiKey;
      }
      if (Object.keys(runtimeNext).length) {
        this._runtimeSecrets.set(guildId, runtimeNext);
      } else {
        this._runtimeSecrets.delete(guildId);
      }

      const patchCommands = patch.commands;
      let nextCoreCmds = patch.core?.commands;
      let nextModCmds = patch.moderation?.commands;
      let nextLevelsCmds = patch.levels?.commands;
      let nextEcoCmds = patch.economy?.commands;
      let nextRiotCmds = patch.riot?.commands;
      let nextMusicCmds = patch.music?.commands;

      if (Array.isArray(patchCommands)) {
        const partitioned = {
          core: [], moderation: [], levels: [], economy: [], riot: [], music: []
        };
        for (const cmd of patchCommands) {
          const type = String(cmd?.type ?? '').trim().toLowerCase();
          const moduleName = COMMAND_TO_MODULE[type] || (type === 'custom' ? 'core' : 'core');
          if (partitioned[moduleName]) {
            partitioned[moduleName].push(cmd);
          }
        }
        
        if (nextCoreCmds === undefined) nextCoreCmds = partitioned.core;
        if (nextModCmds === undefined) nextModCmds = partitioned.moderation;
        if (nextLevelsCmds === undefined) nextLevelsCmds = partitioned.levels;
        if (nextEcoCmds === undefined) nextEcoCmds = partitioned.economy;
        if (nextRiotCmds === undefined) nextRiotCmds = partitioned.riot;
        if (nextMusicCmds === undefined) nextMusicCmds = partitioned.music;
      }

      if (nextCoreCmds === undefined) nextCoreCmds = current.core?.commands;
      if (nextModCmds === undefined) nextModCmds = current.moderation?.commands;
      if (nextLevelsCmds === undefined) nextLevelsCmds = current.levels?.commands;
      if (nextEcoCmds === undefined) nextEcoCmds = current.economy?.commands;
      if (nextRiotCmds === undefined) nextRiotCmds = current.riot?.commands;
      if (nextMusicCmds === undefined) nextMusicCmds = current.music?.commands;

      const coreCmds = normalizeCommands(nextCoreCmds, defaultConfig.core?.commands);
      const modCmds = normalizeCommands(nextModCmds, defaultConfig.moderation?.commands);
      const levelsCmds = normalizeCommands(nextLevelsCmds, defaultConfig.levels?.commands);
      const ecoCmds = normalizeCommands(nextEcoCmds, defaultConfig.economy?.commands);
      const riotCmds = normalizeCommands(nextRiotCmds, defaultConfig.riot?.commands);
      const musicCmds = normalizeCommands(nextMusicCmds, defaultConfig.music?.commands);

      const next = {
        ...current,
        enabled: pickBoolean(patch, 'enabled', current),
        prefix: String(patch.prefix ?? current.prefix).trim().slice(0, 5) || '!',
        core: {
          ...(defaultConfig.core ?? {}),
          ...(patch.core ?? current.core ?? {}),
          commands: coreCmds
        },
        moderation: {
          ...normalizeModeration(patch.moderation ?? current.moderation),
          commands: modCmds
        },
        levels: {
          ...(defaultConfig.levels ?? {}),
          ...(patch.levels ?? current.levels ?? {}),
          commands: levelsCmds
        },
        economy: {
          ...(defaultConfig.economy ?? {}),
          ...(patch.economy ?? current.economy ?? {}),
          commands: ecoCmds
        },
        riot: {
          ...(defaultConfig.riot ?? {}),
          ...(patch.riot ?? current.riot ?? {}),
          commands: riotCmds
        },
        music: {
          ...normalizeMusic(patch.music ?? current.music),
          commands: musicCmds
        },
        moderationEnabled: pickBoolean(patch, 'moderationEnabled', current),
        autoModEnabled: pickBoolean(patch, 'autoModEnabled', current),
        deleteBlockedMessages: pickFlag(patch, 'deleteBlockedMessages', current),
        antiLinkEnabled: pickBoolean(patch, 'antiLinkEnabled', current),
        badWords: normalizeStringList(patch.badWords ?? current.badWords),
        blockedMessage: String(patch.blockedMessage ?? '').trim().slice(0, 500) || defaultConfig.blockedMessage,
        rolesEnabled: pickBoolean(patch, 'rolesEnabled', current),
        autoRoleId: normalizeSnowflakeId(patch.autoRoleId),
        selfRolePanelTitle: String(patch.selfRolePanelTitle ?? '').trim().slice(0, 100) || defaultConfig.selfRolePanelTitle,
        selfRolePanelMessage: String(patch.selfRolePanelMessage ?? '').trim().slice(0, 1000) || defaultConfig.selfRolePanelMessage,
        selfRoles: normalizeSelfRoles(patch.selfRoles ?? current.selfRoles),
        ticketsEnabled: pickBoolean(patch, 'ticketsEnabled', current),
        ticketCategoryId: normalizeSnowflakeId(patch.ticketCategoryId),
        ticketLogChannelId: normalizeSnowflakeId(patch.ticketLogChannelId),
        ticketPanelTitle: String(patch.ticketPanelTitle ?? '').trim().slice(0, 100) || defaultConfig.ticketPanelTitle,
        ticketPanelMessage: String(patch.ticketPanelMessage ?? '').trim().slice(0, 1000) || defaultConfig.ticketPanelMessage,
        levelsEnabled: pickBoolean(patch, 'levelsEnabled', current),
        xpPerMessage: Math.max(1, Math.min(100, Number.parseInt(patch.xpPerMessage, 10) || defaultConfig.xpPerMessage)),
        levelUpMessage: String(patch.levelUpMessage ?? '').trim().slice(0, 500) || defaultConfig.levelUpMessage,
        levelUpAnnouncementEnabled: pickFlag(patch, 'levelUpAnnouncementEnabled', current, { defaultTrue: true }),
        levelUpAnnouncementChannelId: normalizeSnowflakeId(patch.levelUpAnnouncementChannelId),
        xpBase: Math.max(1, Math.min(100000, Number.parseInt(patch.xpBase, 10) || current.xpBase || defaultConfig.xpBase)),
        xpExponent: Number.isFinite(Number(patch.xpExponent))
          ? Math.max(0.5, Math.min(10.0, Number(patch.xpExponent)))
          : (current.xpExponent ?? defaultConfig.xpExponent),
        economyEnabled: pickBoolean(patch, 'economyEnabled', current),
        currencySilverName: String(patch.currencySilverName ?? '').trim().slice(0, 40) || defaultConfig.currencySilverName,
        currencySilverIcon: String(patch.currencySilverIcon ?? '').trim().slice(0, 8) || defaultConfig.currencySilverIcon,
        currencyGoldName: String(patch.currencyGoldName ?? '').trim().slice(0, 40) || defaultConfig.currencyGoldName,
        currencyGoldIcon: String(patch.currencyGoldIcon ?? '').trim().slice(0, 8) || defaultConfig.currencyGoldIcon,
        currencyDiamondName: String(patch.currencyDiamondName ?? '').trim().slice(0, 40) || defaultConfig.currencyDiamondName,
        currencyDiamondIcon: String(patch.currencyDiamondIcon ?? '').trim().slice(0, 8) || defaultConfig.currencyDiamondIcon,
        dailyEnabled: pickFlag(patch, 'dailyEnabled', current),
        dailyCooldownHours: Math.max(1, Math.min(168, Number.parseInt(patch.dailyCooldownHours, 10) || defaultConfig.dailyCooldownHours)),
        dailyResetUtcOffset: Number.isFinite(Number(patch.dailyResetUtcOffset))
          ? Math.max(-720, Math.min(840, Math.round(Number(patch.dailyResetUtcOffset))))
          : (current.dailyResetUtcOffset ?? defaultConfig.dailyResetUtcOffset),
        dailySilverAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailySilverAmount, 10) || 0)),
        dailyGoldAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailyGoldAmount, 10) || 0)),
        dailyDiamondAmount: Math.max(0, Math.min(1000000, Number.parseInt(patch.dailyDiamondAmount, 10) || 0)),
        blackjackEnabled: pickFlag(patch, 'blackjackEnabled', current),
        blackjackMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.blackjackMinBet, 10) || defaultConfig.blackjackMinBet)),
        blackjackMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.blackjackMaxBet, 10) || defaultConfig.blackjackMaxBet)),
        pokerEnabled: pickFlag(patch, 'pokerEnabled', current),
        pokerMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.pokerMinBet, 10) || defaultConfig.pokerMinBet)),
        pokerMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.pokerMaxBet, 10) || defaultConfig.pokerMaxBet)),
        coinflipEnabled: pickFlag(patch, 'coinflipEnabled', current),
        coinflipMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.coinflipMinBet, 10) || defaultConfig.coinflipMinBet)),
        coinflipMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.coinflipMaxBet, 10) || defaultConfig.coinflipMaxBet)),
        diceEnabled: pickFlag(patch, 'diceEnabled', current),
        diceMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.diceMinBet, 10) || defaultConfig.diceMinBet)),
        diceMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.diceMaxBet, 10) || defaultConfig.diceMaxBet)),
        slotsEnabled: pickFlag(patch, 'slotsEnabled', current),
        slotsMinBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.slotsMinBet, 10) || defaultConfig.slotsMinBet)),
        slotsMaxBet: Math.max(1, Math.min(1000000, Number.parseInt(patch.slotsMaxBet, 10) || defaultConfig.slotsMaxBet)),
        announcementsEnabled: pickBoolean(patch, 'announcementsEnabled', current),
        announcementChannelId: normalizeSnowflakeId(patch.announcementChannelId),
        announcementMention: String(patch.announcementMention ?? '').trim().slice(0, 100),
        welcomeEnabled: pickBoolean(patch, 'welcomeEnabled', current),
        welcomeChannelId: normalizeSnowflakeId(patch.welcomeChannelId),
        welcomeMessage: String(patch.welcomeMessage ?? '').trim().slice(0, 500) || defaultConfig.welcomeMessage,
        logChannelId: normalizeSnowflakeId(patch.logChannelId),
        autoReplyEnabled: pickBoolean(patch, 'autoReplyEnabled', current),
        autoReplies: normalizeAutoReplies(patch.autoReplies ?? current.autoReplies),
        mentionReactEnabled: pickBoolean(patch, 'mentionReactEnabled', current),
        mentionReactEmoji: String(patch.mentionReactEmoji ?? current.mentionReactEmoji ?? '👋').trim().slice(0, 32) || '👋',
        tempVcEnabled: pickBoolean(patch, 'tempVcEnabled', current),
        tempVcMasterChannelId: normalizeSnowflakeId(patch.tempVcMasterChannelId),
        tempVcCategoryId: normalizeSnowflakeId(patch.tempVcCategoryId),
        esportsNotifyEnabled: pickBoolean(patch, 'esportsNotifyEnabled', current),
        esportsChannelId: normalizeSnowflakeId(patch.esportsChannelId),
        remindersEnabled: pickBoolean(patch, 'remindersEnabled', current),
        reminders: normalizeReminders(patch.reminders ?? current.reminders),
        musicEnabled: pickBoolean(patch, 'musicEnabled', current),
        musicPrefix: String(patch.musicPrefix ?? current.musicPrefix ?? 'hb').trim().slice(0, 10) || 'hb',
        quizScoring: normalizeQuizScoring(patch.quizScoring ?? current.quizScoring),
        lolEnabled: pickBoolean(patch, 'lolEnabled', current),
        tftEnabled: pickBoolean(patch, 'tftEnabled', current),
        music: {
          ...normalizeMusic(patch.music ?? current.music),
          commands: musicCmds
        },
        moderation: {
          ...normalizeModeration(patch.moderation ?? current.moderation),
          commands: modCmds
        },
        autoModEnabled: normalizeModeration(patch.moderation ?? current.moderation).enabled,
        antiLinkEnabled: normalizeModeration(patch.moderation ?? current.moderation).antiLink
      };

      delete next.commands;
      delete next.guildId;
      delete next.riotApiKey;
      delete next.tftApiKey;
      this.cache[guildId] = next;
      await this.save(guildId);
      return this.getGuildConfig(guildId);
    }); // end _withLock
  }

  async listGuildIds() {
    await this.ready;
    if (this._redis) {
      try {
        const raw = await this._redis.get(this._KEY_INDEX).catch(() => null);
        if (raw) {
          const ids = JSON.parse(raw);
          // Sync keys to this.cache to make sure they exist for fallback
          for (const id of ids) {
            if (!(id in this.cache)) {
              this.cache[id] = {};
            }
          }
          return ids;
        }
      } catch (err) {
        console.warn(`[ConfigStore] Failed to list guild IDs from Redis: ${err.message}`);
      }
    }
    return Object.keys(this.cache);
  }
}