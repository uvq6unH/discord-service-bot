import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api.js';

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [config, setConfig]               = useState(null);
  const [guildData, setGuildData]         = useState({ channels: [], roles: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [dirty, setDirty]                 = useState(false);
  const [saveStatus, setSaveStatus]       = useState('idle');

  const selectGuild = useCallback(async (guild) => {
    // Chỉ load dashboard cho server bot đang có mặt
    // Server không có bot sẽ được xử lý bởi ServerRail (show invite modal)
    if (!guild.botPresent) return;

    setSelectedGuild(guild);
    setConfig(null);
    setGuildData({ channels: [], roles: [] });
    setDirty(false);
    setSaveStatus('idle');

    setConfigLoading(true);
    try {
      const [cfg, data] = await Promise.all([
        api.config(guild.id),
        api.guildData(guild.id).catch(() => ({ channels: [], roles: [] })),
      ]);
      setConfig(cfg);
      setGuildData(data);
    } catch (err) {
      console.error('[GuildContext] Failed to load config:', err);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const updateConfig = useCallback((patch) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setDirty(true);
    setSaveStatus('idle');
  }, []);

  const saveConfig = useCallback(async () => {
    if (!selectedGuild || !config) return;
    setSaveStatus('saving');
    try {
      // Strip server-computed / read-only fields before sending — they are not
      // valid patch keys and can corrupt stored config (e.g. riotApiKeyConfigured
      // is a boolean status flag, not the actual secret string the server expects).
      const {
        guildId: _gid,
        riotApiKeyConfigured: _rac,
        tftApiKeyConfigured: _tac,
        slashSync: _ss,
        ...patch
      } = config;
      const saved = await api.saveConfig(selectedGuild.id, patch);
      // Refresh local config with the server-normalized version so stale values
      // (e.g. trimmed prefix, sorted commands) are reflected immediately.
      setConfig(saved);
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      throw err;
    }
  }, [selectedGuild, config]);

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
