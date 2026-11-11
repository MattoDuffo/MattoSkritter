import { useEffect, useState } from 'react';
import { TopBar } from '../components/common';
import { PARTS, PART_LABEL } from '../lib/db';
import { useSettings } from '../lib/settings';
import { computeStats, type Stats as S } from '../lib/stats';

export function Stats() {
  const [s] = useSettings();
  const [st, setSt] = useState<S | null>(null);
  useEffect(() => {
    if (s) computeStats(s).then(setSt);
  }, [s]);
  if (!st || !s) return <div className="loading">Loading…</div>;
  const maxF = Math.max(1, ...st.forecast.map((f) => f.count));
  const level = (n: number) => (n === 0 ? '' : n < 20 ? 'h1' : n < 50 ? 'h2' : n < 100 ? 'h3' : 'h4');
  return (
    <div className="screen">
      <TopBar title="Progress" />
      <div className="stat-row">
        <div className="stat">
          <b>{st.today.reviews}</b>
          <span>reviews today</span>
        </div>
        <div className="stat">
          <b>{Math.round(st.today.minutes)}</b>
          <span>min today</span>
        </div>
        <div className="stat">
          <b>{st.streak}</b>
          <span>day streak</span>
        </div>
      </div>
      <div className="stat-row" style={{ marginTop: 8, marginBottom: 12 }}>
        <div className="stat">
          <b>{st.wordsStudied}</b>
          <span>words studied</span>
        </div>
        <div className="stat">
          <b>{st.charsStudied}</b>
          <span>characters</span>
        </div>
        <div className="stat">
          <b>{Math.round(st.totalMinutes / 60)}h</b>
          <span>total time</span>
        </div>
      </div>

      <div className="card">
        <h2>Daily goal</h2>
        <div className="small muted">
          {Math.round(st.today.minutes)} of {s.dailyGoalMinutes} minutes
        </div>
        <div className="goal-bar" style={{ marginTop: 6 }}>
          <div style={{ width: `${Math.min(100, (100 * st.today.minutes) / Math.max(1, s.dailyGoalMinutes))}%` }} />
        </div>
      </div>

      <div className="card">
        <h2>Upcoming reviews</h2>
        <div className="bars">
          {st.forecast.map((f, i) => (
            <div className="bar" key={i}>
              <span className="n">{f.count || ''}</span>
              <div style={{ height: `${(100 * f.count) / maxF}%` }} />
              <span className="l">{i === 0 ? 'Now' : f.label.split(' ')[0].slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Accuracy (last 30 days)</h2>
        {PARTS.map((p) => {
          const a = st.accuracy[p];
          const pct = a.total ? Math.round((100 * a.correct) / a.total) : null;
          return (
            <div className="acc-row" key={p}>
              <span>{PART_LABEL[p]}</span>
              <div className="goal-bar">
                <div style={{ width: `${pct ?? 0}%` }} />
              </div>
              <span className="small muted" style={{ width: 70, textAlign: 'right' }}>
                {pct === null ? '—' : `${pct}% (${a.total})`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2>Last 12 weeks</h2>
        <div className="heat">
          {st.heatmap.map((d) => (
            <div key={d.key} className={level(d.count)} title={`${d.key}: ${d.count}`} />
          ))}
        </div>
      </div>
      <p className="small muted center">
        {st.totalReviews} reviews in total · {st.bannedWords} banned word{st.bannedWords === 1 ? '' : 's'}
      </p>
    </div>
  );
}
