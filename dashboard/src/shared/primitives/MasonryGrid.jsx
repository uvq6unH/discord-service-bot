import React from 'react';

/**
 * MasonryGrid — Native CSS Multi-Column Fluid Masonry Component
 * Uses CSS `column-count` and `break-inside: avoid` for real-time, native browser reflow.
 * Dynamically adjusts whenever window resizes, DevTools Console (F12) opens/drags,
 * or when content heights expand/contract naturally.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);

  if (validChildren.length === 0) return null;

  return (
    <div
      className={`masonry-grid ${className}`}
      style={{
        columnCount: cols,
        columnGap: `${gap}px`,
        width: '100%',
        ...style
      }}
    >
      {validChildren.map((child, index) => (
        <div
          key={child.key || index}
          style={{
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
            marginBottom: `${gap}px`,
            display: 'inline-block',
            width: '100%',
            verticalAlign: 'top'
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
