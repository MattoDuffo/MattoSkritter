import { useLayoutEffect, useRef } from 'react';
import type { Bar } from '../lib/statDetail';

/** Bar chart that shows two weeks' worth of bars and scrolls sideways for the rest. */
export function BarChart({ bars, startAtEnd }: { bars: Bar[]; startAtEnd?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (startAtEnd && ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [bars, startAtEnd]);
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="bars-scroll" ref={ref}>
      <div className="bars">
        {bars.map((b, i) => (
          <div className="bar" key={i}>
            <span className="n">{b.top ?? (b.value || '')}</span>
            <div style={{ height: `${(100 * b.value) / max}%` }} />
            <span className="l">{b.l1}</span>
            {b.l2 !== undefined && <span className={`l${b.mark ? ' m' : ''}`}>{b.l2 || ' '}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
