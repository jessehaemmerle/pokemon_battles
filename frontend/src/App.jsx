import { useEffect, useState, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { I18nProvider } from './i18n.jsx';

const RandomBattle = lazy(() => import('./components/RandomBattle.jsx'));
const BattleScreen = lazy(() => import('./components/BattleScreen.jsx'));
const TeamBuilder = lazy(() => import('./components/TeamBuilder.jsx'));
const ReplayViewer = lazy(() => import('./components/ReplayViewer.jsx'));

function Skeleton() {
  return <div className="skel" aria-hidden="true" />;
}

function InnerApp() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);
  const [tab, setTab] = useState('battle'); // battle | replay

  // theme
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('pb_theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('pb_theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  return (
    <div className="container">
      <div className="appbar">
        <div className="app-title">
          <span className="badge">⚔️ Pokémon Battles</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Ansicht wählen">
          <button className={`tab ${tab==='battle'?'active':''}`} role="tab" aria-selected={tab==='battle'} onClick={()=>setTab('battle')}>Kampf</button>
          <button className={`tab ${tab==='replay'?'active':''}`} role="tab" aria-selected={tab==='replay'} onClick={()=>setTab('replay')}>Replay</button>
        </div>
        <div className="theme-toggle" title="Dark Mode umschalten">
          <span className="small" aria-hidden>🌙</span>
          <input className="chb" type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)} aria-label="Dark Mode umschalten"/>
        </div>
      </div>

      {tab==='battle' && !battleRoom && (
        <div className="card" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Suspense fallback={<Skeleton />}><RandomBattle setBattleRoom={setBattleRoom} setTeams={setTeams} /></Suspense>
          <Suspense fallback={<Skeleton />}><TeamBuilder setBattleRoom={setBattleRoom} setTeams={setTeams} /></Suspense>
        </div>
      )}

      {tab==='battle' && battleRoom && (
        <div className="card">
          <Suspense fallback={<Skeleton />}>
            <BattleScreen room={battleRoom} teams={teams} onExit={() => { setBattleRoom(null); setTeams(null); }} />
          </Suspense>
        </div>
      )}

      {tab==='replay' && (
        <div className="card">
          <Suspense fallback={<Skeleton />}><ReplayViewer /></Suspense>
        </div>
      )}
    </div>
  );
}

export default function App(){
  // NOTE: Your I18nProvider previously expected "initial"; using that here for correctness.
  return (
    <I18nProvider initial="de">
      <ErrorBoundary>
        <InnerApp />
      </ErrorBoundary>
    </I18nProvider>
  );
}
