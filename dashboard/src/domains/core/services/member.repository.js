import { api } from '../../../app/services/api/index.js';

export const memberRepository = {
  getMembers: async (guildId, page, search) => {
    return api.members(guildId, page, search);
  }
};
