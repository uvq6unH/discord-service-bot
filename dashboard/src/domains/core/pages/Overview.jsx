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
  const { config, selectedGuild } = useGuild();
  const { status } = useSystem();
  const { t } = useLanguage();

  const bot = status?.bot;
  const stats = status?.stats;
  const online = bot?.online ?? status?.botReady ?? false;

  const fmtUptime = (ms) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const getWelcomeChannelHint = () => {
    if (!config?.welcomeEnabled) return t('DISABLED');
    return config?.welcomeChannelId ? `#${config.welcomeChannelId}` : t('CHƯA CẤU HÌNH');
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
        {/* Panel 1: Member growth */}
        <div className="col-span-6">
          <Panel title={t("MEMBER GROWTH CONFIG")} accent>
            <DataSlab 
              label={t("Welcome System")} 
              value={config?.welcomeEnabled ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("New member greeting broadcast")}
              highlight={config?.welcomeEnabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
            <DataSlab 
              label={t("Welcome Target Channel")} 
              value={getWelcomeChannelHint()} 
              sub={t("Broadcast target room")}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
            <DataSlab 
              label={t("Logging Integration")} 
              value={config?.logChannelId ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Member activity logs target")}
              highlight={!!config?.logChannelId}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
            <DataSlab 
              label={t("Broadcast Announcements")} 
              value={config?.announcementsEnabled ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("System notifications module")}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
          </Panel>
        </div>

        {/* Panel 2: Command activity */}
        <div className="col-span-6">
          <Panel title={t("COMMAND ENGINE STATUS")} accent>
            <DataSlab 
              label={t("Prefix Parameter")} 
              value={config?.prefix ? `"${config.prefix}"` : '"!"'} 
              sub={t("Legacy text command invocation prefix")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
            <DataSlab 
              label={t("Command Module Status")} 
              value={(config?.enabled ?? true) ? t('ACTIVE') : t('INACTIVE')} 
              sub={t("Guild commands routing status")}
              highlight={config?.enabled ?? true}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
          </Panel>
        </div>

        {/* Panel 3: Moderation config */}
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

        {/* Panel 4: Economy config */}
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
