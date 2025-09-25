import { useEffect, useState, Suspense, lazy } from 'react';
import { ToastProvider } from './components/ToastProvider.jsx';

const RandomBattle = lazy(() => import('./components/RandomBattle.jsx'));
const BattleScreen = lazy(() => import('./components/BattleScreen.jsx'));
const TeamBuilder = lazy(() => import('./components/TeamBuilder.jsx'));
const ReplayViewer = lazy(() => import('./components/ReplayViewer.jsx'));

function Skeleton() { return <div className="skel" aria-hidden="true" />; }

export default function App() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);
  const [tab, setTab] = useState('battle');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : '';
  }, [dark]);

  return (
    <ToastProvider>
      <div className="container">
        <div className="appbar">
          <div className="app-title"><span className="badge">⚔️ Pokémon Battles</span></div>
          <div className="tabs" role="tablist" aria-label="Ansicht wählen">
            <button className={`tab ${tab==='battle'?'active':''}`} role="tab" aria-selected={tab==='battle'} onClick={()=>setTab('battle')}>Kampf</button>
            <button className={`tab ${tab==='replay'?'active':''}`} role="tab" aria-selected={tab==='replay'} onClick={()=>setTab('replay')}>Replay</button>
            <button className={`tab ${tab==='team'?'active':''}`} role="tab" aria-selected={tab==='team'} onClick={()=>setTab('team')}>Team-Builder</button>
          </div>
          <div className="theme-toggle" title="Dark Mode umschalten">
            <span className="small" aria-hidden>🌙</span>
            <input className="chb" type="checkbox" checked={dark} onChange={(e)=>setDark(e.target.checked)} aria-label="Dark Mode umschalten" />
          </div>
        </div>

        {tab==='battle' && (
          <Suspense fallback={<Skeleton />}>
            <RandomBattle onReady={(room, t) => { setBattleRoom(room); setTeams(t); }} />
            {battleRoom && teams && <BattleScreen room={battleRoom} teams={teams} onExit={() => setBattleRoom(null)} />}
          </Suspense>
        )}

        {tab==='replay' && (
          <Suspense fallback={<Skeleton />}>
            <ReplayViewer />
          </Suspense>
        )}

        {tab==='team' && (
          <Suspense fallback={<Skeleton />}>
            <TeamBuilder />
          </Suspense>
        )}
      </div>
    </ToastProvider>
  );
}
