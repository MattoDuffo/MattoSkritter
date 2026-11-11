import { useState } from 'react';
import { db, type Word } from '../lib/db';
import { loadDict } from '../lib/dict';
import { importSkritter, type ImportReport } from '../lib/importer';
import { hanChars } from '../lib/pinyin';
import { loadSettings, setKV } from '../lib/settings';
import { prefetchStrokes } from '../lib/strokes';
import { requestPersistence } from '../lib/backup';
import { go } from '../router';
import { ImportReportSheet } from './Lists';

/** First run: one-tap import of the bundled Skritter exports. */
export function Welcome() {
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      requestPersistence().catch(() => undefined);
      const s = await loadSettings();
      setBusy('Loading dictionary…');
      await loadDict();
      setBusy('Loading your Skritter exports…');
      const base = new URL('data/skritter/', document.baseURI).href;
      const names: string[] = await (await fetch(base + 'index.json')).json();
      const files = await Promise.all(names.map(async (name) => ({ name, text: await (await fetch(base + encodeURIComponent(name))).text() })));
      const r = await importSkritter(files, { now: Date.now(), charItems: s.charItems, maxReviewsPerDay: s.maxReviewsPerDay, onProgress: setBusy });
      const chars = new Set<string>();
      for (const w of (await db.words.toArray()) as Word[]) hanChars(w.simp).forEach((c) => chars.add(c));
      await prefetchStrokes(chars, (d, t) => d % 50 === 0 && setBusy(`Downloading stroke data for offline use… ${d}/${t}`));
      await setKV('onboarded', true);
      setBusy(null);
      setReport(r);
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  };

  return (
    <div className="screen full">
      <div className="center" style={{ paddingTop: 30 }}>
        <div className="big-han han" style={{ color: 'var(--accent)' }}>
          写
        </div>
        <h1 style={{ margin: '8px 0' }}>MattoSkritter</h1>
        <p className="muted">Learn to write Mandarin characters.</p>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Import your Skritter data</h2>
        <p className="small">
          Your 5 Skritter lists and the “export all” file are built in. The 714 words you already studied start as known but due soon, spread over the
          first days, and the rest of your list words come in as new words.
        </p>
        {busy ? (
          <div className="banner">{busy}</div>
        ) : (
          <button className="btn primary big" onClick={run}>
            Import my Skritter data
          </button>
        )}
        {error && <p style={{ color: 'var(--bad)' }}>Import failed: {error}</p>}
      </div>
      {!busy && (
        <button
          className="btn ghost block"
          onClick={async () => {
            await setKV('onboarded', true);
            go({ name: 'home' }, true);
          }}
        >
          Start with an empty app
        </button>
      )}
      <p className="small muted center" style={{ marginTop: 24 }}>
        Tip: in Safari tap Share → “Add to Home Screen” so the app works offline and your data is kept safe.
      </p>
      {report && (
        <ImportReportSheet
          report={report}
          onClose={() => {
            setReport(null);
            go({ name: 'home' }, true);
          }}
        />
      )}
    </div>
  );
}
