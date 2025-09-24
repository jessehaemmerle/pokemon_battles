import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';

export default function BattleScreen({ room, teams, onExit }) {
  const [state, setState] = useState({
    room,
    teams,
    active: { player1: 0, player2: 0 },
    over: false,
    winner: null
  });
  const [log, setLog] = useState([]);
  const [hitPlayer, setHitPlayer] = useState(false);
  const [hitEnemy, setHitEnemy] = useState(false);
  const logRef = useRef(null);

  // Listener
  useEffect(() => {
    const onState = (snap) => setState((prev) => ({ ...prev, ...snap }));

    const onMove = (d) => {
      // Trefferanimation
      if (d.target === 'player1') {
        setHitPlayer(true); setTimeout(() => setHitPlayer(false), 180);
      } else {
        setHitEnemy(true); setTimeout(() => setHitEnemy(false), 180);
      }

      // Log Text inkl. Effektivität
      let effTxt = '';
      if (d.effectiveness === 0) effTxt = ' (keine Wirkung)';
      else if (d.effectiveness >= 2) effTxt = ' (sehr effektiv!)';
      else if (d.effectiveness <= 0.5) effTxt = ' (nicht sehr effektiv)';
      const critTxt = d.crit ? ' ✨Krit!' : '';
      setLog(prev => [...prev, `➡️ ${d.side} nutzt ${d.move} gegen ${d.target}: ${d.damage} Schaden${effTxt}${critTxt}`]);
    };

    const onFaint = ({ fainted, target }) => {
      setLog(prev => [...prev, `💀 ${fainted} von ${target} wurde besiegt!`]);
    };

    const onSwitch = ({ side, toIndex }) => {
      setLog(prev => [...prev, `🔄 ${side} wechselt auf Slot ${toIndex + 1}.`]);
    };

    const onEnd = ({ winner }) => {
      setLog(prev => [...prev, `🏆 ${winner} gewinnt den Kampf!`]);
    };

    const onError = (msg) => {
      setLog(prev => [...prev, `⚠️ Fehler: ${msg}`]);
    };

    socket.on('state-update', onState);
    socket.on('move-made', onMove);
    socket.on('pokemon-fainted', onFaint);
    socket.on('switch-ok', onSwitch);
    socket.on('battle-end', onEnd);
    socket.on('error-message', onError);

    // Direkt bei Mount den Snapshot anfragen (z. B. nach Refresh)
    socket.emit('request-state', { room });

    return () => {
      socket.off('state-update', onState);
      socket.off('move-made', onMove);
      socket.off('pokemon-fainted', onFaint);
      socket.off('switch-ok', onSwitch);
      socket.off('battle-end', onEnd);
      socket.off('error-message', onError);
    };
  }, [room]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!state.teams) return <div>Warte auf Teams…</div>;

  const activeP1 = state.teams.player1[state.active.player1];
  const activeP2 = state.teams.player2[state.active.player2];

  const hpFill = (current, total) => {
    const pct = Math.max(0, Math.round((current / total) * 100));
    let cls = 'ok'; if (pct < 50) cls = 'mid'; if (pct < 25) cls = 'low';
    return (
      <div className="healthbar">
        <div className={`fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  const makeMove = (moveIndex) => {
    socket.emit('move', { room, side: 'player1', moveIndex });
  };

  const canSwitchTo = (idx) => {
    const p = state.teams.player1[idx];
    return p.currentHp > 0 && idx !== state.active.player1;
  };

  const doSwitch = (idx) => {
    socket.emit('switch', { room, side: 'player1', toIndex: idx });
  };

  return (
    <div>
      <div className="row">
        {/* Spieler */}
        <div className="card" style={{ flex: 1, minWidth: 280, textAlign: 'center' }}>
          <img
            src={activeP1.sprite}
            alt={activeP1.name}
            className={`sprite ${hitPlayer ? 'hit' : ''}`}
          />
          <h3 style={{ margin: '8px 0' }}>{activeP1.name}</h3>
          {hpFill(activeP1.currentHp, activeP1.stats.hp)}
          <div style={{ marginTop: 12 }} className="grid grid-2">
            {activeP1.moves.map((m, i) => (
              <button key={i} className="btn" onClick={() => makeMove(i)}>
                {m.name}
              </button>
            ))}
          </div>
          <h4 style={{ marginTop: 16 }}>🔄 Wechseln</h4>
          <div className="grid grid-3">
            {state.teams.player1.map((p, i) => (
              <button
                key={p.id}
                className="btn"
                onClick={() => doSwitch(i)}
                disabled={!canSwitchTo(i)}
                title={p.currentHp <= 0 ? 'Kampfunfähig' : (i === state.active.player1 ? 'Bereits aktiv' : `Wechsel zu ${p.name}`)}
                style={{ opacity: canSwitchTo(i) ? 1 : 0.5 }}
              >
                {i+1}. {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Gegner */}
        <div className="card" style={{ flex: 1, minWidth: 280, textAlign: 'center' }}>
          <img
            src={activeP2.sprite}
            alt={activeP2.name}
            className={`sprite ${hitEnemy ? 'hit' : ''}`}
          />
          <h3 style={{ margin: '8px 0' }}>{activeP2.name}</h3>
          {hpFill(activeP2.currentHp, activeP2.stats.hp)}
        </div>
      </div>

      <div style={{ marginTop: 16 }} className="log" ref={logRef}>
        <strong>📜 Battle Log</strong>
        <div style={{ height: 6 }} />
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {state.over ? (
          <>
            <div className="card" style={{ padding: 10 }}>
              🏆 Sieger: <b>{state.winner}</b>
            </div>
            <button className="btn" onClick={() => window.location.reload()}>🔁 Neues Match</button>
            <button className="btn secondary" onClick={onExit}>⬅️ Zurück</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => window.location.reload()}>🔁 Neues Match</button>
            <button className="btn secondary" onClick={onExit}>⬅️ Zurück</button>
          </>
        )}
      </div>
    </div>
  );
}
