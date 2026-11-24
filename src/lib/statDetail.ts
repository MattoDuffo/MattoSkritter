import { PARTS, type Item, type Part, type Review } from './db';
import { dayKey, dayStart } from './settings';
import { studiedCharSet, studiedWordIds } from './stats';

export type StatKind = 'reviews' | 'time' | 'streak' | 'words' | 'chars' | 'total';
export const STAT_KINDS: StatKind[] = ['reviews', 'time', 'streak', 'words', 'chars', 'total'];

const DAY = 86_400_000;
const SESSION_GAP = 10 * 60_000;
/** Interval (days) from which a card counts as well known. */
export const MATURE_DAYS = 21;

export interface Bar {
  value: number;
  top?: string; // label over the bar (defaults to the value)
  l1: string;
  l2?: string;
  mark?: boolean; // highlight l2 (start of a month)
}

export type Stage = 'new' | 'learning' | 'young' | 'mature';
export const STAGES: Stage[] = ['learning', 'young', 'mature'];
export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Not seen yet',
  learning: 'Learning',
  young: `Reviewing (< ${MATURE_DAYS} days)`,
  mature: `Known (${MATURE_DAYS}+ days)`,
};

export function stageOf(i: Item): Stage {
  const c = i.card;
  if (c.state === 0) return 'new';
  if (c.state !== 2) return 'learning';
  return c.scheduled_days >= MATURE_DAYS ? 'mature' : 'young';
}

const STAGE_ORDER: Record<Stage, number> = { new: 0, learning: 1, young: 2, mature: 3 };
/** A word is only as known as its weakest card. */
export function weakest(items: Item[]): Stage {
  let s: Stage = 'mature';
  for (const i of items) if (STAGE_ORDER[stageOf(i)] < STAGE_ORDER[s]) s = stageOf(i);
  return s;
}

const wd = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
const mon = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short' });

/** One value per day for the last `n` days, oldest first. */
export function dailyBars(byDay: Map<string, number>, n: number, start: number, hour: number, fmt?: (v: number) => string): Bar[] {
  const out: Bar[] = [];
  for (let d = n - 1; d >= 0; d--) {
    const t = start - d * DAY + DAY / 2;
    const v = byDay.get(dayKey(t, hour)) ?? 0;
    const date = new Date(t).getDate();
    out.push({
      value: v,
      top: v ? (fmt ? fmt(v) : String(v)) : '',
      l1: d === 0 ? 'Now' : wd(t),
      l2: date === 1 ? mon(t) : String(date),
      mark: date === 1,
    });
  }
  return out;
}

/** One value per week (weeks start on Monday) for the last `n` weeks, oldest first. */
export function weeklyBars(points: { ts: number; v: number }[], n: number, start: number, hour: number, fmt?: (v: number) => string): Bar[] {
  const monday = start - ((new Date(start).getDay() + 6) % 7) * DAY;
  const sums = new Array<number>(n).fill(0);
  for (const p of points) {
    // weeks back from the current one (half a day of slack for DST shifts)
    const back = Math.max(0, Math.ceil((monday - dayStart(p.ts, hour) - DAY / 2) / (7 * DAY)));
    const idx = n - 1 - back;
    if (idx >= 0 && idx < n) sums[idx] += p.v;
  }
  return sums.map((v, i) => {
    const t = monday - (n - 1 - i) * 7 * DAY + DAY / 2;
    const date = new Date(t).getDate();
    const newMonth = date <= 7;
    return {
      value: v,
      top: v ? (fmt ? fmt(v) : String(v)) : '',
      l1: i === n - 1 ? 'Now' : String(date),
      l2: newMonth ? mon(t) : '',
      mark: newMonth,
    };
  });
}

function countByDay<T>(rows: T[], ts: (r: T) => number, v: (r: T) => number, hour: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(ts(r), hour);
    m.set(k, (m.get(k) ?? 0) + v(r));
  }
  return m;
}

export interface PartRow {
  part: Part;
  reviews: number;
  correct: number;
  minutes: number;
}

function byPart(reviews: Review[]): PartRow[] {
  return PARTS.map((part) => {
    const rs = reviews.filter((r) => r.part === part);
    return {
      part,
      reviews: rs.length,
      correct: rs.filter((r) => r.grade > 1).length,
      minutes: rs.reduce((m, r) => m + r.durationMs, 0) / 60000,
    };
  }).filter((p) => p.reviews > 0);
}

