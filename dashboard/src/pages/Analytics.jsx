import React, { useState } from 'react';
import {
  BarChart2, Users, Terminal, Coins, ShieldCheck,
  TrendingUp, TrendingDown, Minus, RefreshCw,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, PermissionGuard } from '../components/ui.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../api.js';

// ── API / Mock ─────────────────────────────────────────────────────────────────
async function fetchAnalytics(guildId, range) {
  try {
    const res = await apiFetch(
      `/api/analytics?guildId=${encodeURIComponent(guildId)}&range=${range}`,
      {}, { allowNotOk: true }
    );
    if (!res.ok) return getMockData(range);
    return res.json();
  } catch {
    return getMockData(range);
  }
}

function getMockData(range) {
  const multiplier = range === '7d' ? 1 : range === '30d' ? 4 : 12;
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return {
    summary: {
      commandsExecuted:    { value: 1240 * multiplier, delta: +12.4 },
      activeUsers:         { value: 89  * multiplier, delta: +5.2  },
      economyTransactions: { value: 432 * multiplier, delta: -3.1  },
      moderationActions:   { value: 17  * multiplier, delta: 0     },
    },
    commandsChart: Array.from({ length: days }, (_, i) => ({
      date: new Date(now - (days - i) * 86_400_000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      count: Math.floor(Math.random() * 120 * multiplier / 7 + 30),
    })),
    topCommands: [
      { name: '/balance',    count: 312 * multiplier },
      { name: '/rank',       count: 248 * multiplier },
      { name: '/daily',      count: 195 * multiplier },
      { name: '/blackjack',  count: 143 * multiplier },
      { name: '/leaderboard',count: 98  * multiplier },
      { name: '/help',       count: 72  * multiplier },
    ],
    activeHours: Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      users: Math.floor(
        h >= 18 && h <= 22 ? Math.random() * 40 + 30
        : h >= 8  && h <= 12 ? Math.random() * 20 + 10
        : Math.random() * 8 + 2
      ),
    })),
    isMock: true,
  };
}

