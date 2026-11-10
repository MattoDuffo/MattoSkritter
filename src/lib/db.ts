import Dexie, { type Table } from 'dexie';

export type Part = 'write' | 'tone' | 'defn' | 'read';
export const PARTS: Part[] = ['write', 'tone', 'defn', 'read'];
export const PART_LABEL: Record<Part, string> = {
  write: 'Writing',
  tone: 'Tone',
  defn: 'Definition',
  read: 'Reading',
};

export interface Word {
  id: string; // the simplified form (one entry per written form)
  simp: string;
  trad?: string;
  pinyin: string; // numbered pinyin
  def: string;
  notes?: string;
  mnemonic?: string;
  source: 'skritter' | 'cedict' | 'custom';
  edited?: boolean; // the user changed pinyin/definition
  createdAt: number;
  introducedAt?: number; // when the word's study items were created
}

export interface WordList {
  id?: number;
  name: string;
  active: 0 | 1;
  order: number;
  createdAt: number;
}

export interface ListEntry {
  id?: number;
  listId: number;
  wordId: string;
  pos: number;
}

/** FSRS card stored with numeric timestamps (easy to back up / restore). */
export interface StoredCard {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number; // 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review?: number;
}

export interface Item {
  id: string; // `${wordId}|${part}`
  wordId: string;
  part: Part;
  banned: 0 | 1;
  /** true when the item exists only because it's a character inside a studied word */
  charOf?: string;
  card: StoredCard;
  dueAt: number;
  createdAt: number;
}

export interface Review {
  id?: number;
  itemId: string;
  wordId: string;
  part: Part;
  grade: 1 | 2 | 3 | 4;
  ts: number;
  durationMs: number;
  mistakes?: number;
  prevCard: StoredCard; // for undo
}

export interface KV {
  key: string;
  value: unknown;
}

export class MattoDB extends Dexie {
  words!: Table<Word, string>;
  lists!: Table<WordList, number>;
  entries!: Table<ListEntry, number>;
  items!: Table<Item, string>;
  reviews!: Table<Review, number>;
  kv!: Table<KV, string>;

  constructor(name = 'mattoskritter') {
    super(name);
    this.version(1).stores({
      words: 'id, introducedAt, createdAt',
      lists: '++id, order',
      entries: '++id, listId, wordId, [listId+pos], [listId+wordId]',
      items: 'id, wordId, part, dueAt, banned, charOf',
      reviews: '++id, ts, itemId, wordId',
      kv: 'key',
    });
  }
}

export let db = new MattoDB();

/** For tests: use a separate database. */
export function useDatabase(name: string) {
  db = new MattoDB(name);
  return db;
}
