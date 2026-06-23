import React from 'react';

export default function DataSlab({ label, value, sub, highlight = false, style }) {
  return (
    <div 
      className={`data-slab ${highlight ? 'data-slab--highlight' : ''}`}
      style={style}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half, 2px)' }}>
        <span style={{ fontWeight: 'bold' }}>{label}</span>
        {sub && <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{sub}</span>}
      </div>
      <span className="data-slab__value">{value}</span>
    </div>
  );
}
