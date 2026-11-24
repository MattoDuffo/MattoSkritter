import { useCallback, useEffect, useRef, useState } from 'react';
import { IntroCard } from '../components/IntroCard';
import { Icon } from '../components/icons';
import { RevealCard } from '../components/RevealCard';
import { ToneCard } from '../components/ToneCard';
import { WritingCard, type CharResult } from '../components/WritingCard';
import { Sheet, useToast } from '../components/common';
import { db, PART_LABEL, type Item, type StoredCard, type Word } from '../lib/db';
import { buildSession, pendingNewWords, redoRound, stepsAfterIntro, topUpLearn, type Step } from '../lib/queue';
import { loadSettings, schedOpts, type Settings } from '../lib/settings';
import { review, type Grade4 } from '../lib/srs';
import { introduceWord, markKnown, setBanned, upsertWord } from '../lib/words';
import { go } from '../router';

interface HistoryEntry {
  idx: number;
  itemId: string;
  prevCard: StoredCard;
  reviewId: number;
  insertedRetryAt: number | null;
  grade: Grade4;
  snapshot: Snapshot;
}

/** What a card looked like when it was answered, so Undo can show it completed again. */
interface Snapshot {
  results?: CharResult[];
  answers?: (number | null)[];
}

/**
 * A practice session (reviews only), or with `learn` an endless run of new words from the active
 * lists: each word is introduced, traced and quizzed, with the next word queued as you go.
 */
