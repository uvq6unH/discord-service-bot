import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useSystem } from '../hooks/useSystem.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import LiveConsole from '../components/LiveConsole.jsx';
import UpstashMetrics from '../components/UpstashMetrics.jsx';
import UptimeRobotStatus from '../components/UptimeRobotStatus.jsx';

export default function SystemPage() {
  const { config } = useGuild();
  const { status, loading, refetch } = useSystem(10000); // Poll every 10s
  const { t } = useLanguage();

  if (loading || !status) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("ESTABLISHING ENGINE CONNECTION TELEMETRY...")}
      </div>
    );
  }

  const bot = status.bot;
  const dash = status.dashboard;
  const stats = status.stats;
  const botOnline = bot?.online ?? status.botReady ?? false;

  const fmtUptime = (ms) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
  };

  const getMemString = (usedBytes) => {
    if (!usedBytes) return '—';
    const mb = usedBytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("SYSTEM RUNTIME MONITOR")}
        subtitle={t("Real-time process load, microservices heartbeats, socket latencies, and transaction queues.")}
        actions={
          <button 
            className="btn btn--secondary" 
            onClick={() => refetch()} 
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <RefreshCw size={12} /> {t("SYNC")}
          </button>
        }
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Process Load (CPU)")} 
          value={bot?.cpu != null ? `${bot.cpu.toFixed(1)}%` : '0.0%'} 
          sub="ENGINE_LOAD"
        />
        <KpiTile 
          label={t("Resident Memory")} 
          value={bot?.memory ? getMemString(bot.memory) : '—'} 
          sub="RSS_MEM_USAGE"
        />
        <KpiTile 
          label={t("Gateway latency")} 
          value={bot?.ping ? `${bot.ping}ms` : '—'} 
          sub="SHARD_WS_LATENCY"
        />
        <KpiTile 
          label={t("Redis DB Status")} 
          value={status.redisConnected ? t('CONNECTED') : t('OFFLINE')} 
          sub="CACHE_PERSIST_LINK"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Discord Bot Engine telemetry */}
        <div className="col-span-6">
          <Panel title={t("DISCORD PROCESS BLUEPRINT [BOT_SERVICE]")} accent={botOnline}>
            <DataSlab 
              label={t("Bot Session Status")} 
              value={botOnline ? t('ACTIVE // RUNNING') : t('OFFLINE // TERMINATED')} 
              sub="STATUS_CODE"
              highlight={botOnline}
            />
            <DataSlab 
              label={t("Process Uptime")} 
              value={bot?.uptime ? fmtUptime(bot.uptime) : '—'} 
              sub="ACTIVE_PROCESS_UPTIME"
            />
            <DataSlab 
              label={t("Command Load (Today)")} 
              value={`${stats?.commandsToday ?? 0} EXEC`} 
              sub="DISPATCHED_SIGNALS"
            />
            <DataSlab 
              label={t("Task Scheduler Queue")} 
              value={`${stats?.slashQueueLength ?? 0} JOBS`} 
              sub="REMAINING_BUFFER_JOBS"
            />
          </Panel>
        </div>

        {/* Dashboard node server details */}
        <div className="col-span-6">
          <Panel title={t("WEB INTERFACE PROCESS [DASH_SERVICE]")} accent>
            <DataSlab 
              label={t("Node Server Uptime")} 
              value={dash?.uptime ? fmtUptime(dash.uptime) : '—'} 
              sub="SERVER_UPTIME_COUNTER"
              highlight
            />
            <DataSlab 
              label={t("Node Memory (RSS)")} 
              value={dash?.memory ? getMemString(dash.memory) : '—'} 
              sub="MEM_RAM_ALLOCATION"
            />
            <DataSlab 
              label={t("Node CPU load")} 
              value={dash?.cpu != null ? `${dash.cpu.toFixed(1)}%` : '0.0%'} 
              sub="CPU_PROCESS_LOAD"
            />
            <DataSlab 
              label={t("Redis Cache Link")} 
              value={status.redisConnected ? t('NOMINAL') : t('LINK_FAILURE')} 
              sub="REDIS_UPSTASH_STATUS"
            />
          </Panel>
        </div>

        {/* Upstash Cloud Redis Metrics */}
        <div className="col-span-12">
          <UpstashMetrics upstash={status.upstash} redisConnected={status.redisConnected} />
        </div>

        {/* UptimeRobot 24/7 Keep-Alive Monitors */}
        <div className="col-span-12">
          <UptimeRobotStatus botOnline={status.bot?.online ?? status.botReady} />
        </div>

        {/* External integrations telemetry */}
        <div className="col-span-12">
          <Panel title={t("INTEGRATIONS & ADAPTERS HEALTH")}>
            <div className="grid-12" style={{ gap: 'var(--space-3)' }}>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>{t("RIOT API CONNECTIVITY")}</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.riotApiKeyConfigured ? 'var(--green)' : 'var(--text-3)' }}>
                  &gt;&gt;&gt; {t(config?.riotApiKeyConfigured ? 'KEY_NOMINAL' : 'NO_KEY_PROVIDED')}
                </div>
              </div>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>{t("TFT CONFIG STATUS")}</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.tftApiKeyConfigured ? 'var(--green)' : 'var(--text-3)' }}>
                  &gt;&gt;&gt; {t(config?.tftApiKeyConfigured ? 'KEY_NOMINAL' : 'NO_KEY_PROVIDED')}
                </div>
              </div>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>{t("LAVALINK NODES ONLINE")}</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.musicEnabled ? 'var(--yellow)' : 'var(--text-3)' }}>
                  &gt;&gt;&gt; {t(config?.musicEnabled ? 'MODULE_STANDBY' : 'MODULE_DISABLED')}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Live Engine Console Terminal */}
        <div className="col-span-12">
          <LiveConsole />
        </div>
      </div>
    </Workspace>
  );
}
