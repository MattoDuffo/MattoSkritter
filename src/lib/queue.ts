import { db, type Item, type Part } from './db';
import { dayStart, type Settings } from './settings';
import { isStruggling, newWordAllowance } from './srs';

export type Step =
  | { kind: 'intro'; wordId: string }
  | { kind: 'trace'; itemId: string; wordId: string }
  | { kind: 'review'; itemId: string; wordId: string; part: Part; retry?: boolean };

export interface StudyStatus {
  due: number; // reviews due now (enabled parts, not banned)
  reviewsToday: number;
  reviewCapLeft: number;
  struggling: number; // distinct struggling words
  introducedToday: number;
  newAllowed: number;
  newTodayCap: number;
  threshold: number;
  newAvailable: number; // words in active lists not yet introduced
}

const enabled = (s: Settings, item: Item) =>
  !item.banned && s.parts[item.part] && (s.charItems || !item.charOf);

export async function activeItems(s: Settings): Promise<Item[]> {
  return (await db.items.toArray()).filter((i) => enabled(s, i));
}

/** Words in active lists, in list order, not yet introduced. */
export async function pendingNewWords(): Promise<string[]> {
  const lists = (await db.lists.orderBy('order').toArray()).filter((l) => l.active);
  const out: string[] = [];
  const seen = new Set<string>();
  const introduced = new Set((await db.words.where('introducedAt').above(0).primaryKeys()) as string[]);
  for (const l of lists) {
    const entries = await db.entries.where('[listId+pos]').between([l.id!, -Infinity], [l.id!, Infinity]).toArray();
    for (const e of entries) {
      if (seen.has(e.wordId) || introduced.has(e.wordId)) continue;
      seen.add(e.wordId);
      out.push(e.wordId);
    }
  }
  return out;
}

export async function studyStatus(s: Settings, now = Date.now()): Promise<StudyStatus> {
  const items = await activeItems(s);
  const start = dayStart(now, s.dayStartHour);
  const reviewsToday = await db.reviews.where('ts').aboveOrEqual(start).count();
  const struggling = new Set(items.filter((i) => isStruggling(i.card)).map((i) => i.wordId)).size;
  const introducedToday = await db.words.where('introducedAt').aboveOrEqual(start).count();
  const a = newWordAllowance({ newPerDay: s.newPerDay, stubbornness: s.stubbornness, struggling, introducedToday });
  const pending = await pendingNewWords();
  return {
    due: items.filter((i) => i.dueAt <= now || i.card.state === 0).length,
    reviewsToday,
    reviewCapLeft: Math.max(0, s.maxReviewsPerDay - reviewsToday),
    struggling,
    introducedToday,
    newAllowed: Math.min(a.allowed, pending.length),
    newTodayCap: a.todayCap,
    threshold: a.threshold,
    newAvailable: pending.length,
  };
}

/** Reorder so the same word never appears twice in a row (parts don't give each other away). */
export function spreadByWord<T extends { wordId: string }>(steps: T[]): T[] {
  const rest = [...steps];
  const out: T[] = [];
  while (rest.length) {
    const last = out[out.length - 1]?.wordId;
    const prev = out[out.length - 2]?.wordId;
    let idx = rest.findIndex((s) => s.wordId !== last && s.wordId !== prev);
    if (idx < 0) idx = rest.findIndex((s) => s.wordId !== last);
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Build a session: overdue reviews first (most overdue relative to interval), plus up to the
 * allowed number of new words. New words become intro steps; their cards are inserted after the intro.
 */
export async function buildSession(
  s: Settings,
  opts: { size: number; forceNew?: number; now?: number },
): Promise<{ steps: Step[]; newWords: string[] }> {
  const now = opts.now ?? Date.now();
  const status = await studyStatus(s, now);
  const items = await activeItems(s);

  // Cards created but never answered (e.g. a session was left early) come back first.
  const unseen = items.filter((i) => i.card.state === 0);
  const due = items
    .filter((i) => i.card.state !== 0 && i.dueAt <= now)
    .sort((a, b) => overdueRatio(b, now) - overdueRatio(a, now));

  let newWords: string[] = [];
  const pending = await pendingNewWords();
  if (opts.forceNew) newWords = pending.slice(0, opts.forceNew);
  else if (status.newAllowed > 0) {
    const parts = Object.values(s.parts).filter(Boolean).length || 1;
    // new words may take up to ~40% of the session
    const slots = Math.max(1, Math.floor((opts.size * 0.4) / parts));
    newWords = pending.slice(0, Math.min(status.newAllowed, slots));
  }

  const parts = Object.values(s.parts).filter(Boolean).length || 1;
  const reviewRoom = opts.forceNew
    ? Math.max(0, opts.size - newWords.length * parts)
    : Math.max(0, Math.min(opts.size - newWords.length * parts, status.reviewCapLeft));
  const reviewItems = [...unseen, ...due].slice(0, reviewRoom);
  const reviewSteps: Step[] = spreadByWord(
    reviewItems.map((i) => ({ kind: 'review' as const, itemId: i.id, wordId: i.wordId, part: i.part })),
  );

  // Interleave intros evenly through the reviews.
  const steps: Step[] = [];
  const every = newWords.length ? Math.max(1, Math.floor(reviewSteps.length / (newWords.length + 1))) : 0;
  let n = 0;
  for (let i = 0; i < reviewSteps.length; i++) {
    if (every && i > 0 && i % every === 0 && n < newWords.length) steps.push({ kind: 'intro', wordId: newWords[n++] });
    steps.push(reviewSteps[i]);
  }
  while (n < newWords.length) steps.push({ kind: 'intro', wordId: newWords[n++] });
  return { steps, newWords };
}

function overdueRatio(i: Item, now: number) {
  const interval = Math.max(1, i.card.scheduled_days) * 86_400_000;
  return (now - i.dueAt) / interval;
}

/** After an intro, its new cards: trace first for writing, the graded cards spread over the next steps. */
export function stepsAfterIntro(created: Item[]): { immediate: Step[]; later: Step[] } {
  const immediate: Step[] = [];
  const later: Step[] = [];
  const ordered = [...created].sort((a, b) => Number(!!a.charOf) - Number(!!b.charOf));
  for (const it of ordered) {
    if (it.part === 'write' && !it.charOf) immediate.push({ kind: 'trace', itemId: it.id, wordId: it.wordId });
    later.push({ kind: 'review', itemId: it.id, wordId: it.wordId, part: it.part });
  }
  return { immediate, later };
}