export function Session({ learn = false }: { learn?: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [word, setWord] = useState<Word | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<{ pinyin: string; def: string } | null>(null);
  const [results, setResults] = useState<{ grade: Grade4; ms: number; retry: boolean }[]>([]);
  // Practice mode goes in rounds: where each round starts in `steps`. A round's "Forgot" cards are
  // shuffled into a new round at its end, until every card has at least "So-so".
  const [rounds, setRounds] = useState<number[]>([0]);
  // words banned or marked known during the session: their failed cards aren't repeated
  const dropped = useRef(new Set<string>());
  const [cardKey, setCardKey] = useState(0);
  // set by Undo: the card we went back to is shown completed, with its grade
  const [restored, setRestored] = useState<{ idx: number; grade: Grade4; snapshot: Snapshot } | null>(null);
  // the writing card can step back one character inside the word
  const cardBack = useRef<(() => boolean) | null>(null);
  const [cardCanBack, setCardCanBack] = useState(false);
  const registerBack = useCallback((fn: (() => boolean) | null, can: boolean) => {
    cardBack.current = fn;
    setCardCanBack(!!fn && can);
  }, []);
  const started = useRef(Date.now());
  const [toast, showToast] = useToast();
  // Learn mode: words in the active lists not yet introduced, in list order (read once at start)
  const pending = useRef<string[]>([]);

  const start = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
    if (learn) {
      pending.current = await pendingNewWords();
      setSteps(topUpLearn([], pending.current, -1));
    } else {
      const { steps } = await buildSession(s, { size: s.sessionSize });
      setSteps(steps);
    }
    setIdx(0);
    setHistory([]);
    setResults([]);
    setRounds([0]);
    dropped.current = new Set();
  }, [learn]);

  useEffect(() => {
    start();
  }, [start]);

  // Learn mode never runs dry while words are left: keep the next new word queued.
  useEffect(() => {
    if (!learn || !steps) return;
    const topped = topUpLearn(steps, pending.current, idx);
    if (topped !== steps) setSteps(topped);
  }, [learn, steps, idx]);

  // Practice mode: at the end of a round, go through its failed cards again (shuffled).
  const roundStart = rounds[rounds.length - 1];
  const atRoundEnd = !learn && !!steps && steps.length > 0 && idx >= steps.length;
  const redoPending = atRoundEnd && redoRound(steps!, roundStart, history, dropped.current).length > 0;
  useEffect(() => {
    if (!atRoundEnd || !steps) return;
    const redo = redoRound(steps, roundStart, history, dropped.current);
    if (!redo.length) return;
    setRounds((r) => [...r, steps.length]);
    setSteps([...steps, ...redo]);
  }, [atRoundEnd, steps, roundStart, history]);

  const step = steps?.[idx];

  // Load word + item for the current step
  useEffect(() => {
    let alive = true;
    setWord(null);
    setItem(null);
    if (!step) return;
    (async () => {
      const w = await db.words.get(step.wordId);
      const it = step.kind === 'intro' ? null : (await db.items.get(step.itemId)) ?? null;
      if (!alive) return;
      if (!w || (step.kind !== 'intro' && !it)) {
        setIdx((i) => i + 1); // stale step (deleted word) - skip
        return;
      }
      setWord(w);
      setItem(it);
      started.current = Date.now();
      setCardKey((k) => k + 1);
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  const next = () => {
    setRestored(null);
    setIdx((i) => i + 1);
  };

  const introduce = async (known: boolean) => {
    if (!step || step.kind !== 'intro' || !settings) return;
    const now = Date.now();
    const ids = await introduceWord(step.wordId, { now, charItems: settings.charItems });
    if (known) {
      await markKnown(step.wordId, 30);
      showToast('Marked as known');
      next();
      return;
    }
    const created = ((await db.items.bulkGet(ids)).filter(Boolean) as Item[]).filter(
      (i) => settings.parts[i.part] && (settings.charItems || !i.charOf),
    );
    const { immediate, later } = stepsAfterIntro(created);
    setSteps((old) => {
      let s = [...(old ?? [])];
      s.splice(idx + 1, 0, ...immediate);
      // In Learn mode the next word is queued first, so this word's cards can come after it.
      if (learn) s = [...topUpLearn(s, pending.current, idx + immediate.length)];
      // Spread the new word's cards over the rest of the session, at least a few cards apart,
      // so its reading, writing and meaning don't come one after the other.
      const start = idx + 1 + immediate.length + (learn ? 1 : 2);
      const room = Math.max(0, s.length - start);
      const gap = Math.max(4, Math.floor(room / Math.max(1, later.length)));
      later.forEach((l, k) => {
        const pos = Math.min(start + k * gap + k, s.length);
        s.splice(pos, 0, l);
      });
      return s;
    });
    next();
  };

  const grade = async (g: Grade4 | null, info: { mistakes?: number } & Snapshot = {}) => {
    setRestored(null);
    if (!step || step.kind !== 'review' || !item) {
      next();
      return;
    }
    if (g === null) return next();
    const now = Date.now();
    const ms = Math.min(now - started.current, 90_000);
    const card = review(item.card, g, now, schedOpts(settings!));
    await db.items.put({ ...item, card, dueAt: card.due });
    const reviewId = await db.reviews.add({
      itemId: item.id,
      wordId: item.wordId,
      part: item.part,
      grade: g,
      ts: now,
      durationMs: ms,
      mistakes: info.mistakes,
      prevCard: item.card,
    });
    let insertedRetryAt: number | null = null;
    if (g === 1 && learn) {
      // Learn mode has no end of round: see it again a few cards later, until it's at least "So-so".
      // (Practice mode repeats failed cards in a new round at the end, see redoRound.)
      insertedRetryAt = Math.min(idx + 5, steps!.length);
      const retry: Step = { ...step, retry: true };
      setSteps((old) => {
        const s = [...(old ?? [])];
        s.splice(insertedRetryAt!, 0, retry);
        return s;
      });
    }
    const snapshot: Snapshot = { results: info.results, answers: info.answers };
    setHistory((h) => [...h, { idx, itemId: item.id, prevCard: item.card, reviewId, insertedRetryAt, grade: g, snapshot }]);
    setResults((r) => [...r, { grade: g, ms, retry: !!step.retry }]);
    next();
  };

  /**
   * Undo / back: inside a multi-character word, go back one character; otherwise go back to the
   * previous card, shown completed with the grade it got (tap a grade to keep or change it).
   */
  const undo = async () => {
    if (cardBack.current?.()) return;
    const last = history[history.length - 1];
    if (!last) return;
    const it = await db.items.get(last.itemId);
    if (it) await db.items.put({ ...it, card: last.prevCard, dueAt: last.prevCard.due });
    await db.reviews.delete(last.reviewId);
    if (last.insertedRetryAt !== null) {
      setSteps((old) => {
        const s = [...(old ?? [])];
        s.splice(last.insertedRetryAt!, 1);
        return s;
      });
    }
    if (last.idx < roundStart) {
      // back into the previous round: its redo round is rebuilt when it ends again
      setSteps((old) => (old ?? []).slice(0, roundStart));
      setRounds((r) => r.slice(0, -1));
    }
    setHistory((h) => h.slice(0, -1));
    setResults((r) => r.slice(0, -1));
    setRestored({ idx: last.idx, grade: last.grade, snapshot: last.snapshot });
    setIdx(last.idx);
    setCardKey((k) => k + 1);
  };
  const rest = restored && restored.idx === idx ? restored : null;

  const skipWord = (wordId: string) => {
    dropped.current.add(wordId);
    setSteps((old) => (old ?? []).filter((s, i) => i <= idx || s.wordId !== wordId));
  };

  const menuAction = async (a: 'ban' | 'known' | 'edit' | 'skip') => {
    setMenu(false);
    if (!word) return;
    if (a === 'ban') {
      await setBanned(word.id, true);
      skipWord(word.id);
      showToast(`${word.simp} banned — it won't be shown again`);
      next();
    } else if (a === 'known') {
      await introduceWord(word.id, { now: Date.now(), charItems: settings!.charItems });
      await markKnown(word.id, 30);
      skipWord(word.id);
      showToast(`${word.simp} marked as known`);
      next();
    } else if (a === 'skip') {
      next();
    } else {
      setEditing({ pinyin: word.pinyin, def: word.def });
    }
  };

  const saveEdit = async () => {
    if (!word || !editing) return;
    const w = await upsertWord({ simp: word.simp, pinyin: editing.pinyin.trim(), def: editing.def.trim(), source: word.source });
    setWord(w);
    setEditing(null);
    showToast('Saved');
  };

  if (!steps || !settings || redoPending) return <div className="loading">Preparing your session…</div>;

  const total = steps.length;
  const done = idx >= total;
  // intros already passed in this session (words learned or marked known)
  const learnedCount = steps.slice(0, idx).filter((x) => x.kind === 'intro').length;

  if (total === 0 || done) {
    // accuracy counts first answers only, not the repeats of failed cards
    const first = results.filter((r) => !r.retry);
    const n = first.length;
    const correct = first.filter((r) => r.grade > 1).length;
    const mins = results.reduce((m, r) => m + r.ms, 0) / 60000;
    return (
      <div className="session">
        <div className="session-top">
          <button className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <div className="reveal-area">
          {learn ? (
            <>
              <div className="big-han han">{total === 0 ? '空' : '棒'}</div>
              <h2>{total === 0 ? 'No new words left' : 'All new words learned'}</h2>
              <p className="muted">
                {total === 0
                  ? 'Every word in your active lists has been learned. Add words or turn on another list to learn more.'
                  : `You've gone through every new word in your active lists (${learnedCount} this time).`}
              </p>
            </>
          ) : total === 0 ? (
            <>
              <div className="big-han han">好</div>
              <h2>Nothing due right now</h2>
              <p className="muted">You're all caught up.</p>
            </>
          ) : (
            <>
              <div className="big-han han">{correct / Math.max(1, n) >= 0.8 ? '棒' : '好'}</div>
              <h2>Session complete</h2>
              <p className="muted">
                {n} reviews · {Math.round((100 * correct) / Math.max(1, n))}% correct · {mins < 1 ? '<1' : Math.round(mins)} min
              </p>
            </>
          )}
        </div>
        <div className="stack" style={{ marginTop: 'auto' }}>
          {!learn && total > 0 && (
            <button className="btn primary big" onClick={() => start()}>
              Keep going
            </button>
          )}
          {learn && total === 0 && (
            <button className="btn big" onClick={() => go({ name: 'lists' })}>
              Lists
            </button>
          )}
          {history.length > 0 && (
            <button className="btn ghost block" onClick={undo}>
              Undo last answer
            </button>
          )}
          <button className="btn ghost block" onClick={() => go({ name: 'home' })}>
            Done
          </button>
        </div>
        {toast}
      </div>
    );
  }

  return (
    <div className="session">
      <div className="session-top">
        <button className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Close">
          <Icon.close />
        </button>
        {learn ? (
          <span className="small muted" style={{ flex: 1 }}>
            Learning new words · {learnedCount} so far
          </span>
        ) : (
          <>
            <div className="progress">
              <div style={{ width: `${(100 * (idx - roundStart)) / (total - roundStart)}%` }} />
            </div>
            <span className="small muted">
              {roundStart > 0 && 'Redo '}
              {idx - roundStart}/{total - roundStart}
            </span>
          </>
        )}
        <button className="undo-btn" disabled={!history.length && !cardCanBack} onClick={undo} aria-label="Undo / back">
          <Icon.undo />
          Undo
        </button>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More">
          <Icon.more />
        </button>
      </div>
      {step && word && step.kind === 'intro' && (
        <IntroCard key={cardKey} word={word} settings={settings} onStart={() => introduce(false)} onKnown={() => introduce(true)} />
      )}
      {step && word && step.kind === 'trace' && (
        <WritingCard key={cardKey} word={word} settings={settings} mode="trace" onDone={() => next()} registerBack={registerBack} />
      )}
      {step && word && item && step.kind === 'review' && (
        <>
          {item.part === 'write' && (
            <WritingCard
              key={cardKey}
              word={word}
              card={item.card}
              settings={settings}
              mode="quiz"
              onDone={(g, i) => grade(g, i)}
              registerBack={registerBack}
              restored={rest && rest.snapshot.results ? { grade: rest.grade, results: rest.snapshot.results } : undefined}
            />
          )}
          {item.part === 'tone' && (
            <ToneCard
              key={cardKey}
              word={word}
              card={item.card}
              settings={settings}
              onDone={(g, i) => grade(g, i)}
              restored={rest && rest.snapshot.answers ? { grade: rest.grade, answers: rest.snapshot.answers } : undefined}
            />
          )}
          {(item.part === 'defn' || item.part === 'read') && (
            <RevealCard
              key={cardKey}
              word={word}
              card={item.card}
              part={item.part}
              settings={settings}
              onDone={(g) => grade(g)}
              restored={rest ? { grade: rest.grade } : undefined}
            />
          )}
        </>
      )}
      {!word && <div className="loading">…</div>}

      {menu && word && (
        <Sheet onClose={() => setMenu(false)}>
          <div className="small muted" style={{ padding: '6px 12px' }}>
            {word.simp} · {item ? PART_LABEL[item.part] : 'new word'}
          </div>
          <button className="menu-item" onClick={() => menuAction('edit')}>
            Edit pinyin / definition
          </button>
          <button className="menu-item" onClick={() => menuAction('known')}>
            Mark as known (show in a month)
          </button>
          <button className="menu-item" onClick={() => menuAction('skip')}>
            Skip this card
          </button>
          <button className="menu-item" style={{ color: 'var(--bad)' }} onClick={() => menuAction('ban')}>
            Ban word (never show)
          </button>
        </Sheet>
      )}
      {editing && (
        <Sheet onClose={() => setEditing(null)}>
          <label className="field">
            <span>Pinyin (numbers, e.g. zhun3bei4)</span>
            <input type="text" value={editing.pinyin} onChange={(e) => setEditing({ ...editing, pinyin: e.target.value })} />
          </label>
          <label className="field">
            <span>Definition</span>
            <textarea value={editing.def} onChange={(e) => setEditing({ ...editing, def: e.target.value })} />
          </label>
          <button className="btn primary block" onClick={saveEdit}>
            Save
          </button>
        </Sheet>
      )}
      {toast}
    </div>
  );
}
