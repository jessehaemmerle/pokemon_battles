import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';

function hpFillNode(current, total) {
  const pct = Math.max(0, Math.round((current / total) * 100));
  let cls = ''; // default green
  if (pct < 50) cls = ' mid';
  if (pct < 25) cls = ' low';
  return (
    <div className="hpbar" title={`${current}/${total}`}>
      <div className={`fill${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BattleScreen({ room, teams, onExit }) {
  const [state, setState] = useState({
    room, teams,
    active: { player1: 0, player2: 0 },
    over: false, winner: null,
    phase: 'select', locks: {}
  });
  const [hitP1, setHitP1] = useState(false);
  const [hitP2, setHitP2] = useState(false);
  const [lastLine, setLastLine] = useState('Ein Kampf beginnt!');
  const [log, setLog] = useState([]);
  const [showParty, setShowParty] = useState(false);
  const logRef = useRef(null);

  const p1 = state?.teams?.player1?.[state.active.player1];
  const p2 = state?.teams?.player2?.[state.active.player2];

  useEffect(() => {
    const onBattleStart = (p) => setState(s => ({ ...s, ...p }));
    const onState = (snap) => setState(s => ({ ...s, ...snap }));
    const onTurnState = (p) => setState(s => ({ ...s, ...p }));
    const onMessage = (m) => { setLastLine(m); setLog(prev => [...prev, m]); };
    const onMove = (d) => {
      if (d.target === 'player1') { setHitP1(true); setTimeout(()=>setHitP1(false), 160); }
      else { setHitP2(true); setTimeout(()=>setHitP2(false), 160); }
      let effTxt = '';
      if (d.effectiveness === 0) effTxt = ' (keine Wirkung)';
      else if (d.effectiveness >= 2) effTxt = ' (sehr effektiv!)';
      else if (d.effectiveness <= 0.5) effTxt = ' (nicht sehr effektiv)';
      const critTxt = d.crit ? ' ✨Krit!' : '';
      const line = `➡️ ${d.side} nutzt ${d.move} auf ${d.target}: ${d.damage} Schaden${effTxt}${critTxt}`;
      setLastLine(line);
      setLog(prev => [...prev, line]);
    };
    const onFainted = ({ fainted, target }) => {
      const line = `💀 ${fainted} (${target}) wurde besiegt!`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };
    const onSwitchOk = ({ side, toIndex }) => {
      const mon = state?.teams?.[side]?.[toIndex]?.name || `Slot ${toIndex+1}`;
      const line = `🔄 ${side} wechselt zu ${mon}.`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };
    const onTurnEnd = () => setLog(prev => [...prev, '--- Rundenende ---']);
    const onEnd = ({ winner }) => {
      const line = `🏆 ${winner} gewinnt den Kampf!`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };
    const onError = (msg) => setLog(prev => [...prev, `⚠️ Fehler: ${msg}`]);

    socket.on('battle-start', onBattleStart);
    socket.on('state-update', onState);
    socket.on('turn-state', onTurnState);
    socket.on('message', onMessage);
    socket.on('move-made', onMove);
    socket.on('pokemon-fainted', onFainted);
    socket.on('switch-ok', onSwitchOk);
    socket.on('turn-end', onTurnEnd);
    socket.on('battle-end', onEnd);
    socket.on('error-message', onError);

    socket.emit('request-state', { room });

    return () => {
      socket.off('battle-start', onBattleStart);
      socket.off('state-update', onState);
      socket.off('turn-state', onTurnState);
      socket.off('message', onMessage);
      socket.off('move-made', onMove);
      socket.off('pokemon-fainted', onFainted);
      socket.off('switch-ok', onSwitchOk);
      socket.off('turn-end', onTurnEnd);
      socket.off('battle-end', onEnd);
      socket.off('error-message', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!state.teams || !p1 || !p2) return <div className="container">Warte auf Teams…</div>;

  const hpBox = (mon) => {
    const lv = Math.max(1, Math.round(mon.stats.speed / 10)); // kleine Illusion eines LV
    const bar = hpFillNode(mon.currentHp, mon.stats.hp);
    return (
      <>
        <div className="info-row">
          <div className="info-name">{mon.name}</div>
          <div className="info-lv">Lv{lv}</div>
        </div>
        <div className="info-row">
          {bar}
          <div className="small">{mon.currentHp}/{mon.stats.hp}</div>
        </div>
      </>
    );
  };

  const lockMove = (idx) => {
    if (state.phase !== 'select' || state.over) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'move', index: idx });
  };

  const canSwitchTo = (idx) => {
    const mon = state.teams.player1[idx];
    return mon.currentHp > 0 && idx !== state.active.player1;
  };
  const lockSwitch = (idx) => {
    if (state.phase !== 'select' || state.over) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'switch', index: idx });
    setShowParty(false);
  };

  const waitingOnOpponent =
    state.phase === 'select' && !!state.locks?.player1 && !state.locks?.player2;

  return (
    <div className="container">
      <div className="battle-stage">
        <div className="stage-layer stage-sky" />
        <div className="stage-layer stage-ground" />

        {/* Platforms */}
        <div className="platform enemy" />
        <div className="platform player" />

        {/* Enemy Info (top-right) */}
        <div className="info-box info-top">
          {hpBox(p2)}
        </div>

        {/* Player Info (bottom-left) */}
        <div className="info-box info-bottom">
          {hpBox(p1)}
        </div>

        {/* Sprites */}
        <img className={`sprite enemy ${hitP2 ? 'hit' : ''}`} src={p2.sprite} alt={p2.name} />
        <img className={`sprite player ${hitP1 ? 'hit' : ''}`} src={p1.sprite} alt={p1.name} />
      </div>

      {/* UI: Command Menu + Dialog */}
      <div className="ui-area">
        {/* Command menu (moves + switch toggle) */}
        <div className="command">
          <div className="grid grid-2" style={{ marginBottom: 10 }}>
            {p1.moves.map((m, i) => (
              <button
                key={i}
                className="btn"
                onClick={() => lockMove(i)}
                disabled={state.phase !== 'select' || !!state.locks?.player1}
                title={m.name}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn secondary"
              onClick={() => setShowParty(v => !v)}
              disabled={state.phase !== 'select'}
            >
              🔄 Pokémon wechseln
            </button>
            <button className="btn" onClick={() => window.location.reload()}>🔁 Neues Match</button>
            <button className="btn" onClick={onExit}>⬅️ Zurück</button>
          </div>

          {showParty && (
            <div style={{ marginTop: 10 }}>
              <div className="party">
                {state.teams.player1.map((mon, i) => (
                  <div key={mon.id} className="party-item">
                    <img src={mon.sprite} alt={mon.name} style={{ width: 72, imageRendering: 'pixelated' }} />
                    <div className="party-name">{i+1}. {mon.name}</div>
                    <div className="small">{mon.currentHp}/{mon.stats.hp} HP</div>
                    <button
                      className="btn"
                      style={{ marginTop: 6 }}
                      disabled={!canSwitchTo(i) || !!state.locks?.player1}
                      onClick={() => lockSwitch(i)}
                    >
                      Wechseln
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dialog + (scrollbarer) Log */}
        <div className="dialog">
          <div style={{ minHeight: 48 }}>{waitingOnOpponent ? '⏳ Warten auf Gegner…' : lastLine}</div>
          <div className="small" style={{ marginTop: 8, opacity: .7 }}>Battle-Log</div>
          <div className="log" ref={logRef}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
