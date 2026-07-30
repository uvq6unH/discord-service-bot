import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Calculates current statistic count for a specific counter type in a guild.
 */
export async function calculateCounterStat(guild, counter, redis = null, guildId = null) {
  const targetGuildId = guild?.id || guildId;
  const type = counter.type;
  const roleId = counter.roleId;

  if (guild) {
    if (['users', 'bots', 'membersWithRole', 'membersWithoutRole', 'onlineMembers', 'offlineMembers'].includes(type)) {
      if (guild.members.cache.size < guild.memberCount) {
        await guild.members.fetch().catch(() => null);
      }
    }

    switch (type) {
      case 'members':
        return guild.memberCount || guild.members.cache.size || 0;
      case 'users':
        return guild.members.cache.filter(m => !m.user?.bot).size;
      case 'bots':
        return guild.members.cache.filter(m => m.user?.bot).size;
      case 'roles':
        return guild.roles.cache.size;
      case 'channels':
        return guild.channels.cache.size;
      case 'textChannels':
        return guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
      case 'voiceChannels':
        return guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice || c.type === 2).size;
      case 'categoryChannels':
        return guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory || c.type === 4).size;
      case 'announcementChannels':
        return guild.channels.cache.filter(c => c.type === ChannelType.GuildNews || c.type === ChannelType.GuildAnnouncement).size;
      case 'stageChannels':
        return guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;
      case 'membersWithRole':
        if (!roleId) return 0;
        return guild.members.cache.filter(m => m.roles.cache.has(roleId)).size;
      case 'membersWithoutRole':
        if (!roleId) return 0;
        return guild.members.cache.filter(m => !m.roles.cache.has(roleId)).size;
      case 'emojis':
        return guild.emojis.cache.size;
      case 'nitroBoosts':
        return guild.premiumSubscriptionCount || 0;
      case 'nitroBoostTier':
        return guild.premiumTier || 0;
      case 'onlineMembers':
        return guild.members.cache.filter(m => ['online', 'idle', 'dnd'].includes(m.presence?.status)).size;
      case 'offlineMembers':
        return Math.max(0, (guild.memberCount || 0) - guild.members.cache.filter(m => ['online', 'idle', 'dnd'].includes(m.presence?.status)).size);
      default:
        return guild.memberCount || 0;
    }
  }

  // Fallback if guild is null (e.g. 2-process split mode in Express server)
  if (redis && targetGuildId) {
    try {
      const rawMeta = await redis.get(`guild_cache:${targetGuildId}`).catch(() => null);
      if (rawMeta) {
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        const rawMembers = await redis.get(`guild_cache:${targetGuildId}:members`).catch(() => null);
        const membersList = rawMembers ? (typeof rawMembers === 'string' ? JSON.parse(rawMembers) : rawMembers) : [];

        switch (type) {
          case 'members':
            return meta.memberCount || membersList.length || 0;
          case 'users':
            return membersList.length > 0 ? membersList.filter(m => !m.user?.bot && !m.bot).length : Math.max(0, (meta.memberCount || 1) - 1);
          case 'bots':
            return membersList.length > 0 ? membersList.filter(m => m.user?.bot || m.bot).length : 1;
          case 'roles':
            return meta.roles?.length || 0;
          case 'channels':
            return meta.channels?.length || 0;
          case 'textChannels':
            return (meta.channels || []).filter(c => c.type === 0 || c.type === ChannelType.GuildText).length;
          case 'voiceChannels':
            return (meta.channels || []).filter(c => c.type === 2 || c.type === ChannelType.GuildVoice).length;
          case 'categoryChannels':
            return (meta.channels || []).filter(c => c.type === 4 || c.type === ChannelType.GuildCategory).length;
          case 'membersWithRole':
            if (!roleId) return 0;
            return membersList.filter(m => Array.isArray(m.roles) && (m.roles.includes(roleId) || m.roles.some(r => r.id === roleId))).length;
          case 'membersWithoutRole':
            if (!roleId) return 0;
            return membersList.filter(m => Array.isArray(m.roles) && !m.roles.includes(roleId) && !m.roles.some(r => r.id === roleId)).length;
          default:
            return meta.memberCount || 0;
        }
      }
    } catch (err) {
      console.warn('[countersEngine] Fallback calculation via Redis failed:', err.message);
    }
  }

  return 0;
}

