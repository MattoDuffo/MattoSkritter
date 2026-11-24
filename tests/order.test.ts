import { describe, expect, it } from 'vitest';
import { familyOf, redoRound, spreadByWord } from '../src/lib/queue';
import { newCard, review } from '../src/lib/srs';

const DAY = 86_400_000;

describe('card order', () => {
  it('keeps the cards of one word several cards apart', () => {
    const steps = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((w) =>
      ['write', 'tone', 'defn'].map((part) => ({ wordId: w, part })),
    );
    steps.push({ wordId: '健', part: 'write', family: '健身房' } as never, { wordId: '健身房', part: 'write' });
    const out = spreadByWord(steps);
    expect(out).toHaveLength(steps.length);
    for (let i = 0; i < out.length; i++)
      for (let k = 1; k <= 4 && i + k < out.length; k++) expect(familyOf(out[i + k])).not.toBe(familyOf(out[i]));
  });

  it('shifts reviews by up to a day', () => {
    const now = Date.now();
    let c = newCard(now);
    c = review(c, 3, now);
    c = review(c, 3, c.due);
    const base = c.due;
    const lo = review(c, 3, base, { shuffleDays: 1 }, () => 0).due;
    const hi = review(c, 3, base, { shuffleDays: 1 }, () => 0.999).due;
    expect(hi - lo).toBeGreaterThan(0.5 * DAY);
    expect(hi - lo).toBeLessThanOrEqual(DAY);
    // slider at 0: no shift
    expect(review(c, 3, base, { shuffleDays: 0 }, () => 0).due).toBe(review(c, 3, base, { shuffleDays: 0 }, () => 0.999).due);
  });
});

describe('redo rounds', () => {
  const st = (w: string) => ({ kind: 'review' as const, itemId: `${w}:write`, wordId: w, part: 'write' as const });
  const steps = ['A', 'B', 'C', 'D', 'E'].map(st);

  it('repeats only the cards whose latest grade is Forgot, as retries', () => {
    const graded = [
      { idx: 0, grade: 1 },
      { idx: 1, grade: 3 },
      { idx: 2, grade: 1 },
      { idx: 2, grade: 2 }, // undone and regraded
      { idx: 3, grade: 1 },
      { idx: 4, grade: 4 },
    ];
    const out = redoRound(steps, 0, graded);
    expect(out.map((s) => s.wordId).sort()).toEqual(['A', 'D']);
    expect(out.every((s) => s.retry)).toBe(true);
  });

  it('only looks at the current round, and leaves out dropped words', () => {
    const all = [...steps, { ...st('A'), retry: true }, { ...st('D'), retry: true }];
    const graded = [
      { idx: 0, grade: 1 },
      { idx: 3, grade: 1 },
      { idx: 5, grade: 1 },
      { idx: 6, grade: 2 },
    ];
    expect(redoRound(all, 5, graded).map((s) => s.wordId)).toEqual(['A']);
    expect(redoRound(all, 5, graded, new Set(['A']))).toEqual([]);
    expect(redoRound(all, 5, [{ idx: 5, grade: 2 }, { idx: 6, grade: 3 }])).toEqual([]);
  });

  it('does not start with the card just answered when it can avoid it', () => {
    const graded = steps.map((_, idx) => ({ idx, grade: 1 }));
    for (let k = 0; k < 30; k++) expect(redoRound(steps, 0, graded)[0].wordId).not.toBe('E');
  });
});
