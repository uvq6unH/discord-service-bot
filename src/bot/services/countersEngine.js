import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Calculates current statistic count for a specific counter type in a guild.
 */
export async function calculateCounterStat(guild, counter) {
  if (!guild) return 0;
  
  const type = counter.type;
  const roleId = counter.roleId;

  // Make sure guild members cache is populated if role/user calculations are needed
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
      return guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;

    case 'categoryChannels':
      return guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

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

    case 'onlineMembers': {
      return guild.members.cache.filter(m => {
        const s = m.presence?.status;
        return s === 'online' || s === 'idle' || s === 'dnd';
      }).size;
    }

    case 'offlineMembers': {
      const onlineCount = guild.members.cache.filter(m => {
        const s = m.presence?.status;
        return s === 'online' || s === 'idle' || s === 'dnd';
      }).size;
      return Math.max(0, (guild.memberCount || guild.members.cache.size) - onlineCount);
    }

    case 'static':
      return 0;

    default:
      return guild.memberCount || 0;
  }
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

  // Ensure goals array is sorted ascending
  const sortedGoals = [...goals].sort((a, b) => a - b);

  let index = counter.currentGoalIndex || 0;
  if (index >= sortedGoals.length) {
    index = sortedGoals.length - 1;
  }

  // Auto advance if currentCount reached or exceeded target goal
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

  // Truncate to Discord 100 char limit for channel names
  return resultName.slice(0, 95);
}

/**
 * Computes live calculated stats (count, targetGoal, evaluated channelName, channel status)
 * for a counter without modifying Discord channels (read-only for GET requests).
 */
export async function enrichCounterWithLiveStats(guild, counter) {
  if (!counter) return counter;
  
  const rawCount = guild ? await calculateCounterStat(guild, counter) : 0;
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
 * Syncs a single counter channel in Discord.
 */
export async function syncSingleCounter(guild, counter, configStore) {
  if (!guild || !counter || counter.enabled === false) return null;

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

    // Find or create parent category for counters
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /counter|stat/i.test(c.name));
    if (!category) {
      category = await guild.channels.create({
        name: '📊 Server Stats',
        type: ChannelType.GuildCategory
      }).catch(() => null);
    }

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
    if (configStore && channel && (counter.channelId !== channel.id || newGoalIndex !== counter.currentGoalIndex)) {
      const config = await configStore.getGuildConfig(guild.id);
      const updatedCounters = (config.counters || []).map(c => {
        if (c.id === counter.id) {
          return {
            ...c,
            channelId: channel.id,
            currentGoalIndex: newGoalIndex
          };
        }
        return c;
      });
      await configStore.updateGuildConfig(guild.id, { counters: updatedCounters });
    }

    return {
      success: true,
      channelId: channel?.id || null,
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

/**
 * Syncs all counters for a guild and cleans up duplicate/orphan channels under the category.
 */
export async function syncAllCountersForGuild(guild, configStore) {
  if (!guild || !configStore) return [];

  const config = await configStore.getGuildConfig(guild.id);
  if (config.countersEnabled === false || !Array.isArray(config.counters) || config.counters.length === 0) {
    return [];
  }

  const results = [];
  const validChannelIds = new Set();
  for (const counter of config.counters) {
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