/**
 * Format raw number with localized commas (e.g. 1234 -> "1,234")
 */
export function formatCountNumber(num) {
  return Number(num || 0).toLocaleString('en-US');
}

/**
 * Resolves current goal milestone for a goal counter.
 * Advances goal milestone index if count >= currentGoal.
 */
export function resolveGoalMilestone(counter, currentCount) {
  let goals = counter.goals || [];
  if (typeof goals === 'string') {
    goals = goals.split(',').map(g => parseInt(g.trim(), 10)).filter(n => !isNaN(n));
  }
  if (!Array.isArray(goals) || goals.length === 0) {
    return { targetGoal: 0, updatedIndex: 0 };
  }

  const sortedGoals = [...goals].sort((a, b) => a - b);

  let index = counter.currentGoalIndex || 0;
  if (index >= sortedGoals.length) {
    index = sortedGoals.length - 1;
  }

  while (index < sortedGoals.length - 1 && currentCount >= sortedGoals[index]) {
    index++;
  }

  return {
    targetGoal: sortedGoals[index] || 0,
    updatedIndex: index
  };
}

/**
 * Evaluates target channel name for counter based on template.
 */
export function generateCounterChannelName(counter, currentCount, targetGoal = null) {
  const template = counter.channelNameTemplate || (targetGoal !== null ? '🎯 Goal: {count}/{goal}' : '👥 Members: {count}');
  const formattedCount = formatCountNumber(currentCount);
  const formattedGoal = targetGoal !== null ? formatCountNumber(targetGoal) : '';

  let resultName = template
    .replace(/\{count\}/gi, formattedCount)
    .replace(/\{goal\}/gi, formattedGoal);

  return resultName.slice(0, 95);
}

/**
 * Computes live calculated stats (count, targetGoal, evaluated channelName, channel status)
 * for a counter without modifying Discord channels (read-only for GET requests).
 */
export async function enrichCounterWithLiveStats(guild, counter, redis = null, guildId = null) {
  if (!counter) return counter;
  const targetGuildId = guild?.id || guildId;
  
  const rawCount = await calculateCounterStat(guild, counter, redis, targetGuildId);
  let targetGoal = null;

  if (counter.isGoal) {
    const goalRes = resolveGoalMilestone(counter, rawCount);
    targetGoal = goalRes.targetGoal;
  }

  const evaluatedName = generateCounterChannelName(counter, rawCount, targetGoal);
  
  let channelExists = false;
  if (guild && counter.channelId) {
    const ch = guild.channels.cache.get(counter.channelId) || await guild.channels.fetch(counter.channelId).catch(() => null);
    channelExists = Boolean(ch);
  } else if (redis && targetGuildId && counter.channelId) {
    try {
      const rawMeta = await redis.get(`guild_cache:${targetGuildId}`).catch(() => null);
      if (rawMeta) {
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        channelExists = Array.isArray(meta.channels) && meta.channels.some(c => c.id === counter.channelId);
      }
    } catch {}
  }

  return {
    ...counter,
    liveCount: rawCount,
    formattedCount: formatCountNumber(rawCount),
    targetGoal,
    formattedGoal: targetGoal !== null ? formatCountNumber(targetGoal) : null,
    evaluatedName,
    channelExists
  };
}

/**
 * Resolves or creates the parent category for Server Counters.
 * Supports renaming on Discord by tracking category ID in configStore & parent IDs of bound channels.
 */
