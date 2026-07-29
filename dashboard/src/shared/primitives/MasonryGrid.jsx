import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

/**
 * MasonryGrid — Enterprise-Grade Container-Responsive GPU Layout Engine
 * 
 * Enterprise Highlights:
 * 1. Container Query Responsiveness: Evaluates `containerRef.current.clientWidth` instead of `window.innerWidth`.
 * 2. Full Container Observation: `ResizeObserver` observes both `containerRef` (sidebar toggles) and all items.
 * 3. GPU VRAM Management: Dynamic `willChange` (active during transitions, auto when stationary).
 * 4. Reflow Optimization: Instant width updates, smooth GPU-accelerated `transform` slide animations.
 * 5. Height Cache & Single-Pass Render: 0% DOM bloat, O(N * cols) layout complexity.
 */
export default function MasonryGrid({ children, cols = 2, gap = 20, minColWidth = 340, className = '', style = {} }) {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const heightsRef = useRef({});
  const rafRef = useRef(null);
  const isMovingTimeoutRef = useRef(null);

  const [isMoving, setIsMoving] = useState(false);
  const [layoutState, setLayoutState] = useState(() => ({
    positions: [], // Array of { leftPx, topPx, widthPx }
    containerHeight: 0
  }));

  const triggerMovingState = () => {
    setIsMoving(true);
    if (isMovingTimeoutRef.current) clearTimeout(isMovingTimeoutRef.current);
    isMovingTimeoutRef.current = setTimeout(() => {
      setIsMoving(false);
    }, 380); // Clear will-change after transition completes (350ms + 30ms margin)
  };

  const calculateLayout = () => {
    if (validChildren.length === 0 || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth || 800;
    
    // Container-relative responsiveness: determine active columns dynamically
    let activeCols = Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
    if (cols && activeCols > cols) activeCols = cols;

    // Calculate column width & positions
    const itemWidthPx = Math.max(0, (containerWidth - (activeCols - 1) * gap) / activeCols);
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

    triggerMovingState();
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
  }, [validChildren.length, cols, gap, minColWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Observe both container (sidebar toggles) and item elements
    const observer = new ResizeObserver((entries) => {
      let shouldUpdate = false;
      entries.forEach((entry) => {
        if (entry.target === containerRef.current) {
          shouldUpdate = true;
        } else {
          const targetIdx = entry.target.dataset.index;
          if (targetIdx !== undefined) {
            const newH = entry.target.getBoundingClientRect().height;
            if (Math.abs((heightsRef.current[targetIdx] || 0) - newH) > 1) {
              heightsRef.current[targetIdx] = newH;
              shouldUpdate = true;
            }
          }
        }
      });

      if (shouldUpdate) {
        debouncedCalculateLayout();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    window.addEventListener('resize', debouncedCalculateLayout);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (isMovingTimeoutRef.current) clearTimeout(isMovingTimeoutRef.current);
      window.removeEventListener('resize', debouncedCalculateLayout);
    };
  }, [validChildren.length, cols, gap, minColWidth]);

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
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: isMoving ? 'transform' : 'auto'
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
