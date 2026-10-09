export const reminderService = {
  createDefaultReminder: (defaultChannelId = '') => {
    const now = new Date(Date.now() + 3600_000); // 1 hour from now
    return {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userIds: [],
      roleIds: [],
      channelId: defaultChannelId || '',
      message: '',
      time: now.toISOString(),
      repeat: 'none',
    };
  },
  validateReminder: (reminder) => {
    return {
      ...reminder,
      channelId: String(reminder.channelId ?? '').trim(),
      userIds: Array.isArray(reminder.userIds) ? reminder.userIds : [],
      roleIds: Array.isArray(reminder.roleIds) ? reminder.roleIds : [],
      message: String(reminder.message ?? '').slice(0, 500),
    };
  },
  isReminderComplete: (reminder) => {
    return Boolean(
      reminder &&
      reminder.id &&
      String(reminder.channelId ?? '').trim() &&
      String(reminder.message ?? '').trim() &&
      reminder.time
    );
  }
};
