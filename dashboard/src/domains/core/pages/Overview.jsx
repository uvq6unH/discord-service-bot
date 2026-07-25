import React from 'react';
import { useNavigate } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useSystem } from '../hooks/useSystem.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { config, selectedGuild, updateConfig, guildData } = useGuild();
  const { status } = useSystem();
  const { t } = useLanguage();

  const bot = status?.bot;
  const stats = status?.stats;
  const online = bot?.online ?? status?.botReady ?? false;
  const textChannels = (guildData?.channels || []).filter(c => c.type === 0);

  const fmtUptime = (ms) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const isBotEnabled = config?.enabled !== false;

  return (
    <Workspace>
      {/* 1. Header Zone with Master Switch Action */}
      <HeaderZone
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // OVERVIEW` : 'OVERVIEW'}
        subtitle={t("Operations center telemetry and community parameters snapshot.")}
        actions={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: '4px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold', color: isBotEnabled ? 'var(--green)' : 'var(--red)' }}>
                {isBotEnabled ? t("● BOT ACTIVATED") : t("○ BOT DEACTIVATED")}
              </span>
              <span style={{ fontSize: '9px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {t("Guild Master Switch")}
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                className="toggle-switch__input"
                checked={isBotEnabled}
                onChange={(e) => updateConfig && updateConfig({ enabled: e.target.checked })}
              />
              <div className="toggle-switch__track">
                <div className="toggle-switch__thumb" />
              </div>
            </label>
          </div>
        }
      />

      {/* 2. Status Zone (KPIs) */}
      <StatusZone>
        <KpiTile 
          label={t("Server Health")} 
          value={online ? t('ONLINE') : t('OFFLINE')} 
          sub={online ? t('TELEMETRY STATUS NOMINAL') : t('TELEMETRY OFFLINE')}
        />
        <KpiTile 
          label={t("Uptime")} 
          value={bot?.uptime ? fmtUptime(bot.uptime) : '—'} 
          sub={t("SYS_UPTIME_COUNTER")}
        />
        <KpiTile 
          label={t("Commands Run")} 
          value={stats?.commandsToday ?? '—'} 
          sub={t("RUN_TODAY")}
        />
        <KpiTile 
          label={t("Ping Latency")} 
          value={bot?.ping ? `${bot.ping}ms` : '—'} 
          sub={t("GATEWAY_LATENCY")}
        />
      </StatusZone>

      {/* 3. Navigation & Core Modules Directory Grid */}
      <div className="grid-12">
        {/* Panel 1: Welcome & Announcement Quick Settings */}
        <div className="col-span-6">
          <Panel title={t("WELCOME & ANNOUNCEMENTS")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Welcome Toggle & Setup */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '12px', color: 'var(--text-1)' }}>
                    {t("Welcome Greeting System")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {t("Send a greeting message when new members join")}
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={Boolean(config?.welcomeEnabled)}
                    onChange={(e) => updateConfig && updateConfig({ welcomeEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {config?.welcomeEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--accent)' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>{t("Welcome Target Channel")}</label>
                    <select
                      className="form-select"
                      value={config?.welcomeChannelId || ''}
                      onChange={(e) => updateConfig && updateConfig({ welcomeChannelId: e.target.value })}
                    >
                      <option value="">-- {t("Select Channel")} --</option>
                      {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>{t("Welcome Message Template")}</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={config?.welcomeMessage || ''}
                      onChange={(e) => updateConfig && updateConfig({ welcomeMessage: e.target.value })}
                      placeholder="Welcome {user} to {server}!"
                    />
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* Announcements Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '12px', color: 'var(--text-1)' }}>
                    {t("Announcements System")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {t("Broadcast system notifications to channel")}
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={Boolean(config?.announcementsEnabled)}
                    onChange={(e) => updateConfig && updateConfig({ announcementsEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {config?.announcementsEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--accent)' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>{t("Announcement Target Channel")}</label>
                    <select
                      className="form-select"
                      value={config?.announcementChannelId || ''}
                      onChange={(e) => updateConfig && updateConfig({ announcementChannelId: e.target.value })}
                    >
                      <option value="">-- {t("Select Channel")} --</option>
                      {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

            </div>
          </Panel>
        </div>

        {/* Panel 2: Core Operations Navigation Hub */}
        <div className="col-span-6">
          <Panel title={t("CORE MODULES DIRECTORY")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              
              <DataSlab 
                label={t("Moderation & Security")} 
                value={config?.moderation?.enabled ? t('ACTIVE') : t('STANDBY')} 
                sub={t("AutoMod, Anti-Spam, Anti-Link, Anti-Raid & Tickets")}
                highlight={config?.moderation?.enabled}
                onClick={() => navigate('/moderation')}
              />

              <DataSlab 
                label={t("Utility Services")} 
                value={t('CONFIGURE')} 
                sub={t("Translation, Duolingo, Mention React, AutoReply & Custom Responders")}
                onClick={() => navigate('/utilities')}
              />

              <DataSlab 
                label={t("Commands Gateway")} 
                value={t('CONFIGURE')} 
                sub={t("Core console system command routing & permissions")}
                onClick={() => navigate('/commands')}
              />

              <DataSlab 
                label={t("Audit Logs & Security Channel")} 
                value={config?.logChannelId ? t('LOGGING_ACTIVE') : t('LOGGING_UNSET')} 
                sub={t("System audit trail & security log channel configuration")}
                highlight={!!config?.logChannelId}
                onClick={() => navigate('/audit-logs')}
              />

              <DataSlab 
                label={t("Economy & XP Leveling")} 
                value={config?.economyEnabled ? t('ACTIVE') : t('STANDBY')} 
                sub={t("Virtual currency ledger, XP scores & mini-games")}
                highlight={config?.economyEnabled}
                onClick={() => navigate('/economy')}
              />

              <DataSlab 
                label={t("Member Directory")} 
                value={t('VIEW_MEMBERS')} 
                sub={t("Guild member list, roles & moderation actions")}
                onClick={() => navigate('/members')}
              />

              <DataSlab 
                label={t("Analytics & Telemetry")} 
                value={t('VIEW_METRICS')} 
                sub={t("Command usage statistics & engagement charts")}
                onClick={() => navigate('/analytics')}
              />

              <DataSlab 
                label={t("System & Infrastructure")} 
                value={t('VIEW_SYSTEM')} 
                sub={t("Bot process health, uptime & environment status")}
                onClick={() => navigate('/system')}
              />

            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
