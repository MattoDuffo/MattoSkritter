import { describe, expect, it } from 'vitest';
import type { Item, Review, StoredCard } from '../src/lib/db';
import { computeDetail, sessions, streaks, weeklyBars } from '../src/lib/statDetail';
import { dayStart } from '../src/lib/settings';

const DAY = 86_400_000;
const MIN = 60_000;
const card = (over: Partial<StoredCard> = {}): StoredCard => ({
  due: 0, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 1, lapses: 0, state: 2, ...over,
});
const rev = (ts: number, over: Partial<Review> = {}): Review => ({
  itemId: 'a|write', wordId: 'a', part: 'write', grade: 3, ts, durationMs: MIN, prevCard: card(), ...over,
});
const item = (wordId: string, part: Item['part'], createdAt: number, c: Partial<StoredCard> = {}, charOf?: string): Item => ({
  id: `${wordId}|${part}`, wordId, part, banned: 0, card: card(c), dueAt: 0, createdAt, charOf,
});

describe('stat details', () => {
  it('finds current and longest streaks', () => {
    const days = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11']);
    // today (12th) not studied yet: streak still counts
    const s = streaks(days, '2026-01-12');
    expect(s).toMatchObject({ current: 2, currentFrom: '2026-01-10', longest: 4, longestFrom: '2026-01-01', longestTo: '2026-01-04', daysStudied: 6 });
    expect(streaks(days, '2026-01-13').current).toBe(0);
    // across a month end
    expect(streaks(new Set(['2026-01-31', '2026-02-01']), '2026-02-01').current).toBe(2);
  });

  it('splits sittings on pauses over 10 minutes', () => {
    const t = Date.UTC(2026, 0, 1, 12);
    const out = sessions([rev(t), rev(t + 5 * MIN), rev(t + 30 * MIN), rev(t + 2 * MIN)]);
    expect(out.map((s) => s.reviews)).toEqual([3, 1]);
    expect(out[0].minutes).toBe(3);
  });

  it('buckets weeks with the current week last', () => {
    const now = new Date(2026, 10, 25, 12).getTime(); // a Wednesday
    const start = dayStart(now, 4);
    const bars = weeklyBars(
      [
        { ts: now, v: 1 },
        { ts: new Date(2026, 10, 23, 12).getTime(), v: 1 }, // Monday this week
        { ts: new Date(2026, 10, 22, 12).getTime(), v: 5 }, // Sunday last week
        { ts: new Date(2026, 10, 23, 2).getTime(), v: 7 }, // 2am Monday belongs to Sunday
      ],
      4, start, 4,
    );
    expect(bars.map((b) => b.value)).toEqual([0, 0, 12, 2]);
  });

  it('summarises today and the collections', () => {
    const now = new Date(2026, 10, 25, 12).getTime();
    const reviews = [
      rev(now - 3 * MIN, { grade: 1, wordId: '你好', prevCard: card({ state: 0 }) }),
      rev(now - 2 * MIN, { grade: 4, part: 'tone' }),
      rev(now - DAY),
    ];
    const items = [
      item('你好', 'write', now, { state: 1, lapses: 2 }),
      item('你好', 'tone', now, { scheduled_days: 40 }),
      item('好', 'write', now - 10 * DAY, { scheduled_days: 40 }),
      item('你', 'write', now, { state: 1 }, '你好'),
    ];
    const d = computeDetail(reviews, items, { dayStartHour: 4, dailyGoalMinutes: 1 }, now);
    expect(d.todayReviews).toHaveLength(2);
    expect(d.grades).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1 });
    expect(d.todayNew).toBe(1);
    expect(d.forgotToday).toEqual(['你好']);
    expect(d.goalDays30).toBe(2);
    expect(d.streak.current).toBe(2);
    expect(d.words.total).toBe(2);
    expect(d.words.stages).toMatchObject({ learning: 1, mature: 1 });
    expect(d.words.added).toMatchObject({ today: 1, week: 1, month: 2 });
    expect(d.words.trouble).toEqual([{ id: '你好', lapses: 2 }]);
    expect(d.chars.total).toBe(2);
    expect(d.chars.stages).toMatchObject({ learning: 1, mature: 1 });
    expect(d.heatmap.at(-1)!.count).toBe(2);
    expect(d.reviewBars.at(-1)!.value).toBe(2);
  });
});
