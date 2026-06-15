import React, { useEffect, useState, useCallback } from 'react';
import { Server, Database, Cpu, Activity, RefreshCw, Wifi, WifiOff, Clock, Hash } from 'lucide-react';
import { Spinner } from '../../../components/ui.jsx';
import { api } from '../../../api.js';

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
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── ServiceBlock — "telemetry panel" per service ───────────────────────────
function ServiceBlock({ name, online, rows, accent }) {
  const color = online ? 'var(--green)' : 'var(--red)';
  const dimColor = online ? 'var(--green-dim)' : 'var(--red-dim)';
  const borderColor = online ? 'rgba(34,197,94,.18)' : 'rgba(239,68,68,.18)';

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: `1px solid var(--border)`,
      borderLeft: `2px solid ${color}`,
      borderRadius: 'var(--r3)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-3)',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color,
          boxShadow: online ? `0 0 6px ${color}` : 'none',
          flexShrink: 0,
          animation: online ? 'pulse-dot 2.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '.02em' }}>
          {name}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '1px 6px', borderRadius: 3,
          background: dimColor,
          color,
          border: `1px solid ${borderColor}`,
        }}>
          {online ? 'LIVE' : 'DOWN'}
        </span>
      </div>

      {/* Data rows */}
      <div style={{ padding: '6px 0' }}>
        {rows.map(({ label, value, highlight }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 14px',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '.02em', fontFamily: 'var(--font-mono)' }}>{label}</span>
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: highlight === 'danger' ? 'var(--red)'
                   : highlight === 'warn'   ? 'var(--yellow)'
                   : 'var(--text-1)',
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MetricCell — command-center tile ──────────────────────────────────────
function MetricCell({ label, value, icon: Icon, highlight }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r3)',
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} strokeWidth={1.75} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '.03em' }}>{label}</span>
      </div>
      <span style={{
        fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)',
        letterSpacing: '-.04em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: highlight === 'danger' ? 'var(--red)'
             : highlight === 'warn'   ? 'var(--yellow)'
             : 'var(--text-1)',
      }}>
        {value}
      </span>
    </div>
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await api.status();
      setStatus(data);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[System] Failed to load status:', e.message);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(false), 15_000);
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
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="page-header">
        <div className="page-header-row">
          <h1 className="page-title">Operations</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginLeft: 'auto' }}>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => load(true)}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={12} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} strokeWidth={2} />
              Refresh
            </button>
          </div>
        </div>
        <p className="page-subtitle">Trạng thái thời gian thực — tự động cập nhật mỗi 15 giây</p>
      </div>

      {/* ── Services — side by side, not cards ── */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' }}>
        <ServiceBlock
          name="BOT"
          online={botOnline}
          rows={[
            { label: 'UPTIME', value: fmtUptime(bot?.uptimeS) },
            { label: 'GUILDS', value: bot?.guilds ?? status?.guildCount ?? '—' },
            { label: 'HEARTBEAT', value: fmtAge(bot?.lastSeenMs) },
            ...(bot?.commit ? [{ label: 'COMMIT', value: bot.commit.slice(0, 7) }] : []),
          ]}
        />
        <ServiceBlock
          name="DASHBOARD"
          online={!!dash}
          rows={[
            { label: 'UPTIME', value: fmtUptime(dash?.uptimeS) },
            ...(dash?.commit ? [{ label: 'COMMIT', value: dash.commit.slice(0, 7) }] : []),
          ]}
        />
      </section>

      {/* ── Metrics grid — command center tiles ── */}
      <section>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
          color: 'var(--text-3)', marginBottom: 'var(--s3)',
          fontFamily: 'var(--font-mono)',
        }}>
          Metrics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s3)' }}>
          <MetricCell
            label="SLASH QUEUE"
            value={queueLen}
            icon={Hash}
            highlight={queueLen > 5 ? 'danger' : queueLen > 0 ? 'warn' : null}
          />
          <MetricCell
            label="SYNC PROCESSED"
            value={stats?.slashSyncProcessed ?? '—'}
            icon={Activity}
          />
          <MetricCell
            label="CACHE REFRESH"
            value={stats?.guildCacheRefresh ?? '—'}
            icon={Database}
          />
          <MetricCell
            label="CONFIGURED GUILDS"
            value={status?.configuredGuilds ?? '—'}
            icon={Server}
          />
          <MetricCell
            label="DISCORD ERRORS"
            value={stats?.discordErrors ?? 0}
            icon={Cpu}
            highlight={(stats?.discordErrors ?? 0) > 10 ? 'danger' : (stats?.discordErrors ?? 0) > 0 ? 'warn' : null}
          />
        </div>
      </section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
