import { describe, expect, it } from 'vitest';
import { normaliseQuery, numbered, plain, syllables, toMarks, tones } from '../src/lib/pinyin';

describe('pinyin', () => {
  it('converts numbered pinyin to tone marks', () => {
    expect(toMarks('zhun3bei4')).toBe('zhǔnbèi');
    expect(toMarks('suan4 le5')).toBe('suàn le');
    expect(toMarks('lv4')).toBe('lǜ');
    expect(toMarks("ke3'ai4")).toBe("kě'ài");
    expect(toMarks('Bei3jing1')).toBe('Běijīng');
    expect(toMarks('he2, huo4')).toBe('hé, huò');
    expect(toMarks('xiu1xi5')).toBe('xiūxi');
    expect(toMarks('gou3')).toBe('gǒu');
    expect(toMarks('dui4')).toBe('duì');
    expect(toMarks('liu4')).toBe('liù');
  });
  it('splits syllables and tones', () => {
    expect(tones('ren4wei2')).toEqual([4, 2]);
    expect(tones('yi1dian3r5')).toEqual([1, 3, 5]);
    expect(tones('he2, huo4, huo2')).toEqual([2]);
    expect(syllables('nv3hai2').map((s) => s.text)).toEqual(['nü', 'hai']);
  });
  it('builds search keys', () => {
    expect(plain('Bei3 jing1')).toBe('beijing');
    expect(numbered('nü3 hai2')).toBe('nv3hai2');
    expect(normaliseQuery('Běijīng')).toEqual({ plain: 'beijing', numbered: null, marked: 'běijīng' });
    expect(normaliseQuery('bei3 jing1')).toEqual({ plain: 'beijing', numbered: 'bei3jing1', marked: null });
    expect(normaliseQuery('bei jing')).toEqual({ plain: 'beijing', numbered: null, marked: null });
  });
});
