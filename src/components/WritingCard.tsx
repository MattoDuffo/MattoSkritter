import type HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';
import { speak } from '../lib/audio';
import type { StoredCard, Word } from '../lib/db';
import { hanChars } from '../lib/pinyin';
import type { Settings } from '../lib/settings';
import type { Grade4 } from '../lib/srs';
import { GradeBar, Pinyin, useCanvasSize } from './common';
import { Icon } from './icons';
import { Grid, Writer } from './Writer';

interface CharResult {
  mistakes: number;
  drawn: number; // strokes drawn for you
  hinted: boolean;
  revealed: boolean;
}

/** Grade rules from the plan (section 4c). */
export function gradeChar(r: CharResult): Grade4 {
  if (r.drawn > 0 || r.revealed || r.mistakes >= 3) return 1;
  if (r.mistakes > 0 || r.hinted) return 2;
  return 3;
}

export function WritingCard({
  word,
  card,
  settings,
  mode,
  onDone,
}: {
  word: Word;
  card?: StoredCard;
  settings: Settings;
  mode: 'quiz' | 'trace';
  onDone: (grade: Grade4 | null, info: { mistakes: number }) => void;
}) {
  const chars = hanChars(word.simp);
  const size = useCanvasSize(420, 340);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  const [error, setError] = useState(false);
  const writerRef = useRef<HanziWriter | null>(null);
  const cur = useRef<CharResult>({ mistakes: 0, drawn: 0, hinted: false, revealed: false });
  const stroke = useRef(0);

  useEffect(() => {
    cur.current = { mistakes: 0, drawn: 0, hinted: false, revealed: false };
    stroke.current = 0;
    setShowOutline(false);
  }, [idx]);

  const finishChar = () => {
    const r = { ...cur.current };
    const next = [...results];
    next[idx] = r;
    setResults(next);
    if (idx + 1 < chars.length) {
      setTimeout(() => setIdx(idx + 1), 350);
    } else {
      setFinished(true);
      if (settings.autoplayAudio) speak(word.simp);
      if (mode === 'trace') setTimeout(() => onDone(null, { mistakes: 0 }), 700);
    }
  };

  const hint = () => {
    const w = writerRef.current;
    if (!w || finished) return;
    cur.current.hinted = true;
    w.highlightStroke(stroke.current);
  };

  const reveal = () => {
    const w = writerRef.current;
    if (!w || finished) return;
    cur.current.revealed = true;
    w.cancelQuiz();
    w.hideCharacter();
    w.animateCharacter({ onComplete: () => finishChar() });
  };

  const total = results.reduce((n, r) => n + (r?.mistakes ?? 0), 0);
  const auto: Grade4 | undefined = finished && mode === 'quiz' ? (Math.min(...results.map(gradeChar)) as Grade4) : undefined;

  if (error) {
    return (
      <div className="reveal-area">
        <p className="muted">No stroke data for {chars[idx]}. Skipping writing for this word.</p>
        <button className="btn primary" onClick={() => onDone(mode === 'quiz' ? 3 : null, { mistakes: 0 })}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="prompt">
        <div className="part-label">{mode === 'trace' ? 'Trace the new word' : 'Write'}</div>
        <div className="pinyin">
          <Pinyin value={word.pinyin} />
        </div>
        <div className="def">{word.def}</div>
      </div>
      <div className="word-row han">
        {chars.map((c, i) => {
          const r = results[i];
          const g = r ? gradeChar(r) : 0;
          return (
            <span key={i} className={`slot ${i === idx && !finished ? 'current' : ''} ${r ? 'g' + g : ''}`}>
              {r || (finished && i <= idx) ? c : ''}
            </span>
          );
        })}
      </div>
      <div className="canvas-wrap" style={{ width: size, height: size }}>
        <Grid size={size} kind={settings.grid} />
        <Writer
          key={`${idx}-${nonce}`}
          char={chars[idx]}
          size={size}
          mode={mode === 'trace' || showOutline ? 'trace' : 'quiz'}
          leniency={settings.leniency}
          hintAfterMisses={settings.hintAfterMisses}
          writerRef={writerRef}
          onError={() => setError(true)}
          callbacks={{
            onMistake: (d, w) => {
              if (mode === 'trace') return;
              cur.current.mistakes++;
              if (d.mistakesOnStroke >= settings.drawAfterMisses) {
                cur.current.drawn++;
                queueMicrotask(() => w.skipQuizStroke());
              }
            },
            onCorrectStroke: (d) => {
              stroke.current = d.strokeNum + 1;
            },
            onComplete: () => finishChar(),
          }}
        />
      </div>
      {!finished && (
        <div className="canvas-tools">
          <button className="icon-btn" onClick={() => speak(word.simp)} aria-label="Play audio">
            <Icon.sound />
          </button>
          {mode === 'quiz' && (
            <>
              <button
                className={`icon-btn ${showOutline ? 'on' : ''}`}
                aria-label="Show outline"
                onClick={() => {
                  cur.current.hinted = true;
                  stroke.current = 0;
                  setShowOutline(true);
                  setNonce(nonce + 1);
                }}
              >
                <Icon.outline />
              </button>
              <button className="icon-btn" onClick={hint} aria-label="Hint: show next stroke">
                <Icon.hint />
              </button>
              <button className="icon-btn" onClick={reveal} aria-label="Reveal character">
                <Icon.eye />
              </button>
            </>
          )}
        </div>
      )}
      {finished && mode === 'quiz' && (
        <>
          <div className="feedback small muted" style={{ margin: '8px 0' }}>
            {total === 0 && !results.some((r) => r.hinted || r.revealed) ? 'Perfect' : `${total} mistake${total === 1 ? '' : 's'}`}
            {results.some((r) => r.drawn) ? ' · strokes drawn for you' : ''}
            {results.some((r) => r.revealed) ? ' · revealed' : ''}
          </div>
          <GradeBar card={card} auto={auto} autoAdvance={settings.autoAdvance} onGrade={(g) => onDone(g, { mistakes: total })} />
        </>
      )}
      {finished && mode === 'trace' && <div className="feedback ok">Nice — now you'll write it from memory later.</div>}
    </>
  );
}
