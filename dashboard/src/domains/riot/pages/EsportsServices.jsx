import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useRiot } from '../hooks/useRiot.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { apiFetch } from '../../../api.js';
import { Trophy, Tv, BellRing, ShieldCheck, Send } from 'lucide-react';

const LEAGUES = [
  { key: 'lck', name: 'LCK Korea', icon: '🇰🇷' },
  { key: 'lcp', name: 'LCP Pacific', icon: '🌏' },
  { key: 'lpl', name: 'LPL China', icon: '🇨🇳' },
  { key: 'lec', name: 'LEC Europe', icon: '🇪🇺' },
  { key: 'lcs', name: 'LCS Americas', icon: '🇺🇸' },
  { key: 'worlds', name: 'Worlds Championship', icon: '🏆' },
  { key: 'msi', name: 'MSI Mid-Season', icon: '🥇' },
  { key: 'first_stand', name: 'First Stand', icon: '🥊' },
  { key: 'ewc', name: 'Esports World Cup', icon: '🇸🇦' }
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export default function EsportsServicesPage() {
  const { config, loading, updateConfig } = useRiot();
  const { guildData, selectedGuild } = useGuild();
  const { t } = useLanguage();

  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState(null);

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
  const selectedLeagues = Array.isArray(config.esportsLeagues)
    ? config.esportsLeagues
    : ['lck', 'lcp', 'worlds', 'msi', 'lpl', 'lec', 'lcs'];
  const dailyTime = config.esportsDailyTime || '08:00';
  const preMatchAlert = config.esportsPreMatchAlert !== false;
  const matchResultAlert = config.esportsMatchResultAlert !== false;
  const leagueRoles = config.esportsLeagueRoles || {};

  const handleLeagueToggle = (leagueKey) => {
    const nextLeagues = selectedLeagues.includes(leagueKey)
      ? selectedLeagues.filter(k => k !== leagueKey)
      : [...selectedLeagues, leagueKey];
    updateConfig({ esportsLeagues: nextLeagues });
  };

  const handleRoleChange = (leagueKey, roleId) => {
    updateConfig({
      esportsLeagueRoles: {
        ...leagueRoles,
        [leagueKey]: roleId
      }
    });
  };

  const handleTestNotify = async () => {
    if (!selectedChannelId) return;
    setTesting(true);
    setTestStatus(null);
    try {
      const selectedGuildId = localStorage.getItem('selectedGuildId') || '';
      const data = await apiFetch(`/api/esports/test-notify?guildId=${selectedGuildId}`, {
        method: 'POST'
      });
      setTestStatus({ success: true, message: data.message });
    } catch (err) {
      setTestStatus({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  return (
    <Workspace>
      <HeaderZone
        title={serverName ? `${serverName} // ESPORTS TOURNAMENTS` : 'ESPORTS TOURNAMENTS'}
        subtitle={t("Automated Esports Live Match Tracker, Daily Schedule Broadcasts & 15-Minute Pre-match Alerts")}
      />

      <StatusZone>
        <KpiTile
          label={t("Tracked Leagues")}
          value={`${selectedLeagues.length} LEAGUES`}
          sub={selectedLeagues.length > 0 ? selectedLeagues.map(l => l.toUpperCase()).join(', ') : 'NONE'}
        />
        <KpiTile
          label={t("Daily Broadcast Time")}
          value={`📅 ${dailyTime}`}
          sub={t("DAILY_SCHEDULE_CARD")}
        />
        <KpiTile
          label={t("15m Pre-Match Alert")}
          value={preMatchAlert ? t("ACTIVE") : t("DISABLED")}
          sub={preMatchAlert ? t("15M_PRE_MATCH_ON") : t("STANDBY")}
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
                justifyContent: 'space-between',
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

              {/* Grid 2 Column: Channel & Daily Broadcast Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                {/* Select Notification Channel */}
                <div style={{
                  padding: 'var(--space-4)',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'var(--text-1)'
                    }}>
                      {t("Target Notification Text Channel")}
                    </label>

                    <button
                      type="button"
                      onClick={handleTestNotify}
                      disabled={testing || !selectedChannelId}
                      style={{
                        padding: 'var(--space-1) var(--space-2-5)',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--accent)',
                        background: testing ? 'var(--surface-2)' : 'var(--accent-dim)',
                        color: 'var(--text-1)',
                        cursor: selectedChannelId ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: selectedChannelId ? 1 : 0.5
                      }}
                    >
                      <Send size={10} />
                      {testing ? '⚡ SENDING...' : '🧪 TEST NOTIFY'}
                    </button>
                  </div>

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

                  {testStatus && (
                    <div style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 'var(--space-2)',
                      color: testStatus.success ? 'var(--green)' : 'var(--red)'
                    }}>
                      {testStatus.success ? '✔ ' : '✖ '}{testStatus.message}
                    </div>
                  )}
                </div>

                {/* Daily Schedule Broadcast Time Selector */}
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
                    {t("Daily Schedule Broadcast Time")}
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
                    value={dailyTime}
                    onChange={(e) => updateConfig({ esportsDailyTime: e.target.value })}
                  >
                    {TIME_OPTIONS.map(time => (
                      <option key={time} value={time}>⏰ {time}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 15-Minute Pre-Match Live Alert */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
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
                    <Tv size={16} color="var(--accent)" />
                    {t("15-Minute Pre-Match Live Alert")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                    {t("Automatically post a high-priority alert 15 minutes before any scheduled match begins")}
                  </div>
                </div>

                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={preMatchAlert}
                    onChange={(e) => updateConfig({ esportsPreMatchAlert: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {/* Automated Match Results Broadcast */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
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
                    <Trophy size={16} color="var(--green)" />
                    {t("Automated Match Results Broadcast")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                    {t("Automatically post official match scores and winner alerts as soon as matches complete")}
                  </div>
                </div>

                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={matchResultAlert}
                    onChange={(e) => updateConfig({ esportsMatchResultAlert: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
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

              {/* League Specific Ping Roles */}
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
                  marginBottom: 'var(--space-1)',
                  color: 'var(--text-1)'
                }}>
                  {t("League Mention Roles (15m Pre-match Ping)")}
                </label>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: 'var(--space-3)' }}>
                  {t("Ping specific Discord roles when a match for that league starts in 15 minutes (Leave empty for no ping)")}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 'var(--space-3)'
                }}>
                  {LEAGUES.filter(l => selectedLeagues.includes(l.key)).map(league => {
                    const currentRoleId = leagueRoles[league.key] || '';
                    return (
                      <div key={league.key} style={{ background: 'var(--surface-0)', padding: 'var(--space-3)', border: '1px solid var(--border)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-1)', marginBottom: 'var(--space-1-5)' }}>
                          {league.icon} {league.name} Role
                        </div>
                        <select
                          className="form-input"
                          style={{ width: '100%', fontSize: '11px', fontFamily: 'var(--font-mono)', padding: 'var(--space-1-5)' }}
                          value={currentRoleId}
                          onChange={(e) => handleRoleChange(league.key, e.target.value)}
                        >
                          <option value="">-- {t("No Mention")} --</option>
                          {(guildData?.roles ?? []).filter(r => r.name !== '@everyone').map(r => (
                            <option key={r.id} value={r.id}>@{r.name}</option>
                          ))}
                        </select>
                      </div>
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
              sub={t("Real-time Schedule • Daily Summaries • 15m Pre-Match Alerts")}
              highlight
            />
            <DataSlab
              label={t("Esports Broadcast Manager")}
              value={t("Dashboard Automated Pipeline")}
              sub={t("Multi-League Daily Summaries & Live Pre-Match Broadcasts")}
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
