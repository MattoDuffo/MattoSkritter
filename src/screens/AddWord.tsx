import { useEffect, useState } from 'react';
import { Pinyin, Seg, TopBar, useToast } from '../components/common';
import { db, type WordList } from '../lib/db';
import { dictLoaded, loadDict, lookup, mergedEntry, type DictEntry } from '../lib/dict';
import { hanChars } from '../lib/pinyin';
import { useSettings } from '../lib/settings';
import { addToList, createList, introduceWord, upsertWord, writable } from '../lib/words';
import { back, go } from '../router';

/** M4: add a new word (or edit an existing one) directly in the app. */
export function AddWord({ initial, listId }: { initial?: string; listId?: number }) {
  const [s] = useSettings();
  const [simp, setSimp] = useState(initial ?? '');
  const [pinyin, setPinyin] = useState('');
  const [def, setDef] = useState('');
  const [notes, setNotes] = useState('');
  const [options, setOptions] = useState<DictEntry[]>([]);
  const [picked, setPicked] = useState<number | 'all' | null>(null);
  const [existing, setExisting] = useState(false);
  const [lists, setLists] = useState<WordList[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [start, setStart] = useState<'new' | 'now'>('new');
  const [dictReady, setDictReady] = useState(dictLoaded());
  const [noStrokes, setNoStrokes] = useState(false);
  const [edited, setEdited] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    loadDict()
      .then(() => setDictReady(true))
      .catch(() => setDictReady(false));
    (async () => {
      const ls = await db.lists.orderBy('order').toArray();
      setLists(ls);
      if (listId) setSelected(new Set([listId]));
      else {
        const personal = ls.find((l) => /^personn?al$/i.test(l.name));
        if (personal) setSelected(new Set([personal.id!]));
      }
    })();
  }, [listId]);

  // When the hanzi changes: fill in from the user's collection or the dictionary.
  useEffect(() => {
    const w = simp.trim();
    let alive = true;
    setNoStrokes(false);
    if (!hanChars(w).length) {
      setOptions([]);
      setExisting(false);
      return;
    }
    (async () => {
      const own = await db.words.get(w);
      if (!alive) return;
      setExisting(!!own);
      if (own) {
        setPinyin(own.pinyin);
        setDef(own.def);
        setNotes(own.notes ?? '');
        setEdited(false);
        const memberOf = await db.entries.where('wordId').equals(w).toArray();
        if (!listId) setSelected((sel) => new Set([...sel, ...memberOf.map((m) => m.listId)]));
      }
      const opts = dictReady ? lookup(w) : [];
      setOptions(opts);
      if (!own && !edited) {
        if (opts.length === 1) {
          setPicked(0);
          setPinyin(opts[0].pinyin.replace(/\s+/g, ''));
          setDef(opts[0].def);
        } else if (opts.length > 1) {
          setPicked(null);
          setPinyin('');
          setDef('');
        } else {
          setPicked(null);
        }
      }
      setNoStrokes(!(await writable(w)));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simp, dictReady]);

  const pick = (i: number | 'all') => {
    setPicked(i);
    const e = i === 'all' ? mergedEntry(simp.trim())! : options[i];
    setPinyin(e.pinyin.replace(/\s+/g, ''));
    setDef(e.def);
  };

  const save = async () => {
    const w = simp.trim();
    if (!hanChars(w).length) return showToast('Type the word in Chinese characters');
    if (!pinyin.trim()) return showToast('Pinyin is needed (e.g. zhun3bei4)');
    if (!def.trim()) return showToast('Add a definition');
    const inDict = options.length > 0;
    const pickedEntry = typeof picked === 'number' ? options[picked] : undefined;
    const word = await upsertWord({
      simp: w,
      pinyin: pinyin.trim(),
      def: def.trim(),
      notes: notes.trim() || undefined,
      trad: pickedEntry?.trad,
      source: inDict ? 'cedict' : 'custom',
    });
    for (const id of selected) await addToList(id, w);
    if (start === 'now' && !word.introducedAt) {
      await introduceWord(w, { now: Date.now(), charItems: s?.charItems ?? true });
    }
    showToast(existing ? 'Saved' : `Added ${w}`);
    if (existing) back();
    else {
      setSimp('');
      setPinyin('');
      setDef('');
      setNotes('');
      setEdited(false);
    }
  };

  return (
    <div className="screen">
      <TopBar title={existing ? 'Edit word' : 'Add word'} back />
      <div className="card">
        <label className="field">
          <span>Word (hanzi)</span>
          <input
            type="text"
            className="han"
            style={{ fontSize: 26 }}
            value={simp}
            autoFocus={!initial}
            placeholder="准备"
            onChange={(e) => {
              setSimp(e.target.value);
              setEdited(false);
            }}
          />
        </label>
        {!dictReady && <p className="small muted">Loading dictionary…</p>}
        {existing && <p className="small pill accent">Already in your collection — editing your version</p>}
        {noStrokes && simp.trim() && <p className="small" style={{ color: 'var(--warn)' }}>No stroke data for some characters: writing practice will be disabled for this word.</p>}
        {options.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div className="small muted" style={{ marginBottom: 4 }}>
              Several dictionary entries — pick one:
            </div>
            <div className="list" style={{ margin: 0 }}>
              {options.map((o, i) => (
                <button key={i} className="list-item" onClick={() => pick(i)} style={picked === i ? { background: 'var(--accent-soft)' } : undefined}>
                  <div className="grow">
                    <b>
                      <Pinyin value={o.pinyin} />
                    </b>
                    <div className="small muted">{o.def}</div>
                  </div>
                </button>
              ))}
              <button className="list-item" onClick={() => pick('all')} style={picked === 'all' ? { background: 'var(--accent-soft)' } : undefined}>
                <div className="grow small">Combine all readings</div>
              </button>
            </div>
          </div>
        )}
        {hanChars(simp).length > 0 && options.length === 0 && dictReady && !existing && (
          <p className="small muted">Not in the dictionary — type the pinyin and definition yourself.</p>
        )}
        <label className="field">
          <span>
            Pinyin with tone numbers {pinyin && <>· <Pinyin value={pinyin} /></>}
          </span>
          <input
            type="text"
            value={pinyin}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="zhun3bei4"
            onChange={(e) => {
              setPinyin(e.target.value);
              setEdited(true);
            }}
          />
        </label>
        <label className="field">
          <span>Definition</span>
          <textarea
            value={def}
            placeholder="prepare; get ready"
            onChange={(e) => {
              setDef(e.target.value);
              setEdited(true);
            }}
          />
        </label>
        <label className="field">
          <span>Notes / mnemonic (optional)</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <h2>Lists</h2>
        <div className="row wrap">
          {lists.map((l) => {
            const on = selected.has(l.id!);
            return (
              <button
                key={l.id}
                className={`pill ${on ? 'accent' : ''}`}
                style={{ border: 0, fontSize: 14, padding: '6px 12px' }}
                onClick={() => {
                  const n = new Set(selected);
                  if (on) n.delete(l.id!);
                  else n.add(l.id!);
                  setSelected(n);
                }}
              >
                {on ? '✓ ' : ''}
                {l.name}
              </button>
            );
          })}
          <button
            className="pill"
            style={{ border: 0, fontSize: 14, padding: '6px 12px' }}
            onClick={async () => {
              const name = prompt('Name of the new list', 'Personal');
              if (name?.trim()) {
                const id = await createList(name.trim());
                setLists(await db.lists.orderBy('order').toArray());
                setSelected(new Set([...selected, id]));
              }
            }}
          >
            + New list
          </button>
        </div>
        {!existing && (
          <>
            <h3>Start as</h3>
            <Seg
              value={start}
              onChange={setStart}
              options={[
                { value: 'new', label: 'New word (in turn)' },
                { value: 'now', label: 'Study it now' },
              ]}
            />
          </>
        )}
      </div>
      <button className="btn primary big" onClick={save}>
        {existing ? 'Save' : 'Add word'}
      </button>
      {existing && (
        <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => go({ name: 'word', id: simp.trim() })}>
          Open word page
        </button>
      )}
      {toast}
    </div>
  );
}
