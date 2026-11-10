import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { useDatabase } from '../src/lib/db';
import { importSkritter, isStudiedExport, listNameFromFile, parseExport } from '../src/lib/importer';
import { buildSession, pendingNewWords, studyStatus } from '../src/lib/queue';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { setStrokeCheck } from '../src/lib/words';

const dir = path.join(__dirname, '..', 'data', 'skritter-exports');
const files = fs.readdirSync(dir).map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));

describe('skritter export parsing', () => {
  it('parses rows, trims, dedupes', () => {
    const rows = parseExport('饺子\t餃子\tjiao3zi5\tdumpling \n饺子\t餃子\tjiao3zi5\tdumpling\n\n');
    expect(rows).toEqual([{ simp: '饺子', trad: '餃子', pinyin: 'jiao3zi5', def: 'dumpling' }]);
  });
  it('detects the export-all file and names lists', () => {
    const all = files.find((f) => f.name.includes('export-all'))!;
    expect(isStudiedExport(all.name, parseExport(all.text))).toBe(true);
    expect(listNameFromFile('export-Words_from_duolingo.txt')).toBe('Words from duolingo');
  });
});

describe('import + session', () => {
  const db = useDatabase('test-import');
  setStrokeCheck(async () => true);
  const now = new Date('2026-11-11T10:00:00').getTime();
  beforeAll(async () => {
    await importSkritter(files, { now, charItems: true, maxReviewsPerDay: 100 });
  });
  it('imports all lists and words', async () => {
    const lists = await db.lists.toArray();
    expect(lists.map((l) => l.name).sort()).toEqual(
      ['Basic duolingo words', 'Kids books', 'Personnal', 'Skritter – other', 'Words from HelloChinese Nov 2022', 'Words from duolingo'].sort(),
    );
    const studied = await db.words.where('introducedAt').above(0).count();
    expect(studied).toBe(714);
    expect((await pendingNewWords()).length).toBeGreaterThan(400);
  });
  it('keeps custom definitions', async () => {
    expect((await db.words.get('辛苦了'))?.def).toBe('exhausting (Hard working)');
  });
  it('spreads reviews over the first days', async () => {
    const items = await db.items.toArray();
    const day1 = items.filter((i) => i.dueAt <= now + 86_400_000);
    expect(day1.length).toBeLessThanOrEqual(110);
    expect(day1.length).toBeGreaterThan(20);
    expect(day1.every((i) => i.part === 'write')).toBe(true);
  });
  it('builds a session with reviews and new words', async () => {
    const s = { ...DEFAULT_SETTINGS, stubbornness: 0 };
    const st = await studyStatus(s, now + 3600_000);
    expect(st.newAllowed).toBe(10);
    const { steps, newWords } = await buildSession(s, { size: 30, now: now + 3600_000 });
    expect(newWords.length).toBeGreaterThan(0);
    expect(steps.filter((x) => x.kind === 'intro').length).toBe(newWords.length);
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].kind === 'review' && steps[i - 1].kind === 'review') expect(steps[i].wordId).not.toBe(steps[i - 1].wordId);
    }
  });
});
