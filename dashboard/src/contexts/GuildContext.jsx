import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api.js';

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  // selectedGuild stays local state — it's UI state, not server data
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [dirty, setDirty]                 = useState(false);
  const queryClient = useQueryClient();

  const selectedGuildId = selectedGuild?.id ?? null;

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config', selectedGuildId],
    queryFn: () => api.config(selectedGuildId),
    enabled: !!selectedGuildId,
  });

  const { data: guildData = { channels: [], roles: [] } } = useQuery({
    queryKey: ['guild-data', selectedGuildId],
    queryFn: () => api.guildData(selectedGuildId).catch(() => ({ channels: [], roles: [] })),
    enabled: !!selectedGuildId,
  });

  const saveMutation = useMutation({
    mutationFn: (patch) => api.saveConfig(selectedGuildId, patch),
    onSuccess: (saved) => {
      queryClient.setQueryData(['config', selectedGuildId], saved);
      setDirty(false);
      toast.success('Đã lưu thành công');
    },
    onError: () => toast.error('Lỗi khi lưu — thử lại'),
  });

  const selectGuild = useCallback((guild) => {
    if (!guild.botPresent) return;
    setSelectedGuild(guild);
    setDirty(false);
  }, []);

  const updateConfig = useCallback((patch) => {
    queryClient.setQueryData(['config', selectedGuildId], prev =>
      prev ? { ...prev, ...patch } : prev
    );
    setDirty(true);
  }, [queryClient, selectedGuildId]);

  const saveConfig = useCallback(async () => {
    if (!selectedGuildId || !config) return;
    const {
      guildId: _gid,
      riotApiKeyConfigured: _rac,
      tftApiKeyConfigured: _tac,
      slashSync: _ss,
      ...patch
    } = config;
    await saveMutation.mutateAsync(patch);
  }, [selectedGuildId, config, saveMutation]);

  // saveStatus for SaveBar compatibility
  const saveStatus = saveMutation.isPending ? 'saving'
    : saveMutation.isSuccess ? 'saved'
    : saveMutation.isError   ? 'error'
    : 'idle';

  return (
    <GuildContext.Provider value={{
      selectedGuild,
      config,
      guildData,
      configLoading,
      dirty,
      saveStatus,
      selectGuild,
      updateConfig,
      saveConfig,
    }}>
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild() {
  return useContext(GuildContext);
}
