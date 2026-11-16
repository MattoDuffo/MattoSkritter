import { useEffect, useState } from 'react';
import { Pinyin, TopBar } from '../components/common';
import { db, type Word } from '../lib/db';
import { loadDict, mergedEntry } from '../lib/dict';
import { pendingNewWords } from '../lib/queue';
import { studiedCharSet, studiedWordIds } from '../lib/stats';
import { go, type CollectionKind } from '../router';

const TITLE: Record<CollectionKind, string> = {
  studied: 'Words studied',
  chars: 'Characters',
  new: 'New words left',
};

const BLURB: Record<CollectionKind, string> = {
  studied: 'Most recently added first.',
  chars: 'Every character you practise writing.',
  new: 'Waiting in your active lists, in the order they will be introduced.',
};

interface Row {
  id: string;
  pinyin?: string;
  def?: string;
}

async function loadIds(kind: CollectionKind): Promise<string[]> {
  if (kind === 'new') return pendingNewWords();
  const items = await db.items.toArray();
  if (kind === 'chars') return [...studiedCharSet(items)];
  const ids = [...studiedWordIds(items)];
  const words = new Map(((await db.words.bulkGet(ids)).filter(Boolean) as Word[]).map((w) => [w.id, w]));
  const at = (id: string) => words.get(id)?.introducedAt ?? 0;
  return ids.sort((a, b) => at(b) - at(a));
}

export function Collection({ kind }: { kind: CollectionKind }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const ids = await loadIds(kind);
      const words = await db.words.bulkGet(ids);
      const base: Row[] = ids.map((id, i) => ({ id, pinyin: words[i]?.pinyin, def: words[i]?.def }));
      if (!live) return;
      setRows(base);
      // Characters are often not words in your lists: fill their reading from the dictionary.
      if (base.some((r) => !r.pinyin)) {
        try {
          await loadDict();
        } catch {
          return;
        }
        if (!live) return;
        setRows(
          base.map((r) => {
            if (r.pinyin) return r;
            const e = mergedEntry(r.id);
            return e ? { ...r, pinyin: e.pinyin, def: e.def } : r;
          }),
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [kind]);

  const needle = q.trim().toLowerCase();
  const shown = rows?.filter(
    (r) => !needle || r.id.includes(needle) || r.pinyin?.toLowerCase().includes(needle) || r.def?.toLowerCase().includes(needle),
  );

  return (
    <div className="screen">
      <TopBar title={TITLE[kind]} back />
      {!rows && <div className="loading">Loading…</div>}
      {rows && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            {rows.length} {kind === 'chars' ? 'character' : 'word'}
            {rows.length === 1 ? '' : 's'}. {BLURB[kind]}
          </p>
          {rows.length > 10 && (
            <input
              type="search"
              placeholder="Filter: 汉字, pinyin or English"
              value={q}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setQ(e.target.value)}
              style={{ marginBottom: 12 }}
            />
          )}
          <div className="list">
            {shown!.map((r) => (
              <button key={r.id} className="list-item" onClick={() => go({ name: 'word', id: r.id })}>
                <span className="han">{r.id}</span>
                <div className="grow">
                  {r.pinyin && (
                    <div className="small">
                      <Pinyin value={r.pinyin} />
                    </div>
                  )}
                  {r.def && <div className="small muted ellipsis">{r.def}</div>}
                </div>
                <span className="chev">›</span>
              </button>
            ))}
            {shown!.length === 0 && <div className="list-item muted">Nothing here</div>}
          </div>
        </>
      )}
    </div>
  );
}
