import type HanziWriter from 'hanzi-writer';
import { useEffect, useRef, useState } from 'react';
import { speak } from '../lib/audio';
import type { StoredCard, Word } from '../lib/db';
import { hanChars } from '../lib/pinyin';
import { schedOpts, type Settings } from '../lib/settings';
import type { Grade4 } from '../lib/srs';
import { GradeBar, Pinyin, useCanvasSize } from './common';
import { Icon } from './icons';
import { Grid, restartWriterQuiz, revealWriterChar, Writer } from './Writer';

export interface CharResult {
  mistakes: number;
  drawn: number; // strokes drawn for you
  hinted: boolean;
  revealed: boolean;
  /** the grade the player gave this character */
  grade?: Grade4;
}

/** Grade rules from the plan (section 4c). */
export function gradeChar(r: CharResult): Grade4 {
  if (r.drawn > 0 || r.revealed || r.mistakes >= 3) return 1;
  if (r.mistakes > 0 || r.hinted) return 2;
  return 3;
}

/** A character's grade: the one the player gave, else the suggested one. */
export const charGrade = (r: CharResult): Grade4 => r.grade ?? gradeChar(r);

/** A word is graded by its worst character. */
export const wordGrade = (results: CharResult[]): Grade4 => Math.min(...results.map(charGrade)) as Grade4;

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
  // trace: the whole word is drawn. quiz: the last character is graded
  const [finished, setFinished] = useState(false);
  // quiz: the current character is written and waits for its grade
  const [charDone, setCharDone] = useState(!!restored);
  // the current character is shown already written (coming back with Undo), not drawn by the player
  const [shownDone, setShownDone] = useState(!!restored);
  const restoredView = shownDone;
  // trace: a character is done and more follow: wait for a tap instead of moving on by itself
  const [awaitNext, setAwaitNext] = useState(false);
  const awaitSince = useRef(0);
  const [nonce, setNonce] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  // quiz: pinyin stays hidden until asked for (or the word is written)
  const [pinyinShown, setPinyinShown] = useState(mode === 'trace' || !!restored);
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
    if (mode === 'quiz') {
      // every character gets its own grade
      setCharDone(true);
      if (idx + 1 === chars.length && settings.autoplayAudio) speak(word.simp, word.pinyin);
      return;
    }
    if (idx + 1 < chars.length) {
      awaitSince.current = Date.now();
      setAwaitNext(true);
    } else {
      setFinished(true);
      if (settings.autoplayAudio) speak(word.simp, word.pinyin);
      setTimeout(() => onDone(null, { mistakes: 0, results: next }), 700);
    }
  };

  /** quiz: the player graded the current character; the word gets its worst character's grade */
  const gradeCurrent = (g: Grade4) => {
    const next = [...results];
    next[idx] = { ...next[idx], grade: g };
    setResults(next);
    if (idx + 1 < chars.length) {
      setCharDone(false);
      setShownDone(false);
      setIdx(idx + 1);
      return;
    }
    setFinished(true);
    onDone(wordGrade(next), { mistakes: next.reduce((n, x) => n + x.mistakes, 0), results: next });
  };

  const goNextChar = (fromCanvas = false) => {
    if (!awaitNext) return;
    // lifting the finger at the end of the last stroke must not count as the tap
    if (fromCanvas && Date.now() - awaitSince.current < 450) return;
    setAwaitNext(false);
    setIdx(idx + 1);
  };

  // Undo inside the word: at a character's grading step, clear it so it can be written again; while
  // writing, go back to the previous character's grading step (shown written, with its grade).
  const canBack = mode === 'quiz' ? !finished && (charDone || idx > 0) : !finished && (awaitNext || idx > 0);
  const back = (): boolean => {
    if (finished) return false;
    if (mode === 'quiz') {
      if (charDone) {
        setResults(results.slice(0, idx));
        setCharDone(false);
        setShownDone(false);
        resetChar();
        setNonce((n) => n + 1);
        return true;
      }
      if (idx > 0) {
        setResults(results.slice(0, idx));
        setIdx(idx - 1);
        setCharDone(true);
        setShownDone(true);
        setNonce((n) => n + 1);
        return true;
      }
      return false;
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
    if (!w || finished || charDone) return;
    cur.current.hinted = true;
    w.highlightStroke(stroke.current);
  };

  const reveal = () => {
    const w = writerRef.current;
    if (!w || finished || charDone) return;
    cur.current.revealed = true;
    w.cancelQuiz();
    revealWriterChar(w);
    w.hideCharacter();
    w.animateCharacter({ onComplete: () => finishChar() });
  };

  const last = idx + 1 === chars.length;
  const curResult = results[idx] as CharResult | undefined;
  // quiz grading step: the grade suggested for this character (or the one it had, coming back with Undo)
  const auto: Grade4 | undefined =
    mode === 'quiz' && charDone && curResult
      ? shownDone && restored && last && !curResult.grade
        ? restored.grade
        : charGrade(curResult)
      : undefined;
  // on the last character the buttons show the word's intervals: the worst of the earlier characters caps the grade
  const capBefore = results.slice(0, idx).length ? wordGrade(results.slice(0, idx)) : 4;

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
        {pinyinShown || finished || (last && charDone) ? (
          <div className="pinyin">
            <Pinyin value={word.pinyin} />
          </div>
        ) : (
          <button className="show-pinyin" onClick={() => setPinyinShown(true)}>
            Show pinyin
          </button>
        )}
        <div className="def">{word.def}</div>
      </div>
      <div className="word-row han">
        {chars.map((c, i) => {
          const r = results[i];
          const g = r ? charGrade(r) : 0;
          return (
            <span key={i} className={`slot ${i === idx && !finished && !awaitNext && !charDone ? 'current' : ''} ${r ? 'g' + g : ''}`}>
              {r ? c : ''}
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
        <>
          {/* tap anywhere on the screen (except the top bar) to go on */}
          <div className="tap-anywhere" onClick={() => goNextChar(true)} aria-label="Next character" role="button" />
          <div className="next-char-hint">Tap anywhere to move to the next character ›</div>
        </>
      )}
      {!finished && !awaitNext && !charDone && (
        <div className="canvas-tools">
          <button className="icon-btn" onClick={() => speak(word.simp, word.pinyin)} aria-label="Play audio">
            <Icon.sound />
          </button>
          {mode === 'quiz' && (
            <>
              <button
                className={`icon-btn ${showOutline ? 'on' : ''}`}
                aria-label={showOutline ? 'Hide outline' : 'Show outline'}
                aria-pressed={showOutline}
                onClick={() => {
                  cur.current.hinted = true;
                  stroke.current = 0;
                  setShowOutline(!showOutline);
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
      {charDone && mode === 'quiz' && curResult && !finished && (
        <>
          <div className="feedback small muted" style={{ margin: '8px 0' }}>
            {chars.length > 1 && `${chars[idx]} (${idx + 1}/${chars.length}) · `}
            {curResult.mistakes === 0 && !curResult.hinted && !curResult.revealed
              ? 'Perfect'
              : `${curResult.mistakes} mistake${curResult.mistakes === 1 ? '' : 's'}`}
            {curResult.drawn ? ' · strokes drawn for you' : ''}
            {curResult.revealed ? ' · revealed' : ''}
            {last && capBefore < 4 && ` · word graded by its worst character`}
          </div>
          <GradeBar
            key={`${idx}-${nonce}-${shownDone}`}
            card={last ? card : undefined}
            sched={schedOpts(settings)}
            cap={last ? capBefore : undefined}
            auto={auto}
            autoAdvance={settings.autoAdvance && !shownDone}
            onGrade={gradeCurrent}
          />
        </>
      )}
      {finished && mode === 'trace' && <div className="feedback ok">Nice — now you'll write it from memory later.</div>}
    </>
  );
}
