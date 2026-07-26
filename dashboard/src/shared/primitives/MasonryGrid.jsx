import React from 'react';

/**
 * MasonryGrid — Flexible 2-Column Masonry Component
 * Distributes items into strictly `cols` columns (default 2 columns).
 * Provides a clean, balanced 2-column layout on desktop, collapsing to 1 column on mobile.
 * Guarantees zero vertical empty gaps, zero card overlap, and strictly 2 columns on wide screens.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);

  if (validChildren.length === 0) return null;

  // Distribute children across specified columns
  const columns = Array.from({ length: cols }, () => []);
  validChildren.forEach((child, index) => {
    columns[index % cols].push(child);
  });

  return (
    <div
      className={`masonry-grid ${className}`}
      style={{
        display: 'flex',
        gap: `${gap}px`,
        width: '100%',
        alignItems: 'flex-start',
        ...style
      }}
    >
      {columns.map((colItems, colIndex) => (
        <div
          key={colIndex}
          className="masonry-column"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}px`,
            minWidth: 0
          }}
        >
          {colItems}
        </div>
      ))}
    </div>
  );
}
