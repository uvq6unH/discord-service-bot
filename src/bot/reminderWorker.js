/**
 * reminderWorker.js — Polls configStore mỗi 60 s, gửi reminder đến đúng channel,
 * reschedule nếu repeat, xoá nếu one-shot.
 *
 * Tách ra khỏi bot.js để ClientReady handler gọn hơn.
 *
 * ⚠️  SINGLE-INSTANCE ASSUMPTION:
 * Worker này không dùng distributed lock. An toàn khi chỉ có 1 bot process
 * (split mode hiện tại). Nếu sau này horizontal scale bot (multi-shard / multiple
 * instances), 2 worker sẽ cùng chạy reminderTick → double-fire mỗi reminder.
 * Giải pháp: wrap `reminderTick` trong `withRedisLock('lock:reminder-worker', ...)`.
 */

import { resolveEmojiNames } from './emojiMap.js';

export const REPEAT_INTERVALS_MS = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
};

/**
 * Tính thời điểm tiếp theo cho reminder lặp lại.
 * Hỗ trợ: hourly, daily, weekly, monthly.
 * @param {string} currentTimeIso Thời điểm hiện tại của reminder (ISO 8601)
 * @param {string} repeat 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly'
 * @param {number|Date} [referenceNow] Thời điểm tham chiếu (mặc định Date.now())
 * @returns {string|null} Thời điểm tiếp theo (ISO 8601), hoặc null nếu không lặp
 */
export function calculateNextReminderTime(currentTimeIso, repeat = 'none', referenceNow = Date.now()) {
  const nowMs = typeof referenceNow === 'number' ? referenceNow : new Date(referenceNow).getTime();

  if (repeat === 'hourly' || repeat === 'daily' || repeat === 'weekly') {
    const ms = REPEAT_INTERVALS_MS[repeat];
    let nextTime = new Date(currentTimeIso).getTime() + ms;
    while (nextTime <= nowMs) nextTime += ms;
    return new Date(nextTime).toISOString();
  }

  if (repeat === 'monthly') {
    const date = new Date(currentTimeIso);
    if (isNaN(date.getTime())) return null;
    const targetDay = date.getDate();

    while (date.getTime() <= nowMs) {
      const curYear = date.getFullYear();
      const curMonth = date.getMonth();
      const nextMonth = (curMonth + 1) % 12;
      const nextYear = curMonth === 11 ? curYear + 1 : curYear;

      const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInNextMonth);

      date.setFullYear(nextYear, nextMonth, clampedDay);
    }
    return date.toISOString();
  }

  return null;
}

/**
 * Xử lý một reminder đến hạn: gửi tin, reschedule / xoá.
 * @returns {object|null} Reminder mới (nếu reschedule), hoặc null (nếu đã xoá)
 */
async function processOneReminder(reminder, guild, referenceNow = Date.now()) {
  const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    const ids = Array.isArray(reminder.userIds) && reminder.userIds.length
      ? reminder.userIds
      : (reminder.userId ? [reminder.userId] : []);
    const userMentions = ids.map((id) => `<@${id}>`).join(' ');

    const roleIds = Array.isArray(reminder.roleIds) ? reminder.roleIds : [];
    const roleMentions = roleIds.map((id) => `<@&${id}>`).join(' ');

    const mentions = [userMentions, roleMentions].filter(Boolean).join(' ');
    const resolvedMsg = resolveEmojiNames(reminder.message, guild);
    const finalText = mentions ? `${mentions} ${resolvedMsg}` : resolvedMsg;
    await channel.send(finalText)
      .then(() => console.log(`[reminder] ✅ Sent reminder "${reminder.message}" to #${channel.name} (${reminder.channelId}) in guild ${guild.name}`))
      .catch((err) => console.error(`[reminder] Failed to send message to channel ${reminder.channelId}:`, err.message));
  } else {
    console.warn(`[reminder] Channel ${reminder.channelId} not found or not text-based in guild ${guild.name}`);
  }

  const repeat = reminder.repeat ?? 'none';
  const nextTime = calculateNextReminderTime(reminder.time, repeat, referenceNow);
  if (!nextTime) return null; // one-shot — consume

  return { ...reminder, time: nextTime };
}

/**
 * Tick chạy mỗi 60 s.
 * @param {import('discord.js').Client} discordClient
 * @param {import('../configStore.js').ConfigStore} configStore
 */
async function reminderTick(discordClient, configStore) {
  const now = new Date();
  const guildIds = await configStore.listGuildIds();

  for (const guildId of guildIds) {
    try {
      const config = await configStore.getGuildConfig(guildId);
      if (!config.enabled || !config.remindersEnabled || !config.reminders?.length) continue;

      let modified = false;
      const nextReminders = [];

      for (const reminder of config.reminders) {
        const time = new Date(reminder.time);
        if (!isNaN(time) && time <= now) {
          modified = true;

          // Skip reminders that are too stale (e.g. bot was down for more than 1 hour)
          const staleMs = now.getTime() - time.getTime();
          const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes (1 hour)

          if (staleMs > STALE_THRESHOLD_MS) {
            // Stale reminder — don't fire the message
            const repeat = reminder.repeat ?? 'none';
            const nextTime = calculateNextReminderTime(reminder.time, repeat, now.getTime());
            if (nextTime) {
              // Recurring: reschedule to next future slot without firing
              nextReminders.push({ ...reminder, time: nextTime });
              console.log(`[reminder] Skipped stale recurring reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late), rescheduled to ${nextTime}`);
            } else {
              // One-shot: silently discard
              console.log(`[reminder] Discarded stale one-shot reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late)`);
            }
            continue;
          }

          const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
          const updated = guild ? await processOneReminder(reminder, guild, now.getTime()) : null;
          if (updated) nextReminders.push(updated);
          // updated === null → one-shot, không push → reminder tự xoá
        } else {
          nextReminders.push(reminder);
        }
      }

      if (modified) {
        await configStore.updateGuildConfig(guildId, { reminders: nextReminders });
      }
    } catch (err) {
      console.error(`[reminder] Error processing guild ${guildId}:`, err.message);
    }
  }
}

/**
 * Khởi động reminder worker.
 * @param {import('discord.js').Client} discordClient
 * @param {import('../configStore.js').ConfigStore} configStore
 * @returns {NodeJS.Timeout}
 */
export function startReminderWorker(discordClient, configStore) {
  // Execute first tick immediately on startup
  reminderTick(discordClient, configStore).catch(err => console.error('[reminder] Initial tick error:', err.message));

  const handle = setInterval(() => reminderTick(discordClient, configStore), 60_000);
  handle.unref();
  console.log('[reminder] Worker started — polling every 60 s');
  return handle;
}
