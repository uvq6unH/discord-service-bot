import { useGuild } from '../../../shared/hooks/useGuild.js';
import { moderationService } from '../services/moderation.service.js';

export function useModeration() {
  const { config, updateConfig, configLoading, guildData, userRole } = useGuild();

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const handleThresholdChange = (key, val) => {
    const validated = moderationService.validateThreshold(val);
    updateConfig({ moderation: { ...config?.moderation, [key]: validated } });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    guildData: guildData ?? { channels: [], roles: [] },
    userRole,
    updateConfig: handleUpdate,
    handleThresholdChange,
  };
}
