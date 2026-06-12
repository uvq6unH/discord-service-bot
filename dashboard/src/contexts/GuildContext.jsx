import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api.js';

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
    // FIX: dùng stripServerFields thay vì destructure thủ công
    // Bảo đảm nếu server thêm field mới vào SERVER_ONLY_FIELDS là đủ
    const patch = stripServerFields(config);
    await saveMutation.mutateAsync(patch);
  }, [selectedGuildId, config, saveMutation]);

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
  return useContext(GuildContext);
}
