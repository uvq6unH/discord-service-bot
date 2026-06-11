import React, { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { GuildProvider, useGuild } from './contexts/GuildContext.jsx';
import ServerRail from './components/ServerRail.jsx';
import PluginNav from './components/PluginNav.jsx';
import { SaveBar, EmptyState, useTheme } from './components/ui.jsx';
import OverviewPage from './pages/Overview.jsx';
import MembersPage from './pages/Members.jsx';
import CommandsPage from './pages/Commands.jsx';
import EconomyPage from './pages/Economy.jsx';
import ModerationPage from './pages/Moderation.jsx';
import LolPage    from './pages/Lol.jsx';
import SystemPage from './pages/System.jsx';
import { api } from './api.js';

// Context để share theme xuống tất cả pages
export const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });
export function useAppTheme() { return useContext(ThemeContext); }

// Màn hình loading toàn trang — hiện khi chưa có đủ data
function FullscreenLoader({ label = 'Đang tải...' }) {
  return (
    <div className="fullscreen-loader">
      <div className="fullscreen-loader__inner">
        <div className="spinner" />
        <span className="fullscreen-loader__label">{label}</span>
      </div>
    </div>
  );
}

function DashboardLayout() {
  const { user, loading: authLoading } = useAuth();
  const { selectedGuild, dirty, saveConfig, saveStatus } = useGuild();
  const [guilds, setGuilds] = useState([]);
  const [guildsLoading, setGuildsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.guilds()
      .then(r => Array.isArray(r) ? r : (r.guilds ?? []))
      .then(setGuilds)
      .catch(console.error)
      .finally(() => setGuildsLoading(false));
  }, [user]);

  // Block render hoàn toàn cho đến khi auth + guilds list đều xong
  if (authLoading || guildsLoading) {
    return <FullscreenLoader label={authLoading ? 'Đang xác thực...' : 'Đang tải servers...'} />;
  }

  return (
    <div className="app">
      <ServerRail guilds={guilds} loading={false} user={user} />

      <div className="main-area">
        {!selectedGuild ? (
          <EmptyState />
        ) : (
          <>
            <PluginNav guildId={selectedGuild.id} />
            <main className="content">
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview"    element={<OverviewPage />} />
                <Route path="/members"     element={<MembersPage />} />
                <Route path="/commands/*"  element={<CommandsPage />} />
                <Route path="/economy"     element={<EconomyPage />} />
                <Route path="/moderation"  element={<ModerationPage />} />
                <Route path="/lol"         element={<LolPage />} />
                <Route path="/system"      element={<SystemPage />} />
                <Route path="*"            element={<Navigate to="/overview" replace />} />
              </Routes>
            </main>
            {dirty && (
              <SaveBar onSave={saveConfig} status={saveStatus} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AuthProvider>
        <GuildProvider>
          <DashboardLayout />
        </GuildProvider>
      </AuthProvider>
    </ThemeContext.Provider>
  );
}