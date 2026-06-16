/**
 * App.jsx — Community Operations Platform
 * V4 Migration — Domain Architecture
 *
 * Phase 1-8 complete:
 * - Core Operations domain
 * - Riot Services domain
 * - Music Services domain
 * - Reminder Services domain
 * - New DomainNav (replaces PluginNav)
 * - Logic giữ nguyên 100%
 */
import React, { createContext, useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { GuildProvider, useGuild } from './contexts/GuildContext.jsx';
import ServerRail from './components/ServerRail.jsx';
import DomainNav from './app/shared/layouts/DomainNav.jsx';
import { SaveBar, EmptyState, useTheme, ThemeContext, ThemePicker } from './components/ui.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// ── Core Operations ──────────────────────────────────────────────────────────
import OverviewPage    from './app/domains/core/Overview.jsx';
import MembersPage     from './app/domains/core/Members.jsx';
import CommandsPage    from './app/domains/core/Commands.jsx';
import EconomyPage     from './app/domains/core/Economy.jsx';
import ModerationPage  from './app/domains/core/Moderation.jsx';
import AnalyticsPage   from './app/domains/core/Analytics.jsx';
import SystemPage      from './app/domains/core/System.jsx';

// ── Riot Services domain ─────────────────────────────────────────────────────
import RiotServicesPage from './app/domains/riot/RiotServices.jsx';

// ── Music Services domain ────────────────────────────────────────────────────
import MusicServicesPage from './app/domains/music/MusicServices.jsx';

// ── Reminder Services domain ─────────────────────────────────────────────────
import ReminderServicesPage from './app/domains/reminder/ReminderServices.jsx';

import { api } from './api.js';

// ThemeContext re-export — backward compat
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
      {/* Left Rail — rất mỏng, chỉ guild switcher */}
      <ServerRail guilds={guilds} loading={false} user={user} />

      <div className="main-area">
        {!selectedGuild ? (
          <EmptyState />
        ) : (
          <>
            {/* Phase 3: DomainNav thay thế PluginNav */}
            <DomainNav />

            <main className="content" id="main-content">
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
                      {/* Default */}
                      <Route path="/"            element={<Navigate to="/overview" replace />} />

                      {/* Core Operations */}
                      <Route path="/overview"    element={<OverviewPage />} />
                      <Route path="/members"     element={<MembersPage />} />
                      <Route path="/commands/*"  element={<CommandsPage />} />
                      <Route path="/economy"     element={<EconomyPage />} />
                      <Route path="/moderation"  element={<ModerationPage />} />
                      <Route path="/analytics"   element={<AnalyticsPage />} />
                      <Route path="/system"      element={<SystemPage />} />

                      {/* Phase 6: Riot Services domain */}
                      <Route path="/riot"        element={<RiotServicesPage />} />

                      {/* Phase 7: Music Services domain */}
                      <Route path="/music"       element={<MusicServicesPage />} />

                      {/* Phase 8: Reminder Services domain */}
                      <Route path="/reminders"   element={<ReminderServicesPage />} />

                      {/* Legacy redirect: /lol → /riot */}
                      <Route path="/lol"         element={<Navigate to="/riot" replace />} />

                      <Route path="*"            element={<Navigate to="/overview" replace />} />
                    </Routes>
                  </motion.div>
                </AnimatePresence>
              </ErrorBoundary>
            </main>

            {/* SaveBar: luôn mount — CSS transition handle show/hide */}
            {/* KHÔNG wrap bằng motion.div — transform tạo stacking context */}
            {/* khiến position:fixed không còn relative với viewport */}
            <SaveBar onSave={saveConfig} status={saveStatus} dirty={dirty} />
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { theme, setTheme, toggleTheme } = useTheme();

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <AuthProvider>
        <GuildProvider>
          <DashboardLayout />
        </GuildProvider>
      </AuthProvider>
    </ThemeContext.Provider>
  );
}
