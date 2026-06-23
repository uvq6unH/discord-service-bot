import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Core operations
const OverviewPage = lazy(() => import('../../domains/core/pages/Overview.jsx'));
const MembersPage = lazy(() => import('../../domains/core/pages/Members.jsx'));
const ModerationPage = lazy(() => import('../../domains/core/pages/Moderation.jsx'));
const CommandsPage = lazy(() => import('../../domains/core/pages/Commands.jsx'));
const EconomyPage = lazy(() => import('../../domains/core/pages/Economy.jsx'));
const AnalyticsPage = lazy(() => import('../../domains/core/pages/Analytics.jsx'));
const SystemPage = lazy(() => import('../../domains/core/pages/System.jsx'));

// Riot
const RiotServicesPage = lazy(() => import('../../domains/riot/pages/RiotServices.jsx'));

// Music
const MusicServicesPage = lazy(() => import('../../domains/music/pages/MusicServices.jsx'));

// Reminder
const ReminderServicesPage = lazy(() => import('../../domains/reminder/pages/ReminderServices.jsx'));

// AI
const AiServicesPage = lazy(() => import('../../domains/ai/pages/AiServices.jsx'));

export default function AppRoutes() {
  return (
    <Routes>
      {/* Default redirect to overview */}
      <Route path="/"            element={<Navigate to="/overview" replace />} />

      {/* Core Operations */}
      <Route path="/overview"    element={<OverviewPage />} />
      <Route path="/members"     element={<MembersPage />} />
      <Route path="/commands"    element={<CommandsPage />} />
      <Route path="/economy"     element={<EconomyPage />} />
      <Route path="/moderation"  element={<ModerationPage />} />
      <Route path="/analytics"   element={<AnalyticsPage />} />
      <Route path="/system"      element={<SystemPage />} />

      {/* Riot Services */}
      <Route path="/riot"        element={<RiotServicesPage />} />

      {/* Music Services */}
      <Route path="/music"       element={<MusicServicesPage />} />

      {/* Reminder Services */}
      <Route path="/reminders"   element={<ReminderServicesPage />} />

      {/* AI Services */}
      <Route path="/ai"          element={<AiServicesPage />} />

      {/* Fallback redirect */}
      <Route path="*"            element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
