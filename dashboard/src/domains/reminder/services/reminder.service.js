export const reminderService = {
  createDefaultReminder: () => {
    const now = new Date(Date.now() + 3600_000); // 1 hour from now
    return {
      id: `rem_${Date.now()}`,
      userIds: [],
      roleIds: [],
      channelId: '',
      message: '',
      time: now.toISOString(),
      repeat: 'none',
    };
  },
  validateReminder: (reminder) => {
    return {
      ...reminder,
      userIds: Array.isArray(reminder.userIds) ? reminder.userIds : [],
      roleIds: Array.isArray(reminder.roleIds) ? reminder.roleIds : [],
      message: (reminder.message || '').trim().slice(0, 500),
    };
  }
};
