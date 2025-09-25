import { useState, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { I18nProvider, useI18n } from './i18n.js';

const RandomBattle = lazy(() => import('./RandomBattle.jsx'));
const BattleScreen = lazy(() => import('./BattleScreen.jsx'));
const TeamBuilder = lazy(() => import('./TeamBuilder.jsx'));
const ReplayViewer = lazy(() => import('./ReplayViewer.jsx'));

function InnerApp() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);
  const [tab, setTab] = useState('battle'); // 'battle' | 'replay'

  const { t } = useI18n();
  return (
    <div className="container">
      <div className="tabs">
        <button className={`tab ${tab==='battle'?'active':''}`} onClick={()=>setTab('battle')}>{t('battle')} ⚔️</button>
        <button className={`tab ${tab==='replay'?'active':''}`} onClick={()=>setTab('replay')}>🎞️ {t('replay_viewer')}</button>
      </div>

      {tab==='battle' && !battleRoom && (
        <div className="row" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="card" style={{ flex: 1 }}>
            <Suspense fallback={<div>Loading…</div>}><RandomBattle setBattleRoom={setBattleRoom} setTeams={setTeams} /></Suspense>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <Suspense fallback={<div>Loading…</div>}><TeamBuilder /></Suspense>
          </div>
        </div>
      )}

      {tab==='battle' && battleRoom && (
        <div className="card">
          <Suspense fallback={<div>Loading…</div>}><BattleScreen
            room={battleRoom}
            teams={teams}
            onExit={() => { setBattleRoom(null); setTeams(null); }}
          /></Suspense>
        </div>
      )}

      {tab==='replay' && (
        <div className="card">
          <Suspense fallback={<div>Loading…</div>}><ReplayViewer /></Suspense>
        </div>
      )}
    </div>
  );
}


export default function App(){
  return (
    <I18nProvider defaultLang="de">
      <ErrorBoundary>
        <InnerApp />
      </ErrorBoundary>
    </I18nProvider>
  );
}
