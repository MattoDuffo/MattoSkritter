import { hanChars, marked, normaliseQuery, numbered, plain, toMarks } from './pinyin';

/** [simplified, traditional ('' if same), numbered pinyin, definitions "; "-joined] */
export type DictRow = [string, string, string, string];

export interface DictEntry {
  simp: string;
  trad: string;
  pinyin: string;
  def: string;
}

let rows: DictRow[] | null = null;
let bySimp: Map<string, DictRow[]> | null = null;
let plainIdx: string[] | null = null;
let numIdx: string[] | null = null;
let markIdx: string[] | null = null;
let charFreq: Map<string, number> | null = null;
let loading: Promise<void> | null = null;

/** "CL:個|个[ge4],隻|只[zhi1]" -> "measure word: 个 gè, 只 zhī" */
export function prettyDef(def: string): string {
  return def.replace(/CL:([^;]+)/g, (_, list: string) =>
    'measure word: ' +
    list
      .split(',')
      .map((m) => {
        const mm = m.trim().match(/^(?:[^|[]+\|)?([^[]+)\[([^\]]+)\]$/);
        return mm ? `${mm[1]} ${toMarks(mm[2].replace(/\s+/g, ''))}` : m.trim();
      })
      .join(', '),
  );
}

const toEntry = (r: DictRow): DictEntry => ({ simp: r[0], trad: r[1] || r[0], pinyin: r[2], def: prettyDef(r[3]) });

export function setDictRows(r: DictRow[]) {
  rows = r;
  bySimp = new Map();
  for (const row of r) {
    const list = bySimp.get(row[0]);
    if (list) list.push(row);
    else bySimp.set(row[0], [row]);
  }
  plainIdx = null;
  numIdx = null;
  markIdx = null;
  charFreq = null;
}

export function dictLoaded() {
  return rows !== null;
}

export function loadDict(): Promise<void> {
  if (rows) return Promise.resolve();
  if (!loading) {
    loading = fetch(new URL('data/dict.json', document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`dictionary download failed (${r.status})`);
        return r.json();
      })
      .then((r: DictRow[]) => setDictRows(r))
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** All dictionary entries written exactly this way (simplified). Surnames are sorted last. */
export function lookup(simp: string): DictEntry[] {
  const list = bySimp?.get(simp) ?? [];
  return [...list]
    .sort((a, b) => Number(/^[A-Z]/.test(a[2])) - Number(/^[A-Z]/.test(b[2])))
    .map(toEntry);
}

/** Pick the entry that best matches a known traditional form / pinyin. */
export function bestEntry(simp: string, hint?: { trad?: string; pinyin?: string }): DictEntry | undefined {
  const list = lookup(simp);
  if (!list.length) return undefined;
  if (hint?.trad && hint.trad !== simp) {
    const t = list.find((e) => e.trad === hint.trad);
    if (t) return t;
  }
  if (hint?.pinyin) {
    const n = numbered(hint.pinyin.split(',')[0]);
    const p = list.find((e) => numbered(e.pinyin) === n);
    if (p) return p;
  }
  return list[0];
}

/** Merge all entries for a word into one (for words added straight from the dictionary). */
export function mergedEntry(simp: string): DictEntry | undefined {
  const list = lookup(simp);
  if (!list.length) return undefined;
  const lower = list.filter((e) => !/^[A-Z]/.test(e.pinyin));
  const use = lower.length ? lower : list;
  const readings = [...new Set(use.map((e) => e.pinyin.replace(/\s+/g, '')))];
  return {
    simp,
    trad: use[0].trad,
    pinyin: readings.join(', '),
    def: use.map((e) => e.def).join('; '),
  };
}

/** How many dictionary words use each character: a rough "how common is it" signal. */
function commonness(word: string): number {
  if (!charFreq) {
    charFreq = new Map();
    for (const r of rows ?? []) for (const c of new Set(r[0])) charFreq.set(c, (charFreq.get(c) ?? 0) + 1);
  }
  let min = Infinity;
  for (const c of word) min = Math.min(min, charFreq.get(c) ?? 1);
  return min === Infinity ? 1 : min;
}

function ensureIdx() {
  if (!rows) return;
  if (!plainIdx) plainIdx = rows.map((r) => plain(r[2]));
  if (!numIdx) numIdx = rows.map((r) => numbered(r[2]));
}

export function search(query: string, limit = 60, preferred?: Set<string>): DictEntry[] {
  if (!rows) return [];
  const q = query.trim();
  if (!q) return [];
  const results: DictRow[] = [];
  const seen = new Set<DictRow>();
  const push = (r: DictRow) => {
    if (!seen.has(r) && results.length < limit) {
      seen.add(r);
      results.push(r);
    }
  };

  if (hanChars(q).length) {
    (bySimp!.get(q) ?? []).forEach(push);
    const starts: DictRow[] = [];
    const contains: DictRow[] = [];
    for (const r of rows) {
      if (r[0] === q || r[1] === q) continue;
      if (r[0].startsWith(q) || r[1].startsWith(q)) starts.push(r);
      else if (r[0].includes(q) || r[1].includes(q)) contains.push(r);
    }
    starts.sort((a, b) => a[0].length - b[0].length).forEach(push);
    contains.sort((a, b) => a[0].length - b[0].length).forEach(push);
    return results.map(toEntry);
  }

  ensureIdx();
  const nq = normaliseQuery(q);
  const ql = q.toLowerCase();
  const boost = (r: DictRow) => (preferred?.has(r[0]) ? -100 : 0);

  // English: exact meaning matches, ranked by position, number of meanings and how common the characters are.
  const exactDef: { r: DictRow; score: number }[] = [];
  const wordDef: DictRow[] = [];
  if (ql.length >= 2 && nq.numbered === null && nq.marked === null) {
    const re = new RegExp(`\\b${ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const r of rows) {
      const segs = r[3].toLowerCase().split('; ').filter((x) => !x.startsWith('cl:'));
      const at = segs.findIndex((x) => x === ql || x === `to ${ql}` || x === `a ${ql}` || x === `the ${ql}` || x.replace(/\s*\(.*?\)\s*/g, '') === ql);
      if (at >= 0) {
        const score = at * 1.5 + Math.min(segs.length, 8) - 2 * Math.log2(commonness(r[0])) + 3 * Math.abs([...r[0]].length - 2) + (/^[A-Z]/.test(r[2]) ? 50 : 0) + boost(r);
        exactDef.push({ r, score });
      } else if (wordDef.length < limit * 4 && re.test(r[3])) wordDef.push(r);
    }
  }
  exactDef.sort((a, b) => a.score - b.score).forEach((x) => push(x.r));

  const looksPinyin = /^[a-zv1-5\s']+$/i.test(q) || nq.numbered !== null || nq.marked !== null;
  if (looksPinyin && nq.plain) {
    if (nq.marked && !markIdx) markIdx = rows.map((r) => marked(r[2]));
    const exact: DictRow[] = [];
    const prefix: DictRow[] = [];
    const target = nq.marked ?? nq.numbered ?? nq.plain;
    for (let i = 0; i < rows.length; i++) {
      const key = nq.marked ? markIdx![i] : nq.numbered ? numIdx![i] : plainIdx![i];
      if (key === target) exact.push(rows[i]);
      else if (key.startsWith(target) && prefix.length < limit * 3) prefix.push(rows[i]);
    }
    const byCommon = (a: DictRow, b: DictRow) =>
      boost(a) - boost(b) || Number(/^[A-Z]/.test(a[2])) - Number(/^[A-Z]/.test(b[2])) || commonness(b[0]) - commonness(a[0]);
    exact.sort(byCommon).forEach(push);
    prefix.sort((a, b) => a[0].length - b[0].length || byCommon(a, b)).forEach(push);
  }
  wordDef.sort((a, b) => boost(a) - boost(b) || a[0].length - b[0].length || a[3].length - b[3].length).forEach(push);
  return results.map(toEntry);
}
