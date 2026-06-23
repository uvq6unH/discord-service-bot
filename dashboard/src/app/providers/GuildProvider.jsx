import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../services/api/index.js';
import { GuildContext } from '../../shared/context/GuildContext.js';

const SERVER_ONLY_FIELDS = ['guildId', 'riotApiKeyConfigured', 'tftApiKeyConfigured', 'slashSync'];

function stripServerFields(config) {
  const patch = { ...config };
  for (const field of SERVER_ONLY_FIELDS) {
    delete patch[field];
  }
  return patch;
}

export function GuildProvider({ children }) {
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

  const { data: userRole = null } = useQuery({
    queryKey: ['my-role', selectedGuildId],
    queryFn: () => api.myRole(selectedGuildId).then(r => r.role ?? null),
    enabled: !!selectedGuildId,
    staleTime: 5 * 60 * 1000,
  });

  const [saveStatus, setSaveStatus] = useState('idle');

  const saveMutation = useMutation({
    mutationFn: async (patch) => {
      try {
        const result = await api.saveConfig(selectedGuildId, patch);
        return result;
      } catch (err) {
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', selectedGuildId] });
      setDirty(false);
      setSaveStatus('saved');
      toast.success('Lưu cấu hình thành công');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: (err) => {
      setSaveStatus('error');
      toast.error('Lỗi khi lưu: ' + (err?.message ?? 'unknown'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const selectGuild = useCallback((guild) => {
    if (!guild.botPresent) return;
    setSelectedGuild(guild);
    setDirty(false);
  }, []);

  const updateConfig = useCallback((patch) => {
    queryClient.setQueryData(['config', selectedGuildId], prev => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof prev[k] === 'object' && prev[k] !== null) {
          next[k] = { ...prev[k], ...v };
        } else {
          next[k] = v;
        }
      }
      return next;
    });
    setDirty(true);
    if (saveStatus === 'error') setSaveStatus('idle');
  }, [queryClient, selectedGuildId, saveStatus]);

  const saveConfig = useCallback(async () => {
    if (!selectedGuildId || !config) return;
    const patch = stripServerFields(config);
    await saveMutation.mutateAsync(patch);
  }, [selectedGuildId, config, saveMutation]);

  const effectiveSaveStatus = saveMutation.isPending ? 'saving' : saveStatus;

  return (
    <GuildContext.Provider value={{
      selectedGuild,
      config,
      guildData,
      configLoading,
      dirty,
      saveStatus: effectiveSaveStatus,
      userRole,
      selectGuild,
      updateConfig,
      saveConfig,
    }}>
      {children}
    </GuildContext.Provider>
  );
}
