import { useGuild } from '../../../shared/hooks/useGuild.js';
import { musicService } from '../services/music.service.js';

export function useMusic() {
  const { config, updateConfig, configLoading } = useGuild();

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const handleVolumeChange = (volume) => {
    const validated = musicService.validateVolume(volume);
    const music = config?.music ?? {};
    updateConfig({ music: { ...music, defaultVolume: validated } });
  };

  const handlePrefixChange = (prefix) => {
    const validated = musicService.validatePrefix(prefix);
    updateConfig({ musicPrefix: validated });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    updateConfig: handleUpdate,
    handleVolumeChange,
    handlePrefixChange,
  };
}
