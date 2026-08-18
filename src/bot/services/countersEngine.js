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
      case 'static':
        return counter.staticValue ?? 0;
      default:
        return guild.memberCount || 0;
    }
  }

  // Fallback if guild is null (read-only from Redis cache)
  if (redis && targetGuildId) {
    try {
      const rawMeta = await redis.get(`guild_cache:${targetGuildId}`).catch(() => null);
      if (rawMeta) {
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        switch (type) {
          case 'members': return meta.memberCount || 0;
          case 'roles': return meta.roleCount || 0;
          case 'channels': return meta.channelCount || 0;
          case 'nitroBoosts': return meta.premiumSubscriptionCount || 0;
          case 'nitroBoostTier': return meta.premiumTier || 0;
          default: return meta.memberCount || 0;
        }
      }
    } catch {}
  }

  return 0;
}

/**
 * Formats a number for display (e.g., 1500 -> "1,500")
 */
export function formatCountNumber(count) {
  if (typeof count !== 'number' || isNaN(count)) return '0';
  return count.toLocaleString('en-US');
}

/**
 * Resolves goal milestone for goal-type counters.
 */
export function resolveGoalMilestone(counter, currentCount) {
  const goals = Array.isArray(counter.goals) ? counter.goals : [];
  if (goals.length === 0) return { targetGoal: null, updatedIndex: 0 };

  const sortedGoals = [...goals].sort((a, b) => a - b);
  let index = counter.currentGoalIndex || 0;
  while (index < sortedGoals.length && currentCount >= sortedGoals[index]) {
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
  const template = counter.channelNameTemplate || (targetGoal !== null ? '\uD83C\uDFAF Goal: {count}/{goal}' : '\uD83D\uDC65 Members: {count}');
  const formattedCount = formatCountNumber(currentCount);
  const formattedGoal = targetGoal !== null ? formatCountNumber(targetGoal) : '';

  let resultName = template
    .replace(/\{count\}/gi, formattedCount)
    .replace(/\{goal\}/gi, formattedGoal);

  return resultName.slice(0, 95);
}

/**
 * Computes live calculated stats for a counter (read-only, no Discord mutations).
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
 * Creates a single counter voice channel on Discord.
 * Returns { success, channelId, name } or { success: false, error }.
 */
export async function createCounterChannel(guild, counter, configStore) {
  if (!guild || !counter) return { success: false, error: 'Missing guild or counter' };

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

    // If channel already exists, just rename it
    if (counter.channelId) {
      const existing = guild.channels.cache.get(counter.channelId) || await guild.channels.fetch(counter.channelId).catch(() => null);
      if (existing) {
        if (existing.name !== expectedName) {
          await existing.setName(expectedName).catch(err =>
            console.warn(`[countersEngine] Could not rename channel ${existing.id}:`, err.message)
          );
        }
        return { success: true, channelId: existing.id, name: expectedName, count: rawCount, targetGoal };
      }
    }

    // Find or create the category
    const config = configStore ? await configStore.getGuildConfig(guild.id).catch(() => ({})) : {};
    let category = null;

    // Try stored category
    if (config.counterCategoryId) {
      category = await guild.channels.fetch(config.counterCategoryId).catch(() => null);
      if (category && category.type !== ChannelType.GuildCategory) category = null;
    }

    // Search existing categories
    if (!category) {
      let fetched;
      try { fetched = await guild.channels.fetch(); } catch { fetched = guild.channels.cache; }
      category = [...fetched.values()].find(c =>
        c.type === ChannelType.GuildCategory && /counter|stat|server stats/i.test(c.name)
      ) || null;
    }

    // Create category only when explicitly creating a counter channel
    if (!category) {
      category = await guild.channels.create({
        name: '\uD83D\uDCCA Server Stats',
        type: ChannelType.GuildCategory
      }).catch(() => null);
    }

    // Save category ID
    if (category && configStore) {
      await configStore.updateGuildConfig(guild.id, { counterCategoryId: category.id }).catch(() => null);
    }

    // Create voice channel
    const everyoneRoleId = guild.roles?.everyone?.id || guild.id;
    let channel = null;

    try {
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
      });
    } catch (err1) {
      console.warn(`[countersEngine] Channel create with overwrites failed:`, err1.message);
      try {
        channel = await guild.channels.create({
          name: expectedName,
          type: ChannelType.GuildVoice,
          parent: category?.id
        });
      } catch (err2) {
        console.warn(`[countersEngine] Channel create under category failed:`, err2.message);
        try {
          channel = await guild.channels.create({
            name: expectedName,
            type: ChannelType.GuildVoice
          });
        } catch (err3) {
          console.error(`[countersEngine] CRITICAL: Channel creation failed for counter ${counter.id}:`, err3.message);
          return { success: false, error: err3.message };
        }
      }
    }

    if (!channel) return { success: false, error: 'Channel creation returned null' };

    // Save channelId to config
    if (configStore) {
      const latestConfig = await configStore.getGuildConfig(guild.id);
      const updatedCounters = (latestConfig.counters || []).map(c => {
        if (c.id === counter.id) {
          return { ...c, channelId: channel.id, currentGoalIndex: newGoalIndex };
        }
        return c;
      });
      await configStore.updateGuildConfig(guild.id, { counters: updatedCounters });
    }

    console.log(`[countersEngine] Created counter channel "${channel.name}" (${channel.id})`);

    return {
      success: true,
      channelId: channel.id,
      name: expectedName,
      count: rawCount,
      targetGoal
    };
  } catch (err) {
    console.error(`[countersEngine] Error creating counter channel ${counter.id}:`, err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}

/**
 * Deletes a counter's voice channel on Discord.
 */
export async function deleteCounterChannel(guild, channelId) {
  if (!guild || !channelId) return;
  try {
    const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (ch) {
      await ch.delete('Counter deleted via Dashboard').catch(() => null);
      console.log(`[countersEngine] Deleted counter channel ${channelId}`);
    }
  } catch (err) {
    console.warn(`[countersEngine] Could not delete channel ${channelId}:`, err.message);
  }
}

/**
 * Updates all existing counter channel names with current stats.
 * Only renames channels that already exist. Does NOT create or delete anything.
 */
export async function refreshCounterNames(guild, configStore) {
  if (!guild || !configStore) return [];

  const config = await configStore.getGuildConfig(guild.id);
  if (config.countersEnabled === false) return [];

  const countersList = Array.isArray(config.counters) ? config.counters : [];
  const results = [];

  for (const counter of countersList) {
    if (!counter.channelId || counter.enabled === false) continue;

    try {
      const ch = guild.channels.cache.get(counter.channelId) || await guild.channels.fetch(counter.channelId).catch(() => null);
      if (!ch) continue;

      const rawCount = await calculateCounterStat(guild, counter);
      let targetGoal = null;
      if (counter.isGoal) {
        const goalRes = resolveGoalMilestone(counter, rawCount);
        targetGoal = goalRes.targetGoal;
      }

      const expectedName = generateCounterChannelName(counter, rawCount, targetGoal);

      if (ch.name !== expectedName) {
        await ch.setName(expectedName).catch(err =>
          console.warn(`[countersEngine] Could not rename channel ${ch.id}:`, err.message)
        );
        results.push({ id: counter.id, name: expectedName, count: rawCount });
      }
    } catch (err) {
      console.warn(`[countersEngine] Error refreshing counter ${counter.id}:`, err.message);
    }
  }

  return results;
}

/**
 * Background name-refresh loop (every 30 min). Only renames, never creates/deletes.
 */
export function startCounterRefreshLoop(client, configStore, intervalMs = 30 * 60 * 1000) {
  if (!client || !configStore) return;

  console.log('[countersEngine] Counter name-refresh loop started (every 30 min, rename only).');

  setInterval(async () => {
    try {
      for (const [, guild] of client.guilds.cache) {
        await refreshCounterNames(guild, configStore).catch(() => null);
      }
    } catch (err) {
      console.error('[countersEngine] Error in name-refresh loop:', err.message);
    }
  }, intervalMs);
}
