import { useEffect, useState, type ReactNode } from 'react';
import { BarChart } from '../components/BarChart';
import { Pinyin, TopBar } from '../components/common';
import { db, PART_LABEL, type Word } from '../lib/db';
import { useSettings } from '../lib/settings';
import { GRADE_LABEL } from '../lib/srs';
import {
  computeDetail,
  STAGE_LABEL,
  STAGES,
  type Collection,
  type Detail,
  type PartRow,
  type StatKind,
  type Trouble,
} from '../lib/statDetail';
import { go } from '../router';

const TITLE: Record<StatKind, string> = {
  reviews: 'Reviews today',
  time: 'Time today',
  streak: 'Streak',
  words: 'Words studied',
  chars: 'Characters',
  total: 'All-time',
};

const level = (n: number) => (n === 0 ? '' : n < 20 ? 'h1' : n < 50 ? 'h2' : n < 100 ? 'h3' : 'h4');
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const mins = (m: number) => {
  if (m > 0 && m < 1) return '<1 min';
  const r = Math.round(m);
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)}h ${r % 60}m`;
};
const hours = (m: number) => (m < 60 ? `${Math.round(m)}m` : `${Math.round(m / 60)}h`);
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dateOf = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const keyDate = (k?: string) => {
  if (!k) return '—';
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function Big({ items }: { items: [ReactNode, string][] }) {
  return (
    <div className="stat-row" style={{ marginBottom: 12 }}>
      {items.map(([v, l], i) => (
        <div className="stat" key={i}>
          <b>{v}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Meter({ label, value, max, right }: { label: ReactNode; value: number; max: number; right: ReactNode }) {
  return (
    <div className="acc-row">
      <span>{label}</span>
      <div className="goal-bar">
        <div style={{ width: `${max ? (100 * value) / max : 0}%` }} />
      </div>
      <span className="small muted" style={{ width: 80, textAlign: 'right' }}>
        {right}
      </span>
    </div>
  );
}

function Parts({ rows, show }: { rows: PartRow[]; show: 'reviews' | 'minutes' }) {
  if (!rows.length) return <div className="small muted">Nothing yet.</div>;
  const max = Math.max(...rows.map((r) => r[show]));
  return (
    <>
      {rows.map((r) => (
        <Meter
          key={r.part}
          label={PART_LABEL[r.part]}
          value={r[show]}
          max={max}
          right={show === 'reviews' ? `${r.reviews} · ${pct(r.correct, r.reviews)}` : mins(r.minutes)}
        />
      ))}
    </>
  );
}

function WordList({ ids, words, note }: { ids: string[]; words: Map<string, Word>; note?: (id: string) => ReactNode }) {
  return (
    <div className="list" style={{ marginBottom: 0 }}>
      {ids.map((id) => {
        const w = words.get(id);
        return (
          <button key={id} className="list-item" onClick={() => go({ name: 'word', id })}>
            <span className="han">{id}</span>
            <div className="grow">
              {w?.pinyin && (
                <div className="small">
                  <Pinyin value={w.pinyin} />
                </div>
              )}
              {w?.def && <div className="small muted ellipsis">{w.def}</div>}
            </div>
            {note && <span className="small muted">{note(id)}</span>}
            <span className="chev">›</span>
          </button>
        );
      })}
    </div>
  );
}

function CollectionView({ c, noun, kind, words }: { c: Collection; noun: string; kind: 'studied' | 'chars'; words: Map<string, Word> }) {
  const staged = STAGES.reduce((n, s) => n + c.stages[s], 0);
  const lapses = new Map(c.trouble.map((t: Trouble) => [t.id, t.lapses]));
  return (
    <>
      <Big
        items={[
          [c.added.today, 'added today'],
          [c.added.week, 'last 7 days'],
          [c.added.month, 'last 30 days'],
        ]}
      />
      <div className="card">
        <h2>How well you know them</h2>
        <div className="small muted" style={{ marginBottom: 6 }}>
          Each {noun} counts as its weakest card.
        </div>
        {STAGES.map((s) => (
          <Meter key={s} label={STAGE_LABEL[s]} value={c.stages[s]} max={staged} right={`${c.stages[s]} · ${pct(c.stages[s], staged)}`} />
        ))}
      </div>
      <div className="card">
        <h2>Added per week</h2>
        <BarChart bars={c.addedBars} startAtEnd />
      </div>
      {c.trouble.length > 0 && (
        <div className="card">
          <h2>Most forgotten</h2>
          <WordList ids={c.trouble.map((t) => t.id)} words={words} note={(id) => `${lapses.get(id)}×`} />
        </div>
      )}
      <button className="btn block" onClick={() => go({ name: 'collection', kind })}>
        See all {c.total} {noun}s
      </button>
    </>
  );
}

function Body({ kind, d, words, goal }: { kind: StatKind; d: Detail; words: Map<string, Word>; goal: number }) {
  switch (kind) {
    case 'reviews': {
      const n = d.todayReviews.length;
      const correct = n - d.grades[1];
      return (
        <>
          <Big
            items={[
              [n, 'reviews today'],
              [pct(correct, n), 'remembered'],
              [d.todayNew, 'new cards'],
            ]}
          />
          <div className="card">
            <h2>Answers</h2>
            {([1, 2, 3, 4] as const).map((g) => (
              <Meter key={g} label={GRADE_LABEL[g]} value={d.grades[g]} max={n} right={`${d.grades[g]} · ${pct(d.grades[g], n)}`} />
            ))}
          </div>
          <div className="card">
            <h2>By card type</h2>
            <Parts rows={d.todayParts} show="reviews" />
          </div>
          <div className="card">
            <h2>Reviews per day</h2>
            <div className="small muted" style={{ marginBottom: 4 }}>
              Average {Math.round(d.avgReviews7)} a day this week, {Math.round(d.avgReviews30)} over 30 days
              {d.bestDay && ` · best ${d.bestDay.count} on ${keyDate(d.bestDay.key)}`}
            </div>
            <BarChart bars={d.reviewBars} startAtEnd />
          </div>
          {d.forgotToday.length > 0 && (
            <div className="card">
              <h2>Forgotten today</h2>
              <WordList ids={d.forgotToday} words={words} />
            </div>
          )}
        </>
      );
    }
    case 'time': {
      const n = d.todayReviews.length;
      return (
        <>
          <Big
            items={[
              [Math.round(d.todayMinutes), 'min today'],
              [n ? `${Math.round((60 * d.todayMinutes) / n)}s` : '—', 'per review'],
              [`${d.goalDays30}/30`, 'goal days'],
            ]}
          />
          <div className="card">
            <h2>Daily goal</h2>
            <Meter label="Today" value={Math.min(d.todayMinutes, goal)} max={goal} right={`${Math.round(d.todayMinutes)} of ${goal} min`} />
          </div>
          <div className="card">
            <h2>Sessions today</h2>
            {d.sessionsToday.length === 0 && <div className="small muted">No studying yet today.</div>}
            {d.sessionsToday.map((s, i) => (
              <div className="row small" key={i} style={{ padding: '4px 0' }}>
                <span>
                  {clock(s.from)} – {clock(s.to)}
                </span>
                <span className="spacer" />
                <span className="muted">
                  {s.reviews} reviews · {mins(s.minutes)}
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>By card type</h2>
            <Parts rows={d.todayParts} show="minutes" />
          </div>
          <div className="card">
            <h2>Minutes per day</h2>
            <BarChart bars={d.minuteBars} startAtEnd />
          </div>
        </>
      );
    }
    case 'streak': {
      const s = d.streak;
      return (
        <>
          <Big
            items={[
              [s.current, 'current'],
              [s.longest, 'longest'],
              [s.daysStudied, 'days studied'],
            ]}
          />
          <div className="card">
            <div className="kv">
              <span className="muted">Current streak</span>
              <span>{s.current ? `since ${keyDate(s.currentFrom)}` : 'Study today to start one'}</span>
              <span className="muted">Longest streak</span>
              <span>{s.longest ? `${keyDate(s.longestFrom)} – ${keyDate(s.longestTo)}` : '—'}</span>
              <span className="muted">Last 30 days</span>
              <span>
                {s.last30} of 30 days studied
              </span>
            </div>
          </div>
          <div className="card">
            <h2>Last year</h2>
            <div className="heat-scroll" ref={(el) => el && (el.scrollLeft = el.scrollWidth)}>
              <div className="heat year">
                {d.heatmap.map((h) => (
                  <div key={h.key} className={level(h.count)} title={`${h.key}: ${h.count}`} />
                ))}
              </div>
            </div>
          </div>
        </>
      );
    }
    case 'words':
      return <CollectionView c={d.words} noun="word" kind="studied" words={words} />;
    case 'chars':
      return <CollectionView c={d.chars} noun="character" kind="chars" words={words} />;
    case 'total': {
      const days = d.streak.daysStudied;
      return (
        <>
          <Big
            items={[
              [hours(d.totalMinutes), 'total time'],
              [d.totalReviews, 'reviews'],
              [days, 'days studied'],
            ]}
          />
          <div className="card">
            <div className="kv">
              <span className="muted">Per study day</span>
              <span>{days ? mins(d.totalMinutes / days) : '—'}</span>
              <span className="muted">Per review</span>
              <span>{d.totalReviews ? `${Math.round((60 * d.totalMinutes) / d.totalReviews)}s` : '—'}</span>
              <span className="muted">Remembered</span>
              <span>{pct(d.allParts.reduce((n, p) => n + p.correct, 0), d.totalReviews)}</span>
              <span className="muted">Studying since</span>
              <span>{d.firstReview ? dateOf(d.firstReview) : '—'}</span>
            </div>
          </div>
          <div className="card">
            <h2>Time by card type</h2>
            <Parts rows={d.allParts} show="minutes" />
          </div>
          <div className="card">
            <h2>Reviews by card type</h2>
            <Parts rows={d.allParts} show="reviews" />
          </div>
          <div className="card">
            <h2>Minutes per week</h2>
            <BarChart bars={d.weekMinuteBars} startAtEnd />
          </div>
        </>
      );
    }
  }
}

export function StatDetail({ kind }: { kind: StatKind }) {
  const [s] = useSettings();
  const [d, setD] = useState<Detail | null>(null);
  const [words, setWords] = useState<Map<string, Word>>(new Map());
  useEffect(() => {
    if (!s) return;
    let live = true;
    (async () => {
      const [reviews, items] = await Promise.all([db.reviews.toArray(), db.items.toArray()]);
      const detail = computeDetail(reviews, items, s);
      const ids = [...new Set([...detail.forgotToday, ...detail.words.trouble.map((t) => t.id), ...detail.chars.trouble.map((t) => t.id)])];
      const ws = (await db.words.bulkGet(ids)).filter(Boolean) as Word[];
      if (!live) return;
      setWords(new Map(ws.map((w) => [w.id, w])));
      setD(detail);
    })();
    return () => {
      live = false;
    };
  }, [s]);
  return (
    <div className="screen">
      <TopBar title={TITLE[kind]} back />
      {!d || !s ? <div className="loading">Loading…</div> : <Body kind={kind} d={d} words={words} goal={s.dailyGoalMinutes} />}
    </div>
  );
}