export async function getOrResolveCounterCategory(guild, configStore) {
  if (!guild) return null;

  const config = configStore ? await configStore.getGuildConfig(guild.id).catch(() => ({})) : {};

  // 1. Try to find by stored counterCategoryId
  if (config.counterCategoryId) {
    let cat = guild.channels.cache.get(config.counterCategoryId);
    if (!cat) {
      cat = await guild.channels.fetch(config.counterCategoryId).catch(() => null);
    }
    if (cat && cat.type === ChannelType.GuildCategory) {
      return cat;
    }
  }

  // 2. Try to find by parent ID of any currently bound counter channel
  const counters = Array.isArray(config.counters) ? config.counters : [];
  for (const c of counters) {
    if (c.channelId) {
      const ch = guild.channels.cache.get(c.channelId) || await guild.channels.fetch(c.channelId).catch(() => null);
      if (ch && ch.parentId) {
        const cat = guild.channels.cache.get(ch.parentId) || await guild.channels.fetch(ch.parentId).catch(() => null);
        if (cat && cat.type === ChannelType.GuildCategory) {
          if (configStore && config.counterCategoryId !== cat.id) {
            await configStore.updateGuildConfig(guild.id, { counterCategoryId: cat.id }).catch(() => null);
          }
          return cat;
        }
      }
    }
  }

  // 3. Search existing channels for category matching /counter|stat|thống kê|analytics|overview/i
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /counter|stat|thống kê|analytics|overview/i.test(c.name));
  if (!category) {
    let fetched;
    try { fetched = await guild.channels.fetch(); } catch { fetched = guild.channels.cache; }
    category = [...fetched.values()].find(c => c.type === ChannelType.GuildCategory && /counter|stat|thống kê|analytics|overview/i.test(c.name));
  }

  // 4. Create new category if not found
  if (!category) {
    category = await guild.channels.create({
      name: '📊 Server Stats',
      type: ChannelType.GuildCategory
    }).catch(() => null);
  }

  if (category && configStore && config.counterCategoryId !== category.id) {
    await configStore.updateGuildConfig(guild.id, { counterCategoryId: category.id }).catch(() => null);
  }

  return category;
}

/**
 * Syncs a single counter channel in Discord.
 */
export async function syncSingleCounter(guild, counter, configStore) {
  if (!guild || !counter || counter.enabled === false) return null;

  const originalChannelId = counter.channelId;

  try {
    const rawCount = await calculateCounterStat(guild, counter);
    let targetGoal = null;
    let newGoalIndex = counter.currentGoalIndex;

    if (counter.isGoal) {
      const goalRes = resolveGoalMilestone(counter, rawCount);
      targetGoal = goalRes.targetGoal;
      newGoalIndex = goalRes.updatedIndex;
    }

    const expectedName = generateCounterChannelName(counter, rawCount, targetGoal);

    // Resolve or create counter channel in Discord
    let channel = null;
    if (counter.channelId) {
      channel = guild.channels.cache.get(counter.channelId) || await guild.channels.fetch(counter.channelId).catch(() => null);
    }

    const category = await getOrResolveCounterCategory(guild, configStore);

    // If channel wasn't found by ID, look under category for any existing voice channel matching this counter type before creating a new one!
    if (!channel && category) {
      try {
        let fetchedChannels;
        try { fetchedChannels = await guild.channels.fetch(); } catch { fetchedChannels = guild.channels.cache; }
        const categoryChildren = [...fetchedChannels.values()].filter(ch => ch.parentId === category.id && ch.type === ChannelType.GuildVoice);

        const match = categoryChildren.find(ch => {
          const nameLower = ch.name.toLowerCase();
          if (counter.type === 'members' && (nameLower.includes('members') || nameLower.includes('thành viên') || ch.name.includes('👥'))) return true;
          if (counter.type === 'users' && (nameLower.includes('users') || nameLower.includes('người dùng') || ch.name.includes('👤'))) return true;
          if (counter.type === 'bots' && (nameLower.includes('bots') || nameLower.includes('robot') || ch.name.includes('🤖'))) return true;
          if (counter.type === 'roles' && (nameLower.includes('roles') || nameLower.includes('vai trò'))) return true;
          if (counter.type === 'channels' && nameLower.includes('channels')) return true;
          if (counter.type === 'voiceChannels' && (nameLower.includes('voice') || ch.name.includes('🔊'))) return true;
          return false;
        });

        if (match) {
          channel = match;
          counter.channelId = channel.id;
          console.log(`[countersEngine] Found existing channel under category for counter ${counter.type}: ${channel.id}`);
        }
      } catch (_) {}
    }

    if (!channel) {
      const everyoneRoleId = guild.roles?.everyone?.id || guild.id;

      // Create a locked voice channel for counter display with safe permission overwrite fallback
      channel = await guild.channels.create({
        name: expectedName,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: everyoneRoleId,
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel]
          }
        ]
      }).catch(async (err) => {
        console.warn(`[countersEngine] Could not create channel with permissionOverwrites, trying basic voice channel:`, err.message);
        return await guild.channels.create({
          name: expectedName,
          type: ChannelType.GuildVoice,
          parent: category?.id
        });
      });

      if (channel) {
        counter.channelId = channel.id;
      }
    } else {
      // Only rename if channel name actually changed (prevents Discord rate-limits)
      if (channel.name !== expectedName) {
        await channel.setName(expectedName).catch(err => {
          console.warn(`[countersEngine] Could not rename channel ${channel.id}:`, err.message);
        });
      }
    }

    // Persist updated counter channelId and currentGoalIndex to configStore
    const finalChannelId = channel?.id || null;
    if (configStore && finalChannelId && (originalChannelId !== finalChannelId || newGoalIndex !== counter.currentGoalIndex)) {
      const config = await configStore.getGuildConfig(guild.id);
      const updatedCounters = (config.counters || []).map(c => {
        if (c.id === counter.id) {
          return {
            ...c,
            channelId: finalChannelId,
            currentGoalIndex: newGoalIndex
          };
        }
        return c;
      });
      await configStore.updateGuildConfig(guild.id, { counters: updatedCounters });
    }

    return {
      success: true,
      channelId: finalChannelId,
      name: expectedName,
      count: rawCount,
      targetGoal
    };
  } catch (err) {
    console.error(`[countersEngine] Error syncing counter ${counter.id} in guild ${guild.id}:`, err);
    const isPermErr = err?.code === 50013 || /permission/i.test(err?.message ?? '');
    const userErrMsg = isPermErr
      ? 'Bot thiếu quyền Manage Channels (Quản lý kênh) trên Discord Server'
      : (err?.message || 'Không thể tạo kênh Discord');
    return { success: false, error: userErrMsg };
  }
}

