import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './app/providers/AuthProvider.jsx';
import { useGuild } from './shared/hooks/useGuild.js';
import { api } from './app/services/api/index.js';
import AppShell from './shared/layouts/AppShell.jsx';
import AppRoutes from './app/router/router.jsx';
import SystemBootLoader from './shared/components/SystemBootLoader.jsx';
import LandingPage from './shared/pages/LandingPage.jsx';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [refreshingGuilds, setRefreshingGuilds] = useState(false);
  const {
    selectedGuild,
    selectGuild,
    config,
    configLoading,
    saveConfig,
    saveStatus,
    dirty,
    setAppReady,
    setSyncing
  } = useGuild();

  const { data: guildsPayload, isLoading: guildsLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: () => api.guilds(),
    enabled: !!user,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'syncing') {
        return (data.retryAfter ?? 2) * 1000;
      }
      return false;
    }
  });

  const lastRefreshTimeRef = useRef(0);

  const handleRefreshGuilds = useCallback(async () => {
    if (refreshingGuilds) return;

    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 2500) {
      return;
    }
    lastRefreshTimeRef.current = now;

    setRefreshingGuilds(true);
    try {
      const data = await api.guilds(true);
      queryClient.setQueryData(['guilds'], data);
    } catch (err) {
      console.error('[guilds] Refresh error:', err.message);
    } finally {
      setRefreshingGuilds(false);
    }
  }, [queryClient, refreshingGuilds]);

  const guilds = guildsPayload?.guilds ?? [];
  const status = guildsPayload?.status ?? 'ready';
  const syncing = status === 'syncing';

  // Deterministic ID-first sorting
  const sortedGuilds = useMemo(() => {
    const list = [...guilds];
    return list.sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name, 'en'));
  }, [guilds]);

  // Synchronize syncing state to provider
  useEffect(() => {
    setSyncing(syncing);
  }, [syncing, setSyncing]);

  // Resolve selection coordinate
  useEffect(() => {
    if (guildsLoading) return;
    if (status === 'syncing') return;

    try {
      const storedId = localStorage.getItem('selectedGuildId');
      if (storedId) {
        const matched = guilds.find(g => g.id === storedId && g.botPresent);
        if (matched) {
          selectGuild(matched);
          setAppReady(true);
          return;
        }
      }
    } catch {}

    selectGuild(null);
    setAppReady(true);
  }, [guildsLoading, status, guilds, selectGuild, setAppReady]);

  // ── Resource Loading State & Telemetry Progression ───────────────────────
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [bootProgress, setBootProgress] = useState(15);
  const [bootFinished, setBootFinished] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => setFontsLoaded(true)).catch(() => setFontsLoaded(true));
    } else {
      setFontsLoaded(true);
    }
  }, []);

  const isAuthReady = !authLoading;
  const isGuildsReady = !guildsLoading && !!guildsPayload;
  const isConfigReady = !selectedGuild || (!configLoading && !!config);

  const telemetryLogs = useMemo(() => [
    { label: '[01/05] SECURITY MATRIX & AUTHENTICATION', done: isAuthReady },
    { label: '[02/05] GUILD ROUTING SYSTEM', done: isGuildsReady },
    { label: '[03/05] SUBSYSTEM CONFIG STORE', done: isConfigReady },
    { label: '[04/05] PERMISSIONS & CHANNEL CACHE', done: isConfigReady && isGuildsReady },
    { label: '[05/05] FONT & ASSET PRE-WARM', done: fontsLoaded }
  ], [isAuthReady, isGuildsReady, isConfigReady, fontsLoaded]);

  const targetProgress = useMemo(() => {
    let count = 0;
    if (isAuthReady) count++;
    if (isGuildsReady) count++;
    if (isConfigReady) count++;
    if (isConfigReady && isGuildsReady) count++;
    if (fontsLoaded) count++;

    if (count === 0) return 20;
    if (count === 1) return 40;
    if (count === 2) return 60;
    if (count === 3) return 80;
    if (count === 4) return 92;
    return 100;
  }, [isAuthReady, isGuildsReady, isConfigReady, fontsLoaded]);

  // Smoothly increment bootProgress towards targetProgress
  useEffect(() => {
    const timer = setInterval(() => {
      setBootProgress(prev => {
        if (prev < targetProgress) {
          return Math.min(prev + 10, targetProgress);
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(timer);
  }, [targetProgress]);

  // Handle smooth boot screen exit
  useEffect(() => {
    if (bootProgress >= 100 && isAuthReady && isGuildsReady && isConfigReady && fontsLoaded) {
      setFadingOut(true);
      const timer = setTimeout(() => {
        setBootFinished(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [bootProgress, isAuthReady, isGuildsReady, isConfigReady, fontsLoaded]);

  // 1. Unauthenticated users see Landing Page directly
  if (isAuthReady && !user) {
    return <LandingPage />;
  }

  // 2. Loading state: ONLY render SystemBootLoader until bootFinished is true
  if (!bootFinished) {
    const currentStepText = telemetryLogs.find(l => !l.done)?.label ?? '[05/05] MISSION CONTROL OPERATIONAL';
    return (
      <SystemBootLoader
        progress={bootProgress}
        currentStep={currentStepText}
        telemetryLogs={telemetryLogs}
        fadingOut={fadingOut}
      />
    );
  }

  // 3. Authenticated & fully loaded: render full Dashboard UI
  return (
    <AppShell
      guilds={sortedGuilds}
      selectedGuild={selectedGuild}
      user={user}
      selectGuild={selectGuild}
      onRefreshGuilds={handleRefreshGuilds}
      refreshingGuilds={refreshingGuilds}
      onInviteRequest={(guild) => {
        api.inviteUrl(guild.id).then(({ url }) => {
          window.open(url, '_blank', 'noopener,noreferrer');
        }).catch(() => {
          const clientId = window.__BOT_CLIENT_ID__ ?? '';
          const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8&guild_id=${guild.id}`;
          window.open(url, '_blank', 'noopener,noreferrer');
        });
      }}
      saveConfig={saveConfig}
      saveStatus={saveStatus}
      dirty={dirty}
    >
      <React.Suspense fallback={
        <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: '12px' }}>
          &gt;&gt;&gt; SYSLOAD // CACHING MODULE CHUNKS...
        </div>
      }>
        <AppRoutes />
      </React.Suspense>
    </AppShell>
  );
}
