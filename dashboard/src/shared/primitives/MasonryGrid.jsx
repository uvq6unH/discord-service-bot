import React from 'react';

/**
 * MasonryGrid — Modern Multi-Column Masonry Layout
 * Prevents overlapping using native CSS columns + break-inside: avoid.
 * Cards stack smoothly without vertical gaps regardless of content height.
 */
export default function MasonryGrid({ children, minWidth = 340, gap = 20, className = '', style = {} }) {
  return (
    <div
      className={`masonry-grid ${className}`}
      style={{
        columns: `auto ${minWidth}px`,
        columnGap: `${gap}px`,
        width: '100%',
        ...style
      }}
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return (
          <div
            style={{
              breakInside: 'avoid',
              pageBreakInside: 'avoid',
              WebkitColumnBreakInside: 'avoid',
              marginBottom: `${gap}px`,
              display: 'block',
              width: '100%'
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
