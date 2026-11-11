import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { search, setDictRows } from '../src/lib/dict';

const file = path.join(__dirname, '..', 'public', 'data', 'dict.json');

// Needs the generated dictionary (npm run data).
describe.skipIf(!fs.existsSync(file))('dictionary search', () => {
  setDictRows(JSON.parse(fs.readFileSync(file, 'utf8')));
  const top = (q: string, n = 3) => search(q, 10).slice(0, n).map((e) => e.simp);
  it('finds English words', () => {
    console.log(['dumpling', 'panda', 'prepare', 'water', 'teacher'].map((q) => `${q}→${top(q, 4).join(' ')}`).join(' | '));
    expect(top('panda')).toContain('熊猫');
    expect(top('dumpling')).toContain('饺子');
    expect(top('prepare', 5)).toContain('准备');
    // words in your own lists come first
    expect(search('dumpling', 5, new Set(['饺子']))[0].simp).toBe('饺子');
  });
  it('finds pinyin with or without tones', () => {
    expect(top('zhunbei')).toContain('准备');
    expect(top('zhun3bei4')).toContain('准备');
    expect(top('zhǔnbèi')).toContain('准备');
    expect(top('xiong mao')).toContain('熊猫');
  });
  it('finds hanzi', () => {
    expect(top('准备')[0]).toBe('准备');
  });
});
