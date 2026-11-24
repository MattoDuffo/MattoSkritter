import { describe, expect, it } from 'vitest';
import { formatInterval, isStruggling, knownCard, newCard, newWordAllowance, previewIntervals, review, struggleThreshold } from '../src/lib/srs';

describe('stubbornness', () => {
  it('thresholds match the plan', () => {
    expect(struggleThreshold(0)).toBe(Infinity);
    expect(struggleThreshold(50)).toBeCloseTo(30);
    expect(struggleThreshold(100)).toBeCloseTo(5);
  });
  it('eager always allows the daily limit', () => {
    expect(newWordAllowance({ newPerDay: 10, stubbornness: 0, struggling: 500, introducedToday: 3 }).allowed).toBe(7);
  });
  it('shrinks gradually', () => {
    const a = (struggling: number) => newWordAllowance({ newPerDay: 10, stubbornness: 50, struggling, introducedToday: 0 }).allowed;
    expect(a(0)).toBe(10);
    expect(a(15)).toBe(5);
    expect(a(30)).toBe(0);
    expect(a(40)).toBe(0);
  });
  it('strict stops below 5', () => {
    expect(newWordAllowance({ newPerDay: 10, stubbornness: 100, struggling: 5, introducedToday: 0 }).allowed).toBe(0);
    expect(newWordAllowance({ newPerDay: 10, stubbornness: 100, struggling: 1, introducedToday: 0 }).allowed).toBe(8);
  });
});

describe('scheduling', () => {
  it('new cards are struggling, known imported cards are not', () => {
    const now = Date.now();
    expect(isStruggling(newCard(now))).toBe(true);
    expect(isStruggling(knownCard(now, 0, 10))).toBe(false);
  });
  it('good answers push the card out, forgot brings it back', () => {
    const now = Date.now();
    let c = newCard(now);
    c = review(c, 3, now);
    c = review(c, 3, c.due);
    c = review(c, 3, c.due);
    expect(c.due - now).toBeGreaterThan(86_400_000);
    const f = review(c, 1, c.due);
    expect(f.lapses).toBe(1);
    expect(f.due - c.due).toBeLessThan(86_400_000);
  });
});

describe('grade button previews', () => {
  it('show exactly the interval grading applies, even when graded later', () => {
    const t0 = Date.UTC(2026, 10, 24, 12);
    let c = newCard(t0);
    let t = t0;
    for (const g of [3, 3, 3, 2, 3, 4, 1, 3, 3] as const) {
      const shown = previewIntervals(c, t, 1);
      for (const gg of [2, 3, 4] as const) {
        // graded 20 s after the buttons appeared
        const at = t + 20_000;
        expect(formatInterval(review(c, gg, at, 1).due - at)).toBe(shown[gg]);
      }
      expect(shown[1]).toBe('this session');
      c = review(c, g, t, 1);
      t = c.due;
    }
  });
});
