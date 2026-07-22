import React, { useState, useCallback, useRef, useEffect } from 'react';
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

/** Stable deep-equal for JSON-serializable config objects */
function configsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(stripServerFields(a)) === JSON.stringify(stripServerFields(b));
  } catch {
    return false;
  }
}

export function GuildProvider({ children }) {
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [appReady, setAppReady]           = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [dirty, setDirty]                 = useState(false);
  const queryClient = useQueryClient();

  // Snapshot of the last known server config (set on fetch success and after save)
  const serverSnapshotRef = useRef(null);

  const selectedGuildId = selectedGuild?.id ?? null;

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config', selectedGuildId],
    queryFn: () => api.config(selectedGuildId),
    enabled: appReady && !!selectedGuildId,
  });

  // Capture server snapshot whenever fresh config arrives from the server
  useEffect(() => {
    if (config && !configLoading) {
      // Only snapshot if we don't have one yet or after a save reset it
      if (!serverSnapshotRef.current || !dirty) {
        serverSnapshotRef.current = structuredClone(config);
      }
    }
  }, [config, configLoading]);

  const { data: guildData = { channels: [], roles: [] } } = useQuery({
    queryKey: ['guild-data', selectedGuildId],
    queryFn: () => api.guildData(selectedGuildId).catch(() => ({ channels: [], roles: [] })),
    enabled: appReady && !!selectedGuildId,
  });

  const { data: userRole = null } = useQuery({
    queryKey: ['my-role', selectedGuildId],
    queryFn: () => api.myRole(selectedGuildId).then(r => r.role ?? null),
    enabled: appReady && !!selectedGuildId,
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
      // Update snapshot to current config so dirty resets correctly
      serverSnapshotRef.current = config ? structuredClone(config) : null;
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
    if (!guild) {
      setSelectedGuild(null);
      try {
        localStorage.removeItem('selectedGuildId');
      } catch {}
      setDirty(false);
      serverSnapshotRef.current = null;
      return;
    }
    if (!guild.botPresent) return;
    setSelectedGuild(guild);
    try {
      localStorage.setItem('selectedGuildId', guild.id);
    } catch {}
    setDirty(false);
    serverSnapshotRef.current = null;
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
      // Sync flat next.commands array with sub-module command arrays
      const coreCmds = next.core?.commands ?? [];
      const modCmds = next.moderation?.commands ?? [];
      const levelsCmds = next.levels?.commands ?? [];
      const ecoCmds = next.economy?.commands ?? [];
      const riotCmds = next.riot?.commands ?? [];
      const musicCmds = next.music?.commands ?? [];
      next.commands = [...coreCmds, ...modCmds, ...levelsCmds, ...ecoCmds, ...riotCmds, ...musicCmds];

      // Compare against server snapshot to determine real dirty state
      const isDirty = !configsEqual(next, serverSnapshotRef.current);
      setDirty(isDirty);
      return next;
    });
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
      appReady,
      syncing,
      setAppReady,
      setSyncing,
      selectGuild,
      updateConfig,
      saveConfig,
    }}>
      {children}
    </GuildContext.Provider>
  );
}

