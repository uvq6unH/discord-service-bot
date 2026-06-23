import { api } from '../../../app/services/api/index.js';

export const systemRepository = {
  getSystemStatus: async () => {
    return api.status();
  }
};
