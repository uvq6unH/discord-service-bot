import React, { lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import GuildGuard from '../../shared/navigation/GuildGuard.jsx';

/**
 * Safe Lazy Import with automatic retry & reload on deployment chunk hash mismatch (404)
 */
function safeLazy(importFn) {
  return lazy(() => 
    importFn().catch((err) => {
      const isChunkError = err && (
        err.name === 'ChunkLoadError' ||
        err.message?.includes('Failed to fetch dynamically imported module') ||
        err.message?.includes('Importing a module script failed')
      );

      const hasReloadedKey = 'chunk_reload_' + window.location.pathname;
      const alreadyReloaded = sessionStorage.getItem(hasReloadedKey);

      if (isChunkError && !alreadyReloaded) {
        sessionStorage.setItem(hasReloadedKey, 'true');
        window.location.reload();
        return new Promise(() => {}); // Pause execution while page reloads
      }

      throw err;
    })
  );
}

// Core operations
const OverviewPage = safeLazy(() => import('../../domains/core/pages/Overview.jsx'));
const MembersPage = safeLazy(() => import('../../domains/core/pages/Members.jsx'));
const ModerationPage = safeLazy(() => import('../../domains/core/pages/Moderation.jsx'));
const CommandsPage = safeLazy(() => import('../../domains/core/pages/Commands.jsx'));
const EconomyPage = safeLazy(() => import('../../domains/core/pages/Economy.jsx'));
const AnalyticsPage = safeLazy(() => import('../../domains/core/pages/Analytics.jsx'));
const SystemPage = safeLazy(() => import('../../domains/core/pages/System.jsx'));
const AuditLogsPage = safeLazy(() => import('../../domains/core/pages/AuditLogs.jsx'));

// Riot
const RiotServicesPage = safeLazy(() => import('../../domains/riot/pages/RiotServices.jsx'));
const EsportsServicesPage = safeLazy(() => import('../../domains/riot/pages/EsportsServices.jsx'));

// Music & Voice
const MusicServicesPage = safeLazy(() => import('../../domains/music/pages/MusicServices.jsx'));
const VoiceServicesPage = safeLazy(() => import('../../domains/music/pages/VoiceServices.jsx'));

// Utility & Reminders Domain
const UtilityServicesPage = safeLazy(() => import('../../domains/utility/pages/UtilityServices.jsx'));
const ReminderServicesPage = safeLazy(() => import('../../domains/utility/pages/ReminderServices.jsx'));

// AI
const AiServicesPage = safeLazy(() => import('../../domains/ai/pages/AiServices.jsx'));

// Public documentation pages for Discord verification
const TermsPage = safeLazy(() => import('../../shared/pages/TermsPage.jsx'));
const PrivacyPage = safeLazy(() => import('../../shared/pages/PrivacyPage.jsx'));

export default function AppRoutes() {
  return (
    <Routes>
      {/* Default redirect to overview */}
      <Route path="/"            element={<Navigate to="/overview" replace />} />

      {/* Public Pages */}
      <Route path="/terms"       element={<TermsPage />} />
      <Route path="/privacy"     element={<PrivacyPage />} />

      {/* Guild-Scoped Sub-routes Guarded by GuildGuard */}
      <Route element={<GuildGuard><Outlet /></GuildGuard>}>
        <Route path="/overview"        element={<OverviewPage />} />
        <Route path="/members"         element={<MembersPage />} />
        <Route path="/commands"        element={<CommandsPage />} />
        <Route path="/utilities"       element={<UtilityServicesPage />} />
        <Route path="/audit-logs"      element={<AuditLogsPage />} />
        <Route path="/economy"         element={<EconomyPage />} />
        <Route path="/moderation"      element={<ModerationPage />} />
        <Route path="/analytics"       element={<AnalyticsPage />} />
        <Route path="/system"          element={<SystemPage />} />
        <Route path="/riot"            element={<RiotServicesPage />} />
        <Route path="/esports"         element={<EsportsServicesPage />} />
        <Route path="/music"           element={<MusicServicesPage />} />
        <Route path="/voice"           element={<VoiceServicesPage />} />
        <Route path="/reminders"       element={<ReminderServicesPage />} />
        <Route path="/ai"              element={<AiServicesPage />} />
      </Route>

      {/* Fallback redirect */}
      <Route path="*"            element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}
