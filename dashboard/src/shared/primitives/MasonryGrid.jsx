import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

/**
 * MasonryGrid — Smart Dynamic Height-Balancing Masonry Engine
 * Measures real-time DOM heights of every child card (via ResizeObserver / offsetHeight).
 * Automatically distributes cards into whichever column currently has the SHORTEST total height
 * (Shortest Column First algorithm).
 * Automatically recalculates when cards expand/collapse or content resizes.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const containerRef = useRef(null);
  const itemRefs = useRef({});

  // Store indices of children per column
  const [columnIndices, setColumnIndices] = useState(() => {
    const initial = Array.from({ length: cols }, () => []);
    validChildren.forEach((_, i) => initial[i % cols].push(i));
    return initial;
  });

  const updateLayout = () => {
    if (validChildren.length === 0) return;

    // Mobile fallback (< 768px): single column vertical stack
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setColumnIndices([validChildren.map((_, i) => i)]);
      return;
    }

    // Measure actual DOM heights of each child item
    const heights = validChildren.map((_, idx) => {
      const el = itemRefs.current[idx];
      return el ? el.offsetHeight : 300;
    });

    const colHeights = new Array(cols).fill(0);
    const colAssignments = Array.from({ length: cols }, () => []);

    // Shortest Column First Algorithm
    heights.forEach((height, idx) => {
      let shortestCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[shortestCol]) {
          shortestCol = c;
        }
      }
      colAssignments[shortestCol].push(idx);
      colHeights[shortestCol] += height + gap;
    });

    setColumnIndices(colAssignments);
  };

  useLayoutEffect(() => {
    updateLayout();
  }, [validChildren.length, cols, gap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Recalculate layout whenever any card resizes
    const observer = new ResizeObserver(() => {
      updateLayout();
    });

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    window.addEventListener('resize', updateLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, [validChildren.length, cols, gap]);

  if (validChildren.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`masonry-grid ${className}`}
      style={{
        display: 'flex',
        gap: `${gap}px`,
        width: '100%',
        alignItems: 'flex-start',
        position: 'relative',
        ...style
      }}
    >
      {/* Hidden Measurement Layer to accurately measure card heights */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -9999,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: `${gap}px`
        }}
      >
        {validChildren.map((child, idx) => (
          <div key={idx} ref={(el) => (itemRefs.current[idx] = el)}>
            {child}
          </div>
        ))}
      </div>

      {/* Visible Columns Render Layer */}
      {columnIndices.map((colItems, colIndex) => (
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
          {colItems.map((childIdx) => validChildren[childIdx])}
        </div>
      ))}
    </div>
  );
}
