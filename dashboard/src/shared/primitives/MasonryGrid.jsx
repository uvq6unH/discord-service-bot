import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';

/**
 * MasonryGrid — Open-Source Grade Container-Responsive GPU Layout Engine
 * 
 * Production Features:
 * 1. Fixed & Pinned Sorting: Correctly pins `fixed={true}` / `pinned={true}` cards to top.
 * 2. Layout Strategy Support: `"shortest-first"` | `"preserve-order"` | `"priority"`.
 * 3. Event-Driven VRAM Cleanup: Uses `transitionend` event instead of setTimeouts.
 * 4. Callbacks API: `onLayout`, `onColumnChange`.
 * 5. Imperative API: `ref.current.recalculate()`, `ref.current.invalidate()`.
 */
const MasonryGrid = forwardRef(function MasonryGrid(
  {
    children,
    cols = 2,
    gap = 20,
    minColWidth = 340,
    layoutStrategy = 'preserve-order',
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

  // Event-driven GPU VRAM management using native transitionend
  const triggerGPUWillChange = (el) => {
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

    let activeCols = Math.max(1, Math.floor((containerWidth + gap) / (minColWidth + gap)));
    if (cols && activeCols > cols) activeCols = cols;

    if (activeColsRef.current !== activeCols) {
      activeColsRef.current = activeCols;
      if (typeof onColumnChange === 'function') {
        onColumnChange(activeCols);
      }
    }

    const itemWidthPx = Math.max(0, (containerWidth - (activeCols - 1) * gap) / activeCols);
    const colHeights = new Array(activeCols).fill(0);
    const newPositions = [];

    const indexedChildren = validChildren.map((child, idx) => ({
      child,
      idx,
      priority: child.props?.priority ?? 0,
      fixed: child.props?.fixed ?? child.props?.pinned ?? false
    }));

    // Sorting according to strategy & fixed status
    if (layoutStrategy === 'priority') {
      indexedChildren.sort((a, b) => {
        if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
        return b.priority - a.priority;
      });
    } else if (layoutStrategy === 'preserve-order') {
      indexedChildren.sort((a, b) => {
        if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
        return a.idx - b.idx;
      });
    }

    indexedChildren.forEach(({ idx }) => {
      const el = itemRefs.current[idx];
      const measuredH = el ? el.getBoundingClientRect().height : (heightsRef.current[idx] || 300);
      heightsRef.current[idx] = measuredH;

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
      triggerGPUWillChange(el);
    });

    const maxContainerH = Math.max(...colHeights, 0);

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

      const nextState = {
        positions: newPositions,
        containerHeight: maxContainerH
      };

      if (typeof onLayout === 'function') {
        onLayout(nextState);
      }

      return nextState;
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
  }, [validChildren.length, cols, gap, minColWidth, layoutStrategy]);

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
