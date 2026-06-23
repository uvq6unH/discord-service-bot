import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './app/providers/AuthProvider.jsx';
import { useGuild } from './shared/hooks/useGuild.js';
import { api } from './app/services/api/index.js';
import AppShell from './shared/layouts/AppShell.jsx';
import AppRoutes from './app/router/router.jsx';

function TerminalLoader({ message }) {
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px'
    }}>
      &gt;&gt;&gt; {message.toUpperCase()}...
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { selectedGuild, selectGuild, saveConfig, saveStatus, dirty } = useGuild();

  const { data: guildsRaw, isLoading: guildsLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: () => api.guilds().then(r => Array.isArray(r) ? r : (r.guilds ?? [])),
    enabled: !!user,
  });
  const guilds = guildsRaw ?? [];

  if (authLoading) {
    return <TerminalLoader message="Checking security credentials" />;
  }

  if (guildsLoading) {
    return <TerminalLoader message="Syncing guild list" />;
  }

  return (
    <AppShell
      guilds={guilds}
      selectedGuild={selectedGuild}
      user={user}
      selectGuild={selectGuild}
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
