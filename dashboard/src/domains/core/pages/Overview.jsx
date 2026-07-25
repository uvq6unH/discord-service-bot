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

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // OVERVIEW` : 'OVERVIEW'}
        subtitle={t("Operations center telemetry and community parameters snapshot.")}
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

      {/* 3. Workspace Zone - Asymmetric Grids */}
      <div className="grid-12">
        {/* Panel 1: Master Bot Control */}
        <div className="col-span-12">
          <Panel title={t("BOT MASTER CONTROL ENGINE")} accent>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)' }}>
                  {t("Bot Master Activation Switch")}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                  {t("Enable or disable bot operations completely for this guild")}
                </div>
              </div>

              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={config?.enabled !== false}
                  onChange={(e) => updateConfig && updateConfig({ enabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>
          </Panel>
        </div>

        {/* Panel 2: Member Welcome & Log Settings */}
        <div className="col-span-6">
          <Panel title={t("WELCOME & LOGGING CONFIG")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Welcome Toggle */}
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
                    <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {t("Variables: {user}, {server}, {memberCount}")}
                    </span>
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* Security Log Channel */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
                  {t("Security Logging Channel")}
                </label>
                <select
                  className="form-select"
                  value={config?.logChannelId || ''}
                  onChange={(e) => updateConfig && updateConfig({ logChannelId: e.target.value })}
                >
                  <option value="">-- {t("Select Log Channel")} --</option>
                  {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
                <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {t("Target channel for member audit logs and moderation events")}
                </span>
              </div>

            </div>
          </Panel>
        </div>

        {/* Panel 3: Announcements Settings */}
        <div className="col-span-6">
          <Panel title={t("BROADCAST ANNOUNCEMENTS")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '12px', color: 'var(--text-1)' }}>
                    {t("Announcements System")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {t("Broadcast system announcements to designated channel")}
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

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>{t("Announcement Role Mention")}</label>
                    <input
                      className="form-input"
                      value={config?.announcementMention || ''}
                      onChange={(e) => updateConfig && updateConfig({ announcementMention: e.target.value })}
                      placeholder="@everyone"
                    />
                  </div>
                </div>
              )}

            </div>
          </Panel>
        </div>

        {/* Panel 4: Moderation & Command Status Overview */}
        <div className="col-span-6">
          <Panel title={t("MODERATION CONTROLS")} accent>
            <DataSlab 
              label={t("Auto Moderation")} 
              value={config?.moderation?.enabled ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Automated chat filter state")}
              highlight={config?.moderation?.enabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
            <DataSlab 
              label={t("Anti Spam Protocol")} 
              value={config?.moderation?.antiSpam ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Rate limiting message spikes")}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
            <DataSlab 
              label={t("Anti Link Broadcast")} 
              value={config?.moderation?.antiLink ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Filtering unapproved hyper-links")}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
            <DataSlab 
              label={t("Anti Raid Shield")} 
              value={config?.moderation?.antiRaid ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Guild lockdown operations toggle")}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
          </Panel>
        </div>

        {/* Panel 5: Economy config */}
        <div className="col-span-6">
          <Panel title={t("ECONOMY TELEMETRY")} accent>
            <DataSlab 
              label={t("Economy Ledger Status")} 
              value={config?.economyEnabled ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Global virtual transaction module")}
              highlight={config?.economyEnabled}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("XP Leveling Pipeline")} 
              value={config?.levelsEnabled ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Chat participation score module")}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("Primary Ledger Currency")} 
              value={config?.currencyGoldName ? config.currencyGoldName.toUpperCase() : 'GOLD'} 
              sub={t("Current ledger name token")}
              onClick={() => navigate('/economy', { state: { highlight: 'currency' } })}
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
