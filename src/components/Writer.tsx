import HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';
import { charDataLoader, loadStrokes } from '../lib/strokes';

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

const TRANSPARENT = 'rgba(0,0,0,0)';

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
  /** `forced`: this was the last allowed miss, so the stroke was drawn for the user */
  onMistake?: (d: { strokeNum: number; mistakesOnStroke: number; totalMistakes: number; forced: boolean }) => void;
  onCorrectStroke?: (d: { strokeNum: number; strokesRemaining: number }) => void;
  onComplete?: (d: { totalMistakes: number }) => void;
}

interface Props {
  char: string;
  size: number;
  mode: 'quiz' | 'trace' | 'animate' | 'show';
  leniency?: number;
  hintAfterMisses?: number;
  /** quiz: draw the stroke for the user after this many misses on it */
  drawAfterMisses?: number;
  callbacks?: QuizCallbacks;
  writerRef?: React.MutableRefObject<HanziWriter | null>;
  onError?: () => void;
  /** change to restart */
  nonce?: number;
}

/**
 * Hanzi Writer wrapper: quiz (write from memory), trace (outline shown), animate, or show.
 * In quiz mode the character itself stays hidden while writing: accepted strokes stay as the
 * user's own ink, strokes drawn for the user appear as model strokes, and the real character
 * only appears once it is complete.
 */
export function Writer({
  char,
  size,
  mode,
  leniency = 1.4,
  hintAfterMisses = 2,
  drawAfterMisses = 3,
  callbacks,
  writerRef,
  onError,
  nonce,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const [ink, setInk] = useState<string[]>([]); // user's accepted strokes (screen coordinates)
  const [model, setModel] = useState<string[]>([]); // strokes drawn for the user (character coordinates)
  const [showInk, setShowInk] = useState(true);
  const padding = Math.round(size * 0.05);
  const hidden = mode === 'quiz';

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    host.innerHTML = '';
    setInk([]);
    setModel([]);
    setShowInk(true);
    let cancelled = false;
    const inkColor = cssVar('--ink');
    const writer = HanziWriter.create(host, char, {
      width: size,
      height: size,
      padding,
      showCharacter: mode === 'show',
      showOutline: mode === 'trace' || mode === 'animate',
      strokeColor: hidden ? TRANSPARENT : inkColor,
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
    // Reveal the real character (used on completion and by "reveal").
    const revealChar = () => {
      writer.updateColor('strokeColor', inkColor, { duration: 0 });
      // radical strokes (e.g. 阝 in 都) have their own colour
      writer.updateColor('radicalColor', inkColor, { duration: 0 });
    };
    (writer as HanziWriter & { revealChar?: () => void }).revealChar = () => {
      revealChar();
      setShowInk(false);
    };
    if (writerRef) writerRef.current = writer;
    const startQuiz = () =>
      writer.quiz({
        leniency,
        showHintAfterMisses: mode === 'trace' ? 1 : hintAfterMisses,
        acceptBackwardsStrokes: true,
        highlightOnComplete: true,
        onMistake: (d) => {
          const forced = mode === 'quiz' && d.mistakesOnStroke >= drawAfterMisses;
          if (forced) {
            if (hidden) {
              loadStrokes(char)
                .then((data) => !cancelled && setModel((m) => [...m, data.strokes[d.strokeNum]]))
                .catch(() => undefined);
            }
            queueMicrotask(() => writer.skipQuizStroke());
          }
          cb.current?.onMistake?.({ ...d, forced });
        },
        onCorrectStroke: (d) => {
          if (hidden) setInk((s) => [...s, d.drawnPath.pathString]);
          cb.current?.onCorrectStroke?.(d);
        },
        onComplete: (d) => {
          if (hidden) {
            revealChar();
            setTimeout(() => !cancelled && setShowInk(false), 150);
          }
          cb.current?.onComplete?.(d);
        },
      });
    // "Clear": restart the current character on the same writer, without revealing it.
    (writer as HanziWriter & { restartQuiz?: () => void }).restartQuiz = () => {
      writer.cancelQuiz();
      setInk([]);
      setModel([]);
      setShowInk(true);
      startQuiz();
    };
    if (mode === 'quiz' || mode === 'trace') {
      startQuiz();
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
  }, [char, size, mode, leniency, hintAfterMisses, drawAfterMisses, nonce]);

  const t = HanziWriter.getScalingTransform(size, size, padding);
  return (
    <>
      {hidden && showInk && (ink.length > 0 || model.length > 0) && (
        <svg className="ink" width={size} height={size} aria-hidden>
          <g transform={t.transform} fill="var(--ink)">
            {model.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </g>
          <g fill="none" stroke="var(--ink)" strokeWidth={Math.max(14, Math.round(size / 14))} strokeLinecap="round" strokeLinejoin="round">
            {ink.map((p, i) => (
              <path key={i} d={p} />
            ))}
          </g>
        </svg>
      )}
      <div className="writer" ref={el} data-char={char} data-mode={mode} style={{ width: size, height: size }} />
    </>
  );
}

/** Restart the quiz for the current character (the "Clear" button). */
export function restartWriterQuiz(w: HanziWriter | null) {
  (w as (HanziWriter & { restartQuiz?: () => void }) | null)?.restartQuiz?.();
}

/** Reveal a hidden quiz character (see Writer). */
export function revealWriterChar(w: HanziWriter | null) {
  (w as (HanziWriter & { revealChar?: () => void }) | null)?.revealChar?.();
}
