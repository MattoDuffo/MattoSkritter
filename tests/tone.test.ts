import { describe, expect, it } from 'vitest';
import { classifyTone, type Pt } from '../src/lib/tone';

const line = (a: Pt, b: Pt, n = 20): Pt[] => Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) }));

describe('tone gestures', () => {
  const S = 300;
  it('flat', () => expect(classifyTone(line({ x: 40, y: 150 }, { x: 260, y: 160 }), S)).toBe(1));
  it('rising', () => expect(classifyTone(line({ x: 60, y: 240 }, { x: 240, y: 60 }), S)).toBe(2));
  it('dip', () => expect(classifyTone([...line({ x: 50, y: 80 }, { x: 140, y: 240 }), ...line({ x: 140, y: 240 }, { x: 250, y: 70 })], S)).toBe(3));
  it('falling', () => expect(classifyTone(line({ x: 60, y: 60 }, { x: 240, y: 240 }), S)).toBe(4));
  it('tap', () => expect(classifyTone([{ x: 100, y: 100 }, { x: 102, y: 101 }], S)).toBe(5));
});
