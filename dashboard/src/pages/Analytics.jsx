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

// ── API call — dễ swap mock → real khi backend có sẵn ─────────────────────────

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

// Mock data — thay bằng API thật khi backend sẵn sàng
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

// ── Sub-components ────────────────────────────────────────────────────────────

function DeltaBadge({ delta }) {
  if (delta === 0) return (
    <span style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}>
      <Minus size={12} /> 0%
    </span>
  );
  const up = delta > 0;
  return (
    <span style={{
      fontSize: 12, display: 'flex', alignItems: 'center', gap: 2,
      color: up ? 'var(--green)' : 'var(--red)',
    }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
}

function StatCard({ icon, label, value, delta, color }) {
  return (
    <div style={{
      background: 'var(--surface-1)', border: '1px solid var(--border)',
      borderRadius: 'var(--r3)', padding: 'var(--s3)',
      display: 'flex', flexDirection: 'column', gap: 'var(--s1)',
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.04em' }}>
          {value.toLocaleString('vi-VN')}
        </span>
        <DeltaBadge delta={delta} />
      </div>
    </div>
  );
}

// Mini bar chart dùng thuần CSS/SVG — không cần Chart.js
function BarChart({ data, color = 'var(--accent)', height = 120, labelKey = 'date', valueKey = 'count' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const showEvery = Math.ceil(data.length / 8);

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${data.length * 14} ${height + 28}`}
        style={{ width: '100%', overflow: 'visible' }}
        role="img"
        aria-label={`Biểu đồ ${labelKey}`}
      >
        {data.map((d, i) => {
          const barH = Math.max((d[valueKey] / max) * height, 2);
          const x = i * 14;
          const y = height - barH;
          return (
            <g key={i}>
              <rect
                x={x + 1} y={y} width={11} height={barH}
                rx={2}
                fill={color}
                opacity={0.85}
              >
                <title>{d[labelKey]}: {d[valueKey].toLocaleString('vi-VN')}</title>
              </rect>
              {i % showEvery === 0 && (
                <text
                  x={x + 7} y={height + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-3)"
                >
                  {d[labelKey]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HeatmapRow({ data }) {
  const max = Math.max(...data.map(d => d.users), 1);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
      {data.map((d, i) => {
        const intensity = d.users / max;
        return (
          <div
            key={i}
            title={`${d.hour}: ${d.users} users`}
            style={{
              width: 22, height: 22, borderRadius: 3, cursor: 'default',
              background: `rgba(88,101,242,${0.08 + intensity * 0.85})`,
              border: '1px solid rgba(88,101,242,0.1)',
              position: 'relative',
            }}
          />
        );
      })}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, width: '100%' }}>
        {['00:00', '06:00', '12:00', '18:00', '23:00'].map(h => (
          <span key={h} style={{ fontSize: 11, color: 'var(--text-3)' }}>{h}</span>
        ))}
      </div>
    </div>
  );
}

function TopCommandsTable({ commands }) {
  const max = commands[0]?.count ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {commands.map((c, i) => (
        <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)', width: 18, textAlign: 'right', flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <code style={{
            fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)',
            padding: '1px 6px', borderRadius: 'var(--r1)', flexShrink: 0,
            border: '1px solid rgba(88,101,242,.2)',
          }}>
            {c.name}
          </code>
          <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${(c.count / max) * 100}%`,
              background: 'var(--accent)',
            }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', minWidth: 40, textAlign: 'right' }}>
            {c.count.toLocaleString('vi-VN')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const RANGES = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: '90 ngày', value: '90d' },
];

export default function AnalyticsPage() {
  const { selectedGuild } = useGuild();
  const { user } = useAuth();
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
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                background: 'rgba(234,179,8,.12)', color: 'var(--yellow)',
                border: '1px solid rgba(234,179,8,.25)',
              }}>
                Demo data
              </span>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
          >
            <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            Làm mới
          </button>
        </div>
        <p className="page-subtitle">
          Hoạt động của {selectedGuild?.name} — dữ liệu thực từ backend khi endpoint /api/analytics sẵn sàng.
        </p>
      </div>

      {/* Range picker */}
      <div style={{ display: 'flex', gap: 'var(--s1)', marginBottom: 'var(--s4)' }}>
        {RANGES.map(r => (
          <button
            key={r.value}
            className={`btn btn-sm ${range === r.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
        <StatCard
          icon={<Terminal size={16} />}
          label="Lệnh thực thi"
          value={s.commandsExecuted.value}
          delta={s.commandsExecuted.delta}
          color="#5865f2"
        />
        <StatCard
          icon={<Users size={16} />}
          label="Người dùng hoạt động"
          value={s.activeUsers.value}
          delta={s.activeUsers.delta}
          color="#22c55e"
        />
        <StatCard
          icon={<Coins size={16} />}
          label="Giao dịch economy"
          value={s.economyTransactions.value}
          delta={s.economyTransactions.delta}
          color="#eab308"
        />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="Hành động kiểm duyệt"
          value={s.moderationActions.value}
          delta={s.moderationActions.delta}
          color="#ef4444"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)', marginBottom: 'var(--s3)' }}>
        {/* Commands chart */}
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r3)', padding: 'var(--s3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
            <BarChart2 size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Lệnh theo ngày</span>
          </div>
          <BarChart
            data={data.commandsChart}
            color="var(--accent)"
            height={100}
            labelKey="date"
            valueKey="count"
          />
        </div>

        {/* Top commands */}
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r3)', padding: 'var(--s3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
            <Terminal size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Top lệnh</span>
          </div>
          <TopCommandsTable commands={data.topCommands} />
        </div>
      </div>

      {/* Active hours heatmap */}
      <div style={{
        background: 'var(--surface-1)', border: '1px solid var(--border)',
        borderRadius: 'var(--r3)', padding: 'var(--s3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
          <Users size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Giờ hoạt động trong ngày</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>(màu đậm hơn = nhiều người hơn)</span>
        </div>
        <HeatmapRow data={data.activeHours} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
