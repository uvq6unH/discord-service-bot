import React from 'react';

export default function DataSlab({ label, value, sub, highlight = false, style, onClick }) {
  const isClickable = !!onClick;
  return (
    <div 
      className={`data-slab ${highlight ? 'data-slab--highlight' : ''} ${isClickable ? 'data-slab--clickable' : ''}`}
      style={style}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half, 2px)' }}>
        <span style={{ fontWeight: 'bold' }}>{label}</span>
        {sub && <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="data-slab__value">{value}</span>
        {isClickable && (
          <span style={{ 
            color: 'var(--accent)', 
            fontSize: '14px', 
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)',
            marginLeft: 'var(--space-1)'
          }}>
            →
          </span>
        )}
      </div>
    </div>
  );
}
