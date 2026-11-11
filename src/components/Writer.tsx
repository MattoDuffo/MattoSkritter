import HanziWriter from 'hanzi-writer';
import { useEffect, useRef } from 'react';
import { charDataLoader } from '../lib/strokes';

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function Grid({ size, kind }: { size: number; kind: 'mi' | 'tian' | 'none' }) {
  if (kind === 'none') return null;
  const s = size;
  const dash = '6 6';
  return (
    <svg className="grid" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <g stroke="var(--grid)" strokeWidth={1.5} strokeDasharray={dash} fill="none">
        <line x1={0} y1={s / 2} x2={s} y2={s / 2} />
        <line x1={s / 2} y1={0} x2={s / 2} y2={s} />
        {kind === 'mi' && (
          <>
            <line x1={0} y1={0} x2={s} y2={s} />
            <line x1={s} y1={0} x2={0} y2={s} />
          </>
        )}
      </g>
    </svg>
  );
}

export interface QuizCallbacks {
  onMistake?: (d: { strokeNum: number; mistakesOnStroke: number; totalMistakes: number }, writer: HanziWriter) => void;
  onCorrectStroke?: (d: { strokeNum: number; strokesRemaining: number }, writer: HanziWriter) => void;
  onComplete?: (d: { totalMistakes: number }) => void;
}

interface Props {
  char: string;
  size: number;
  mode: 'quiz' | 'trace' | 'animate' | 'show';
  leniency?: number;
  hintAfterMisses?: number;
  callbacks?: QuizCallbacks;
  writerRef?: React.MutableRefObject<HanziWriter | null>;
  onError?: () => void;
  /** change to restart */
  nonce?: number;
}

/** Hanzi Writer wrapper: quiz (write from memory), trace (outline shown), animate, or show. */
export function Writer({ char, size, mode, leniency = 1.4, hintAfterMisses = 2, callbacks, writerRef, onError, nonce }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    host.innerHTML = '';
    let cancelled = false;
    const writer = HanziWriter.create(host, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.05),
      showCharacter: mode === 'show',
      showOutline: mode === 'trace' || mode === 'animate',
      strokeColor: cssVar('--ink'),
      outlineColor: cssVar('--outline'),
      highlightColor: cssVar('--hint'),
      drawingColor: cssVar('--stroke-draw'),
      radicalColor: null,
      drawingWidth: Math.max(14, Math.round(size / 14)),
      strokeAnimationSpeed: 1.4,
      delayBetweenStrokes: 180,
      strokeFadeDuration: 250,
      renderer: 'svg',
      charDataLoader,
      onLoadCharDataError: () => {
        if (!cancelled) onError?.();
      },
    });
    if (writerRef) writerRef.current = writer;
    if (mode === 'quiz' || mode === 'trace') {
      writer.quiz({
        leniency,
        showHintAfterMisses: mode === 'trace' ? 1 : hintAfterMisses,
        acceptBackwardsStrokes: true,
        highlightOnComplete: true,
        onMistake: (d) => cb.current?.onMistake?.(d, writer),
        onCorrectStroke: (d) => cb.current?.onCorrectStroke?.(d, writer),
        onComplete: (d) => cb.current?.onComplete?.(d),
      });
    } else if (mode === 'animate') {
      writer.animateCharacter();
    }
    return () => {
      cancelled = true;
      try {
        writer.cancelQuiz();
      } catch {
        /* ignore */
      }
      if (writerRef && writerRef.current === writer) writerRef.current = null;
      host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, size, mode, leniency, hintAfterMisses, nonce]);

  return <div className="writer" ref={el} data-char={char} data-mode={mode} style={{ width: size, height: size }} />;
}
