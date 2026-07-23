import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useAnalytics } from '../hooks/useAnalytics.js';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

function BarChart({ data, color = 'var(--accent)', labelKey = 'date', valueKey = 'count' }) {
  const chartWidth = 800;
  const chartHeight = 125;
  const bottomMargin = 25;
  const svgHeight = chartHeight + bottomMargin;

  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const count = data.length || 1;
  const paddingX = 10;
  const usableWidth = chartWidth - paddingX * 2;
  const step = usableWidth / count;
  const barWidth = Math.max(3, Math.min(24, step * 0.7));

  const maxLabels = 8;
  const showEvery = Math.max(1, Math.ceil(count / maxLabels));

  return (
    <div style={{ height: '160px', width: '100%', display: 'flex', alignItems: 'center' }}>
      <svg viewBox={`0 0 ${chartWidth} ${svgHeight}`} style={{ width: '100%', height: '100%', overflow: 'visible' }} role="img">
        <line x1={paddingX} y1={chartHeight} x2={chartWidth - paddingX} y2={chartHeight} stroke="var(--border)" strokeWidth="1" />
        {data.map((d, i) => {
          const val = d[valueKey] || 0;
          const barH = Math.max((val / max) * (chartHeight - 10), 3);
          const x = paddingX + i * step + (step - barWidth) / 2;
          const y = chartHeight - barH;

          return (
            <g key={i}>
              <rect 
                x={x} 
                y={y} 
                width={barWidth} 
                height={barH} 
                fill={val > 0 ? color : 'var(--surface-2)'} 
                opacity={val > 0 ? 0.88 : 0.4}
                rx={1}
              >
                <title>{d[labelKey]}: {val.toLocaleString('vi-VN')}</title>
              </rect>
              {i % showEvery === 0 && (
                <text 
                  x={x + barWidth / 2} 
                  y={chartHeight + 16} 
                  textAnchor="middle" 
                  fontSize={11} 
                  fill="var(--text-3)" 
                  fontFamily="var(--font-mono)"
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
    <div style={{ display: 'flex', gap: 'var(--space-3px)', alignItems: 'flex-end', height: '50px', borderBottom: '1px solid var(--border)' }}>
      {data.map((d, i) => {
        const ratio = d.users / max;
        return (
          <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }} title={`${d.hour}: ${d.users} active`}>
            <div style={{
              width: '100%',
              height: `${Math.max(ratio * 100, 10)}%`,
              background: ratio > 0 ? `rgba(255, 255, 255, ${0.1 + ratio * 0.9})` : 'var(--surface-2)',
              borderTop: ratio > 0 ? '1px solid var(--accent)' : 'none'
            }} />
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const { selectedGuild } = useGuild();
  const {
    range,
    setRange,
    data,
    loading,
    refetch
  } = useAnalytics(selectedGuild?.id);
  const { t } = useLanguage();

  if (loading || !data) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("QUERYING SERVICE TELEMETRY DATABASE...")}
      </div>
    );
  }

  const { summary, commandsChart, topCommands, activeHours } = data;

  const renderKpiDelta = (delta) => {
    const isUp = delta > 0;
    const isFlat = delta === 0;
    const color = isFlat ? 'var(--text-3)' : isUp ? 'var(--green)' : 'var(--red)';
    const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;

    return (
      <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 'var(--space-1)', 
        fontFamily: 'var(--font-mono)', 
        fontSize: '11px',
        color 
      }}>
        <Icon size={12} />
        {isFlat ? '—' : `${isUp ? '+' : ''}${delta.toFixed(1)}%`}
      </span>
    );
  };

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("OPERATIONAL TELEMETRY LOGS")}
        subtitle={t("Historical execution statistics, user interaction profiles, and network query traffic load.")}
        actions={
          <button 
            className="btn btn--secondary" 
            onClick={() => refetch()} 
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <RefreshCw size={12} /> {t("REQUERY")}
          </button>
        }
      />

      {/* Range switcher tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {['7d', '30d', '90d'].map(r => (
          <button
            key={r}
            className="btn"
            onClick={() => setRange(r)}
            style={{
              backgroundColor: range === r ? 'var(--surface-2)' : 'var(--surface-0)',
              borderColor: range === r ? 'var(--accent)' : 'var(--border)',
              color: range === r ? 'var(--text-1)' : 'var(--text-2)',
              padding: 'var(--space-1-5) var(--space-3)'
            }}
          >
            {t(r.toUpperCase() + " INTERVAL")}
          </button>
        ))}
      </div>

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Commands Executed")} 
          value={summary.commandsExecuted.value.toLocaleString('vi-VN')} 
          sub={renderKpiDelta(summary.commandsExecuted.delta)}
        />
        <KpiTile 
          label={t("Active Users Metric")} 
          value={summary.activeUsers.value.toLocaleString('vi-VN')} 
          sub={renderKpiDelta(summary.activeUsers.delta)}
        />
        <KpiTile 
          label={t("Ledger Transactions")} 
          value={summary.economyTransactions.value.toLocaleString('vi-VN')} 
          sub={renderKpiDelta(summary.economyTransactions.delta)}
        />
        <KpiTile 
          label={t("Moderation Actions")} 
          value={summary.moderationActions.value.toLocaleString('vi-VN')} 
          sub={renderKpiDelta(summary.moderationActions.delta)}
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Core Command Load Chart */}
        <div className="col-span-8">
          <Panel title={t("HISTORICAL COMMAND LOAD DISTRIBUTION")} accent>
            <div style={{ padding: 'var(--space-4) 0' }}>
              <BarChart data={commandsChart} />
            </div>
          </Panel>
        </div>

        {/* Top Commands list */}
        <div className="col-span-4">
          <Panel title={t("TOP COMMAND SIGNALS")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {topCommands.map((cmd, i) => (
                <DataSlab
                  key={cmd.name}
                  label={cmd.name}
                  value={`${cmd.count} EXEC`}
                  sub={`RANK_#0${i + 1}`}
                  highlight={i === 0}
                />
              ))}
            </div>
          </Panel>
        </div>

        {/* Heatmap active hours */}
        <div className="col-span-12">
          <Panel title={t("DAILY ENGAGEMENT PROFILE LOGS")} accent>
            <HeatmapRow data={activeHours} />
            {/* Heatmap hours label */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-3)' }}>
              {activeHours.filter((_, i) => i % 3 === 0).map(h => (
                <span key={h.hour}>{h.hour}</span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
