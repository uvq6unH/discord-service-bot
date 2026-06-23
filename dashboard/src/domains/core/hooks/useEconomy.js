import { useGuild } from '../../../shared/hooks/useGuild.js';
import { economyService } from '../services/economy.service.js';

export function useEconomy() {
  const { config, updateConfig, configLoading } = useGuild();

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const handleBetChange = (prefix, field, val) => {
    const min = field === 'MinBet' ? 1 : (config?.[`${prefix}MinBet`] ?? 1);
    const max = field === 'MaxBet' ? 1000000 : (config?.[`${prefix}MaxBet`] ?? 1000000);
    const validated = economyService.validateBet(val, min, max);
    updateConfig({ [`${prefix}${field}`]: validated });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    updateConfig: handleUpdate,
    handleBetChange,
  };
}
