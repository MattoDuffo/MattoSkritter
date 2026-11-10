import { db, PARTS, type Item, type Part, type Word } from './db';
import { bestEntry, dictLoaded } from './dict';
import { hanChars, syllables } from './pinyin';
import { knownCard, newCard } from './srs';

/** Pluggable so tests can run without network. */
export let strokeCheck: (char: string) => Promise<boolean> = async (char) => {
  const { hasStrokes } = await import('./strokes');
  return hasStrokes(char);
};
export function setStrokeCheck(fn: (char: string) => Promise<boolean>) {
  strokeCheck = fn;
}

export async function writable(simp: string): Promise<boolean> {
  const chars = hanChars(simp);
  if (!chars.length) return false;
  for (const c of chars) if (!(await strokeCheck(c))) return false;
  return true;
}

export function toneable(word: Pick<Word, 'simp' | 'pinyin'>): boolean {
  const n = hanChars(word.simp).length;
  return n > 0 && syllables(word.pinyin).length === n;
}

/** Which parts a word can be studied in. */
export async function availableParts(word: Word): Promise<Part[]> {
  const out: Part[] = [];
  if (await writable(word.simp)) out.push('write');
  if (toneable(word)) out.push('tone');
  out.push('defn', 'read');
  return out;
}

export const itemId = (wordId: string, part: Part) => `${wordId}|${part}`;

interface IntroduceOpts {
  now: number;
  charItems: boolean;
  /** imported as already studied: schedule as known, due in this many days (optionally per part) */
  knownDueInDays?: number | ((part: Part) => number);
}

/**
 * Create the study items for a word (all parts it supports), plus writing items for
 * the characters inside multi-character words. Returns the ids of created items.
 */
export async function introduceWord(wordId: string, opts: IntroduceOpts): Promise<string[]> {
  const word = await db.words.get(wordId);
  if (!word) return [];
  const created: string[] = [];
  const mkCard = (part: Part) => {
    if (opts.knownDueInDays === undefined) return newCard(opts.now);
    const d = typeof opts.knownDueInDays === 'function' ? opts.knownDueInDays(part) : opts.knownDueInDays;
    return knownCard(opts.now, d, Math.max(10, d));
  };

  const parts = await availableParts(word);
  for (const part of parts) {
    const id = itemId(wordId, part);
    const existing = await db.items.get(id);
    if (existing) {
      if (existing.charOf) await db.items.update(id, { charOf: undefined });
      continue;
    }
    const card = mkCard(part);
    await db.items.add({ id, wordId, part, banned: 0, card, dueAt: card.due, createdAt: opts.now });
    created.push(id);
  }
  // Imported (already studied) words get a timestamp in the past so they don't count as "new today".
  const introducedAt = word.introducedAt ?? (opts.knownDueInDays !== undefined ? 1 : opts.now);
  await db.words.update(wordId, { introducedAt });

  const chars = hanChars(word.simp);
  if (opts.charItems && chars.length > 1) {
    const syl = syllables(word.pinyin);
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const id = itemId(c, 'write');
      if (await db.items.get(id)) continue;
      if (!(await strokeCheck(c))) continue;
      await ensureCharWord(c, syl.length === chars.length ? `${syl[i].text}${syl[i].tone}` : undefined, opts.now);
      const card = mkCard('write');
      await db.items.add({ id, wordId: c, part: 'write', banned: 0, charOf: wordId, card, dueAt: card.due, createdAt: opts.now });
      created.push(id);
    }
  }
  return created;
}

/** Make sure a single character exists as a word entry (dictionary data if available). */
export async function ensureCharWord(char: string, pinyinHint: string | undefined, now: number): Promise<Word> {
  const existing = await db.words.get(char);
  if (existing) return existing;
  const e = dictLoaded() ? bestEntry(char, { pinyin: pinyinHint }) : undefined;
  const w: Word = {
    id: char,
    simp: char,
    trad: e?.trad,
    pinyin: e?.pinyin.replace(/\s+/g, '') ?? pinyinHint ?? '',
    def: e?.def ?? '',
    source: e ? 'cedict' : 'custom',
    createdAt: now,
  };
  await db.words.put(w);
  return w;
}

export async function saveWord(w: Word) {
  await db.words.put(w);
}

/** Add a new word or update the user's version of an existing one (M4). */
export async function upsertWord(input: {
  simp: string;
  pinyin: string;
  def: string;
  trad?: string;
  notes?: string;
  source: Word['source'];
}): Promise<Word> {
  const existing = await db.words.get(input.simp);
  const now = Date.now();
  if (existing) {
    const changed = existing.pinyin !== input.pinyin || existing.def !== input.def;
    const w: Word = {
      ...existing,
      pinyin: input.pinyin,
      def: input.def,
      notes: input.notes ?? existing.notes,
      edited: existing.edited || changed,
    };
    await db.words.put(w);
    return w;
  }
  const w: Word = {
    id: input.simp,
    simp: input.simp,
    trad: input.trad,
    pinyin: input.pinyin,
    def: input.def,
    notes: input.notes,
    source: input.source,
    createdAt: now,
  };
  await db.words.add(w);
  return w;
}

export async function createList(name: string): Promise<number> {
  const count = await db.lists.count();
  return db.lists.add({ name, active: 1, order: count, createdAt: Date.now() });
}

export async function addToList(listId: number, wordId: string) {
  const exists = await db.entries.where('[listId+wordId]').equals([listId, wordId]).first();
  if (exists) return;
  const last = await db.entries.where('listId').equals(listId).toArray();
  const pos = last.reduce((m, e) => Math.max(m, e.pos), -1) + 1;
  await db.entries.add({ listId, wordId, pos });
}

export async function removeFromList(listId: number, wordId: string) {
  await db.entries.where('[listId+wordId]').equals([listId, wordId]).delete();
}

export async function deleteList(listId: number) {
  await db.transaction('rw', db.lists, db.entries, async () => {
    await db.entries.where('listId').equals(listId).delete();
    await db.lists.delete(listId);
  });
}

export async function setBanned(wordId: string, banned: boolean) {
  const items = await db.items.where('wordId').equals(wordId).toArray();
  await db.items.bulkPut(items.map((i) => ({ ...i, banned: banned ? 1 : 0 }) as Item));
}

export async function resetWord(wordId: string) {
  const now = Date.now();
  const items = await db.items.where('wordId').equals(wordId).toArray();
  await db.items.bulkPut(items.map((i) => ({ ...i, card: newCard(now), dueAt: now })));
}

export async function markKnown(wordId: string, days = 30) {
  const now = Date.now();
  const items = await db.items.where('wordId').equals(wordId).toArray();
  await db.items.bulkPut(items.map((i) => {
    const card = knownCard(now, days, days);
    return { ...i, card, dueAt: card.due };
  }));
}

export async function setItemCard(item: Item) {
  await db.items.put({ ...item, dueAt: item.card.due });
}

export { PARTS };
