import { useEffect, useState } from 'react';
import { Pinyin, TopBar } from '../components/common';
import { db } from '../lib/db';
import { loadDict, search, type DictEntry } from '../lib/dict';
import { go } from '../router';

export function Search({ q: initial }: { q?: string }) {
  const [q, setQ] = useState(initial ?? '');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DictEntry[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDict()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
    db.words.toCollection().primaryKeys().then((k) => setMine(new Set(k as string[])));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setResults(search(q, 60, mine));
      history.replaceState(null, '', q ? `#/search?q=${encodeURIComponent(q)}` : '#/search');
    }, 150);
    return () => clearTimeout(t);
  }, [q, ready, mine]);

  return (
    <div className="screen">
      <TopBar title="Dictionary" />
      <input
        type="search"
        placeholder="汉字, pinyin (zhun3bei4, zhunbei) or English"
        value={q}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      {error && <p className="muted">Dictionary unavailable: {error}</p>}
      {!ready && !error && <div className="loading">Loading dictionary (first time only)…</div>}
      {ready && q && results.length === 0 && (
        <div className="card">
          <p>No results.</p>
          <button className="btn block" onClick={() => go({ name: 'add', word: q })}>
            Add “{q}” as a new word
          </button>
        </div>
      )}
      {results.length > 0 && (
        <div className="list">
          {results.map((r, i) => (
            <button key={i} className="list-item" onClick={() => go({ name: 'word', id: r.simp })}>
              <span className="han">{r.simp}</span>
              <div className="grow">
                <div className="small">
                  <Pinyin value={r.pinyin} />
                  {mine.has(r.simp) && <span className="pill accent" style={{ marginLeft: 6 }}>in my lists</span>}
                </div>
                <div className="small muted ellipsis">{r.def}</div>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}
      {ready && !q && <p className="muted small">Search the full CC-CEDICT dictionary (~124,000 entries). Tap a result to see its strokes and add it to a list.</p>}
    </div>
  );
}
