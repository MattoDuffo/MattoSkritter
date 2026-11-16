import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_LISTS, installBuiltinLists } from '../src/lib/builtin';
import { useDatabase } from '../src/lib/db';

describe('built-in HSK lists', () => {
  const db = useDatabase('test-builtin');
  it('has HSK 1 and HSK 2', () => {
    expect(Object.keys(BUILTIN_LISTS)).toEqual(['HSK 1', 'HSK 2']);
    expect(BUILTIN_LISTS['HSK 1']).toHaveLength(150);
    expect(BUILTIN_LISTS['HSK 2'].length).toBeGreaterThan(140);
  });
  it('adds them once, keeps the user’s own word data, and does not re-add deleted lists', async () => {
    await db.words.put({ id: '爱', simp: '爱', pinyin: 'ai4', def: 'my own definition', source: 'skritter', createdAt: 1 });
    expect(await installBuiltinLists()).toEqual(['HSK 1', 'HSK 2']);
    const lists = await db.lists.toArray();
    expect(lists.map((l) => l.name)).toEqual(['HSK 1', 'HSK 2']);
    expect(await db.entries.where('listId').equals(lists[0].id!).count()).toBe(150);
    expect((await db.words.get('爱'))!.def).toBe('my own definition');
    expect((await db.words.get('熊猫'))).toBeUndefined();
    expect((await db.words.get('八'))!.pinyin).toBe('ba1');
    await db.lists.delete(lists[1].id!);
    expect(await installBuiltinLists()).toEqual([]);
    expect(await db.lists.count()).toBe(1);
  });
});
