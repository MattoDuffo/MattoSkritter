import { useCallback, useEffect, useRef, useState } from 'react';
import { IntroCard } from '../components/IntroCard';
import { Icon } from '../components/icons';
import { RevealCard } from '../components/RevealCard';
import { ToneCard } from '../components/ToneCard';
import { WritingCard } from '../components/WritingCard';
import { Sheet, useToast } from '../components/common';
import { db, PART_LABEL, type Item, type StoredCard, type Word } from '../lib/db';
import { buildSession, stepsAfterIntro, type Step } from '../lib/queue';
import { loadSettings, type Settings } from '../lib/settings';
import { review, type Grade4 } from '../lib/srs';
import { introduceWord, markKnown, setBanned, upsertWord } from '../lib/words';
import { go } from '../router';

interface HistoryEntry {
  idx: number;
  itemId: string;
  prevCard: StoredCard;
  reviewId: number;
  insertedRetryAt: number | null;
}

export function Session({ forceNew }: { forceNew?: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [word, setWord] = useState<Word | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<{ pinyin: string; def: string } | null>(null);
  const [results, setResults] = useState<{ grade: Grade4; ms: number }[]>([]);
  const [cardKey, setCardKey] = useState(0);
  const started = useRef(Date.now());
  const [toast, showToast] = useToast();

  const start = useCallback(async (extraNew?: number) => {
    const s = await loadSettings();
    setSettings(s);
    const { steps } = await buildSession(s, { size: s.sessionSize, forceNew: extraNew });
    setSteps(steps);
    setIdx(0);
    setHistory([]);
    setResults([]);
  }, []);

  useEffect(() => {
    start(forceNew);
  }, [start, forceNew]);

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

  const next = () => setIdx((i) => i + 1);

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
      const s = [...(old ?? [])];
      s.splice(idx + 1, 0, ...immediate);
      let pos = idx + 1 + immediate.length + 1;
      for (const l of later) {
        pos = Math.min(pos, s.length);
        s.splice(pos, 0, l);
        pos += 2;
      }
      return s;
    });
    next();
  };

  const grade = async (g: Grade4 | null, info: { mistakes?: number } = {}) => {
    if (!step || step.kind !== 'review' || !item) {
      next();
      return;
    }
    if (g === null) return next();
    const now = Date.now();
    const ms = Math.min(now - started.current, 90_000);
    const card = review(item.card, g, now);
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
    if (g === 1 && !step.retry) {
      // see it again a few cards later in this session
      insertedRetryAt = Math.min(idx + 5, steps!.length);
      const retry: Step = { ...step, retry: true };
      setSteps((old) => {
        const s = [...(old ?? [])];
        s.splice(insertedRetryAt!, 0, retry);
        return s;
      });
    }
    setHistory((h) => [...h, { idx, itemId: item.id, prevCard: item.card, reviewId, insertedRetryAt }]);
    setResults((r) => [...r, { grade: g, ms }]);
    next();
  };

  const undo = async () => {
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
    setHistory((h) => h.slice(0, -1));
    setResults((r) => r.slice(0, -1));
    setIdx(last.idx);
    setCardKey((k) => k + 1);
  };

  const skipWord = (wordId: string) => setSteps((old) => (old ?? []).filter((s, i) => i <= idx || s.wordId !== wordId));

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

  if (!steps || !settings) return <div className="loading">Preparing your session…</div>;

  const total = steps.length;
  const done = idx >= total;

  if (total === 0 || done) {
    const n = results.length;
    const correct = results.filter((r) => r.grade > 1).length;
    const mins = results.reduce((m, r) => m + r.ms, 0) / 60000;
    return (
      <div className="session">
        <div className="session-top">
          <button className="icon-btn" onClick={() => go({ name: 'home' })} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        <div className="reveal-area">
          {total === 0 ? (
            <>
              <div className="big-han han">好</div>
              <h2>Nothing due right now</h2>
              <p className="muted">You're all caught up. You can add new words now if you like.</p>
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
          {total > 0 && (
            <button className="btn primary big" onClick={() => start()}>
              Keep going
            </button>
          )}
          <button className="btn big" onClick={() => start(5)}>
            Add 5 new words now
          </button>
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
        <div className="progress">
          <div style={{ width: `${(100 * idx) / total}%` }} />
        </div>
        <span className="small muted">
          {idx}/{total}
        </span>
        <button className="undo-btn" disabled={!history.length} onClick={undo} aria-label="Undo last answer">
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
        <WritingCard key={cardKey} word={word} settings={settings} mode="trace" onDone={() => next()} />
      )}
      {step && word && item && step.kind === 'review' && (
        <>
          {item.part === 'write' && (
            <WritingCard key={cardKey} word={word} card={item.card} settings={settings} mode="quiz" onDone={(g, i) => grade(g, i)} />
          )}
          {item.part === 'tone' && <ToneCard key={cardKey} word={word} card={item.card} settings={settings} onDone={(g, i) => grade(g, i)} />}
          {(item.part === 'defn' || item.part === 'read') && (
            <RevealCard key={cardKey} word={word} card={item.card} part={item.part} settings={settings} onDone={(g) => grade(g)} />
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
