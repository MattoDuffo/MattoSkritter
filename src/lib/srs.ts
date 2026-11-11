import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { StoredCard } from './db';

export type Grade4 = 1 | 2 | 3 | 4; // Forgot, So-so, Got it, Too easy
export const GRADE_LABEL: Record<Grade4, string> = { 1: 'Forgot', 2: 'So-so', 3: 'Got it', 4: 'Too easy' };

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, maximum_interval: 3650 }));

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

export function review(card: StoredCard, grade: Grade4, now: number): StoredCard {
  return fromCard(scheduler.next(toCard(card), new Date(now), RATING[grade]).card);
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

/** Next interval preview for each grade, e.g. { 1: '10m', 3: '3d' }. */
export function previewIntervals(card: StoredCard, now: number): Record<Grade4, string> {
  const p = scheduler.repeat(toCard(card), new Date(now));
  const fmt = (d: Date) => formatInterval(d.getTime() - now);
  return {
    1: fmt(p[Rating.Again].card.due),
    2: fmt(p[Rating.Hard].card.due),
    3: fmt(p[Rating.Good].card.due),
    4: fmt(p[Rating.Easy].card.due),
  };
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
