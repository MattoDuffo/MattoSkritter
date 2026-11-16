import hsk from '../data/hsk.json';
import { db, type Word } from './db';
import { getKV, setKV } from './settings';
import { addToList } from './words';

/**
 * Lists that ship with the app. Source: HSK 2.0 vocabulary from
 * github.com/drkameleon/complete-hsk-vocabulary (MIT), definitions from CC-CEDICT.
 * Rows: [simplified, traditional, numbered pinyin, definition].
 */
export const BUILTIN_LISTS = hsk as unknown as Record<string, [string, string, string, string][]>;

/**
 * Add the built-in lists (HSK 1, HSK 2) once. A list the user deletes is not re-added.
 * Words already in the collection keep the user's own pinyin and definitions.
 * Returns the names of the lists that were added.
 */
export async function installBuiltinLists(now = Date.now()): Promise<string[]> {
  const added: string[] = [];
  for (const [name, rows] of Object.entries(BUILTIN_LISTS)) {
    const key = `builtin:${name}`;
    if (await getKV(key, false)) continue;
    const lists = await db.lists.toArray();
    if (!lists.some((l) => l.name === name)) {
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
      for (const r of rows) await addToList(listId, r[0]);
      added.push(name);
    }
    await setKV(key, true);
  }
  return added;
}
