import React from 'react';

export function HeaderZone({ title, subtitle, actions }) {
  return (
    <div className="header-zone">
      <div>
        <h1 className="header-zone__title">{title}</h1>
        {subtitle && <p className="header-zone__subtitle">{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{actions}</div>}
    </div>
  );
}

export function StatusZone({ children }) {
  return <div className="status-zone">{children}</div>;
}

export function KpiTile({ label, value, sub }) {
  return (
    <div className="kpi-tile">
      <span className="kpi-tile__label">{label}</span>
      <span className="kpi-tile__value">{value}</span>
      {sub && <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{sub}</span>}
    </div>
  );
}

export default function Workspace({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }}>
      {children}
    </div>
  );
}
