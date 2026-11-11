import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'session'; forceNew?: number }
  | { name: 'lists' }
  | { name: 'list'; id: number }
  | { name: 'word'; id: string }
  | { name: 'add'; word?: string; listId?: number }
  | { name: 'search'; q?: string }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'welcome' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const [a, b] = path.split('/').map(decodeURIComponent);
  switch (a) {
    case 'session':
      return { name: 'session', forceNew: params.get('new') ? Number(params.get('new')) : undefined };
    case 'lists':
      return { name: 'lists' };
    case 'list':
      return { name: 'list', id: Number(b) };
    case 'word':
      return { name: 'word', id: b };
    case 'add':
      return { name: 'add', word: params.get('w') ?? undefined, listId: params.get('list') ? Number(params.get('list')) : undefined };
    case 'search':
      return { name: 'search', q: params.get('q') ?? undefined };
    case 'stats':
      return { name: 'stats' };
    case 'settings':
      return { name: 'settings' };
    case 'welcome':
      return { name: 'welcome' };
    default:
      return { name: 'home' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'session':
      return r.forceNew ? `#/session?new=${r.forceNew}` : '#/session';
    case 'list':
      return `#/list/${r.id}`;
    case 'word':
      return `#/word/${encodeURIComponent(r.id)}`;
    case 'add': {
      const p = new URLSearchParams();
      if (r.word) p.set('w', r.word);
      if (r.listId) p.set('list', String(r.listId));
      const s = p.toString();
      return `#/add${s ? '?' + s : ''}`;
    }
    case 'search':
      return r.q ? `#/search?q=${encodeURIComponent(r.q)}` : '#/search';
    default:
      return `#/${r.name}`;
  }
}

export function go(r: Route, replace = false) {
  const h = href(r);
  if (replace) location.replace(h);
  else location.hash = h;
}

export function back(fallback: Route = { name: 'home' }) {
  if (history.length > 1) history.back();
  else go(fallback, true);
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setR(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
