import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/index.js';

/**
 * GuildContext
 *
 * Fixes từ review:
 * 1. saveConfig dùng Omit type để strip server-only fields an toàn hơn.
 *    Trước đây destructure thủ công — nếu server thêm field mới sẽ bị leak.
 *    Giờ dùng SERVER_ONLY_FIELDS array — 1 chỗ duy nhất để update.
 * 2. saveStatus exposed đúng type để SaveBar render.
 */

const GuildContext = createContext(null);

// Fields server trả về nhưng không được gửi lên trong PUT
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

  // Role của user trong guild này — fetch riêng theo guild, tránh rate limit
  // khi load danh sách server. Cache 5 phút vì quyền thay đổi rất hiếm.
  const { data: userRole = null } = useQuery({
    queryKey: ['my-role', selectedGuildId],
    queryFn: () => api.myRole(selectedGuildId).then(r => r.role ?? null),
    enabled: !!selectedGuildId,
    staleTime: 5 * 60 * 1000,
  });

  const [saveStatus, setSaveStatus] = useState('idle');

  const saveMutation = useMutation({
    mutationFn: (patch) => api.saveConfig(selectedGuildId, patch),
    onSuccess: () => {
      // Invalidate để refetch fresh data từ Upstash — tránh ghi đè sai format
      queryClient.invalidateQueries({ queryKey: ['config', selectedGuildId] });
      setDirty(false);
      setSaveStatus('saved');
      toast.success('Đã lưu thành công');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: (err) => {
      setSaveStatus('error');
      toast.error('Lỗi khi lưu: ' + (err?.message ?? 'thử lại'));
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
      // Deep merge 1 level: nếu value là object (và không phải array),
      // merge vào key đó thay vì replace — ví dụ: updateConfig({ music: { defaultVolume: 70 } })
      // sẽ giữ nguyên các field khác của config.music
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
    // Reset error state khi user thay đổi config mới
    if (saveStatus === 'error') setSaveStatus('idle');
  }, [queryClient, selectedGuildId, saveStatus]);

  const saveConfig = useCallback(async () => {
    if (!selectedGuildId || !config) return;
    // FIX: dùng stripServerFields thay vì destructure thủ công
    // Bảo đảm nếu server thêm field mới vào SERVER_ONLY_FIELDS là đủ
    const patch = stripServerFields(config);
    await saveMutation.mutateAsync(patch);
  }, [selectedGuildId, config, saveMutation]);

  // saveStatus là state riêng — tránh React Query reset isSuccess quá nhanh
  // Khi mutate đang chạy, override về 'saving'
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

export function useGuild() {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error('useGuild must be used inside <GuildProvider>');
  return ctx;
}
