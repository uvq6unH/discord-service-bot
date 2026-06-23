import { apiFetch } from '../../../api.js';

export const analyticsRepository = {
  getAnalytics: async (guildId, range) => {
    const res = await apiFetch(
      `/api/analytics?guildId=${encodeURIComponent(guildId)}&range=${range}`,
      {}, { allowNotOk: true }
    );
    if (!res.ok) {
      throw new Error('API request failed');
    }
    return res.json();
  }
};
