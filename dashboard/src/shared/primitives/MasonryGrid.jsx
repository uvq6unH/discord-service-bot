import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * MasonryGrid — Open-Source v2.1 Enterprise Key-Based GPU Layout Engine
 * 
 * Key-Based Pipeline Architecture:
 * 1. Key-Based Measure & Position Mapping (Map<key, HTMLElement> & Record<key, Position>)
 * 2. 100% Insertion/Deletion Stability (Re-ordering, filtering, or insertions leave active refs intact)
 * 3. Stage 1: MEASURE (getBoundingClientRect by key)
 * 4. Stage 2: STRATEGY (Ordering by key)
 * 5. Stage 3: PLACEMENT (Positioning by key)
 * 6. Stage 4: ANIMATE & RENDER (Selective GPU willChange + translate3d hardware motion)
 */

const getItemKey = (child, idx) => String(child.key ?? child.props?.title ?? idx);

// Stage 2: Ordering Strategy Registry
const defaultStrategyHandlers = {
  'preserve-order': (items) =>
    [...items].sort((a, b) => {
      if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
      return a.idx - b.idx;
    }),
  'priority': (items) =>
    [...items].sort((a, b) => {
      if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
      return b.priority - a.priority;
    }),
  'shortest-column': (items) =>
    [...items].sort((a, b) => {
      if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
      return 0;
    })
};

// Stage 3: Default Placement Engine (Shortest Column First)
const defaultShortestColumnPlacement = (orderedItems, ctx) => {
  const { activeCols, itemWidthPx, gap, getMeasuredHeight } = ctx;
  const colHeights = new Array(activeCols).fill(0);
  const positions = {};

  orderedItems.forEach(({ key, idx }) => {
    const measuredH = getMeasuredHeight(key, idx);

    let shortestCol = 0;
    for (let c = 1; c < activeCols; c++) {
      if (colHeights[c] < colHeights[shortestCol]) {
        shortestCol = c;
      }
    }

    const leftPx = shortestCol * (itemWidthPx + gap);
    const topPx = colHeights[shortestCol];

    positions[key] = {
      leftPx,
      topPx,
      widthPx: itemWidthPx
    };

    colHeights[shortestCol] += measuredH + gap;
  });

  return {
    positions,
    containerHeight: Math.max(...colHeights, 0)
  };
};

