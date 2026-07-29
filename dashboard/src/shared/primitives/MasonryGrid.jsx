import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

/**
 * MasonryGrid — Ultimate Single-Render GPU-Accelerated Animated Layout Engine
 * 
 * Architecture Highlights:
 * 1. Single-Pass DOM Render: Eliminates offscreen measurement layer (50% DOM reduction).
 * 2. GPU-Accelerated Hardware Motion: Uses `transform: translate3d(x, y, 0)` with `willChange: transform`.
 * 3. Exact Height Measurement: Uses `getBoundingClientRect().height` for precision under scale/transforms.
 * 4. rAF Observer Debouncing: Batches layout calculation with `requestAnimationFrame`.
 * 5. Stable React Keys & State: Preserves internal form, chart & terminal states.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const heightsRef = useRef({});
  const rafRef = useRef(null);

  // Store numerical position layouts per item
  const [layoutState, setLayoutState] = useState(() => ({
    positions: [], // Array of { leftPx, topPx, widthPx }
    containerHeight: 0
  }));

  const calculateLayout = () => {
    if (validChildren.length === 0 || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth || 800;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const activeCols = isMobile ? 1 : cols;

    // Calculate column width & positions
    const itemWidthPx = (containerWidth - (activeCols - 1) * gap) / activeCols;
    const colHeights = new Array(activeCols).fill(0);
    const newPositions = [];

    validChildren.forEach((_, idx) => {
      const el = itemRefs.current[idx];
      const measuredH = el ? el.getBoundingClientRect().height : (heightsRef.current[idx] || 300);
      heightsRef.current[idx] = measuredH;

      // Find column with minimum height (Shortest Column First)
      let shortestCol = 0;
      for (let c = 1; c < activeCols; c++) {
        if (colHeights[c] < colHeights[shortestCol]) {
          shortestCol = c;
        }
      }

      const leftPx = shortestCol * (itemWidthPx + gap);
      const topPx = colHeights[shortestCol];

      newPositions[idx] = {
        leftPx,
        topPx,
        widthPx: itemWidthPx
      };

      colHeights[shortestCol] += measuredH + gap;
    });

    const maxContainerH = Math.max(...colHeights, 0);

    setLayoutState({
      positions: newPositions,
      containerHeight: maxContainerH
    });
  };

  const debouncedCalculateLayout = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      calculateLayout();
    });
  };

  useLayoutEffect(() => {
    calculateLayout();
  }, [validChildren.length, cols, gap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Realtime Height Observer with rAF Debouncing
    const observer = new ResizeObserver((entries) => {
      let shouldUpdate = false;
      entries.forEach((entry) => {
        const targetIdx = entry.target.dataset.index;
        if (targetIdx !== undefined) {
          const newH = entry.target.getBoundingClientRect().height;
          if (Math.abs((heightsRef.current[targetIdx] || 0) - newH) > 1) {
            heightsRef.current[targetIdx] = newH;
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        debouncedCalculateLayout();
      }
    });

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    window.addEventListener('resize', debouncedCalculateLayout);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', debouncedCalculateLayout);
    };
  }, [validChildren.length, cols, gap]);

  if (validChildren.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`masonry-grid ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: `${layoutState.containerHeight}px`,
        transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        ...style
      }}
    >
      {validChildren.map((child, idx) => {
        const pos = layoutState.positions[idx] || { leftPx: 0, topPx: 0, widthPx: 0 };
        const key = child.key ?? child.props?.title ?? idx;

        return (
          <div
            key={key}
            data-index={idx}
            ref={(el) => (itemRefs.current[idx] = el)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: pos.widthPx ? `${pos.widthPx}px` : '100%',
              transform: `translate3d(${pos.leftPx}px, ${pos.topPx}px, 0)`,
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'transform'
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
