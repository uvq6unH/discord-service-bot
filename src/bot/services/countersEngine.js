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
      return guild.memberCount || guild.members.cache.size;

    case 'users':
      return guild.members.cache.filter(m => !m.user.bot).size;

    case 'bots':
      return guild.members.cache.filter(m => m.user.bot).size;

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

  let index = counter.currentGoalIndex || 0;
  if (index >= goals.length) {
    index = goals.length - 1;
  }

  // Auto advance if currentCount reached or exceeded target goal
  while (index < goals.length - 1 && currentCount >= goals[index]) {
    index++;
  }

  return {
    targetGoal: goals[index] || 0,
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

    if (!channel) {
      // Find or create parent category for counters
      let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /counter/i.test(c.name));
      if (!category) {
        category = await guild.channels.create({
          name: '📊 Server Stats',
          type: ChannelType.GuildCategory
        }).catch(() => null);
      }

      // Create a locked voice channel for counter display
      channel = await guild.channels.create({
        name: expectedName,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
      counter.channelId = channel.id;
    } else {
      // Only rename if channel name actually changed (prevents Discord rate-limits)
      if (channel.name !== expectedName) {
        await channel.setName(expectedName).catch(err => {
          console.warn(`[countersEngine] Could not rename channel ${channel.id}:`, err.message);
        });
      }
    }

    // Persist updated counter channelId and currentGoalIndex to configStore
    if (configStore && (counter.channelId !== channel.id || newGoalIndex !== counter.currentGoalIndex)) {
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

    return { success: true, channelId: channel.id, name: expectedName, count: rawCount };
  } catch (err) {
    console.error(`[countersEngine] Error syncing counter ${counter.id} in guild ${guild.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Syncs all counters for a guild.
 */
export async function syncAllCountersForGuild(guild, configStore) {
  if (!guild || !configStore) return [];

  const config = await configStore.getGuildConfig(guild.id);
  if (config.countersEnabled === false || !Array.isArray(config.counters) || config.counters.length === 0) {
    return [];
  }

  const results = [];
  for (const counter of config.counters) {
    const res = await syncSingleCounter(guild, counter, configStore);
    if (res) results.push(res);
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
