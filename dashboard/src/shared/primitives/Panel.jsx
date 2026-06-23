import React from 'react';

export default function Panel({ title, actions, accent = false, children, style }) {
  return (
    <section 
      className={`panel ${accent ? 'panel--accent' : ''}`}
      style={style}
    >
      {(title || actions) && (
        <div className="panel__header" style={{ gap: 'var(--space-2)' }}>
          {title && <h2 className="panel__title">{title}</h2>}
          {actions && <div style={{ display: 'flex', gap: 'var(--space-2)' }}>{actions}</div>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {children}
      </div>
    </section>
  );
}
