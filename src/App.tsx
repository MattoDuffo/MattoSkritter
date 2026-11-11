import { useEffect } from 'react';
import { Icon } from './components/icons';
import { useSettings } from './lib/settings';
import { go, useRoute, type Route } from './router';
import { AddWord } from './screens/AddWord';
import { Home } from './screens/Home';
import { ListDetail, Lists } from './screens/Lists';
import { Search } from './screens/Search';
import { Session } from './screens/Session';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { Welcome } from './screens/Welcome';
import { WordPage } from './screens/WordPage';

const TABS: { route: Route; label: string; icon: () => JSX.Element; match: Route['name'][] }[] = [
  { route: { name: 'home' }, label: 'Study', icon: Icon.study, match: ['home'] },
  { route: { name: 'lists' }, label: 'Lists', icon: Icon.lists, match: ['lists', 'list'] },
  { route: { name: 'search' }, label: 'Dictionary', icon: Icon.search, match: ['search', 'word', 'add'] },
  { route: { name: 'stats' }, label: 'Progress', icon: Icon.stats, match: ['stats'] },
  { route: { name: 'settings' }, label: 'Settings', icon: Icon.settings, match: ['settings'] },
];

export function App() {
  const route = useRoute();
  const [settings] = useSettings();

  // M3: dark mode — follow the system, or a manual override.
  useEffect(() => {
    const t = settings?.theme ?? 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [settings?.theme]);

  const showTabs = route.name !== 'session' && route.name !== 'welcome';

  return (
    <div className="app">
      {route.name === 'home' && <Home />}
      {route.name === 'session' && <Session key={location.hash} forceNew={route.forceNew} />}
      {route.name === 'lists' && <Lists />}
      {route.name === 'list' && <ListDetail id={route.id} />}
      {route.name === 'word' && <WordPage key={route.id} id={route.id} />}
      {route.name === 'add' && <AddWord key={`${route.word}-${route.listId}`} initial={route.word} listId={route.listId} />}
      {route.name === 'search' && <Search key={route.q ?? ''} q={route.q} />}
      {route.name === 'stats' && <Stats />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'welcome' && <Welcome />}
      {showTabs && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.label} className={t.match.includes(route.name) ? 'on' : ''} onClick={() => go(t.route)}>
              <t.icon />
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
