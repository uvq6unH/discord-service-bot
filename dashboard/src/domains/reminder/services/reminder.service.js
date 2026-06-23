export const reminderService = {
  createDefaultReminder: () => {
    const pad = n => String(n).padStart(2, '0');
    const now = new Date(Date.now() + 3600_000);
    const localTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
                      `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return {
      id: `rem_${Date.now()}`,
      userIds: [],
      channelId: '',
      message: '',
      time: localTime,
      repeat: 'none',
    };
  },
  validateReminder: (reminder) => {
    return {
      ...reminder,
      message: (reminder.message || '').trim().slice(0, 500),
    };
  }
};
