import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import { Pinyin, Sheet, Toggle, TopBar, useToast } from '../components/common';
import { db, type Item, type Word, type WordList } from '../lib/db';
import { loadDict } from '../lib/dict';
import { importSkritter, type ImportReport } from '../lib/importer';
import { loadSettings } from '../lib/settings';
import { prefetchStrokes } from '../lib/strokes';
import { hanChars } from '../lib/pinyin';
import { createList, deleteList, removeFromList } from '../lib/words';
import { go } from '../router';

interface ListRow extends WordList {
  count: number;
  studied: number;
}

export function Lists() {
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, showToast] = useToast();

  const load = async () => {
    const ls = await db.lists.orderBy('order').toArray();
    const introduced = new Set((await db.words.where('introducedAt').above(0).primaryKeys()) as string[]);
    const rows: ListRow[] = [];
    for (const l of ls) {
      const entries = await db.entries.where('listId').equals(l.id!).toArray();
      rows.push({ ...l, count: entries.length, studied: entries.filter((e) => introduced.has(e.wordId)).length });
    }
    setLists(rows);
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = async (l: ListRow, v: boolean) => {
    await db.lists.update(l.id!, { active: v ? 1 : 0 });
    load();
  };
  const move = async (l: ListRow, dir: -1 | 1) => {
    if (!lists) return;
    const i = lists.findIndex((x) => x.id === l.id);
    const j = i + dir;
    if (j < 0 || j >= lists.length) return;
    await db.lists.update(lists[i].id!, { order: lists[j].order });
    await db.lists.update(lists[j].id!, { order: lists[i].order });
    load();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const s = await loadSettings();
    setImporting('Loading dictionary…');
    try {
      await loadDict().catch(() => undefined);
      const data = await Promise.all([...files].map(async (f) => ({ name: f.name, text: await f.text() })));
      const r = await importSkritter(data, {
        now: Date.now(),
        charItems: s.charItems,
        maxReviewsPerDay: s.maxReviewsPerDay,
        onProgress: setImporting,
      });
      setReport(r);
      const chars = new Set<string>();
      for (const w of (await db.words.toArray()) as Word[]) hanChars(w.simp).forEach((c) => chars.add(c));
      setImporting('Downloading stroke data for offline use…');
      await prefetchStrokes(chars);
    } catch (e) {
      showToast(`Import failed: ${(e as Error).message}`);
    }
    setImporting(null);
    load();
  };

  return (
    <div className="screen">
      <TopBar
        title="Lists"
        right={
          <button
            className="icon-btn"
            aria-label="New list"
            onClick={async () => {
              const name = prompt('Name of the new list');
              if (name?.trim()) {
                const id = await createList(name.trim());
                go({ name: 'list', id });
              }
            }}
          >
            <Icon.plus />
          </button>
        }
      />
      {importing && <div className="banner">{importing}</div>}
      {!lists ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          {lists.length === 0 && <p className="muted">No lists yet. Create one, or import Skritter exports below.</p>}
          <div className="list">
            {lists.map((l, i) => (
              <div key={l.id} className="list-item" style={{ cursor: 'default' }}>
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => go({ name: 'list', id: l.id! })}>
                  <div className="ellipsis">
                    <b>{l.name}</b>
                  </div>
                  <div className="small muted">
                    {l.studied}/{l.count} studied · {l.active ? 'studying' : 'paused'}
                  </div>
                </button>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn ghost" style={{ padding: '4px 6px', minHeight: 36 }} disabled={i === 0} onClick={() => move(l, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="btn ghost" style={{ padding: '4px 6px', minHeight: 36 }} disabled={i === lists.length - 1} onClick={() => move(l, 1)} aria-label="Move down">
                    ↓
                  </button>
                </div>
                <label className="switch" aria-label="Studying">
                  <input type="checkbox" checked={!!l.active} onChange={(e) => toggle(l, e.target.checked)} />
                  <span />
                </label>
              </div>
            ))}
          </div>
          <p className="small muted">New words are taken from active lists, top to bottom. Use ↑↓ to set the order.</p>
          <div className="card">
            <h2>Import Skritter exports</h2>
            <p className="small muted">
              Pick one or more exported .txt/.tsv files. Each file becomes a list. A file named “export-all” marks those words as already studied.
            </p>
            <input ref={fileRef} type="file" accept=".txt,.tsv,.csv,text/plain" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <button className="btn block" onClick={() => fileRef.current?.click()} disabled={!!importing}>
              Choose files…
            </button>
          </div>
        </>
      )}
      {report && <ImportReportSheet report={report} onClose={() => setReport(null)} />}
      {toast}
    </div>
  );
}

