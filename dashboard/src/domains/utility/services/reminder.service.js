export const REMINDER_IMAGE_PRESETS = [
  {
    id: 'announcement',
    name: '📢 Thông báo',
    nameKey: '📢 Announcement',
    url: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=800&q=80',
    desc: 'Bản tin / Thông báo chung'
  },
  {
    id: 'meeting',
    name: '👥 Họp team',
    nameKey: '👥 Meeting',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    desc: 'Họp giao ban / Thảo luận nhóm'
  },
  {
    id: 'deadline',
    name: '⏰ Deadline',
    nameKey: '⏰ Deadline',
    url: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80',
    desc: 'Hạn chót / Báo cáo tiến độ'
  },
  {
    id: 'gaming',
    name: '🎮 Gaming',
    nameKey: '🎮 Gaming',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80',
    desc: 'Chơi game / Giải trí cùng server'
  },
  {
    id: 'break',
    name: '☕ Giải lao',
    nameKey: '☕ Break',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
    desc: 'Nghỉ ngơi / Uống nước / Cà phê'
  },
  {
    id: 'event',
    name: '🎉 Sự kiện',
    nameKey: '🎉 Event',
    url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
    desc: 'Tiệc tùng / Mini game / Giveaway'
  },
  {
    id: 'meal',
    name: '🍱 Giờ ăn',
    nameKey: '🍱 Meal',
    url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
    desc: 'Cơm trưa / Cơm tối / Đi ăn'
  },
  {
    id: 'maintenance',
    name: '🛡️ Bảo trì',
    nameKey: '🛡️ Maintenance',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
    desc: 'Bảo trì máy chủ / Cập nhật hệ thống'
  }
];

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
      imageUrl: '',
    };
  },
  validateReminder: (reminder) => {
    const validRepeats = ['none', 'hourly', 'daily', 'weekly', 'monthly'];
    return {
      ...reminder,
      channelId: String(reminder.channelId ?? '').trim(),
      userIds: Array.isArray(reminder.userIds) ? reminder.userIds : [],
      roleIds: Array.isArray(reminder.roleIds) ? reminder.roleIds : [],
      message: String(reminder.message ?? '').slice(0, 500),
      repeat: validRepeats.includes(reminder?.repeat) ? reminder.repeat : 'none',
      imageUrl: String(reminder?.imageUrl ?? '').trim().slice(0, 500),
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
