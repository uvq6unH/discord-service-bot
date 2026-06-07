import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { GuildProvider, useGuild } from './contexts/GuildContext.jsx';
import ServerRail from './components/ServerRail.jsx';
import PluginNav from './components/PluginNav.jsx';
import { SaveBar, EmptyState } from './components/ui.jsx';
import OverviewPage from './pages/Overview.jsx';
import MembersPage from './pages/Members.jsx';
import CommandsPage from './pages/Commands.jsx';
import EconomyPage from './pages/Economy.jsx';
import ModerationPage from './pages/Moderation.jsx';
import LolPage from './pages/Lol.jsx';
import { api } from './api.js';

function DashboardLayout() {
  const { user, loading: authLoading } = useAuth();
  const { selectedGuild, dirty, saveConfig, saveStatus } = useGuild();
  const [guilds, setGuilds] = useState([]);
  const [guildsLoading, setGuildsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.guilds()
      .then(setGuilds)
      .catch(console.error)
      .finally(() => setGuildsLoading(false));
  }, [user]);

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      <ServerRail guilds={guilds} loading={guildsLoading} user={user} />

      <div className="main-area">
        {selectedGuild ? (
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
                <Route path="*"            element={<Navigate to="/overview" replace />} />
              </Routes>
            </main>
            {dirty && (
              <SaveBar onSave={saveConfig} status={saveStatus} />
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GuildProvider>
        <DashboardLayout />
      </GuildProvider>
    </AuthProvider>
  );
}
