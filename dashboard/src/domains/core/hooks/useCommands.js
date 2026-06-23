import { useGuild } from '../../../shared/hooks/useGuild.js';
import { commandService } from '../services/command.service.js';

export function useCommands() {
  const { config, updateConfig, configLoading } = useGuild();

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const handleCommandNameChange = (id, val) => {
    const validated = commandService.validateCommandName(val);
    const updated = (config?.commands ?? []).map(c =>
      c.type === 'custom' && c.id === id ? { ...c, name: validated } : c
    );
    updateConfig({ commands: updated });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    updateConfig: handleUpdate,
    handleCommandNameChange,
  };
}
