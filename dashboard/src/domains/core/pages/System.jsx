import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useSystem } from '../hooks/useSystem.js';
import { RefreshCw } from 'lucide-react';

export default function SystemPage() {
  const { status, loading, refetch } = useSystem(10000); // Poll every 10s

  if (loading || !status) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        ESTABLISHING ENGINE CONNECTION TELEMETRY...
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
        title="SYSTEM RUNTIME MONITOR"
        subtitle="Real-time PM2 process load, microservices heartbeats, socket latencies, and transaction queues."
        actions={
          <button 
            className="btn btn--secondary" 
            onClick={() => refetch()} 
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <RefreshCw size={12} /> SYNC
          </button>
        }
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Process Load (CPU)" 
          value={bot?.cpu != null ? `${bot.cpu.toFixed(1)}%` : '0.0%'} 
          sub="PM2_ENGINE_LOAD"
        />
        <KpiTile 
          label="Resident Memory" 
          value={bot?.memory ? getMemString(bot.memory) : '—'} 
          sub="RSS_MEM_USAGE"
        />
        <KpiTile 
          label="Gateway latency" 
          value={bot?.ping ? `${bot.ping}ms` : '—'} 
          sub="SHARD_WS_LATENCY"
        />
        <KpiTile 
          label="Redis DB Status" 
          value={status.redisConnected ? 'CONNECTED' : 'OFFLINE'} 
          sub="CACHE_PERSIST_LINK"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Discord Bot Engine telemetry */}
        <div className="col-span-6">
          <Panel title="DISCORD PROCESS BLUEPRINT [PM2_BOT]" accent={botOnline}>
            <DataSlab 
              label="Bot Session Status" 
              value={botOnline ? 'ACTIVE // RUNNING' : 'OFFLINE // TERMINATED'} 
              sub="STATUS_CODE"
              highlight={botOnline}
            />
            <DataSlab 
              label="Process Uptime" 
              value={bot?.uptime ? fmtUptime(bot.uptime) : '—'} 
              sub="ACTIVE_PROCESS_UPTIME"
            />
            <DataSlab 
              label="Command Load (Today)" 
              value={`${stats?.commandsToday ?? 0} EXEC`} 
              sub="DISPATCHED_SIGNALS"
            />
            <DataSlab 
              label="Task Scheduler Queue" 
              value={`${stats?.slashQueueLength ?? 0} JOBS`} 
              sub="REMAINING_BUFFER_JOBS"
            />
          </Panel>
        </div>

        {/* Dashboard node server details */}
        <div className="col-span-6">
          <Panel title="WEB INTERFACE PROCESS [PM2_DASH]" accent>
            <DataSlab 
              label="Node Server Uptime" 
              value={dash?.uptime ? fmtUptime(dash.uptime) : '—'} 
              sub="SERVER_UPTIME_COUNTER"
              highlight
            />
            <DataSlab 
              label="Node Memory (RSS)" 
              value={dash?.memory ? getMemString(dash.memory) : '—'} 
              sub="MEM_RAM_ALLOCATION"
            />
            <DataSlab 
              label="Node CPU load" 
              value={dash?.cpu != null ? `${dash.cpu.toFixed(1)}%` : '0.0%'} 
              sub="CPU_PROCESS_LOAD"
            />
            <DataSlab 
              label="Redis Cache Link" 
              value={status.redisConnected ? 'NOMINAL' : 'LINK_FAILURE'} 
              sub="REDIS_UPSTASH_STATUS"
            />
          </Panel>
        </div>

        {/* External integrations telemetry */}
        <div className="col-span-12">
          <Panel title="INTEGRATIONS & ADAPTERS HEALTH">
            <div className="grid-12" style={{ gap: 'var(--space-3)' }}>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>RIOT API CONNECTIVITY</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.riotApiKeyConfigured ? 'var(--green)' : 'var(--text-3)' }}>
                  {config?.riotApiKeyConfigured ? '>>> KEY_NOMINAL' : '>>> NO_KEY_PROVIDED'}
                </div>
              </div>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>TFT CONFIG STATUS</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.tftApiKeyConfigured ? 'var(--green)' : 'var(--text-3)' }}>
                  {config?.tftApiKeyConfigured ? '>>> KEY_NOMINAL' : '>>> NO_KEY_PROVIDED'}
                </div>
              </div>
              <div className="col-span-4" style={{ border: '1px solid var(--border)', padding: 'var(--space-4)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>LAVALINK NODES ONLINE</span>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: 'var(--space-2)', color: config?.musicEnabled ? 'var(--yellow)' : 'var(--text-3)' }}>
                  {config?.musicEnabled ? '>>> MODULE_STANDBY' : '>>> MODULE_DISABLED'}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
