/**
 * shared/ui/Panel.jsx — Community Operations Platform
 * Base data panel — asymmetric, command center aesthetic
 */
import React from 'react';

/**
 * Panel — base surface container
 * @param {'sm'|'md'|'lg'} size
 * @param {'default'|'accent'|'ghost'} variant
 */
export function Panel({ children, className = '', variant = 'default', size = 'md', style, ...props }) {
  const base = 'panel';
  const cls  = [base, `panel--${variant}`, `panel--${size}`, className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style} {...props}>
      {children}
    </div>
  );
}

/**
 * MetricPanel — large metric display (asymmetric layout)
 */
export function MetricPanel({ label, value, delta, deltaLabel, accent = false, children, className = '' }) {
  const positive = typeof delta === 'number' ? delta >= 0 : null;
  return (
    <div className={`metric-panel ${accent ? 'metric-panel--accent' : ''} ${className}`}>
      <span className="metric-panel__label">{label}</span>
      <span className="metric-panel__value">{value}</span>
      {delta !== undefined && (
        <span className={`metric-panel__delta ${positive ? 'metric-panel__delta--up' : 'metric-panel__delta--down'}`}>
          {positive ? '↑' : '↓'} {Math.abs(delta)}%
          {deltaLabel && <span className="metric-panel__delta-label"> {deltaLabel}</span>}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * DataPanel — table-style data display
 */
export function DataPanel({ title, children, action, className = '' }) {
  return (
    <div className={`data-panel ${className}`}>
      {(title || action) && (
        <div className="data-panel__header">
          {title && <span className="data-panel__title">{title}</span>}
          {action && <div className="data-panel__action">{action}</div>}
        </div>
      )}
      <div className="data-panel__body">{children}</div>
    </div>
  );
}
