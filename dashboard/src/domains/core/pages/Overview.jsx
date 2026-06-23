import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useSystem } from '../hooks/useSystem.js';

export default function OverviewPage() {
  const { config, selectedGuild } = useGuild();
  const { status } = useSystem();

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
    if (!config?.welcomeEnabled) return 'DISABLED';
    return config?.welcomeChannelId ? `#${config.welcomeChannelId}` : 'CHƯA CẤU HÌNH';
  };

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // OVERVIEW` : 'OVERVIEW'}
        subtitle="Operations center telemetry and community parameters snapshot."
      />

      {/* 2. Status Zone (KPIs) */}
      <StatusZone>
        <KpiTile 
          label="Server Health" 
          value={online ? 'ONLINE' : 'OFFLINE'} 
          sub={online ? 'TELEMETRY STATUS NOMINAL' : 'TELEMETRY OFFLINE'}
        />
        <KpiTile 
          label="Uptime" 
          value={bot?.uptime ? fmtUptime(bot.uptime) : '—'} 
          sub="SYS_UPTIME_COUNTER"
        />
        <KpiTile 
          label="Commands Run" 
          value={stats?.commandsToday ?? '—'} 
          sub="RUN_TODAY"
        />
        <KpiTile 
          label="Ping Latency" 
          value={bot?.ping ? `${bot.ping}ms` : '—'} 
          sub="GATEWAY_LATENCY"
        />
      </StatusZone>

      {/* 3. Workspace Zone - Asymmetric Grids */}
      <div className="grid-12">
        {/* Panel 1: Member growth */}
        <div className="col-span-6">
          <Panel title="MEMBER GROWTH CONFIG" accent>
            <DataSlab 
              label="Welcome System" 
              value={config?.welcomeEnabled ? 'ACTIVE' : 'INACTIVE'} 
              sub="New member greeting broadcast"
              highlight={config?.welcomeEnabled}
            />
            <DataSlab 
              label="Welcome Target Channel" 
              value={getWelcomeChannelHint()} 
              sub="Broadcast target room"
            />
            <DataSlab 
              label="Logging Integration" 
              value={config?.logChannelId ? 'ACTIVE' : 'INACTIVE'} 
              sub="Member activity logs target"
              highlight={!!config?.logChannelId}
            />
            <DataSlab 
              label="Broadcast Announcements" 
              value={config?.announcementsEnabled ? 'ACTIVE' : 'INACTIVE'} 
              sub="System notifications module"
            />
          </Panel>
        </div>

        {/* Panel 2: Command activity */}
        <div className="col-span-6">
          <Panel title="COMMAND ENGINE STATUS" accent>
            <DataSlab 
              label="Prefix Parameter" 
              value={config?.prefix ? `"${config.prefix}"` : '"!"'} 
              sub="Legacy text command invocation prefix"
            />
            <DataSlab 
              label="Command Module Status" 
              value={(config?.enabled ?? true) ? 'ACTIVE' : 'INACTIVE'} 
              sub="Guild commands routing status"
              highlight={config?.enabled ?? true}
            />
          </Panel>
        </div>

        {/* Panel 3: Moderation config */}
        <div className="col-span-6">
          <Panel title="MODERATION CONTROLS" accent>
            <DataSlab 
              label="Auto Moderation" 
              value={config?.moderation?.enabled ? 'ACTIVE' : 'INACTIVE'} 
              sub="Automated chat filter state"
              highlight={config?.moderation?.enabled}
            />
            <DataSlab 
              label="Anti Spam Protocol" 
              value={config?.moderation?.antiSpam ? 'ACTIVE' : 'INACTIVE'} 
              sub="Rate limiting message spikes"
            />
            <DataSlab 
              label="Anti Link Broadcast" 
              value={config?.moderation?.antiLink ? 'ACTIVE' : 'INACTIVE'} 
              sub="Filtering unapproved hyper-links"
            />
            <DataSlab 
              label="Anti Raid Shield" 
              value={config?.moderation?.antiRaid ? 'ACTIVE' : 'INACTIVE'} 
              sub="Guild lockdown operations toggle"
            />
          </Panel>
        </div>

        {/* Panel 4: Economy config */}
        <div className="col-span-6">
          <Panel title="ECONOMY TELEMETRY" accent>
            <DataSlab 
              label="Economy Ledger Status" 
              value={config?.economy?.enabled ? 'ACTIVE' : 'INACTIVE'} 
              sub="Global virtual transaction module"
              highlight={config?.economy?.enabled}
            />
            <DataSlab 
              label="XP Leveling Pipeline" 
              value={config?.economy?.levelingEnabled ? 'ACTIVE' : 'INACTIVE'} 
              sub="Chat participation score module"
            />
            <DataSlab 
              label="Primary Ledger Currency" 
              value={config?.economy?.currencyName ? config.economy.currencyName.toUpperCase() : 'COINS'} 
              sub="Current ledger name token"
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
