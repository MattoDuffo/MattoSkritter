import { db, PARTS, type Part } from './db';
import { dayKey, dayStart, type Settings } from './settings';

export interface Stats {
  today: { reviews: number; minutes: number; correct: number };
  streak: number;
  wordsStudied: number;
  charsStudied: number;
  totalReviews: number;
  totalMinutes: number;
  accuracy: Record<Part, { total: number; correct: number }>;
  forecast: { label: string; count: number }[];
  heatmap: { key: string; count: number }[]; // last 84 days, oldest first
  bannedWords: number;
  pendingNew: number;
}

const DAY = 86_400_000;

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
  for (let d = 0; d < 14; d++) {
    const from = d === 0 ? -Infinity : start + d * DAY;
    const to = start + (d + 1) * DAY;
    const count = active.filter((i) => i.dueAt >= from && i.dueAt < to).length;
    const date = new Date(start + d * DAY);
    forecast.push({ label: d === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), count });
  }

  const heatmap: Stats['heatmap'] = [];
  for (let d = 83; d >= 0; d--) {
    const k = dayKey(start - d * DAY + DAY / 2, s.dayStartHour);
    heatmap.push({ key: k, count: byDay.get(k) ?? 0 });
  }

  const studiedWords = new Set(items.filter((i) => !i.charOf).map((i) => i.wordId));
  const studiedChars = new Set<string>();
  for (const i of items) if (i.part === 'write') for (const c of i.wordId) studiedChars.add(c);
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
