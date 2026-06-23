import { systemRepository } from './system.repository.js';

export const systemService = {
  fetchSystemStatus: async () => {
    const data = await systemRepository.getSystemStatus();
    return data ?? null;
  }
};
