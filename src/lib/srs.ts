import { createEmptyCard, type AbstractScheduler, fsrs, generatorParameters, Rating, StrategyMode, type Card, type Grade } from 'ts-fsrs';
import type { StoredCard } from './db';

export type Grade4 = 1 | 2 | 3 | 4; // Forgot, So-so, Got it, Too easy
export const GRADE_LABEL: Record<Grade4, string> = { 1: 'Forgot', 2: 'So-so', 3: 'Got it', 4: 'Too easy' };

/** How intervals are shaped (all in Settings). */
export interface SchedOpts {
  /** spread of review dates, in days (see review) */
  shuffleDays: number;
  /** shortest wait before a card comes back, in minutes: the learning step */
  minMinutes: number;
  /** longest interval, in days */
  maxDays: number;
  /** recall probability the scheduler aims for when a card comes due: higher = shorter intervals */
  retention: number;
}
export const DEFAULT_SCHED: SchedOpts = { shuffleDays: 1, minMinutes: 30, maxDays: 365, retention: 0.95 };

const schedulers = new Map<string, ReturnType<typeof fsrs>>();
function schedulerFor(o: SchedOpts) {
  const key = `${o.minMinutes}_${o.maxDays}_${o.retention}`;
  let sc = schedulers.get(key);
  if (!sc) {
    const step = `${Math.max(1, Math.round(o.minMinutes))}m` as const;
    sc = fsrs(
      generatorParameters({
        enable_fuzz: true,
        request_retention: o.retention,
        maximum_interval: Math.max(1, Math.round(o.maxDays)),
        learning_steps: [step],
        relearning_steps: [step],
      }),
    );
    sc.useStrategy(StrategyMode.SEED, seedStrategy);
    schedulers.set(key, sc);
  }
  return sc;
}
/**
 * ts-fsrs seeds its interval fuzz with the exact review time by default, so the interval shown on
 * a grade button (computed when the card appears) and the one applied (when the button is tapped,
 * seconds later) were rolled separately and could differ by days. Seed from the card's state
 * before the review instead: the same card always gets the same fuzz, whenever it is graded.
 */
function seedStrategy(this: AbstractScheduler) {
  // `last` (the card before this review) is protected in the typings but set by the constructor
  return cardSeed((this as unknown as { last: Card }).last);
}

function cardSeed(c: Pick<Card, 'due' | 'reps' | 'stability' | 'difficulty'> | StoredCard): string {
  const due = typeof c.due === 'number' ? c.due : c.due.getTime();
  return `${due}_${c.reps}_${c.difficulty * c.stability}`;
}

/** A number in [0, 1) fixed by a string (FNV-1a hash). */
function hashUnit(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

const DAY = 86_400_000;

export function toCard(s: StoredCard): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review !== undefined ? new Date(s.last_review) : undefined,
  } as Card;
}

export function fromCard(c: Card): StoredCard {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as number,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

export function newCard(now: number): StoredCard {
  return fromCard(createEmptyCard(new Date(now)));
}

const RATING: Record<Grade4, Grade> = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };

/**
 * Schedule the next review. Intervals of a day or more get a random shift spanning up to
 * `shuffleDays` (setting, default 1 day), so the different parts of a word (and words learned
 * together) drift apart instead of always coming due at the same moment. The shift never moves a
 * card by more than half its interval. The shift is fixed by the card and grade (not random at
 * grading time), so the preview on the grade buttons is exactly what grading does.
 * The result always lies between the minimum and maximum interval.
 */
export function review(
  card: StoredCard,
  grade: Grade4,
  now: number,
  opts: Partial<SchedOpts> = {},
  rand: () => number = () => hashUnit(`${cardSeed(card)}_${grade}`),
): StoredCard {
  const o = { ...DEFAULT_SCHED, ...opts };
  const next = fromCard(schedulerFor(o).next(toCard(card), new Date(now), RATING[grade]).card);
  const interval = next.due - now;
  if (interval >= DAY && o.shuffleDays > 0) {
    const limit = interval / 2;
    const shift = Math.max(-limit, Math.min(limit, (rand() - 0.5) * o.shuffleDays * DAY));
    next.due = Math.round(next.due + shift);
  }
  next.due = Math.max(now + o.minMinutes * 60_000, Math.min(now + o.maxDays * DAY, next.due));
  return next;
}

/** A card treated as already known, due in `dueInDays` (used for imported "studied" words). */
export function knownCard(now: number, dueInDays: number, stabilityDays = Math.max(1, dueInDays)): StoredCard {
  return {
    due: now + dueInDays * DAY,
    stability: stabilityDays,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: Math.round(dueInDays),
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: now,
  };
}

/**
 * Time until the card comes back for each grade, e.g. { 2: '1d', 3: '3d' }, computed with the
 * same function grading uses. "Forgot" has none: the card is repeated in the session until it
 * gets at least "So-so", and that grade sets the schedule.
 */
export function previewIntervals(card: StoredCard, now: number, opts: Partial<SchedOpts> = {}): Record<Grade4, string> {
  const fmt = (g: Grade4) => formatInterval(review(card, g, now, opts).due - now);
  return { 1: 'this session', 2: fmt(2), 3: fmt(3), 4: fmt(4) };
}

export function formatInterval(ms: number): string {
  const m = ms / 60_000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/**
 * "Struggling": learned recently or failed recently and the scheduler isn't confident yet:
 * never reviewed, in (re)learning, or stability under 4 days.
 */
export function isStruggling(card: StoredCard): boolean {
  return card.state === 0 || card.state === 1 || card.state === 3 || card.stability < 4;
}

/** Struggling-word count at which new words stop, for a stubbornness value (0..100). */
export function struggleThreshold(stubbornness: number): number {
  if (stubbornness <= 0) return Infinity;
  // 100 -> 5, 50 -> 30, 1 -> ~175
  return 5 * Math.pow(6, (100 - stubbornness) / 50);
}

/**
 * How many new words may still be introduced today.
 * The daily limit shrinks gradually as struggling words pile up.
 */
export function newWordAllowance(opts: {
  newPerDay: number;
  stubbornness: number;
  struggling: number;
  introducedToday: number;
}): { allowed: number; todayCap: number; threshold: number } {
  const threshold = struggleThreshold(opts.stubbornness);
  const factor = threshold === Infinity ? 1 : Math.max(0, Math.min(1, 1 - opts.struggling / threshold));
  const todayCap = Math.floor(opts.newPerDay * factor + 1e-9);
  return { allowed: Math.max(0, todayCap - opts.introducedToday), todayCap, threshold };
}
