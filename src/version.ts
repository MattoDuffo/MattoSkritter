declare const __APP_VERSION__: { build: string; sha: string; date: string };

/** Build info injected by vite.config.ts (falls back when running tests). */
export const APP_VERSION: { build: string; sha: string; date: string } =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : { build: 'dev', sha: 'local', date: new Date().toISOString() };

export function versionLabel(): string {
  const d = new Date(APP_VERSION.date);
  const when = d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `Version ${APP_VERSION.build} · ${when} · ${APP_VERSION.sha}`;
}
