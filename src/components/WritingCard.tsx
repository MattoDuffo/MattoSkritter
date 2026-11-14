import type HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';
import { speak } from '../lib/audio';
import type { StoredCard, Word } from '../lib/db';
import { hanChars } from '../lib/pinyin';
import type { Settings } from '../lib/settings';
import type { Grade4 } from '../lib/srs';
import { GradeBar, Pinyin, useCanvasSize } from './common';
import { Icon } from './icons';
import { Grid, restartWriterQuiz, revealWriterChar, Writer } from './Writer';

export interface CharResult {
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
  restored,
  registerBack,
}: {
  word: Word;
  card?: StoredCard;
  settings: Settings;
  mode: 'quiz' | 'trace';
  onDone: (grade: Grade4 | null, info: { mistakes: number; results: CharResult[] }) => void;
  /** coming back with Undo: show the card completed, with the grade that was given */
  restored?: { grade: Grade4; results: CharResult[] };
  /** lets the session's Undo step back one character inside this word */
  registerBack?: (back: (() => boolean) | null, canBack: boolean) => void;
}) {
  const chars = hanChars(word.simp);
  const size = useCanvasSize(420, 340);
  const [idx, setIdx] = useState(restored ? chars.length - 1 : 0);
  const [results, setResults] = useState<CharResult[]>(restored?.results ?? []);
  const [finished, setFinished] = useState(!!restored);
  const [restoredView, setRestoredView] = useState(!!restored);
  // a character is done and more follow: wait for a tap instead of moving on by itself
  const [awaitNext, setAwaitNext] = useState(false);
  const awaitSince = useRef(0);
  const [nonce, setNonce] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  const [error, setError] = useState(false);
  const writerRef = useRef<HanziWriter | null>(null);
  const cur = useRef<CharResult>({ mistakes: 0, drawn: 0, hinted: false, revealed: false });
  const stroke = useRef(0);

  const resetChar = () => {
    cur.current = { mistakes: 0, drawn: 0, hinted: false, revealed: false };
    stroke.current = 0;
    setShowOutline(false);
  };
  useEffect(resetChar, [idx]);

  const finishChar = () => {
    const r = { ...cur.current };
    const next = [...results];
    next[idx] = r;
    setResults(next);
    if (idx + 1 < chars.length) {
      awaitSince.current = Date.now();
      setAwaitNext(true);
    } else {
      setFinished(true);
      if (settings.autoplayAudio) speak(word.simp, word.pinyin);
      if (mode === 'trace') setTimeout(() => onDone(null, { mistakes: 0, results: next }), 700);
    }
  };

  const goNextChar = (fromCanvas = false) => {
    if (!awaitNext) return;
    // lifting the finger at the end of the last stroke must not count as the tap
    if (fromCanvas && Date.now() - awaitSince.current < 450) return;
    setAwaitNext(false);
    setIdx(idx + 1);
  };

  // Undo inside the word: back to the previous character (or reopen the one just finished).
  const canBack = finished ? chars.length > 1 && mode === 'quiz' : awaitNext || idx > 0;
  const back = (): boolean => {
    if (finished) {
      if (chars.length < 2 || mode !== 'quiz') return false;
      setResults(results.slice(0, idx));
      setFinished(false);
      setRestoredView(false);
      resetChar();
      setNonce((n) => n + 1);
      return true;
    }
    if (awaitNext) {
      setResults(results.slice(0, idx));
      setAwaitNext(false);
      resetChar();
      setNonce((n) => n + 1);
      return true;
    }
    if (idx > 0) {
      setResults(results.slice(0, idx - 1));
      setIdx(idx - 1);
      setNonce((n) => n + 1);
      return true;
    }
    return false;
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    registerBack?.(() => backRef.current(), canBack);
  }, [registerBack, canBack]);
  useEffect(() => () => registerBack?.(null, false), [registerBack]);

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
    revealWriterChar(w);
    w.hideCharacter();
    w.animateCharacter({ onComplete: () => finishChar() });
  };

  const total = results.reduce((n, r) => n + (r?.mistakes ?? 0), 0);
  const auto: Grade4 | undefined =
    finished && mode === 'quiz' ? (restoredView && restored ? restored.grade : (Math.min(...results.map(gradeChar)) as Grade4)) : undefined;

  if (error) {
    return (
      <div className="reveal-area">
        <p className="muted">No stroke data for {chars[idx]}. Skipping writing for this word.</p>
        <button className="btn primary" onClick={() => onDone(mode === 'quiz' ? 3 : null, { mistakes: 0, results: [] })}>
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
            <span key={i} className={`slot ${i === idx && !finished && !awaitNext ? 'current' : ''} ${r ? 'g' + g : ''}`}>
              {r || (finished && i <= idx) ? c : ''}
            </span>
          );
        })}
      </div>
      <div className="canvas-wrap" style={{ width: size, height: size }} onClick={awaitNext ? () => goNextChar(true) : undefined}>
        <Grid size={size} kind={settings.grid} />
        <Writer
          key={`${idx}-${nonce}`}
          char={chars[idx]}
          size={size}
          mode={restoredView ? 'show' : mode === 'trace' || showOutline ? 'trace' : 'quiz'}
          leniency={settings.leniency}
          hintAfterMisses={settings.hintAfterMisses}
          drawAfterMisses={settings.drawAfterMisses}
          writerRef={writerRef}
          onError={() => setError(true)}
          callbacks={{
            onMistake: (d) => {
              if (mode === 'trace') return;
              cur.current.mistakes++;
              if (d.forced) {
                cur.current.drawn++;
                stroke.current = d.strokeNum + 1;
              }
            },
            onCorrectStroke: (d) => {
              stroke.current = d.strokeNum + 1;
            },
            onComplete: () => finishChar(),
          }}
        />
      </div>
      {awaitNext && (
        <button className="next-char-hint" onClick={() => goNextChar()}>
          Tap to move to the next character ›
        </button>
      )}
      {!finished && !awaitNext && (
        <div className="canvas-tools">
          <button className="icon-btn" onClick={() => speak(word.simp, word.pinyin)} aria-label="Play audio">
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
              <button
                className="icon-btn"
                aria-label="Clear and start this character again"
                onClick={() => {
                  stroke.current = 0;
                  restartWriterQuiz(writerRef.current);
                }}
              >
                <Icon.clear />
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
          <GradeBar
            key={restoredView ? 'restored' : 'live'}
            card={card}
            auto={auto}
            autoAdvance={settings.autoAdvance && !restoredView}
            onGrade={(g) => onDone(g, { mistakes: total, results })}
          />
        </>
      )}
      {finished && mode === 'trace' && <div className="feedback ok">Nice — now you'll write it from memory later.</div>}
    </>
  );
}
