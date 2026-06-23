import { useGuild } from '../../../shared/hooks/useGuild.js';
import { reminderService } from '../services/reminder.service.js';

export function useReminders() {
  const { config, updateConfig, configLoading, guildData } = useGuild();

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
    updateConfig: handleUpdate,
    addReminder,
    removeReminder,
    updateReminder,
  };
}
