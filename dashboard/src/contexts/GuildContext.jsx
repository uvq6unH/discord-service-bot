import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api.js';

const GuildContext = createContext(null);

export function GuildProvider({ children }) {
  const [selectedGuild, setSelectedGuild] = useState(null); // guild object từ /api/guilds
  const [config, setConfig]               = useState(null); // config từ /api/config
  const [guildData, setGuildData]         = useState({ channels: [], roles: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [dirty, setDirty]                 = useState(false);
  const [saveStatus, setSaveStatus]       = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const selectGuild = useCallback(async (guild) => {
    // Nếu bot chưa trong server → redirect sang invite URL, không mở dashboard
    if (!guild.botPresent) {
      try {
        const { url } = await api.inviteUrl(guild.id);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // Fallback: build invite URL thủ công
        const clientId = window.__BOT_CLIENT_ID__ ?? '';
        const perms = '8'; // Administrator
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${perms}&guild_id=${guild.id}`;
        window.open(inviteUrl, '_blank', 'noopener,noreferrer');
      }
      return; // Không set selectedGuild, không load config
    }

    setSelectedGuild(guild);
    setConfig(null);
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
      await api.saveConfig(selectedGuild.id, config);
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
