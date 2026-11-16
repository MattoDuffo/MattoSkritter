import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_LIST_NAMES, installBuiltinLists, loadBuiltinLists } from '../src/lib/builtin';
import { useDatabase } from '../src/lib/db';

describe('built-in HSK lists', () => {
  const db = useDatabase('test-builtin');
  it('has HSK 1 to 6', async () => {
    const lists = await loadBuiltinLists();
    expect(Object.keys(lists)).toEqual(BUILTIN_LIST_NAMES);
    expect(lists['HSK 1']).toHaveLength(150);
    expect(lists['HSK 6']).toHaveLength(2500);
    const all = Object.values(lists).flat().map((r) => r[0]);
    expect(new Set(all).size).toBe(all.length); // each word in one level only
  });
  it('adds them once, keeps the user’s own word data, and does not re-add deleted lists', async () => {
    await db.words.put({ id: '爱', simp: '爱', pinyin: 'ai4', def: 'my own definition', source: 'skritter', createdAt: 1 });
    expect(await installBuiltinLists()).toEqual(BUILTIN_LIST_NAMES);
    const lists = await db.lists.toArray();
    expect(lists.map((l) => l.name)).toEqual(BUILTIN_LIST_NAMES);
    expect(await db.entries.where('listId').equals(lists[0].id!).count()).toBe(150);
    expect((await db.words.get('爱'))!.def).toBe('my own definition');
    expect((await db.words.get('熊猫'))!.pinyin).toBe('xiong2mao1'); // added from a higher HSK level
    expect(await db.words.get('溍')).toBeUndefined(); // not an HSK word
    expect((await db.words.get('八'))!.pinyin).toBe('ba1');
    await db.lists.delete(lists[1].id!);
    expect(await installBuiltinLists()).toEqual([]);
    expect(await db.lists.count()).toBe(5);
  });
});
