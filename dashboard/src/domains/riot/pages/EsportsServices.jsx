import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useRiot } from '../hooks/useRiot.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { Trophy, Tv, BellRing, ShieldCheck } from 'lucide-react';

const LEAGUES = [
  { key: 'lck', name: 'LCK Korea', icon: '🇰🇷' },
  { key: 'vcs', name: 'VCS Việt Nam', icon: '🇻🇳' },
  { key: 'lpl', name: 'LPL China', icon: '🇨🇳' },
  { key: 'lec', name: 'LEC Europe', icon: '🇪🇺' },
  { key: 'lcs', name: 'LCS Americas', icon: '🇺🇸' },
  { key: 'worlds', name: 'Worlds Championship', icon: '🏆' },
  { key: 'msi', name: 'MSI Mid-Season', icon: '🥇' }
];

export default function EsportsServicesPage() {
  const { config, loading, updateConfig } = useRiot();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  const channels = guildData?.channels ?? [];

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING ESPORTS OPERATIONS CONSOLE...")}
      </div>
    );
  }

  const isEnabled = Boolean(config.esportsNotifyEnabled);
  const selectedChannelId = config.esportsChannelId || '';
  const selectedLeagues = config.esportsLeagues ?? ['lck', 'vcs', 'worlds'];

  const handleLeagueToggle = (leagueKey) => {
    const nextLeagues = selectedLeagues.includes(leagueKey)
      ? selectedLeagues.filter(k => k !== leagueKey)
      : [...selectedLeagues, leagueKey];
    updateConfig({ esportsLeagues: nextLeagues });
  };

  return (
    <Workspace>
      <HeaderZone
        title={t("ESPORTS TOURNAMENTS CONSOLE")}
        subtitle={t("Automated Esports Live Match Tracker, Match Schedule Feeds & Multi-league Notifications")}
      />

      <StatusZone>
        <KpiTile
          label={t("Tracked Leagues")}
          value={`${selectedLeagues.length} LEAGUES`}
          sub={t("LCK, VCS, WORLDS, LPL")}
        />
        <KpiTile
          label={t("Live Notification Pipeline")}
          value={isEnabled ? t("ACTIVE") : t("DISABLED")}
          sub={isEnabled ? t("AUTO_BROADCAST_ON") : t("STANDBY_MODE")}
        />
        <KpiTile
          label={t("Broadcast Target Channel")}
          value={selectedChannelId ? `#${channels.find(c => c.id === selectedChannelId)?.name ?? 'selected'}` : t("UNCONFIGURED")}
          sub={t("DISCORD_TEXT_CHANNEL")}
        />
      </StatusZone>

      <div className="grid-12">
        {/* Main Settings Panel */}
        <div className="col-span-12">
          <Panel title={t("AUTOMATED LIVE MATCH BROADCASTER")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              
              {/* Toggle Broadcaster */}
              <div style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)'
              }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    color: 'var(--text-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                  }}>
                    <BellRing size={16} color="var(--accent)" />
                    {t("Automated Live Match Notifications")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                    {t("Automatically post live announcements when major esports matches go live")}
                  </div>
                </div>

                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={isEnabled}
                    onChange={(e) => updateConfig({ esportsNotifyEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {/* Select Notification Channel */}
              <div style={{
                padding: 'var(--space-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)'
              }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginBottom: 'var(--space-2)',
                  color: 'var(--text-1)'
                }}>
                  {t("Target Notification Text Channel")}
                </label>
                <select
                  className="form-input"
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    padding: 'var(--space-3)',
                    background: 'var(--surface-0)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)'
                  }}
                  value={selectedChannelId}
                  onChange={(e) => updateConfig({ esportsChannelId: e.target.value })}
                >
                  <option value="">-- {t("Select Channel")} --</option>
                  {(channels || []).filter(c => c.type === 0 || c.type === 5).map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>

              {/* League Selector Grid */}
              <div style={{
                padding: 'var(--space-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)'
              }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginBottom: 'var(--space-3)',
                  color: 'var(--text-1)'
                }}>
                  {t("Tracked Esports Leagues")}
                </label>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 'var(--space-3)'
                }}>
                  {LEAGUES.map(league => {
                    const active = selectedLeagues.includes(league.key);
                    return (
                      <button
                        key={league.key}
                        type="button"
                        onClick={() => handleLeagueToggle(league.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          padding: 'var(--space-3)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          border: '1px solid',
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                          background: active ? 'var(--accent-dim)' : 'var(--surface-0)',
                          color: active ? 'var(--text-1)' : 'var(--text-3)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>{league.icon}</span>
                        <span>{league.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </Panel>
        </div>

        {/* Live Match Preview Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("ESPORTS TELEMETRY PIPELINE PREVIEW")} accent>
            <DataSlab
              label={t("Official Riot Esports API")}
              value={t("CONNECTED (esports-api.lolesports.com)")}
              sub={t("15m Cache TTL • Real-time BO3/BO5 Parsing")}
              highlight
            />
            <DataSlab
              label={t("Available Slash Commands")}
              value="/esports [league], /lck, /vcs"
              sub={t("Interactive Dropdown Buttons Active")}
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
