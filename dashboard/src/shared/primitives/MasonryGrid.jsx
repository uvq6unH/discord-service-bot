import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

/**
 * MasonryGrid — JS-Driven Dynamic Animated Layout Engine
 * 1. Measures DOM panel heights via ResizeObserver in real-time.
 * 2. Calculates dynamic placement using the Shortest Column First algorithm.
 * 3. Renders into React columns with CSS transitions for smooth sliding/reflow animations.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const heightsRef = useRef({});

  // Store assigned column items
  const [columns, setColumns] = useState(() => {
    const initial = Array.from({ length: cols }, () => []);
    validChildren.forEach((child, i) => initial[i % cols].push(child));
    return initial;
  });

  const recalculateLayout = () => {
    if (validChildren.length === 0) return;

    // Mobile fallback (< 768px): single column vertical stack
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setColumns([validChildren]);
      return;
    }

    const colHeights = new Array(cols).fill(0);
    const colAssignments = Array.from({ length: cols }, () => []);

    validChildren.forEach((child, idx) => {
      const el = itemRefs.current[idx];
      const height = el ? el.offsetHeight : heightsRef.current[idx] || 300;
      heightsRef.current[idx] = height;

      // Find column with minimum total height
      let shortestCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[shortestCol]) {
          shortestCol = c;
        }
      }

      colAssignments[shortestCol].push(child);
      colHeights[shortestCol] += height + gap;
    });

    setColumns(colAssignments);
  };

  useLayoutEffect(() => {
    recalculateLayout();
  }, [validChildren.length, cols, gap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ResizeObserver tracks height changes of every panel in real-time
    const observer = new ResizeObserver((entries) => {
      let shouldUpdate = false;
      entries.forEach((entry) => {
        const targetIdx = entry.target.dataset.index;
        if (targetIdx !== undefined) {
          const newH = entry.target.offsetHeight;
          if (heightsRef.current[targetIdx] !== newH) {
            heightsRef.current[targetIdx] = newH;
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        recalculateLayout();
      }
    });

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    window.addEventListener('resize', recalculateLayout);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recalculateLayout);
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
      {/* Hidden Offscreen Measurement Layer */}
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
          <div key={child.key || idx} data-index={idx} ref={(el) => (itemRefs.current[idx] = el)}>
            {child}
          </div>
        ))}
      </div>

      {/* Visible Columns Layer with Smooth Reflow Transitions */}
      {columns.map((colItems, colIndex) => (
        <div
          key={colIndex}
          className="masonry-column"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}px`,
            minWidth: 0,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {colItems.map((child) => (
            <div
              key={child.key || child.props?.title || Math.random()}
              style={{
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '100%'
              }}
            >
              {child}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
