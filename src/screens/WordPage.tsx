import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { Pinyin, TopBar, useToast } from '../components/common';
import { Grid, Writer } from '../components/Writer';
import { speak } from '../lib/audio';
import { db, PART_LABEL, type Item, type Word, type WordList } from '../lib/db';
import { dictLoaded, loadDict, lookup, type DictEntry } from '../lib/dict';
import { hanChars } from '../lib/pinyin';
import { useSettings } from '../lib/settings';
import { formatInterval } from '../lib/srs';
import { introduceWord, markKnown, resetWord, setBanned, upsertWord } from '../lib/words';
import { go } from '../router';

export function WordPage({ id }: { id: string }) {
  const [s] = useSettings();
  const [word, setWord] = useState<Word | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [lists, setLists] = useState<WordList[]>([]);
  const [dict, setDict] = useState<DictEntry[]>([]);
  const [nonce, setNonce] = useState(0);
  const [notes, setNotes] = useState('');
  const [toast, showToast] = useToast();

  const load = async () => {
    const w = await db.words.get(id);
    setWord(w ?? null);
    setNotes(w?.notes ?? '');
    setItems(await db.items.where('wordId').equals(id).toArray());
    const entries = await db.entries.where('wordId').equals(id).toArray();
    setLists((await db.lists.bulkGet(entries.map((e) => e.listId))).filter(Boolean) as WordList[]);
  };
  useEffect(() => {
    load();
    loadDict()
      .then(() => setDict(lookup(id)))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (word === undefined || !s) return <div className="loading">Loading…</div>;
  const chars = hanChars(id);
  const size = Math.min(150, Math.floor((Math.min(window.innerWidth, 640) - 48) / Math.min(Math.max(chars.length, 1), 3)));
  const now = Date.now();
  const banned = items.some((i) => i.banned);

  return (
    <div className="screen">
      <TopBar
        title={id}
        back
        right={
          word && (
            <button className="btn ghost" onClick={() => go({ name: 'add', word: id })}>
              Edit
            </button>
          )
        }
      />
      <div className="card word-head">
        <div className="chars">
          {chars.map((c, i) => (
            <div key={i} className="mini-canvas" style={{ width: size, height: size }}>
              <Grid size={size} kind={s.grid} />
              <Writer char={c} size={size} mode="animate" nonce={nonce} />
            </div>
          ))}
        </div>
        {word && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              <Pinyin value={word.pinyin} />
            </div>
            <div style={{ fontSize: 17, marginTop: 4 }}>{word.def}</div>
            {word.trad && word.trad !== word.simp && <div className="small muted han">Traditional: {word.trad}</div>}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="icon-btn" onClick={() => speak(id, word?.pinyin ?? dict[0]?.pinyin)} aria-label="Play audio">
            <Icon.sound />
          </button>
          <button className="icon-btn" onClick={() => setNonce(nonce + 1)} aria-label="Replay stroke order">
            <Icon.play />
          </button>
        </div>
      </div>

      {!word && (
        <div className="card">
          <p>This word isn't in your collection yet.</p>
          <button className="btn primary block" onClick={() => go({ name: 'add', word: id })}>
            Add “{id}”
          </button>
        </div>
      )}

      {word && (
        <div className="card">
          <h2>Study progress</h2>
          {items.length === 0 ? (
            <p className="small muted">Not studied yet{lists.some((l) => l.active) ? ' — it will come up as a new word.' : '.'}</p>
          ) : (
            <div className="kv">
              {items.map((i) => (
                <FragmentRow key={i.id} item={i} now={now} />
              ))}
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 12 }}>
            {items.length === 0 && (
              <button
                className="btn"
                onClick={async () => {
                  await introduceWord(id, { now: Date.now(), charItems: s.charItems });
                  showToast('Added to your reviews');
                  load();
                }}
              >
                Study now
              </button>
            )}
            <button
              className="btn"
              onClick={async () => {
                await introduceWord(id, { now: Date.now(), charItems: s.charItems });
                await markKnown(id, 30);
                showToast('Marked as known');
                load();
              }}
            >
              Mark known
            </button>
            {items.length > 0 && (
              <button
                className="btn"
                onClick={async () => {
                  if (confirm('Reset all progress for this word?')) {
                    await resetWord(id);
                    load();
                  }
                }}
              >
                Reset
              </button>
            )}
            {items.length > 0 && (
              <button
                className="btn danger"
                onClick={async () => {
                  await setBanned(id, !banned);
                  load();
                }}
              >
                {banned ? 'Unban' : 'Ban'}
              </button>
            )}
          </div>
        </div>
      )}

      {word && (
        <div className="card">
          <h2>Notes &amp; mnemonic</h2>
          <textarea value={notes} placeholder="Your notes, a mnemonic…" onChange={(e) => setNotes(e.target.value)} />
          {notes !== (word.notes ?? '') && (
            <button
              className="btn primary"
              style={{ marginTop: 8 }}
              onClick={async () => {
                await upsertWord({ simp: word.simp, pinyin: word.pinyin, def: word.def, notes, source: word.source });
                showToast('Notes saved');
                load();
              }}
            >
              Save notes
            </button>
          )}
          <h3>Lists</h3>
          <div className="row wrap">
            {lists.map((l) => (
              <button key={l.id} className="pill" style={{ border: 0 }} onClick={() => go({ name: 'list', id: l.id! })}>
                {l.name}
              </button>
            ))}
            <button className="pill accent" style={{ border: 0 }} onClick={() => go({ name: 'add', word: id })}>
              + add to list
            </button>
          </div>
        </div>
      )}

      {chars.length > 1 && (
        <div className="card">
          <h2>Characters</h2>
          <div className="list" style={{ margin: 0 }}>
            {chars.map((c, i) => (
              <button key={i} className="list-item" onClick={() => go({ name: 'word', id: c })}>
                <span className="han">{c}</span>
                <span className="grow small muted ellipsis">{dictLoaded() ? lookup(c)[0]?.def ?? '' : ''}</span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {dict.length > 0 && (
        <div className="card">
          <h2>Dictionary (CC-CEDICT)</h2>
          {dict.map((e, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <b>
                <Pinyin value={e.pinyin} />
              </b>{' '}
              <span className="small">{e.def}</span>
            </div>
          ))}
        </div>
      )}
      {toast}
    </div>
  );
}

function FragmentRow({ item, now }: { item: Item; now: number }) {
  const c = item.card;
  const due = item.dueAt <= now ? 'due now' : `in ${formatInterval(item.dueAt - now)}`;
  const state = item.banned ? 'banned' : c.state === 0 ? 'new' : `${c.reps} review${c.reps === 1 ? '' : 's'}, ${c.lapses} lapse${c.lapses === 1 ? '' : 's'}`;
  return (
    <>
      <span className="muted">{PART_LABEL[item.part]}</span>
      <span>
        {state} · {due}
        {item.charOf ? <span className="small muted"> (from {item.charOf})</span> : null}
      </span>
    </>
  );
}
