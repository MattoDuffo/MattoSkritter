import { useRef, useState } from 'react';
import { speak } from '../lib/audio';
import type { StoredCard, Word } from '../lib/db';
import { hanChars, syllables, toMarks } from '../lib/pinyin';
import type { Settings } from '../lib/settings';
import type { Grade4 } from '../lib/srs';
import { classifyTone, type Pt } from '../lib/tone';
import { GradeBar, useCanvasSize } from './common';
import { Icon } from './icons';

const TONE_NAME = ['', '1st', '2nd', '3rd', '4th', 'neutral'];

export function ToneCard({
  word,
  card,
  settings,
  onDone,
}: {
  word: Word;
  card?: StoredCard;
  settings: Settings;
  onDone: (grade: Grade4, info: { mistakes: number }) => void;
}) {
  const chars = hanChars(word.simp);
  const syl = syllables(word.pinyin);
  const size = Math.min(useCanvasSize(380, 400), 340);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(chars.map(() => null));
  const [path, setPath] = useState<Pt[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const drawing = useRef<Pt[] | null>(null);
  const pad = useRef<SVGSVGElement>(null);
  const finished = idx >= chars.length;
  const wrong = answers.filter((a, i) => a !== null && a !== syl[i]?.tone).length;

  const pt = (e: React.PointerEvent): Pt => {
    const r = pad.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const submit = (points: Pt[]) => {
    if (finished) return;
    const t = classifyTone(points, size);
    const expected = syl[idx].tone;
    const next = [...answers];
    next[idx] = t;
    setAnswers(next);
    const ok = t === expected;
    setFeedback({ ok, text: ok ? `${TONE_NAME[t]} tone ✓` : `You drew ${TONE_NAME[t]} tone — it's ${TONE_NAME[expected]}` });
    const ni = idx + 1;
    setTimeout(() => setPath([]), ok ? 250 : 900);
    setIdx(ni);
    if (ni >= chars.length && settings.autoplayAudio) speak(word.simp);
  };

  const auto: Grade4 = wrong === 0 ? 3 : 1;

  return (
    <>
      <div className="prompt">
        <div className="part-label">Tone</div>
        <div className="def">{word.def}</div>
      </div>
      <div className="tone-syllables">
        {chars.map((c, i) => {
          const a = answers[i];
          const st = a === null ? '' : a === syl[i].tone ? 'right' : 'wrong';
          return (
            <div key={i} className={`syl ${i === idx ? 'current' : ''} ${st}`}>
              <span className="h han">{c}</span>
              <span className="p">{a === null ? '' : toMarks(`${syl[i].text}${syl[i].tone}`)}</span>
            </div>
          );
        })}
      </div>
      <div className={`feedback ${feedback ? (feedback.ok ? 'ok' : 'bad') : ''}`}>{feedback?.text ?? 'Draw the tone of the highlighted character'}</div>
      <div className="canvas-wrap" style={{ width: size, height: size, marginTop: 6 }}>
        <svg
          ref={pad}
          className="tone-pad"
          width={size}
          height={size}
          onPointerDown={(e) => {
            if (finished) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            drawing.current = [pt(e)];
            setPath(drawing.current);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            drawing.current = [...drawing.current, pt(e)];
            setPath(drawing.current);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            const pts = drawing.current;
            drawing.current = null;
            submit(pts);
          }}
          onPointerCancel={() => {
            drawing.current = null;
            setPath([]);
          }}
        >
          <g stroke="var(--grid)" strokeWidth={1.5} strokeDasharray="6 6">
            <line x1={0} y1={size / 2} x2={size} y2={size / 2} />
          </g>
          {path.length > 0 && (
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--stroke-draw)"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {path.length === 1 && <circle cx={path[0].x} cy={path[0].y} r={7} fill="var(--stroke-draw)" />}
        </svg>
      </div>
      <div className="tone-guide">
        <span className="tone1">ˉ 1st</span>
        <span className="tone2">ˊ 2nd</span>
        <span className="tone3">ˇ 3rd</span>
        <span className="tone4">ˋ 4th</span>
        <span className="tone5">· tap</span>
      </div>
      {!finished && (
        <div className="canvas-tools">
          <button className="icon-btn" onClick={() => speak(word.simp)} aria-label="Play audio">
            <Icon.sound />
          </button>
        </div>
      )}
      {finished && <GradeBar card={card} auto={auto} autoAdvance={settings.autoAdvance} onGrade={(g) => onDone(g, { mistakes: wrong })} />}
    </>
  );
}