export interface Session {
  from: number;
  to: number;
  reviews: number;
  minutes: number;
}

/** Split reviews into sittings: a pause of over 10 minutes starts a new one. */
export function sessions(reviews: Review[]): Session[] {
  const rs = [...reviews].sort((a, b) => a.ts - b.ts);
  const out: Session[] = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && r.ts - last.to <= SESSION_GAP) {
      last.to = r.ts;
      last.reviews++;
      last.minutes += r.durationMs / 60000;
    } else out.push({ from: r.ts - r.durationMs, to: r.ts, reviews: 1, minutes: r.durationMs / 60000 });
  }
  return out;
}

export interface Streaks {
  current: number;
  currentFrom?: string;
  longest: number;
  longestFrom?: string;
  longestTo?: string;
  daysStudied: number;
  last30: number;
}

/** Day keys are local dates (YYYY-MM-DD); walk them as calendar days. */
export function streaks(dayKeys: Set<string>, todayKey: string): Streaks {
  const next = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(y, m - 1, d + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const prev = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(y, m - 1, d - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const sorted = [...dayKeys].sort();
  let longest = 0;
  let longestFrom: string | undefined;
  let longestTo: string | undefined;
  let run = 0;
  let runFrom = '';
  let last = '';
  for (const k of sorted) {
    if (last && next(last) === k) run++;
    else {
      run = 1;
      runFrom = k;
    }
    if (run > longest) {
      longest = run;
      longestFrom = runFrom;
      longestTo = k;
    }
    last = k;
  }
  // Today not done yet doesn't break the streak.
  let k = dayKeys.has(todayKey) ? todayKey : prev(todayKey);
  let current = 0;
  let currentFrom: string | undefined;
  while (dayKeys.has(k)) {
    current++;
    currentFrom = k;
    k = prev(k);
  }
  let last30 = 0;
  k = todayKey;
  for (let i = 0; i < 30; i++, k = prev(k)) if (dayKeys.has(k)) last30++;
  return { current, currentFrom, longest, longestFrom, longestTo, daysStudied: dayKeys.size, last30 };
}

export interface Trouble {
  id: string;
  lapses: number;
}

export interface Detail {
  // reviews today
  todayReviews: Review[];
  todayParts: PartRow[];
  grades: Record<1 | 2 | 3 | 4, number>;
  todayNew: number;
  forgotToday: string[];
  reviewBars: Bar[];
  avgReviews7: number;
  avgReviews30: number;
  bestDay?: { key: string; count: number };
  // time today
  todayMinutes: number;
  sessionsToday: Session[];
  minuteBars: Bar[];
  goalDays30: number;
  // streak
  streak: Streaks;
  heatmap: { key: string; count: number }[]; // 53 weeks, oldest first, ending today
  // words / characters
  words: Collection;
  chars: Collection;
  // all time
  totalReviews: number;
  totalMinutes: number;
  allParts: PartRow[];
  weekMinuteBars: Bar[];
  firstReview?: number;
}

export interface Collection {
  total: number;
  added: { today: number; week: number; month: number };
  stages: Record<Stage, number>;
  trouble: Trouble[];
  addedBars: Bar[];
}

export function computeDetail(
  reviews: Review[],
  items: Item[],
  opts: { dayStartHour: number; dailyGoalMinutes: number },
  now = Date.now(),
): Detail {
  const hour = opts.dayStartHour;
  const start = dayStart(now, hour);
  const todayKey = dayKey(now, hour);
  const todayReviews = reviews.filter((r) => r.ts >= start);
  const grades = { 1: 0, 2: 0, 3: 0, 4: 0 } as Detail['grades'];
  for (const r of todayReviews) grades[r.grade]++;

  const perDay = countByDay(reviews, (r) => r.ts, () => 1, hour);
  const minPerDay = countByDay(reviews, (r) => r.ts, (r) => r.durationMs / 60000, hour);
  const sumDays = (m: Map<string, number>, n: number) => {
    let s = 0;
    for (let d = 0; d < n; d++) s += m.get(dayKey(start - d * DAY + DAY / 2, hour)) ?? 0;
    return s;
  };
  let bestDay: Detail['bestDay'];
  for (const [key, count] of perDay) if (!bestDay || count > bestDay.count) bestDay = { key, count };
  let goalDays30 = 0;
  for (let d = 0; d < 30; d++) if ((minPerDay.get(dayKey(start - d * DAY + DAY / 2, hour)) ?? 0) >= opts.dailyGoalMinutes) goalDays30++;

  const forgot = new Set<string>();
  for (const r of todayReviews) if (r.grade === 1) forgot.add(r.wordId);

  const heatmap: Detail['heatmap'] = [];
  // Full weeks so the grid lines up: start on the Monday 52 weeks back.
  const firstDay = start - (52 * 7 + ((new Date(start).getDay() + 6) % 7)) * DAY;
  for (let t = firstDay; t <= start; t += DAY) {
    const k = dayKey(t + DAY / 2, hour);
    heatmap.push({ key: k, count: perDay.get(k) ?? 0 });
  }

  const fmtMin = (v: number) => String(Math.round(v));

  return {
    todayReviews,
    todayParts: byPart(todayReviews),
    grades,
    todayNew: todayReviews.filter((r) => r.prevCard.state === 0).length,
    forgotToday: [...forgot],
    reviewBars: dailyBars(perDay, 90, start, hour),
    avgReviews7: sumDays(perDay, 7) / 7,
    avgReviews30: sumDays(perDay, 30) / 30,
    bestDay,
    todayMinutes: todayReviews.reduce((m, r) => m + r.durationMs, 0) / 60000,
    sessionsToday: sessions(todayReviews),
    minuteBars: dailyBars(minPerDay, 90, start, hour, fmtMin),
    goalDays30,
    streak: streaks(new Set(perDay.keys()), todayKey),
    heatmap,
    words: wordCollection(items, start, hour),
    chars: charCollection(items, start, hour),
    totalReviews: reviews.length,
    totalMinutes: reviews.reduce((m, r) => m + r.durationMs, 0) / 60000,
    allParts: byPart(reviews),
    weekMinuteBars: weeklyBars(reviews.map((r) => ({ ts: r.ts, v: r.durationMs / 60000 })), 52, start, hour, fmtMin),
    firstReview: reviews.length ? Math.min(...reviews.map((r) => r.ts)) : undefined,
  };
}

function collection(groups: Map<string, Item[]>, addedAt: Map<string, number>, start: number, hour: number): Collection {
  const stages: Record<Stage, number> = { new: 0, learning: 0, young: 0, mature: 0 };
  const trouble: Trouble[] = [];
  for (const [id, its] of groups) {
    const live = its.filter((i) => !i.banned);
    if (live.length) stages[weakest(live)]++;
    const lapses = its.reduce((n, i) => n + i.card.lapses, 0);
    if (lapses > 0) trouble.push({ id, lapses });
  }
  trouble.sort((a, b) => b.lapses - a.lapses);
  const times = [...addedAt.values()];
  return {
    total: addedAt.size,
    added: {
      today: times.filter((t) => t >= start).length,
      week: times.filter((t) => t >= start - 6 * DAY).length,
      month: times.filter((t) => t >= start - 29 * DAY).length,
    },
    stages,
    trouble: trouble.slice(0, 10),
    addedBars: weeklyBars(times.map((ts) => ({ ts, v: 1 })), 26, start, hour),
  };
}

function wordCollection(items: Item[], start: number, hour: number): Collection {
  const ids = studiedWordIds(items);
  const groups = new Map<string, Item[]>();
  const addedAt = new Map<string, number>();
  for (const i of items) {
    if (i.charOf || !ids.has(i.wordId)) continue;
    groups.set(i.wordId, [...(groups.get(i.wordId) ?? []), i]);
    addedAt.set(i.wordId, Math.min(addedAt.get(i.wordId) ?? Infinity, i.createdAt));
  }
  return collection(groups, addedAt, start, hour);
}

function charCollection(items: Item[], start: number, hour: number): Collection {
  const chars = studiedCharSet(items);
  const groups = new Map<string, Item[]>();
  const addedAt = new Map<string, number>();
  for (const i of items) {
    if (i.part !== 'write') continue;
    for (const c of i.wordId) {
      if (!chars.has(c)) continue;
      addedAt.set(c, Math.min(addedAt.get(c) ?? Infinity, i.createdAt));
    }
    // A character's own writing card (its own word, or one made for it inside a word)
    if ([...i.wordId].length === 1) groups.set(i.wordId, [...(groups.get(i.wordId) ?? []), i]);
  }
  return collection(groups, addedAt, start, hour);
}
