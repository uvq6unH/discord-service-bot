import { useGuild } from '../../../shared/hooks/useGuild.js';
import { reminderService } from '../services/reminder.service.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../app/services/api/index.js';

export function useReminders() {
  const { config, updateConfig, configLoading, guildData } = useGuild();
  const selectedGuildId = config?.guildId ?? null;

  const { data: members = [] } = useQuery({
    queryKey: ['members', selectedGuildId, 1, '', 1000],
    queryFn: () => api.members(selectedGuildId, 1, '', 1000).then(r => r.members ?? []),
    enabled: !!selectedGuildId,
  });

  const handleUpdate = (patch) => {
    updateConfig(patch);
  };

  const addReminder = () => {
    const newRem = reminderService.createDefaultReminder();
    const currentList = config?.reminders ?? [];
    updateConfig({ reminders: [...currentList, newRem] });
  };

  const removeReminder = (id) => {
    const currentList = config?.reminders ?? [];
    updateConfig({ reminders: currentList.filter(r => r.id !== id) });
  };

  const updateReminder = (id, patch) => {
    const currentList = config?.reminders ?? [];
    const updatedList = currentList.map(r => {
      if (r.id === id) {
        const merged = { ...r, ...patch };
        return reminderService.validateReminder(merged);
      }
      return r;
    });
    updateConfig({ reminders: updatedList });
  };

  return {
    config: config ?? null,
    loading: configLoading,
    channels: guildData?.channels ?? [],
    roles: guildData?.roles ?? [],
    members,
    updateConfig: handleUpdate,
    addReminder,
    removeReminder,
    updateReminder,
  };
}
