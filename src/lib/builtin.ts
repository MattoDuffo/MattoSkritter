import { db, type Word } from './db';
import { getKV, setKV } from './settings';

/**
 * Lists that ship with the app: HSK 2.0 levels 1–6, from
 * github.com/drkameleon/complete-hsk-vocabulary (MIT), definitions from CC-CEDICT.
 * Rows: [simplified, traditional, numbered pinyin, definition].
 */
export type BuiltinLists = Record<string, [string, string, string, string][]>;

/** Loaded on demand (≈430 KB) so it isn't part of every app start. */
export async function loadBuiltinLists(): Promise<BuiltinLists> {
  const mod = await import('../data/hsk.json');
  return mod.default as unknown as BuiltinLists;
}

export const BUILTIN_LIST_NAMES = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];

/**
 * Add the built-in lists once each. A list the user deletes is not re-added.
 * Words already in the collection keep the user's own pinyin and definitions.
 * Returns the names of the lists that were added.
 */
export async function installBuiltinLists(now = Date.now()): Promise<string[]> {
  const missing: string[] = [];
  for (const name of BUILTIN_LIST_NAMES) if (!(await getKV(`builtin:${name}`, false))) missing.push(name);
  if (!missing.length) return [];

  const data = await loadBuiltinLists();
  const added: string[] = [];
  for (const name of missing) {
    const rows = data[name] ?? [];
    const lists = await db.lists.toArray();
    if (rows.length && !lists.some((l) => l.name === name)) {
      await db.transaction('rw', db.lists, db.words, db.entries, async () => {
        const order = lists.reduce((m, l) => Math.max(m, l.order), -1) + 1;
        const listId = await db.lists.add({ name, active: 1, order, createdAt: now });
        const existing = new Set((await db.words.bulkGet(rows.map((r) => r[0]))).filter(Boolean).map((w) => w!.id));
        const fresh: Word[] = rows
          .filter((r) => !existing.has(r[0]))
          .map(([simp, trad, pinyin, def]) => ({
            id: simp,
            simp,
            trad: trad !== simp ? trad : undefined,
            pinyin,
            def,
            source: 'cedict',
            createdAt: now,
          }));
        await db.words.bulkPut(fresh);
        await db.entries.bulkAdd(rows.map((r, pos) => ({ listId, wordId: r[0], pos })));
      });
      added.push(name);
    }
    await setKV(`builtin:${name}`, true);
  }
  return added;
}
