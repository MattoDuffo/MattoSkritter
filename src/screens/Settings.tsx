import { useEffect, useRef, useState } from 'react';
import { Seg, Toggle, TopBar, useToast } from '../components/common';
import { isPersisted, lastBackupAt, requestPersistence, restoreBackup, saveBackupFile } from '../lib/backup';
import { db, PARTS, PART_LABEL } from '../lib/db';
import { DEFAULT_SETTINGS, useSettings } from '../lib/settings';
import { struggleThreshold } from '../lib/srs';
import { go } from '../router';

function stubbornText(v: number) {
  if (v <= 0) return 'Eager: new words always come, up to your daily limit.';
  const t = Math.round(struggleThreshold(v));
  const name = v >= 90 ? 'Skritter-strict' : v >= 60 ? 'Strict' : v >= 35 ? 'Balanced' : 'Relaxed';
  return `${name}: new words slow down as struggling words pile up and stop at about ${t}.`;
}

function shuffleText(days: number) {
  if (days <= 0) return 'off (strict due order)';
  if (days < 1) return `up to ${Math.round(days * 24)} hours`;
  return `up to ${days} day${days === 1 ? '' : 's'}`;
}

export function Settings() {
  const [s, update] = useSettings();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    isPersisted().then(setPersisted);
    lastBackupAt().then(setLastBackup);
  }, []);

  if (!s) return <div className="loading">Loading…</div>;

  return (
    <div className="screen">
      <TopBar title="Settings" />

      <div className="card">
        <h2>New words</h2>
        <label className="field">
          <span>New words per day: {s.newPerDay}</span>
          <input type="range" min={0} max={40} value={s.newPerDay} onChange={(e) => update({ newPerDay: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Stubbornness: {s.stubbornness}</span>
          <input type="range" min={0} max={100} step={5} value={s.stubbornness} onChange={(e) => update({ stubbornness: Number(e.target.value) })} />
          <div className="row small muted">
            <span>Eager</span>
            <span className="spacer" />
            <span>Balanced</span>
            <span className="spacer" />
            <span>Skritter-strict</span>
          </div>
        </label>
        <p className="small">{stubbornText(s.stubbornness)}</p>
        <p className="small muted">
          Struggling words are ones you learned or failed recently that the scheduler isn't confident about yet. “Add 5 new words now” on the home screen
          always works.
        </p>
      </div>

      <div className="card">
        <h2>Reviews</h2>
        <label className="field">
          <span>Maximum reviews per day: {s.maxReviewsPerDay}</span>
          <input type="range" min={20} max={500} step={10} value={s.maxReviewsPerDay} onChange={(e) => update({ maxReviewsPerDay: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Daily goal: {s.dailyGoalMinutes} minutes</span>
          <input type="range" min={5} max={90} step={5} value={s.dailyGoalMinutes} onChange={(e) => update({ dailyGoalMinutes: Number(e.target.value) })} />
        </label>
        <h3>Parts to study</h3>
        {PARTS.map((p) => (
          <Toggle key={p} label={PART_LABEL[p]} checked={s.parts[p]} onChange={(v) => update({ parts: { ...s.parts, [p]: v } })} />
        ))}
        <Toggle
          label="Study characters inside words"
          sub="健身房 also adds writing reviews for 健, 身 and 房"
          checked={s.charItems}
          onChange={(v) => update({ charItems: v })}
        />
        <label className="field" style={{ marginTop: 12 }}>
          <span>Shuffle cards: {shuffleText(s.shuffleDays)}</span>
          <input type="range" min={0} max={3} step={0.25} value={s.shuffleDays} onChange={(e) => update({ shuffleDays: Number(e.target.value) })} />
          <div className="small muted">
            Mixes up the order of due cards and spreads review dates by up to this much, so a word's reading, writing and meaning cards don't
            keep coming together.
          </div>
        </label>
        <Toggle label="Auto-advance after “Got it”" sub="Moves on after about 1 second" checked={s.autoAdvance} onChange={(v) => update({ autoAdvance: v })} />
        <Toggle label="Play audio automatically" checked={s.autoplayAudio} onChange={(v) => update({ autoplayAudio: v })} />
      </div>

      <div className="card">
        <h2>Writing</h2>
        <label className="field">
          <span>Stroke matching: {s.leniency <= 1.2 ? 'strict' : s.leniency <= 2 ? 'normal (finger)' : 'forgiving'} ({s.leniency.toFixed(1)})</span>
          <input type="range" min={0.6} max={3} step={0.1} value={s.leniency} onChange={(e) => update({ leniency: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Flash a hint after {s.hintAfterMisses} wrong attempt{s.hintAfterMisses === 1 ? '' : 's'}</span>
          <input type="range" min={1} max={5} value={s.hintAfterMisses} onChange={(e) => update({ hintAfterMisses: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Draw the stroke for you after {s.drawAfterMisses} wrong attempts</span>
          <input type="range" min={2} max={8} value={s.drawAfterMisses} onChange={(e) => update({ drawAfterMisses: Number(e.target.value) })} />
        </label>
        <h3>Grid</h3>
        <Seg
          value={s.grid}
          onChange={(v) => update({ grid: v })}
          options={[
            { value: 'mi', label: '米 grid' },
            { value: 'tian', label: '田 grid' },
            { value: 'none', label: 'None' },
          ]}
        />
      </div>

      <div className="card">
        <h2>Appearance</h2>
        <Seg
          value={s.theme}
          onChange={(v) => update({ theme: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <label className="field" style={{ marginTop: 12 }}>
          <span>New day starts at {s.dayStartHour}:00</span>
          <input type="range" min={0} max={8} value={s.dayStartHour} onChange={(e) => update({ dayStartHour: Number(e.target.value) })} />
        </label>
      </div>

      <div className="card">
        <h2>Backup</h2>
        <p className="small muted">
          Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}. Storage{' '}
          {persisted === null ? 'persistence unknown' : persisted ? 'is protected from automatic clean-up ✓' : 'may be cleared by Safari if unused for weeks'}.
        </p>
        <div className="stack">
          <button
            className="btn primary block"
            onClick={async () => {
              const r = await saveBackupFile();
              if (r !== 'cancelled') {
                setLastBackup(Date.now());
                showToast('Backup saved');
              }
            }}
          >
            Back up now (save to Files / iCloud)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!confirm('Restore this backup? Everything currently in the app will be replaced.')) return;
              try {
                await restoreBackup(await f.text());
                showToast('Backup restored');
                setTimeout(() => location.reload(), 600);
              } catch (err) {
                showToast(`Restore failed: ${(err as Error).message}`);
              }
            }}
          />
          <button className="btn block" onClick={() => fileRef.current?.click()}>
            Restore from backup file…
          </button>
          {!persisted && (
            <button
              className="btn block"
              onClick={async () => {
                const r = await requestPersistence();
                setPersisted(r);
                showToast(r ? 'Storage protected' : 'Safari declined — add the app to your Home Screen first');
              }}
            >
              Protect storage
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Data</h2>
        <div className="stack">
          <button className="btn block" onClick={() => go({ name: 'welcome' })}>
            Re-run Skritter import
          </button>
          <button className="btn block" onClick={() => update({ ...DEFAULT_SETTINGS, sessionSize: s.sessionSize })}>
            Reset settings to defaults
          </button>
          <button
            className="btn danger block"
            onClick={async () => {
              if (!confirm('Erase ALL words, lists and progress? Make a backup first!')) return;
              if (!confirm('Really erase everything?')) return;
              await db.delete();
              location.hash = '#/';
              location.reload();
            }}
          >
            Erase everything
          </button>
        </div>
      </div>
      <p className="small muted center">
        MattoSkritter · Dictionary: CC-CEDICT (CC BY-SA 4.0) · Strokes: Make Me a Hanzi / Hanzi Writer (Arphic PL)
      </p>
      {toast}
    </div>
  );
}
