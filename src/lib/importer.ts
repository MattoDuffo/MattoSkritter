import { db, type Item, type Part, type Word } from './db';
import { knownCard } from './srs';
import { dictLoaded, lookup } from './dict';
import { hanChars } from './pinyin';
import { addToList, introduceWord } from './words';

export interface ExportRow {
  simp: string;
  trad: string;
  pinyin: string;
  def: string;
}

/** Skritter export: UTF-8, tab separated: simplified, traditional, numbered pinyin, definition. */
export function parseExport(text: string): ExportRow[] {
  const out: ExportRow[] = [];
  const seen = new Set<string>();
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cols = raw.split('\t').map((c) => c.trim());
    if (cols.length < 3 || !hanChars(cols[0]).length) continue;
    const row: ExportRow = { simp: cols[0], trad: cols[1] || cols[0], pinyin: cols[2] ?? '', def: cols[3] ?? '' };
    if (seen.has(row.simp)) continue; // duplicates within a list: keep first
    seen.add(row.simp);
    out.push(row);
  }
  return out;
}

/** The "export all" file lists every item you studied; its 2nd column repeats the simplified form. */
export function isStudiedExport(fileName: string, rows: ExportRow[]): boolean {
  if (/export-all/i.test(fileName)) return true;
  return rows.length > 50 && rows.every((r) => r.simp === r.trad);
}

export function listNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.(txt|tsv|csv)$/i, '')
    .replace(/^export-/i, '')
    .replace(/_/g, ' ')
    .trim();
}

export interface ImportReport {
  lists: { name: string; words: number }[];
  words: number;
  studied: number;
  newWords: number;
  notInDictionary: string[];
  spreadDays: number;
  writingDays: number;
}

export async function importSkritter(
  files: { name: string; text: string }[],
  opts: { now: number; charItems: boolean; maxReviewsPerDay: number; onProgress?: (msg: string) => void },
): Promise<ImportReport> {
  const parsed = files.map((f) => ({ name: f.name, rows: parseExport(f.text) }));
  const studiedFiles = parsed.filter((f) => isStudiedExport(f.name, f.rows));
  const listFiles = parsed.filter((f) => !studiedFiles.includes(f));

  const studiedRows = new Map<string, ExportRow>();
  for (const f of studiedFiles) for (const r of f.rows) if (!studiedRows.has(r.simp)) studiedRows.set(r.simp, r);

  // Word data: the "export all" file has Skritter's latest definitions; lists have the real traditional form.
  const wordData = new Map<string, ExportRow>();
  for (const f of listFiles)
    for (const r of f.rows) {
      if (wordData.has(r.simp)) continue;
      const s = studiedRows.get(r.simp);
      wordData.set(r.simp, s ? { ...r, pinyin: s.pinyin || r.pinyin, def: s.def || r.def } : r);
    }
  for (const [simp, r] of studiedRows) if (!wordData.has(simp)) wordData.set(simp, { ...r, trad: r.simp });

  opts.onProgress?.(`Saving ${wordData.size} words…`);
  const existing = new Map((await db.words.bulkGet([...wordData.keys()])).filter(Boolean).map((w) => [w!.id, w!]));
  const toPut: Word[] = [];
  for (const r of wordData.values()) {
    const ex = existing.get(r.simp);
    if (ex?.edited) continue; // never overwrite the user's own edits
    toPut.push({
      ...(ex ?? {}),
      id: r.simp,
      simp: r.simp,
      trad: r.trad !== r.simp ? r.trad : undefined,
      pinyin: r.pinyin,
      def: r.def,
      source: 'skritter',
      createdAt: ex?.createdAt ?? opts.now,
    });
  }
  await db.words.bulkPut(toPut);

  // Lists
  const report: ImportReport = { lists: [], words: wordData.size, studied: 0, newWords: 0, notInDictionary: [], spreadDays: 0, writingDays: 0 };
  const inLists = new Set<string>();
  const allLists = await db.lists.toArray();
  let order = allLists.length;
  const getList = async (name: string) => {
    const ex = allLists.find((l) => l.name === name);
    if (ex) return ex.id!;
    const id = await db.lists.add({ name, active: 1, order: order++, createdAt: opts.now });
    allLists.push({ id, name, active: 1, order: order - 1, createdAt: opts.now });
    return id;
  };
  for (const f of listFiles) {
    const name = listNameFromFile(f.name);
    opts.onProgress?.(`Creating list “${name}”…`);
    const id = await getList(name);
    for (const r of f.rows) {
      await addToList(id, r.simp);
      inLists.add(r.simp);
    }
    report.lists.push({ name, words: f.rows.length });
  }
  const others = [...studiedRows.keys()].filter((s) => !inLists.has(s));
  if (others.length) {
    const id = await getList('Skritter – other');
    for (const s of others) await addToList(id, s);
    report.lists.push({ name: 'Skritter – other', words: others.length });
  }

  // Studied words: known but due soon. Reviews are spread so no day exceeds ~90% of the review cap,
  // with writing first (the main skill), then tone, definition and reading.
  const studied = [...studiedRows.keys()];
  const created: string[] = [];
  for (let i = 0; i < studied.length; i++) {
    if (i % 25 === 0) opts.onProgress?.(`Scheduling studied words… ${i}/${studied.length}`);
    const w = await db.words.get(studied[i]);
    if (w?.introducedAt) continue;
    created.push(...(await introduceWord(studied[i], { now: opts.now, charItems: opts.charItems, knownDueInDays: 0 })));
    report.studied++;
  }
  const perDay = Math.max(10, opts.maxReviewsPerDay * 0.9);
  const partOrder: Part[] = ['write', 'tone', 'defn', 'read'];
  const items = ((await db.items.bulkGet(created)).filter(Boolean) as Item[]).sort(
    (a, b) => partOrder.indexOf(a.part) - partOrder.indexOf(b.part),
  );
  const writeCount = items.filter((it) => it.part === 'write').length;
  items.forEach((it, k) => {
    const days = k / perDay;
    const card = knownCard(opts.now, days, Math.max(10, days));
    it.card = card;
    it.dueAt = card.due;
  });
  await db.items.bulkPut(items);
  report.spreadDays = Math.max(1, Math.ceil(items.length / perDay));
  report.writingDays = Math.max(1, Math.ceil(writeCount / perDay));
  report.newWords = [...inLists].filter((s) => !studiedRows.has(s)).length;

  if (dictLoaded()) {
    report.notInDictionary = [...wordData.keys()].filter((s) => lookup(s).length === 0);
  }
  return report;
}