const MasonryGrid = forwardRef(function MasonryGrid(
  {
    children,
    cols = 2,
    gap = 20,
    minColWidth = 340,
    layoutStrategy = 'preserve-order',
    placementEngine = defaultShortestColumnPlacement,
    onLayout,
    onColumnChange,
    className = '',
    style = {}
  },
  ref
) {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const heightsRef = useRef({});
  const rafRef = useRef(null);
  const activeColsRef = useRef(cols);

  const [layoutState, setLayoutState] = useState(() => ({
    positions: {}, // Map<key, Position>
    containerHeight: 0
  }));

  // Safe side-effect-free onLayout invocation
  useEffect(() => {
    if (typeof onLayout === 'function') {
      onLayout(layoutState);
    }
  }, [layoutState, onLayout]);

  // Selective Stage 4: Selective GPU VRAM management on moved elements only
  const triggerSelectiveGPUWillChange = (el) => {
    if (!el) return;
    el.style.willChange = 'transform';

    const handleTransitionEnd = (e) => {
      if (e.target === el && (e.propertyName === 'transform' || !e.propertyName)) {
        el.style.willChange = 'auto';
        el.removeEventListener('transitionend', handleTransitionEnd);
      }
    };

    el.removeEventListener('transitionend', handleTransitionEnd);
    el.addEventListener('transitionend', handleTransitionEnd, { once: true });
  };

  const calculateLayout = () => {
    if (validChildren.length === 0 || !containerRef.current) return;

    // Stage 1: MEASURE
    const containerWidth = containerRef.current.clientWidth || 800;
    let activeCols = Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
    if (cols && activeCols > cols) activeCols = cols;

    if (activeColsRef.current !== activeCols) {
      const prevCols = activeColsRef.current;
      activeColsRef.current = activeCols;
      if (typeof onColumnChange === 'function') {
        onColumnChange({ previous: prevCols, current: activeCols });
      }
    }

    const itemWidthPx = Math.max(0, (containerWidth - (activeCols - 1) * gap) / activeCols);

    const getMeasuredHeight = (key, idx) => {
      const el = itemRefs.current[key];
      const measuredH = el ? el.getBoundingClientRect().height : (heightsRef.current[key] || 300);
      heightsRef.current[key] = measuredH;
      return measuredH;
    };

    // Stage 2: STRATEGY (Ordering)
    const indexedChildren = validChildren.map((child, idx) => {
      const key = getItemKey(child, idx);
      return {
        child,
        key,
        idx,
        priority: child.props?.priority ?? 0,
        fixed: child.props?.fixed ?? child.props?.pinned ?? false
      };
    });

    let orderedItems = indexedChildren;
    if (typeof layoutStrategy === 'function') {
      orderedItems = layoutStrategy(indexedChildren, { containerWidth, activeCols, gap, minColWidth });
    } else if (defaultStrategyHandlers[layoutStrategy]) {
      orderedItems = defaultStrategyHandlers[layoutStrategy](indexedChildren);
    }

    // Stage 3: PLACEMENT (Positioning Engine)
    const placementRunner = typeof placementEngine === 'function' ? placementEngine : defaultShortestColumnPlacement;
    const { positions: newPositions, containerHeight: maxContainerH } = placementRunner(orderedItems, {
      containerWidth,
      activeCols,
      itemWidthPx,
      gap,
      minColWidth,
      getMeasuredHeight
    });

    // Stage 4: ANIMATE & RENDER (Selective GPU willChange + translate3d)
    setLayoutState((prev) => {
      const isHeightSame = Math.abs(prev.containerHeight - maxContainerH) < 1;
      const prevKeys = Object.keys(prev.positions);
      const newKeys = Object.keys(newPositions);

      const isPosSame =
        prevKeys.length === newKeys.length &&
        newKeys.every((key) => {
          const p1 = prev.positions[key];
          const p2 = newPositions[key];
          return (
            p1 && p2 &&
            Math.abs(p1.leftPx - p2.leftPx) < 1 &&
            Math.abs(p1.topPx - p2.topPx) < 1 &&
            Math.abs(p1.widthPx - p2.widthPx) < 1
          );
        });

      if (isHeightSame && isPosSame) return prev;

      // Selectively trigger GPU willChange ONLY on elements that actually moved
      newKeys.forEach((key) => {
        const prevP = prev.positions[key];
        const newP = newPositions[key];
        const el = itemRefs.current[key];
        if (el && (!prevP || Math.abs(prevP.leftPx - newP.leftPx) > 1 || Math.abs(prevP.topPx - newP.topPx) > 1)) {
          triggerSelectiveGPUWillChange(el);
        }
      });

      return {
        positions: newPositions,
        containerHeight: maxContainerH
      };
    });
  };

  const debouncedCalculateLayout = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      calculateLayout();
    });
  };

  // Expose Imperative API
  useImperativeHandle(ref, () => ({
    recalculate: debouncedCalculateLayout,
    invalidate: () => {
      heightsRef.current = {};
      debouncedCalculateLayout();
    },
    getContainerHeight: () => layoutState.containerHeight,
    getActiveColumns: () => activeColsRef.current
  }));

  useLayoutEffect(() => {
    calculateLayout();
  }, [validChildren.length, cols, gap, minColWidth, layoutStrategy, placementEngine]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Clean up stale refs on children count/structure change
    const activeKeys = new Set(validChildren.map((child, idx) => getItemKey(child, idx)));
    Object.keys(itemRefs.current).forEach((k) => {
      if (!activeKeys.has(k)) {
        delete itemRefs.current[k];
        delete heightsRef.current[k];
      }
    });

    const observer = new ResizeObserver((entries) => {
      let shouldUpdate = false;
      entries.forEach((entry) => {
        if (entry.target === containerRef.current) {
          shouldUpdate = true;
        } else {
          const targetKey = entry.target.dataset.key;
          if (targetKey !== undefined) {
            const newH = entry.target.getBoundingClientRect().height;
            if (Math.abs((heightsRef.current[targetKey] || 0) - newH) > 1) {
              heightsRef.current[targetKey] = newH;
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

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
        const key = getItemKey(child, idx);
        const pos = layoutState.positions[key] || { leftPx: 0, topPx: 0, widthPx: 0 };

        return (
          <div
            key={key}
            data-key={key}
            ref={(el) => (itemRefs.current[key] = el)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: pos.widthPx ? `${pos.widthPx}px` : '100%',
              transform: `translate3d(${pos.leftPx}px, ${pos.topPx}px, 0)`,
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              willChange: 'auto'
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
});

export default MasonryGrid;
