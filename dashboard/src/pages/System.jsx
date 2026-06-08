import React, { useEffect, useState, useCallback } from 'react';
import { SectionCard, Spinner } from '../components/ui.jsx';
import { api } from '../api.js';

function fmtUptime(s) {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

function fmtAge(ms) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s trước`;
  return `${Math.floor(s / 60)}m ${s % 60}s trước`;
}

function StatusDot({ online }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8, borderRadius: '50%',
      background: online ? 'var(--color-success)' : 'var(--color-danger)',
      marginRight: 6, flexShrink: 0,
    }} />
  );
}

function KV({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>{label}</span>
      <span style={{
        fontWeight: 600, fontSize: 13,
        color: highlight === 'danger' ? 'var(--color-danger)'
             : highlight === 'warn'  ? 'var(--color-warning)'
             : 'var(--color-text)',
      }}>{value}</span>
    </div>
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.status();
      setStatus(data);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[System] Failed to load status:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="page-loading"><Spinner /></div>;

  const bot = status?.bot;
  const dash = status?.dashboard;
  const stats = status?.stats;
  const botOnline = bot?.online ?? status?.botReady ?? false;
  const queueLen = stats?.slashQueueLength ?? 0;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Hệ thống</h1>
        {lastRefresh && (
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            cập nhật lúc {lastRefresh.toLocaleTimeString('vi-VN')}
          </span>
        )}
      </div>
      <p className="page-subtitle">Trạng thái thời gian thực của bot và dashboard</p>

      <div className="cards-grid">

        {/* ── Services ── */}
        <SectionCard title="Dịch vụ" icon="ti-server">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>

            {/* Bot */}
            <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <StatusDot online={botOnline} />
                <span style={{ fontWeight: 600 }}>Bot</span>
                <span style={{
                  marginLeft: 8, fontSize: 11, padding: '2px 8px',
                  borderRadius: 99, fontWeight: 600,
                  background: botOnline ? 'rgba(59,165,92,.2)' : 'rgba(237,66,69,.2)',
                  color: botOnline ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                  {botOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <KV label="Uptime"        value={fmtUptime(bot?.uptimeS)} />
              <KV label="Guilds"        value={bot?.guilds ?? status?.guildCount ?? '—'} />
              <KV label="Heartbeat"     value={fmtAge(bot?.lastSeenMs)} />
            </div>

            {/* Dashboard */}
            <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <StatusDot online={!!dash} />
                <span style={{ fontWeight: 600 }}>Dashboard</span>
                <span style={{
                  marginLeft: 8, fontSize: 11, padding: '2px 8px',
                  borderRadius: 99, fontWeight: 600,
                  background: dash ? 'rgba(59,165,92,.2)' : 'rgba(237,66,69,.2)',
                  color: dash ? 'var(--color-success)' : 'var(--color-danger)',
                }}>
                  {dash ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <KV label="Uptime" value={fmtUptime(dash?.uptimeS)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Queue & Cache ── */}
        <SectionCard title="Queue & Cache" icon="ti-database">
          <KV
            label="Slash sync queue"
            value={queueLen === 0 ? '0 (sạch)' : `${queueLen} job đang chờ`}
            highlight={queueLen > 5 ? 'danger' : queueLen > 0 ? 'warn' : null}
          />
          <KV label="Guild được cấu hình" value={status?.configuredGuilds ?? '—'} />
        </SectionCard>

        {/* ── Stats counters ── */}
        <SectionCard title="Thống kê hoạt động" icon="ti-chart-bar">
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
            Tích luỹ từ lần khởi động — reset khi Redis xoá key.
          </p>
          <KV label="Slash sync đã xử lý" value={stats?.slashSyncProcessed ?? '—'} />
          <KV label="Guild cache refresh"  value={stats?.guildCacheRefresh  ?? '—'} />
          <KV
            label="Discord errors"
            value={stats?.discordErrors ?? '—'}
            highlight={(stats?.discordErrors ?? 0) > 10 ? 'danger' : (stats?.discordErrors ?? 0) > 0 ? 'warn' : null}
          />
        </SectionCard>

      </div>
    </div>
  );
}