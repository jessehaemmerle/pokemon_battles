import { useEffect, useState, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { I18nProvider } from './i18n.jsx';
import { ToastProvider } from './components/ToastProvider.jsx'; // ← new

const RandomBattle = lazy(() => import('./components/RandomBattle.jsx'));
const BattleScreen = lazy(() => import('./components/BattleScreen.jsx'));
const TeamBuilder = lazy(() => import('./components/TeamBuilder.jsx'));
const ReplayViewer = lazy(() => import('./components/ReplayViewer.jsx'));

function Skeleton() { return <div className="skel" aria-hidden="true" />; }

function InnerApp() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);
  const [tab, setTab] = useState('battle');

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('pb_theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('pb_theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  return (
    <div className="container">
      <div className="appbar">
        <div className="app-title"><span className="badge">⚔️ Pokémon Battles</span></div>
        <div className="tabs" role="tablist" aria-label="Ansicht wählen">
          <button className={`tab ${tab==='battle'?'active':''}`} role="tab" aria-selected={tab==='battle'} onClick={()=>setTab('battle')}>Kampf</button>
          <button className={`tab ${tab==='replay'?'active':''}`} role="tab" aria-selected={tab==='replay'} onClick={()=>setTab('replay')}>Replay</button>
        </div>
        <div className="theme-toggle" title="Dark Mode umschalten">
          <span className="small" aria-hidden>🌙</span>
          <input className="chb" type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)} aria-label="Dark Mode umschalten" />
        </div>
      </div>

      {tab==='battle' && !battleRoom && (
        <div className="card card-landing">
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
  return (
    <I18nProvider initial="de">
      <ErrorBoundary>
        <ToastProvider>
          <InnerApp />
        </ToastProvider>
      </ErrorBoundary>
    </I18nProvider>
  );
}