export function deduplicateCounters(counters) {
  if (!Array.isArray(counters)) return [];
  const seen = new Set();
  const result = [];

  for (const c of counters) {
    const key = `${c.type}_${c.channelId || 'unbound'}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
}

/**
 * Auto-discovers and imports existing counter voice channels under '📊 Server Stats' category in Discord if they are not yet in configStore.
 */
export async function autoDiscoverExistingCounters(guild, configStore) {
  if (!guild || !configStore) return [];

  const config = await configStore.getGuildConfig(guild.id);
  let currentCounters = Array.isArray(config.counters) ? [...config.counters] : [];

  const category = await getOrResolveCounterCategory(guild, configStore);
  if (!category) return currentCounters;

  let fetchedChannels;
  try { fetchedChannels = await guild.channels.fetch(); } catch { fetchedChannels = guild.channels.cache; }

  const voiceChannels = [...fetchedChannels.values()].filter(ch => ch.parentId === category.id && ch.type === ChannelType.GuildVoice);
  let updated = false;

  for (const ch of voiceChannels) {
    const alreadyBound = currentCounters.some(c => c.channelId === ch.id);
    if (!alreadyBound) {
      const nameLower = ch.name.toLowerCase();
      let typeKey = null;
      let template = '👥 Members: {count}';

      if (nameLower.includes('users') || nameLower.includes('người dùng') || ch.name.includes('👤')) {
        typeKey = 'users';
        template = '👤 Users: {count}';
      } else if (nameLower.includes('bots') || nameLower.includes('robot') || ch.name.includes('🤖')) {
        typeKey = 'bots';
        template = '🤖 Bots: {count}';
      } else if (nameLower.includes('members') || nameLower.includes('thành viên') || ch.name.includes('👥')) {
        typeKey = 'members';
        template = '👥 Members: {count}';
      } else if (nameLower.includes('roles') || nameLower.includes('vai trò')) {
        typeKey = 'roles';
        template = '🏷️ Roles: {count}';
      } else if (nameLower.includes('voice')) {
        typeKey = 'voiceChannels';
        template = '🔊 Voice Channels: {count}';
      }

      if (typeKey) {
        const unboundIdx = currentCounters.findIndex(c => c.type === typeKey && !c.channelId);
        if (unboundIdx >= 0) {
          currentCounters[unboundIdx] = {
            ...currentCounters[unboundIdx],
            channelId: ch.id
          };
          updated = true;
        } else {
          const existingBound = currentCounters.find(c => c.type === typeKey && c.channelId);
          if (!existingBound) {
            currentCounters.push({
              id: `counter_${typeKey}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              type: typeKey,
              channelNameTemplate: template,
              channelId: ch.id,
              enabled: true,
              isGoal: false
            });
            updated = true;
          }
        }
      }
    }
  }

  const deduplicated = deduplicateCounters(currentCounters);
  if (deduplicated.length !== currentCounters.length) {
    currentCounters = deduplicated;
    updated = true;
  }

  if (updated) {
    await configStore.updateGuildConfig(guild.id, { counters: currentCounters });
  }

  return currentCounters;
}

