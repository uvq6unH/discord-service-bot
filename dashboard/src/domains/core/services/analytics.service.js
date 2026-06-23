import { analyticsRepository } from './analytics.repository.js';

function getMockData(range) {
  const multiplier = range === '7d' ? 1 : range === '30d' ? 4 : 12;
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return {
    summary: {
      commandsExecuted:    { value: 1240 * multiplier, delta: +12.4 },
      activeUsers:         { value: 89  * multiplier, delta: +5.2  },
      economyTransactions: { value: 432 * multiplier, delta: -3.1  },
      moderationActions:   { value: 17  * multiplier, delta: 0     },
    },
    commandsChart: Array.from({ length: days }, (_, i) => ({
      date: new Date(now - (days - i) * 86_400_000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      count: Math.floor(Math.random() * 120 * multiplier / 7 + 30),
    })),
    topCommands: [
      { name: '/balance',    count: 312 * multiplier },
      { name: '/rank',       count: 248 * multiplier },
      { name: '/daily',      count: 195 * multiplier },
      { name: '/blackjack',  count: 143 * multiplier },
      { name: '/leaderboard',count: 98  * multiplier },
      { name: '/help',       count: 72  * multiplier },
    ],
    activeHours: Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      users: Math.floor(
        h >= 18 && h <= 22 ? Math.random() * 40 + 30
        : h >= 8  && h <= 12 ? Math.random() * 20 + 10
        : Math.random() * 8 + 2
      ),
    })),
    isMock: true,
  };
}

export const analyticsService = {
  fetchAnalytics: async (guildId, range) => {
    try {
      const data = await analyticsRepository.getAnalytics(guildId, range);
      return data;
    } catch {
      return getMockData(range);
    }
  }
};
