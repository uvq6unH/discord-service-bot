import React, { createContext, useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { GuildProvider, useGuild } from './contexts/GuildContext.jsx';
import ServerRail from './components/ServerRail.jsx';
import PluginNav from './components/PluginNav.jsx';
import { SaveBar, EmptyState, useTheme, ThemeContext } from './components/ui.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import OverviewPage   from './pages/Overview.jsx';
import MembersPage    from './pages/Members.jsx';
import CommandsPage   from './pages/Commands.jsx';
import EconomyPage    from './pages/Economy.jsx';
import ModerationPage from './pages/Moderation.jsx';
import LolPage        from './pages/Lol.jsx';
import SystemPage     from './pages/System.jsx';
import AnalyticsPage  from './pages/Analytics.jsx';
import { api } from './api.js';

// ThemeContext re-export để các file cũ import từ App.jsx vẫn hoạt động
export { ThemeContext };
export function useAppTheme() { return useContext(ThemeContext); }

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
  const location = useLocation();

  const { data: guildsRaw, isLoading: guildsLoading } = useQuery({
    queryKey: ['guilds'],
    queryFn: () => api.guilds().then(r => Array.isArray(r) ? r : (r.guilds ?? [])),
    enabled: !!user,
  });
  const guilds = guildsRaw ?? [];

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
              <ErrorBoundary key={location.pathname}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ height: '100%' }}
                  >
                    <Routes>
                      <Route path="/"             element={<Navigate to="/overview" replace />} />
                      <Route path="/overview"     element={<OverviewPage />} />
                      <Route path="/members"      element={<MembersPage />} />
                      <Route path="/commands/*"   element={<CommandsPage />} />
                      <Route path="/economy"      element={<EconomyPage />} />
                      <Route path="/moderation"   element={<ModerationPage />} />
                      <Route path="/lol"          element={<LolPage />} />
                      <Route path="/system"       element={<SystemPage />} />
                      <Route path="/analytics"    element={<AnalyticsPage />} />
                      <Route path="*"             element={<Navigate to="/overview" replace />} />
                    </Routes>
                  </motion.div>
                </AnimatePresence>
              </ErrorBoundary>
            </main>
            <AnimatePresence>
              {dirty && (
                <motion.div
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                  <SaveBar onSave={saveConfig} status={saveStatus} />
                </motion.div>
              )}
            </AnimatePresence>
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