// ── Big KPI number — hero metric ──────────────────────────────────────────────
function KPI({ value, delta, label, color, wide }) {
  const up = delta > 0, flat = delta === 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: wide ? 'var(--s5) var(--s6)' : 'var(--s4) var(--s5)',
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`,
      borderRadius: 'var(--r4)',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{
          fontSize: wide ? 42 : 32, fontWeight: 700, letterSpacing: '-.06em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)',
          color: 'var(--text-1)',
        }}>
          {value.toLocaleString('vi-VN')}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
          color: flat ? 'var(--text-3)' : up ? 'var(--green)' : 'var(--red)',
        }}>
          {flat ? <Minus size={11} /> : up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {flat ? '—' : `${up ? '+' : ''}${delta.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}

// ── Bar chart — SVG ────────────────────────────────────────────────────────────
function BarChart({ data, color = 'var(--accent)', height = 80, labelKey = 'date', valueKey = 'count' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const showEvery = Math.ceil(data.length / 7);
  return (
    <svg viewBox={`0 0 ${data.length * 14} ${height + 24}`} style={{ width: '100%', overflow: 'visible' }} role="img">
      {data.map((d, i) => {
        const barH = Math.max((d[valueKey] / max) * height, 2);
        return (
          <g key={i}>
            <rect x={i * 14 + 1} y={height - barH} width={11} height={barH} rx={2}
              fill={color} opacity={0.82}>
              <title>{d[labelKey]}: {d[valueKey].toLocaleString('vi-VN')}</title>
            </rect>
            {i % showEvery === 0 && (
              <text x={i * 14 + 7} y={height + 16} textAnchor="middle" fontSize={8} fill="var(--text-3)">
                {d[labelKey]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function HeatmapRow({ data }) {
  const max = Math.max(...data.map(d => d.users), 1);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
      {data.map((d, i) => {
        const ratio = d.users / max;
        return (
          <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{
              width: '100%',
              height: `${Math.max(ratio * 100, 8)}%`,
              background: `rgba(88,101,242,${0.12 + ratio * 0.78})`,
              borderRadius: 2,
              transition: 'height 0.3s',
            }}>
              <title>{d.hour}: {d.users} người</title>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top commands — horizontal bars ────────────────────────────────────────────
function TopCommandsTable({ commands }) {
  const max = commands[0]?.count ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {commands.map((c, i) => (
        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 14, textAlign: 'right', flexShrink: 0 }}>
            {i + 1}
          </span>
          <code style={{
            fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)',
            padding: '1px 6px', borderRadius: 'var(--r1)', flexShrink: 0,
            border: '1px solid rgba(88,101,242,.18)', fontFamily: 'var(--font-mono)',
          }}>
            {c.name}
          </code>
          <div style={{ flex: 1, height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(c.count / max) * 100}%`, background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', minWidth: 38, textAlign: 'right' }}>
            {c.count.toLocaleString('vi-VN')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ children, style, label, accent }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r4)',
      overflow: 'hidden',
      ...style,
    }}>
      {label && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface-2)',
        }}>
          {accent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {label}
          </span>
        </div>
      )}
      <div style={{ padding: 'var(--s4)' }}>
        {children}
      </div>
    </div>
  );
}

const RANGES = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: '90 ngày', value: '90d' },
];

export default function AnalyticsPage() {
  const { selectedGuild } = useGuild();
  const [range, setRange] = useState('7d');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['analytics', selectedGuild?.id, range],
    queryFn: () => fetchAnalytics(selectedGuild.id, range),
    enabled: !!selectedGuild,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <div className="page-loading"><Spinner /></div>;

  const s = data?.summary;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <h1 className="page-title">Analytics</h1>
            {data?.isMock && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, fontWeight: 700, letterSpacing: '.06em',
                background: 'rgba(234,179,8,.1)', color: 'var(--yellow)', border: '1px solid rgba(234,179,8,.2)',
                fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              }}>
                DEMO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginLeft: 'auto' }}>
            {/* Range picker inline */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r2)', padding: 2, gap: 1 }}>
              {RANGES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r1)',
                    border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    background: range === r.value ? 'var(--accent)' : 'transparent',
                    color: range === r.value ? '#fff' : 'var(--text-3)',
                    transition: 'all 130ms',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => refetch()}
              disabled={isFetching}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={12} style={{ animation: isFetching ? 'spin 0.7s linear infinite' : 'none' }} strokeWidth={2} />
            </button>
          </div>
        </div>
        <p className="page-subtitle">{selectedGuild?.name} — command center</p>
      </div>

      {/* ── KPI row — asymmetric: one big + three small ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 'var(--s3)' }}>
        <KPI
          value={s.commandsExecuted.value}
          delta={s.commandsExecuted.delta}
          label="Lệnh thực thi"
          color="var(--accent)"
          wide
        />
        <KPI value={s.activeUsers.value}         delta={s.activeUsers.delta}         label="Người dùng"    color="var(--green)" />
        <KPI value={s.economyTransactions.value}  delta={s.economyTransactions.delta}  label="Giao dịch"     color="var(--yellow)" />
        <KPI value={s.moderationActions.value}    delta={s.moderationActions.delta}    label="Kiểm duyệt"    color="var(--red)" />
      </div>

      {/* ── Main bento: chart spans 3 cols, top commands 1 col ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 'var(--s3)' }}>
        <Panel label="Lệnh theo ngày" accent="var(--accent)">
          <BarChart data={data.commandsChart} color="var(--accent)" height={110} />
        </Panel>
        <Panel label="Top lệnh">
          <TopCommandsTable commands={data.topCommands} />
        </Panel>
      </div>

      {/* ── Activity heatmap — full width ── */}
      <Panel label="Giờ hoạt động" accent="rgba(88,101,242,.6)">
        <div style={{ marginBottom: 'var(--s2)' }}>
          <HeatmapRow data={data.activeHours} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
          {['00:00', '06:00', '12:00', '18:00', '23:00'].map(h => (
            <span key={h} style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{h}</span>
          ))}
        </div>
      </Panel>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
