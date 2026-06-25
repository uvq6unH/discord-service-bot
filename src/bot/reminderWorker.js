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

const REPEAT_INTERVALS_MS = {
  hourly: 60 * 60 * 1_000,
  daily:  24 * 60 * 60 * 1_000,
  weekly:  7 * 24 * 60 * 60 * 1_000,
};

const REPEAT_LABELS = {
  hourly: ' 🔁 (mỗi giờ)',
  daily:  ' 🔁 (mỗi ngày)',
  weekly: ' 🔁 (mỗi tuần)',
};

/**
 * Xử lý một reminder đến hạn: gửi tin, reschedule / xoá.
 * @returns {object|null} Reminder mới (nếu reschedule), hoặc null (nếu đã xoá)
 */
async function processOneReminder(reminder, guild) {
  const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    const ids = Array.isArray(reminder.userIds) && reminder.userIds.length
      ? reminder.userIds
      : (reminder.userId ? [reminder.userId] : []);
    const userMentions = ids.map((id) => `<@${id}>`).join(' ');

    const roleIds = Array.isArray(reminder.roleIds) ? reminder.roleIds : [];
    const roleMentions = roleIds.map((id) => `<@&${id}>`).join(' ');

    const mentions = [userMentions, roleMentions].filter(Boolean).join(' ');
    const repeatLabel  = REPEAT_LABELS[reminder.repeat] ?? '';
    const resolvedMsg  = resolveEmojiNames(reminder.message, guild);
    const finalText = mentions ? `${mentions} ${resolvedMsg}${repeatLabel}` : `${resolvedMsg}${repeatLabel}`;
    await channel.send(finalText).catch(() => null);
  }

  const repeat = reminder.repeat ?? 'none';
  const ms     = REPEAT_INTERVALS_MS[repeat];
  if (!ms) return null; // one-shot — consume

  const baseTime = new Date(reminder.time).getTime();
  const now      = Date.now();
  let nextTime   = baseTime + ms;
  while (nextTime <= now) nextTime += ms;

  return { ...reminder, time: new Date(nextTime).toISOString() };
}

/**
 * Tick chạy mỗi 60 s.
 * @param {import('discord.js').Client} discordClient
 * @param {import('../configStore.js').ConfigStore} configStore
 */
async function reminderTick(discordClient, configStore) {
  const now      = new Date();
  const guildIds = await configStore.listGuildIds();

  for (const guildId of guildIds) {
    try {
      const config = await configStore.getGuildConfig(guildId);
      if (!config.enabled || !config.remindersEnabled || !config.reminders?.length) continue;

      let modified       = false;
      const nextReminders = [];

      for (const reminder of config.reminders) {
        const time = new Date(reminder.time);
        if (!isNaN(time) && time <= now) {
          modified = true;

          // Skip reminders that are too stale (e.g. bot was restarted after the reminder time)
          const staleMs = now.getTime() - time.getTime();
          const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

          if (staleMs > STALE_THRESHOLD_MS) {
            // Stale reminder — don't fire the message
            const repeat = reminder.repeat ?? 'none';
            const ms = REPEAT_INTERVALS_MS[repeat];
            if (ms) {
              // Recurring: reschedule to next future slot without firing
              let nextTime = time.getTime() + ms;
              while (nextTime <= now.getTime()) nextTime += ms;
              nextReminders.push({ ...reminder, time: new Date(nextTime).toISOString() });
              console.log(`[reminder] Skipped stale recurring reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late), rescheduled to ${new Date(nextTime).toISOString()}`);
            } else {
              // One-shot: silently discard
              console.log(`[reminder] Discarded stale one-shot reminder ${reminder.id} (was ${Math.round(staleMs / 60000)}m late)`);
            }
            continue;
          }

          const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
          const updated = guild ? await processOneReminder(reminder, guild) : null;
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
  const handle = setInterval(() => reminderTick(discordClient, configStore), 60_000);
  handle.unref();
  console.log('[reminder] Worker started — polling every 60 s');
  return handle;
}
