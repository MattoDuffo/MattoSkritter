import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { TopBar } from '../components/common';
import { db } from '../lib/db';
import { lastBackupAt, saveBackupFile } from '../lib/backup';
import { studyStatus, type StudyStatus } from '../lib/queue';
import { dayStart, getKV, useSettings } from '../lib/settings';
import { computeStats, type Stats } from '../lib/stats';
import { go } from '../router';
import { versionLabel } from '../version';

const WEEK = 7 * 86_400_000;

export function Home() {
  const [s, update] = useSettings();
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [backupDue, setBackupDue] = useState(false);

  useEffect(() => {
    (async () => {
      const lists = await db.lists.count();
      const onboarded = await getKV('onboarded', false);
      if (!lists && !onboarded) go({ name: 'welcome' }, true);
    })();
  }, []);

  useEffect(() => {
    if (!s) return;
    studyStatus(s).then(setStatus);
    computeStats(s).then(setStats);
    (async () => {
      const last = await lastBackupAt();
      const anyReviews = (await db.reviews.count()) > 0;
      setBackupDue(anyReviews && (!last || Date.now() - last > WEEK));
    })();
  }, [s]);

  if (!s || !status) return <div className="loading">Loading…</div>;

  const goalPct = stats ? Math.min(100, (100 * stats.today.minutes) / Math.max(1, s.dailyGoalMinutes)) : 0;
  const newReason =
    status.newAvailable === 0
      ? 'No new words left in your active lists'
      : s.stubbornness <= 0
        ? `${status.newAllowed} new word${status.newAllowed === 1 ? '' : 's'} today (stubbornness off)`
        : `${status.newAllowed} new word${status.newAllowed === 1 ? '' : 's'} today (${status.struggling} struggling word${status.struggling === 1 ? '' : 's'}, stubbornness ${s.stubbornness})`;

  return (
    <div className="screen">
      <TopBar
        title="MattoSkritter"
        right={
          <button className="icon-btn" onClick={() => go({ name: 'add' })} aria-label="Add word">
            <Icon.plus />
          </button>
        }
      />

      {backupDue && (
        <div className="banner">
          <span style={{ flex: 1 }}>No backup in the last 7 days. Back up now?</span>
          <button
            className="btn primary"
            onClick={async () => {
              const r = await saveBackupFile();
              if (r !== 'cancelled') setBackupDue(false);
            }}
          >
            Back up
          </button>
        </div>
      )}

      <div className="card">
        <div className="row">
          <div>
            <div className="hero-num">{status.due}</div>
            <div className="muted small">cards due now</div>
          </div>
          <div className="spacer" />
          <div style={{ textAlign: 'right' }}>
            <div className="small muted">Today</div>
            <div>
              <b>{status.reviewsToday}</b> / {s.maxReviewsPerDay} reviews
            </div>
          </div>
        </div>
        <p className="small" style={{ margin: '12px 0 4px' }}>
          {newReason}
        </p>
        {stats && (
          <>
            <div className="row small muted" style={{ marginTop: 10 }}>
              <span>
                Goal: {Math.round(stats.today.minutes)} / {s.dailyGoalMinutes} min
              </span>
              <span className="spacer" />
              <span>🔥 {stats.streak} day streak</span>
            </div>
            <div className="goal-bar" style={{ marginTop: 6 }}>
              <div style={{ width: `${goalPct}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <b>Cards per session</b>
            <div className="small muted">Remembered for next time</div>
          </div>
          <div className="spacer" />
          <div className="stepper">
            <button onClick={() => update({ sessionSize: Math.max(5, s.sessionSize - 5) })} aria-label="Fewer">
              −
            </button>
            <b>{s.sessionSize}</b>
            <button onClick={() => update({ sessionSize: Math.min(300, s.sessionSize + 5) })} aria-label="More">
              +
            </button>
          </div>
        </div>
      </div>

      <div className="stack">
        <button className="btn primary big" onClick={() => go({ name: 'session' })}>
          Study
        </button>
        <button className="btn big" disabled={status.newAvailable === 0} onClick={() => go({ name: 'session', forceNew: 5 })}>
          Add 5 new words now
        </button>
      </div>

      {stats && (
        <div className="stat-row" style={{ marginTop: 16 }}>
          <div className="stat">
            <b>{stats.wordsStudied}</b>
            <span>words studied</span>
          </div>
          <div className="stat">
            <b>{stats.charsStudied}</b>
            <span>characters</span>
          </div>
          <div className="stat">
            <b>{stats.pendingNew}</b>
            <span>new words left</span>
          </div>
        </div>
      )}
      <p className="small muted center" style={{ marginTop: 16 }}>
        Day starts at {s.dayStartHour}:00 · {new Date(dayStart(Date.now(), s.dayStartHour)).toLocaleDateString()}
      </p>
      <p className="small muted center" style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
        {versionLabel()}
      </p>
    </div>
  );
}
