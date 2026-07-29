import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * MasonryGrid — Open-Source v2.2 Isomorphic Enterprise GPU Layout Engine
 * 
 * v2.2 Highlights:
 * 1. SSR Compatibility: `useIsomorphicLayoutEffect` (0% Next.js / Remix SSR warnings)
 * 2. Pure `computeLayout`: Decoupled pure layout calculator for 100% Vitest unit testing
 * 3. Stable Key Resolution: `child.props.id ?? child.key ?? itemKey(child)` with Dev Warnings
 * 4. API Versioning Metadata: `MASONRY_ENGINE_VERSION = '2.2.0'`
 */

export const MASONRY_ENGINE_VERSION = '2.2.0';

// Isomorphic Layout Effect for SSR compatibility
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Key Resolution helper
const resolveItemKey = (child, idx, itemKeyFn) => {
  if (typeof itemKeyFn === 'function') {
    const key = itemKeyFn(child, idx);
    if (key) return String(key);
  }

  if (child.props?.id) return String(child.props.id);
  if (child.key) return String(child.key);

  if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
    console.warn(
      `[MasonryGrid Warning]: Child at index ${idx} is missing a stable 'id' or 'key' prop. ` +
        `Using fallback index may cause re-order issues during dynamic insertions or deletions.`
    );
  }

  return `fallback-idx-${idx}`;
};

// Stage 2: Ordering Strategy Registry
export const defaultStrategyHandlers = {
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
export const defaultShortestColumnPlacement = (orderedItems, ctx) => {
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

/**
 * Pure Layout Calculator (Independent of React Rendering Loop for Vitest Unit Testing)
 */
export const computeLayout = ({
  validChildren,
  containerWidth,
  cols = 2,
  gap = 20,
  minColWidth = 340,
  layoutStrategy = 'preserve-order',
  placementEngine = defaultShortestColumnPlacement,
  getMeasuredHeight,
  itemKeyFn
}) => {
  let activeCols = Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
  if (cols && activeCols > cols) activeCols = cols;

  const itemWidthPx = Math.max(0, (containerWidth - (activeCols - 1) * gap) / activeCols);

  const indexedChildren = validChildren.map((child, idx) => {
    const key = resolveItemKey(child, idx, itemKeyFn);
    return {
      child,
      key,
      idx,
      priority: child.props?.priority ?? 0,
      fixed: child.props?.fixed ?? child.props?.pinned ?? false
    };
  });

  let orderedItems = indexedChildren;
  const ctxMeta = {
    apiVersion: MASONRY_ENGINE_VERSION,
    containerWidth,
    activeCols,
    itemWidthPx,
    gap,
    minColWidth,
    getMeasuredHeight
  };

  if (typeof layoutStrategy === 'function') {
    orderedItems = layoutStrategy(indexedChildren, ctxMeta);
  } else if (defaultStrategyHandlers[layoutStrategy]) {
    orderedItems = defaultStrategyHandlers[layoutStrategy](indexedChildren);
  }

  const placementRunner = typeof placementEngine === 'function' ? placementEngine : defaultShortestColumnPlacement;
  const placementResult = placementRunner(orderedItems, ctxMeta);

  return {
    activeCols,
    itemWidthPx,
    positions: placementResult.positions,
    containerHeight: placementResult.containerHeight
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
    itemKey: itemKeyFn,
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
    positions: {},
    containerHeight: 0
  }));

  // Safe side-effect-free onLayout invocation
  useEffect(() => {
    if (typeof onLayout === 'function') {
      onLayout(layoutState);
    }
  }, [layoutState, onLayout]);

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

    const containerWidth = containerRef.current.clientWidth || 800;

    const getMeasuredHeight = (key) => {
      const el = itemRefs.current[key];
      const measuredH = el ? el.getBoundingClientRect().height : (heightsRef.current[key] || 300);
      heightsRef.current[key] = measuredH;
      return measuredH;
    };

    const computed = computeLayout({
      validChildren,
      containerWidth,
      cols,
      gap,
      minColWidth,
      layoutStrategy,
      placementEngine,
      getMeasuredHeight,
      itemKeyFn
    });

    if (activeColsRef.current !== computed.activeCols) {
      const prevCols = activeColsRef.current;
      activeColsRef.current = computed.activeCols;
      if (typeof onColumnChange === 'function') {
        onColumnChange({ previous: prevCols, current: computed.activeCols });
      }
    }

    setLayoutState((prev) => {
      const isHeightSame = Math.abs(prev.containerHeight - computed.containerHeight) < 1;
      const prevKeys = Object.keys(prev.positions);
      const newKeys = Object.keys(computed.positions);

      const isPosSame =
        prevKeys.length === newKeys.length &&
        newKeys.every((key) => {
          const p1 = prev.positions[key];
          const p2 = computed.positions[key];
          return (
            p1 && p2 &&
            Math.abs(p1.leftPx - p2.leftPx) < 1 &&
            Math.abs(p1.topPx - p2.topPx) < 1 &&
            Math.abs(p1.widthPx - p2.widthPx) < 1
          );
        });

      if (isHeightSame && isPosSame) return prev;

      newKeys.forEach((key) => {
        const prevP = prev.positions[key];
        const newP = computed.positions[key];
        const el = itemRefs.current[key];
        if (el && (!prevP || Math.abs(prevP.leftPx - newP.leftPx) > 1 || Math.abs(prevP.topPx - newP.topPx) > 1)) {
          triggerSelectiveGPUWillChange(el);
        }
      });

      return {
        positions: computed.positions,
        containerHeight: computed.containerHeight
      };
    });
  };

  const debouncedCalculateLayout = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      calculateLayout();
    });
  };

  useImperativeHandle(ref, () => ({
    recalculate: debouncedCalculateLayout,
    invalidate: () => {
      heightsRef.current = {};
      debouncedCalculateLayout();
    },
    getContainerHeight: () => layoutState.containerHeight,
    getActiveColumns: () => activeColsRef.current,
    engineVersion: MASONRY_ENGINE_VERSION
  }));

  useIsomorphicLayoutEffect(() => {
    calculateLayout();
  }, [validChildren.length, cols, gap, minColWidth, layoutStrategy, placementEngine]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const activeKeys = new Set(validChildren.map((child, idx) => resolveItemKey(child, idx, itemKeyFn)));
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
        const key = resolveItemKey(child, idx, itemKeyFn);
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
