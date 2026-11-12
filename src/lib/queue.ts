import { db, type Item, type Part } from './db';
import { dayStart, type Settings } from './settings';
import { isStruggling, newWordAllowance } from './srs';

export type Step =
  | { kind: 'intro'; wordId: string }
  | { kind: 'trace'; itemId: string; wordId: string; family?: string }
  | { kind: 'review'; itemId: string; wordId: string; part: Part; retry?: boolean; family?: string };

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

/** Cards that would give each other away: a word's parts, and the characters studied inside it. */
export const familyOf = (s: { wordId: string; family?: string }) => s.family ?? s.wordId;

/**
 * Reorder so cards of the same word (reading, writing, meaning, its characters) are kept apart:
 * a family is not repeated within the last `gap` cards when that can be avoided.
 */
export function spreadByWord<T extends { wordId: string; family?: string }>(steps: T[], maxGap = 6): T[] {
  const rest = [...steps];
  const out: T[] = [];
  const families = new Set(steps.map(familyOf)).size;
  const gap = Math.max(1, Math.min(maxGap, families - 1));
  const lastAt = new Map<string, number>();
  const remaining = new Map<string, number>();
  for (const st of rest) remaining.set(familyOf(st), (remaining.get(familyOf(st)) ?? 0) + 1);
  while (rest.length) {
    const recent = new Set(out.slice(-gap).map(familyOf));
    // Among cards whose word wasn't seen in the last `gap` cards, prefer the word with the most
    // cards still to place (so no word is left bunched up at the end), then the original order.
    let idx = -1;
    let most = -1;
    rest.forEach((st, k) => {
      const f = familyOf(st);
      if (recent.has(f)) return;
      const n = remaining.get(f)!;
      if (n > most) {
        most = n;
        idx = k;
      }
    });
    if (idx < 0) {
      // no clean choice: take the card whose word was seen longest ago
      let best = Infinity;
      rest.forEach((st, k) => {
        const at = lastAt.get(familyOf(st)) ?? -Infinity;
        if (at < best) {
          best = at;
          idx = k;
        }
      });
    }
    const [step] = rest.splice(idx, 1);
    const f = familyOf(step);
    lastAt.set(f, out.length);
    remaining.set(f, remaining.get(f)! - 1);
    out.push(step);
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
  // Randomness in the order of due cards (setting, default up to a day) so the same cards don't always come together.
  const jitter = new Map(items.map((i) => [i.id, Math.random() * s.shuffleDays * 86_400_000]));
  const due = items
    .filter((i) => i.card.state !== 0 && i.dueAt <= now)
    .sort((a, b) => a.dueAt + jitter.get(a.id)! - (b.dueAt + jitter.get(b.id)!));

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
    reviewItems.map((i) => ({ kind: 'review' as const, itemId: i.id, wordId: i.wordId, part: i.part, family: i.charOf ?? i.wordId })),
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


/** After an intro, its new cards: trace first for writing, the graded cards spread over the next steps. */
export function stepsAfterIntro(created: Item[]): { immediate: Step[]; later: Step[] } {
  const immediate: Step[] = [];
  const later: Step[] = [];
  const ordered = [...created].sort((a, b) => Number(!!a.charOf) - Number(!!b.charOf));
  for (const it of ordered) {
    const family = it.charOf ?? it.wordId;
    if (it.part === 'write' && !it.charOf) immediate.push({ kind: 'trace', itemId: it.id, wordId: it.wordId, family });
    later.push({ kind: 'review', itemId: it.id, wordId: it.wordId, part: it.part, family });
  }
  return { immediate, later: shuffle(later) };
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
