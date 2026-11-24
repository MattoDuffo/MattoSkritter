import { db, PARTS, type Item, type Part } from './db';
import { dayKey, dayStart, type Settings } from './settings';

export interface Stats {
  today: { reviews: number; minutes: number; correct: number };
  streak: number;
  wordsStudied: number;
  charsStudied: number;
  totalReviews: number;
  totalMinutes: number;
  accuracy: Record<Part, { total: number; correct: number }>;
  forecast: { label: string; day: number; month: string; count: number }[]; // next 365 days
  heatmap: { key: string; count: number }[]; // last 84 days, oldest first
  bannedWords: number;
  pendingNew: number;
}

const DAY = 86_400_000;
const FORECAST_DAYS = 365;

/** Words with study items of their own (not just as a character inside another word). */
export function studiedWordIds(items: Item[]): Set<string> {
  return new Set(items.filter((i) => !i.charOf).map((i) => i.wordId));
}

/** Every character you write as part of a studied item. */
export function studiedCharSet(items: Item[]): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (i.part === 'write') for (const c of i.wordId) out.add(c);
  return out;
}

export async function computeStats(s: Settings, now = Date.now()): Promise<Stats> {
  const reviews = await db.reviews.toArray();
  const items = await db.items.toArray();
  const start = dayStart(now, s.dayStartHour);

  const byDay = new Map<string, number>();
  for (const r of reviews) {
    const k = dayKey(r.ts, s.dayStartHour);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const todays = reviews.filter((r) => r.ts >= start);

  let streak = 0;
  for (let d = 0; d < 3650; d++) {
    const k = dayKey(start - d * DAY + DAY / 2, s.dayStartHour);
    if (byDay.get(k)) streak++;
    else if (d === 0) continue; // today not done yet doesn't break the streak
    else break;
  }

  const since = now - 30 * DAY;
  const accuracy = Object.fromEntries(PARTS.map((p) => [p, { total: 0, correct: 0 }])) as Stats['accuracy'];
  for (const r of reviews) {
    if (r.ts < since) continue;
    accuracy[r.part].total++;
    if (r.grade > 1) accuracy[r.part].correct++;
  }

  const forecast: Stats['forecast'] = [];
  const active = items.filter((i) => !i.banned && s.parts[i.part] && (s.charItems || !i.charOf));
  const counts = new Array<number>(FORECAST_DAYS).fill(0);
  for (const i of active) {
    const d = i.dueAt < start + DAY ? 0 : Math.floor((i.dueAt - start) / DAY);
    if (d < FORECAST_DAYS) counts[d]++;
  }
  for (let d = 0; d < FORECAST_DAYS; d++) {
    const date = new Date(start + d * DAY + DAY / 2);
    forecast.push({
      label: d === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      day: date.getDate(),
      month: date.toLocaleDateString(undefined, { month: 'short' }),
      count: counts[d],
    });
  }

  const heatmap: Stats['heatmap'] = [];
  for (let d = 83; d >= 0; d--) {
    const k = dayKey(start - d * DAY + DAY / 2, s.dayStartHour);
    heatmap.push({ key: k, count: byDay.get(k) ?? 0 });
  }

  const studiedWords = studiedWordIds(items);
  const studiedChars = studiedCharSet(items);
  const bannedWords = new Set(items.filter((i) => i.banned).map((i) => i.wordId)).size;

  const { pendingNewWords } = await import('./queue');
  return {
    today: {
      reviews: todays.length,
      minutes: todays.reduce((m, r) => m + r.durationMs, 0) / 60000,
      correct: todays.filter((r) => r.grade > 1).length,
    },
    streak,
    wordsStudied: studiedWords.size,
    charsStudied: studiedChars.size,
    totalReviews: reviews.length,
    totalMinutes: reviews.reduce((m, r) => m + r.durationMs, 0) / 60000,
    accuracy,
    forecast,
    heatmap,
    bannedWords,
    pendingNew: (await pendingNewWords()).length,
  };
}
