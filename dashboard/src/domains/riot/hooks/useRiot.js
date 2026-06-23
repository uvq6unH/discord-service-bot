import { useGuild } from '../../../shared/hooks/useGuild.js';
import { riotService } from '../services/riot.service.js';

export function useRiot() {
  const { config, updateConfig, configLoading } = useGuild();

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const handleApiKeyChange = (key, val) => {
    const validated = riotService.validateApiKey(val);
    updateConfig({ [key]: validated });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    updateConfig: handleUpdate,
    handleApiKeyChange,
  };
}
