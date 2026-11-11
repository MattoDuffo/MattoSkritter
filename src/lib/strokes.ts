import type { CharacterJson } from 'hanzi-writer';

const cache = new Map<string, Promise<CharacterJson>>();

export function strokeUrl(char: string) {
  return new URL(`data/strokes/${encodeURIComponent(char)}.json`, document.baseURI).href;
}

export function loadStrokes(char: string): Promise<CharacterJson> {
  let p = cache.get(char);
  if (!p) {
    p = fetch(strokeUrl(char)).then((r) => {
      if (!r.ok) throw new Error(`No stroke data for ${char}`);
      return r.json();
    });
    p.catch(() => cache.delete(char));
    cache.set(char, p);
  }
  return p;
}

export async function hasStrokes(char: string): Promise<boolean> {
  try {
    await loadStrokes(char);
    return true;
  } catch {
    return false;
  }
}

/** Download stroke data for many characters so it is cached for offline use. */
export async function prefetchStrokes(chars: Iterable<string>, onProgress?: (done: number, total: number) => void) {
  const list = [...new Set(chars)];
  let done = 0;
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift()!;
      await hasStrokes(c);
      done++;
      onProgress?.(done, list.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

/** charDataLoader for Hanzi Writer */
export function charDataLoader(char: string, onLoad: (d: CharacterJson) => void, onError: (e?: unknown) => void) {
  loadStrokes(char).then(onLoad, onError);
}
