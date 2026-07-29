import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * MasonryGrid — Open-Source v2.0 Modular 4-Pipeline GPU Layout Engine
 * 
 * Pipeline Architecture:
 * Stage 1: MEASURE (getBoundingClientRect + height cache)
 * Stage 2: STRATEGY (Ordering handlers: preserve-order, priority, shortest-column, or custom strategy)
 * Stage 3: PLACEMENT (Placement engine: shortest-column-first, bin-packing, or custom placement plugin)
 * Stage 4: ANIMATE & RENDER (Selective GPU willChange + translate3d hardware motion)
 */

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
  const positions = [];

  orderedItems.forEach(({ idx }) => {
    const measuredH = getMeasuredHeight(idx);

    let shortestCol = 0;
    for (let c = 1; c < activeCols; c++) {
      if (colHeights[c] < colHeights[shortestCol]) {
        shortestCol = c;
      }
    }

    const leftPx = shortestCol * (itemWidthPx + gap);
    const topPx = colHeights[shortestCol];

    positions[idx] = {
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
    positions: [],
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

    const getMeasuredHeight = (idx) => {
      const el = itemRefs.current[idx];
      const measuredH = el ? el.getBoundingClientRect().height : (heightsRef.current[idx] || 300);
      heightsRef.current[idx] = measuredH;
      return measuredH;
    };

    // Stage 2: STRATEGY (Ordering)
    const indexedChildren = validChildren.map((child, idx) => ({
      child,
      idx,
      priority: child.props?.priority ?? 0,
      fixed: child.props?.fixed ?? child.props?.pinned ?? false
    }));

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
      const isPosSame =
        prev.positions.length === newPositions.length &&
        prev.positions.every((p, i) =>
          p && newPositions[i] &&
          Math.abs(p.leftPx - newPositions[i].leftPx) < 1 &&
          Math.abs(p.topPx - newPositions[i].topPx) < 1 &&
          Math.abs(p.widthPx - newPositions[i].widthPx) < 1
        );

      if (isHeightSame && isPosSame) return prev;

      // Selectively trigger GPU willChange ONLY on elements that actually moved
      newPositions.forEach((newP, i) => {
        const prevP = prev.positions[i];
        const el = itemRefs.current[i];
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

    const activeIndices = new Set(validChildren.map((_, i) => i));
    Object.keys(itemRefs.current).forEach((k) => {
      if (!activeIndices.has(Number(k))) {
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
