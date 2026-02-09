import React, { useEffect, useMemo, useState } from 'react';
import { getSocket } from './lib/socket';
import RandomBattle from './components/RandomBattle.jsx';
import BattleScreen from './components/BattleScreen.jsx';
import TeamBuilder from './components/TeamBuilder.jsx';
import ReplayViewer from './components/ReplayViewer.jsx';
import { ToastProvider, useToast } from './components/ToastProvider.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { I18nProvider } from './i18n.jsx';

function AppInner() {
  const socket = useMemo(() => getSocket(), []);
  const toast = useToast();
  const [tab, setTab] = useState('battle');
  const [theme, setTheme] = useState(() => localStorage.getItem('pb_theme') || 'dark');
  const [battleRoom, setBattleRoom] = useState(null);
  const [battleSide, setBattleSide] = useState('p1');
  const [teams, setTeams] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [events, setEvents] = useState([]);
  const [battleEnd, setBattleEnd] = useState(null);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('pb_theme', theme);
  }, [theme]);

  useEffect(() => {
    const onBattleStart = (payload) => {
      setBattleRoom(payload.room);
      setBattleSide(payload.side || 'p1');
      setTeams(payload.teams);
      setSnapshot(payload.snapshot);
      setEvents([]);
      setBattleEnd(null);
    };
    const onStateUpdate = (snap) => setSnapshot(snap);
    const onTurnState = (payload) => setEvents((prev) => [...prev, ...(payload.events || [])]);
    const onBattleEnd = (payload) => setBattleEnd(payload);
    const onTimer = (payload) => setTimer(payload.remaining ?? 60);
    const onErrorMessage = (payload) => toast(payload.text || 'Error');

    socket.on('battle-start', onBattleStart);
    socket.on('state-update', onStateUpdate);
    socket.on('turn-state', onTurnState);
    socket.on('battle-end', onBattleEnd);
    socket.on('timer', onTimer);
    socket.on('error-message', onErrorMessage);

    return () => {
      socket.off('battle-start', onBattleStart);
      socket.off('state-update', onStateUpdate);
      socket.off('turn-state', onTurnState);
      socket.off('battle-end', onBattleEnd);
      socket.off('timer', onTimer);
      socket.off('error-message', onErrorMessage);
    };
  }, [socket, toast]);

  const startOnline = (generations) => socket.emit('join-random', { generations });
  const startBot = (generations) => socket.emit('start-bot-battle', { generations });
  const startCustomBot = (team, generations) => socket.emit('start-custom-bot', { team, generations });
  const startCustomPvp = (team, generations) => socket.emit('start-custom-pvp', { team, generations });

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">Pokemon Battles</div>
        <div className="tabs">
          <button className={tab === 'battle' ? 'active' : ''} onClick={() => setTab('battle')}>Kampf</button>
          <button className={tab === 'replay' ? 'active' : ''} onClick={() => setTab('replay')}>Replay</button>
        </div>
        <button className="theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Theme</button>
      </header>

      {tab === 'battle' && (
        <div className="grid">
          <div className="card">
            <h2>Random Battle</h2>
            <RandomBattle onOnline={startOnline} onBot={startBot} />
          </div>
          <div className="card">
            <h2>Team Builder</h2>
            <TeamBuilder onStartBot={startCustomBot} onStartPvp={startCustomPvp} />
          </div>
          <div className="card full">
            <BattleScreen
              room={battleRoom}
              side={battleSide}
              teams={teams}
              snapshot={snapshot}
              events={events}
              battleEnd={battleEnd}
              timer={timer}
              onMove={(payload) => socket.emit('lock-action', payload)}
              onForfeit={(payload) => socket.emit('forfeit', payload)}
              onRematch={(payload) => socket.emit('rematch', payload)}
              requestState={() => battleRoom && socket.emit('request-state', { room: battleRoom })}
            />
          </div>
        </div>
      )}

      {tab === 'replay' && (
        <div className="card">
          <ReplayViewer />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </ToastProvider>
    </I18nProvider>
  );
}
