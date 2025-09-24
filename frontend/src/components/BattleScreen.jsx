import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';

export default function BattleScreen({ room, teams, onExit }) {
  const [state, setState] = useState({
    room,
    teams,
    active: { player1: 0, player2: 0 },
    over: false,
    winner: null,
    phase: 'select',
    locks: {}
  });
  const [log, setLog] = useState([]);
  const [hitP1, setHitP1] = useState(false);
  const [hitP2, setHitP2] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    const onBattleStart = (p) => {
      setState(s => ({ ...s, ...p }));
    };
    const onState = (snap) => setState(s => ({ ...s, ...snap }));
    const onTurnState = (p) => setState(s => ({ ...s, ...p }));
    const onMessage = (m) => setLog(prev => [...prev, m]);
    const onMove = (d) => {
      if (d.target === 'player1') { setHitP1(true); setTimeout(()=>setHitP1(false),180); }
      else { setHitP2(true); setTimeout(()=>setHitP2(false),180); }

      let effTxt = '';
      if (d.effectiveness === 0) effTxt = ' (keine Wirkung)';
      else if (d.effectiveness >= 2) effTxt = ' (sehr effektiv!)';
      else if (d.effectiveness <= 0.5) effTxt = ' (nicht sehr effektiv)';
      const critTxt = d.crit ? ' ✨Krit!' : '';
      setLog(prev => [...prev, `➡️ ${d.side} nutzt ${d.move} auf ${d.target}: ${d.damage} Schaden${effTxt}${critTxt}`]);
    };
    const onFainted = ({ fainted, target }) => setLog(prev => [...prev, `💀 ${fainted} (${target}) wurde besiegt!`]);
    const onSwitchOk = ({ side, toIndex }) => setLog(prev => [...prev, `🔄 ${side} wechselt: Slot ${toIndex+1}`]);
    const onTurnEnd = () => setLog(prev => [...prev, `--- Rundenende ---`]);
    const onEnd = ({ winner }) => setLog(prev => [...prev, `🏆 ${winner} gewinnt den Kampf!`]);
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
  }, [room]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!state.teams) return <div>Warte auf Teams…</div>;

  const p1 = state.teams.player1[state.active.player1];
  const p2 = state.teams.player2[state.active.player2];

  const hp = (cur, max) => {
    const pct = Math.max(0, Math.round((cur/max)*100));
    let cls = 'ok'; if (pct<50) cls='mid'; if (pct<25) cls='low';
    return <div className="healthbar"><div className={`fill ${cls}`} style={{width:`${pct}%`}}/></div>;
  };

  const lockMove = (idx) => {
    if (state.phase !== 'select' || state.over) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'move', index: idx });
  };

  const canSwitchTo = (idx) => {
    const mon = state.teams.player1[idx];
    return mon.currentHp>0 && idx!==state.active.player1;
  };
  const lockSwitch = (idx) => {
    if (state.phase !== 'select' || state.over) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'switch', index: idx });
  };

  const waiting =
    state.phase === 'select' &&
    !!state.locks?.player1 &&
    !state.locks?.player2;

  return (
    <div>
      <div className="row">
        {/* Spieler */}
        <div className="card" style={{ flex:1, minWidth:280, textAlign:'center' }}>
          <img src={p1.sprite} alt={p1.name} className={`sprite ${hitP1?'hit':''}`} />
          <h3 style={{margin:'8px 0'}}>{p1.name}</h3>
          {hp(p1.currentHp, p1.stats.hp)}

          <div style={{marginTop:12}} className="grid grid-2">
            {p1.moves.map((m,i)=>(
              <button key={i} className="btn"
                onClick={()=>lockMove(i)}
                disabled={state.phase!=='select' || !!state.locks?.player1}
                title={state.phase!=='select' ? 'Warte auf nächste Runde' : (!!state.locks?.player1 ? 'Schon gelockt' : m.name)}>
                {m.name}
              </button>
            ))}
          </div>

          <h4 style={{marginTop:16}}>🔄 Wechseln</h4>
          <div className="grid grid-3">
            {state.teams.player1.map((mon, i)=>(
              <button key={mon.id} className="btn"
                onClick={()=>lockSwitch(i)}
                disabled={!canSwitchTo(i) || !!state.locks?.player1 || state.phase!=='select'}
                style={{opacity: canSwitchTo(i) && state.phase==='select' && !state.locks?.player1 ? 1 : 0.5}}>
                {i+1}. {mon.name}
              </button>
            ))}
          </div>
        </div>

        {/* Gegner */}
        <div className="card" style={{ flex:1, minWidth:280, textAlign:'center' }}>
          <img src={p2.sprite} alt={p2.name} className={`sprite ${hitP2?'hit':''}`} />
          <h3 style={{margin:'8px 0'}}>{p2.name}</h3>
          {hp(p2.currentHp, p2.stats.hp)}
        </div>
      </div>

      <div style={{marginTop:12}} className="card">
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <strong>Phase:</strong> {state.phase === 'select' ? 'Auswahl' : 'Auflösung'}
          {waiting && <span style={{marginLeft:8}}>⏳ Warten auf Gegner …</span>}
          {state.locks?.player1 && <span style={{marginLeft:8}}>✅ Dein Zug ist gelockt</span>}
        </div>
      </div>

      <div style={{marginTop:12}} className="log" ref={logRef}>
        <strong>📜 Battle Log</strong>
        <div style={{height:6}}/>
        {log.map((l,i)=><div key={i}>{l}</div>)}
      </div>

      <div style={{marginTop:12, display:'flex', gap:8}}>
        {state.over ? (
          <>
            <div className="card" style={{padding:10}}>
              🏆 Sieger: <b>{state.winner}</b>
            </div>
            <button className="btn" onClick={()=>window.location.reload()}>🔁 Neues Match</button>
            <button className="btn secondary" onClick={onExit}>⬅️ Zurück</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={()=>window.location.reload()}>🔁 Neues Match</button>
            <button className="btn secondary" onClick={onExit}>⬅️ Zurück</button>
          </>
        )}
      </div>
    </div>
  );
}
