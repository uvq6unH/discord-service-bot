import React, { useEffect, useRef, useState } from 'react';

/**
 * MasonryGrid — Mission Control Dynamic Dashboard Grid
 * Uses CSS Grid + grid-auto-flow: dense + ResizeObserver to automatically calculate
 * grid-row: span N for every child card, placing them seamlessly without vertical gaps.
 */
export function MasonryItem({ children, className = '', style = {} }) {
  const itemRef = useRef(null);
  const [span, setSpan] = useState(1);

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    const calculateSpan = () => {
      const height = el.getBoundingClientRect().height;
      const rowHeight = 10;
      const gap = 16;
      const newSpan = Math.ceil((height + gap) / (rowHeight + gap));
      setSpan(newSpan);
    };

    calculateSpan();

    const resizeObserver = new ResizeObserver(() => {
      calculateSpan();
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={itemRef}
      className={className}
      style={{
        gridRowEnd: `span ${span}`,
        ...style
      }}
    >
      {children}
    </div>
  );
}

export default function MasonryGrid({ children, minWidth = 340, gap = 16, className = '', style = {} }) {
  return (
    <div
      className={`masonry-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gridAutoRows: '10px',
        gridAutoFlow: 'dense',
        gap: `${gap}px`,
        ...style
      }}
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return <MasonryItem>{child}</MasonryItem>;
      })}
    </div>
  );
}
