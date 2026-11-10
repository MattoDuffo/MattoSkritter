import { db } from './db';
import { getKV, resetSettingsCache, setKV } from './settings';

export const BACKUP_VERSION = 1;

export async function exportBackup(): Promise<string> {
  const data = {
    app: 'MattoSkritter',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    words: await db.words.toArray(),
    lists: await db.lists.toArray(),
    entries: await db.entries.toArray(),
    items: await db.items.toArray(),
    reviews: await db.reviews.toArray(),
    kv: (await db.kv.toArray()).filter((k) => k.key !== 'lastBackupAt'),
  };
  return JSON.stringify(data);
}

export async function restoreBackup(json: string) {
  const data = JSON.parse(json);
  if (data.app !== 'MattoSkritter') throw new Error('This is not a MattoSkritter backup file.');
  await db.transaction('rw', [db.words, db.lists, db.entries, db.items, db.reviews, db.kv], async () => {
    await Promise.all([db.words.clear(), db.lists.clear(), db.entries.clear(), db.items.clear(), db.reviews.clear(), db.kv.clear()]);
    await db.words.bulkAdd(data.words);
    await db.lists.bulkAdd(data.lists);
    await db.entries.bulkAdd(data.entries);
    await db.items.bulkAdd(data.items);
    await db.reviews.bulkAdd(data.reviews);
    await db.kv.bulkAdd(data.kv);
  });
  resetSettingsCache();
  await markBackedUp();
}

export async function markBackedUp() {
  await setKV('lastBackupAt', Date.now());
}

export async function lastBackupAt(): Promise<number | null> {
  return getKV<number | null>('lastBackupAt', null);
}

/** Save the backup through the iOS share sheet (Files / iCloud Drive), or download it. */
export async function saveBackupFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = await exportBackup();
  const name = `mattoskritter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'MattoSkritter backup' });
      await markBackedUp();
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await markBackedUp();
  return 'downloaded';
}

export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function isPersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}
