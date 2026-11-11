import { useEffect, useState } from 'react';
import { db, type Part } from './db';

export interface Settings {
  sessionSize: number; // M1: remembered
  newPerDay: number;
  stubbornness: number; // M2: 0 eager .. 100 Skritter-strict
  maxReviewsPerDay: number;
  parts: Record<Part, boolean>;
  charItems: boolean; // characters inside words get their own writing item
  autoAdvance: boolean;
  theme: 'auto' | 'light' | 'dark';
  autoplayAudio: boolean;
  grid: 'mi' | 'tian' | 'none';
  leniency: number; // stroke matching leniency for Hanzi Writer
  hintAfterMisses: number;
  drawAfterMisses: number;
  dailyGoalMinutes: number;
  dayStartHour: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sessionSize: 30,
  newPerDay: 10,
  stubbornness: 50,
  maxReviewsPerDay: 100,
  parts: { write: true, tone: true, defn: true, read: true },
  charItems: true,
  autoAdvance: true,
  theme: 'auto',
  autoplayAudio: true,
  grid: 'mi',
  leniency: 1.4,
  hintAfterMisses: 2,
  drawAfterMisses: 3,
  dailyGoalMinutes: 15,
  dayStartHour: 4,
};

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  const row = await db.kv.get('settings');
  const stored = (row?.value ?? {}) as Partial<Settings>;
  cache = { ...DEFAULT_SETTINGS, ...stored, parts: { ...DEFAULT_SETTINGS.parts, ...(stored.parts ?? {}) } };
  return cache;
}

export function resetSettingsCache() {
  cache = null;
}

/** Saved immediately on every change (M1). */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings();
  cache = { ...cur, ...patch };
  await db.kv.put({ key: 'settings', value: cache });
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useSettings(): [Settings | null, (p: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings | null>(cache);
  useEffect(() => {
    let alive = true;
    loadSettings().then((v) => alive && setS(v));
    const l = (v: Settings) => setS(v);
    listeners.add(l);
    return () => {
      alive = false;
      listeners.delete(l);
    };
  }, []);
  return [s, (p) => void updateSettings(p)];
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value });
}

/** Start of the current study day (default 4am local). */
export function dayStart(now: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function dayKey(ts: number, hour: number): string {
  const d = new Date(dayStart(ts, hour));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
