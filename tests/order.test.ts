import { describe, expect, it } from 'vitest';
import { familyOf, spreadByWord } from '../src/lib/queue';
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
    const lo = review(c, 3, base, () => 0).due;
    const hi = review(c, 3, base, () => 0.999).due;
    expect(hi - lo).toBeGreaterThan(0.5 * DAY);
    expect(hi - lo).toBeLessThanOrEqual(DAY);
  });
});
