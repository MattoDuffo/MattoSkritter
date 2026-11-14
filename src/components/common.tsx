import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { StoredCard } from '../lib/db';
import { syllables, toMarks } from '../lib/pinyin';
import { GRADE_LABEL, previewIntervals, type Grade4 } from '../lib/srs';
import { back as goBack } from '../router';

/** Pinyin with tone colours. */
export function Pinyin({ value, className }: { value: string; className?: string }) {
  const readings = value.split(',').map((r) => r.trim()).filter(Boolean);
  return (
    <span className={className}>
      {readings.map((r, ri) => (
        <span key={ri}>
          {ri > 0 && ', '}
          {r.split(/\s+/).map((chunk, ci) => (
            <span key={ci}>
              {ci > 0 && ' '}
              {syllables(chunk).map((s, si) => (
                <span key={si} className={`tone${s.tone}`}>
                  {toMarks(`${s.text}${s.tone}`)}
                </span>
              ))}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function TopBar({ title, back, right }: { title: ReactNode; back?: boolean; right?: ReactNode }) {
  return (
    <div className="topbar">
      {back && (
        <button className="back" onClick={() => goBack()}>
          ‹ Back
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </div>
  );
}

export function Toggle({ label, sub, checked, onChange }: { label: ReactNode; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {sub && <div className="small muted">{sub}</div>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The four grade buttons. `auto` is highlighted; with `autoAdvance` a "Got it" auto-grade
 * is accepted after ~1 s unless the user taps something else. When the user picks a different
 * grade than the highlighted one, their choice is shown for half a second before moving on.
 */
export function GradeBar({
  card,
  auto,
  autoAdvance,
  onGrade,
}: {
  card?: StoredCard;
  auto?: Grade4;
  autoAdvance?: boolean;
  onGrade: (g: Grade4) => void;
}) {
  const [now] = useState(() => Date.now());
  const intervals = card ? previewIntervals(card, now) : null;
  const done = useRef(false);
  const [chosen, setChosen] = useState<Grade4 | null>(null);
  const fire = (g: Grade4, byUser: boolean) => {
    if (done.current) return;
    done.current = true;
    if (byUser && g !== auto) {
      setChosen(g);
      setTimeout(() => onGrade(g), 500);
    } else onGrade(g);
  };
  useEffect(() => {
    if (autoAdvance && auto === 3) {
      const t = setTimeout(() => fire(3, false), 1000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoAdvance]);
  const highlighted = chosen ?? auto;
  return (
    <div className={`grades ${highlighted ? '' : 'none-auto'}`}>
      {([1, 2, 3, 4] as Grade4[]).map((g) => (
        <button key={g} className={`g${g} ${highlighted === g ? 'auto' : ''}`} onClick={() => fire(g, true)}>
          {GRADE_LABEL[g]}
          {intervals && <small>{intervals[g]}</small>}
        </button>
      ))}
    </div>
  );
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast">{msg}</div> : null, setMsg];
}

export function useCanvasSize(max = 420, reserve = 330) {
  const calc = () => Math.max(220, Math.min(max, window.innerWidth - 32, window.innerHeight - reserve));
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return size;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="menu-sheet" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