export function ImportReportSheet({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ margin: '6px 4px' }}>Import finished</h2>
      <div style={{ padding: '0 4px', maxHeight: '60vh', overflow: 'auto' }}>
        <p>
          {report.words} words in {report.lists.length} lists. {report.studied} words you already studied are scheduled as known: their writing
          reviews come over the next {report.writingDays} day{report.writingDays === 1 ? '' : 's'}, then tone, definition and reading (about{' '}
          {report.spreadDays} days in total, within your daily review limit). {report.newWords} words are new.
        </p>
        <ul className="small">
          {report.lists.map((l) => (
            <li key={l.name}>
              {l.name}: {l.words} words
            </li>
          ))}
        </ul>
        {report.notInDictionary.length > 0 && (
          <>
            <p className="small">
              <b>Not found in the dictionary</b> — mostly phrases, but worth a look for typos (your own definitions are kept):
            </p>
            <div className="row wrap">
              {report.notInDictionary.map((w) => (
                <button key={w} className="pill accent han" style={{ border: 0, fontSize: 16 }} onClick={() => go({ name: 'word', id: w })}>
                  {w}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={onClose}>
        OK
      </button>
    </Sheet>
  );
}

export function ListDetail({ id }: { id: number }) {
  const [list, setList] = useState<WordList | null>(null);
  const [words, setWords] = useState<{ word: Word; items: Item[] }[] | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const l = await db.lists.get(id);
    setList(l ?? null);
    if (!l) return;
    const entries = await db.entries.where('[listId+pos]').between([id, -Infinity], [id, Infinity]).toArray();
    const ws = await db.words.bulkGet(entries.map((e) => e.wordId));
    const items = await db.items.where('wordId').anyOf(entries.map((e) => e.wordId)).toArray();
    const byWord = new Map<string, Item[]>();
    for (const it of items) byWord.set(it.wordId, [...(byWord.get(it.wordId) ?? []), it]);
    setWords(ws.filter(Boolean).map((w) => ({ word: w!, items: byWord.get(w!.id) ?? [] })));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!list) return <div className="screen"><TopBar title="List" back /><div className="loading">{words ? 'List not found' : 'Loading…'}</div></div>;

  const shown = (words ?? []).filter(
    (w) => !filter || w.word.simp.includes(filter) || w.word.def.toLowerCase().includes(filter.toLowerCase()) || w.word.pinyin.includes(filter.toLowerCase()),
  );
  const status = (w: { word: Word; items: Item[] }) => {
    const own = w.items.filter((i) => !i.charOf);
    if (own.some((i) => i.banned)) return <span className="pill">banned</span>;
    if (!w.word.introducedAt || !own.length) return <span className="pill accent">new</span>;
    return null;
  };

  return (
    <div className="screen">
      <TopBar
        title={list.name}
        back
        right={
          <button className="btn ghost" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Done' : 'Edit'}
          </button>
        }
      />
      {editMode && (
        <div className="card">
          <Toggle
            label="Studying"
            sub="New words come from active lists"
            checked={!!list.active}
            onChange={async (v) => {
              await db.lists.update(id, { active: v ? 1 : 0 });
              load();
            }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn"
              onClick={async () => {
                const name = prompt('Rename list', list.name);
                if (name?.trim()) {
                  await db.lists.update(id, { name: name.trim() });
                  load();
                }
              }}
            >
              Rename
            </button>
            <span className="spacer" />
            <button
              className="btn danger"
              onClick={async () => {
                if (confirm(`Delete the list “${list.name}”? Your progress on its words is kept.`)) {
                  await deleteList(id);
                  go({ name: 'lists' }, true);
                }
              }}
            >
              Delete list
            </button>
          </div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="search" placeholder={`Filter ${words?.length ?? ''} words`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="icon-btn" aria-label="Add word to this list" onClick={() => go({ name: 'add', listId: id })}>
          <Icon.plus />
        </button>
      </div>
      {!words ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="list">
          {shown.map(({ word, items }) => (
            <div key={word.id} className="list-item" onClick={() => !editMode && go({ name: 'word', id: word.id })}>
              <span className="han">{word.simp}</span>
              <div className="grow">
                <div className="small">
                  <Pinyin value={word.pinyin} />
                </div>
                <div className="small muted ellipsis">{word.def}</div>
              </div>
              {status({ word, items })}
              {editMode ? (
                <button
                  className="btn danger"
                  style={{ minHeight: 36, padding: '4px 10px' }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await removeFromList(id, word.id);
                    load();
                  }}
                >
                  Remove
                </button>
              ) : (
                <span className="chev">›</span>
              )}
            </div>
          ))}
          {shown.length === 0 && <div className="list-item muted">No words</div>}
        </div>
      )}
    </div>
  );
}