/**
 * Syncs all counters for a guild and cleans up duplicate/orphan channels under the category.
 */
export async function syncAllCountersForGuild(guild, configStore) {
  if (!guild || !configStore) return [];

  // Auto-discover any unlinked voice channels under '📊 Server Stats'
  await autoDiscoverExistingCounters(guild, configStore).catch(() => null);

  const config = await configStore.getGuildConfig(guild.id);
  if (config.countersEnabled === false) {
    return [];
  }

  const countersList = Array.isArray(config.counters) ? config.counters : [];
  if (countersList.length === 0) {
    // If counters list is empty after auto-discover, delete empty category if it exists
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /counter|stat/i.test(c.name));
    if (category) {
      let fetchedChannels;
      try { fetchedChannels = await guild.channels.fetch(); } catch { fetchedChannels = guild.channels.cache; }
      const remaining = [...fetchedChannels.values()].filter(ch => ch.parentId === category.id);
      if (remaining.length === 0) {
        await category.delete('No active counters').catch(() => null);
      }
    }
    return [];
  }

  const results = [];
  const validChannelIds = new Set();
  for (const counter of countersList) {
    const res = await syncSingleCounter(guild, counter, configStore);
    if (res) {
      results.push(res);
      if (res.channelId) validChannelIds.add(res.channelId);
    }
  }

  // Auto clean up any excess/duplicate voice channels under '📊 Server Stats' category
  try {
    const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /counter|stat/i.test(c.name));
    if (category) {
      let fetchedChannels;
      try { fetchedChannels = await guild.channels.fetch(); } catch { fetchedChannels = guild.channels.cache; }
      const voiceChannelsUnderCategory = [...fetchedChannels.values()].filter(c => c.parentId === category.id && c.type === ChannelType.GuildVoice);

      const seenTypes = new Set();
      for (const ch of voiceChannelsUnderCategory) {
        const isAssigned = validChannelIds.has(ch.id);
        const nameLower = ch.name.toLowerCase();
        let typeKey = null;
        if (nameLower.includes('users') || ch.name.includes('👤')) typeKey = 'users';
        else if (nameLower.includes('bots') || ch.name.includes('🤖')) typeKey = 'bots';
        else if (nameLower.includes('members') || ch.name.includes('👥')) typeKey = 'members';

        if (!isAssigned || (typeKey && seenTypes.has(typeKey))) {
          console.log(`[countersEngine] Auto-deleting duplicate/orphan channel "${ch.name}" (${ch.id})`);
          await ch.delete('Cleaning up duplicate counter channel').catch(() => null);
        } else if (typeKey) {
          seenTypes.add(typeKey);
        }
      }
    }
  } catch (err) {
    console.warn('[countersEngine] Error during duplicate channel cleanup:', err.message);
  }

  return results;
}

/**
 * Launches background intervals to periodically sync counters for all cached guilds.
 */
export function startCountersEngine(client, configStore, intervalMs = 15 * 60 * 1000) {
  if (!client || !configStore) return;

  console.log('[countersEngine] Counters engine background service initialized.');

  // Run initial sync after 20 seconds of bot startup
  setTimeout(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        await syncAllCountersForGuild(guild, configStore).catch(() => null);
      }
    } catch (err) {
      console.error('[countersEngine] Error in initial sync:', err.message);
    }
  }, 20000);

  // Periodic interval loop (every 15 minutes)
  setInterval(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        await syncAllCountersForGuild(guild, configStore).catch(() => null);
      }
    } catch (err) {
      console.error('[countersEngine] Error in periodic sync:', err.message);
    }
  }, intervalMs);
}
