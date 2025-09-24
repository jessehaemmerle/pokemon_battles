import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket';

function hpFillNode(current, total) {
  const pct = Math.max(0, Math.round((current / total) * 100));
  let cls = ''; if (pct < 50) cls = ' mid'; if (pct < 25) cls = ' low';
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
    phase: 'select',
    turnOwner: 'player1'
  });

  const [atkP1, setAtkP1] = useState(false);
  const [atkP2, setAtkP2] = useState(false);
  const [defP1, setDefP1] = useState(false);
  const [defP2, setDefP2] = useState(false);

  const [lastLine, setLastLine] = useState('Ein Kampf beginnt!');
  const [log, setLog] = useState([]);
  const [showParty, setShowParty] = useState(false);
  const logRef = useRef(null);

  const p1 = state?.teams?.player1?.[state.active.player1];
  const p2 = state?.teams?.player2?.[state.active.player2];

  const lv = (mon) => Math.max(1, Math.round(mon.stats.speed / 10));
  const hpBox = (mon) => (
    <>
      <div className="info-row">
        <div className="info-name">{mon.name}</div>
        <div className="info-lv">Lv{lv(mon)}</div>
      </div>
      <div className="info-row">
        {hpFillNode(mon.currentHp, mon.stats.hp)}
        <div className="small">{mon.currentHp}/{mon.stats.hp}</div>
      </div>
    </>
  );

  useEffect(() => {
    const onBattleStart = (p) => setState(s => ({ ...s, ...p }));
    const onState = (snap) => setState(s => ({ ...s, ...snap }));
    const onTurnState = (p) => setState(s => ({ ...s, ...p }));

    const onMessage = (m) => { setLastLine(m); setLog(prev => [...prev, m]); };

    const onMove = (d) => {
      if (d.side === 'player1') { setAtkP1(true); setTimeout(()=>setAtkP1(false), 460); setDefP2(true); setTimeout(()=>setDefP2(false), 460); }
      else { setAtkP2(true); setTimeout(()=>setAtkP2(false), 460); setDefP1(true); setTimeout(()=>setDefP1(false), 460); }

      let effTxt = '';
      if (d.effectiveness === 0) effTxt = ' (keine Wirkung)';
      else if (d.effectiveness >= 2) effTxt = ' (sehr effektiv!)';
      else if (d.effectiveness <= 0.5) effTxt = ' (nicht sehr effektiv)';
      const critTxt = d.crit ? ' ✨Krit!' : '';
      const line = `➡️ ${d.side} nutzt ${d.move} auf ${d.target}: ${d.damage} Schaden${effTxt}${critTxt}`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };

    const onFainted = ({ fainted, target }) => {
      const line = `💀 ${fainted} (${target}) wurde besiegt!`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };
    const onSwitchOk = ({ side, toIndex }) => {
      const mon = (state?.teams?.[side] ?? [])[toIndex]?.name || `Slot ${toIndex+1}`;
      const line = `🔄 ${side} wechselt zu ${mon}.`;
      setLastLine(line); setLog(prev => [...prev, line]);
    };
    const onTurnEnd = () => setLog(prev => [...prev, '— Rundenende —']);
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

  const myTurn = state.turnOwner === 'player1';
  const canClick = myTurn && state.phase === 'select' && !state.over;

  const lockMove = (idx) => {
    if (!canClick) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'move', index: idx });
  };
  const canSwitchTo = (idx) => {
    const mon = state.teams.player1[idx];
    return mon.currentHp > 0 && idx !== state.active.player1;
  };
  const lockSwitch = (idx) => {
    if (!canClick) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'switch', index: idx });
    setShowParty(false);
  };

  return (
    <div className="container">
      {/* Turn badge */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
        <div className="badge" style={{ background: myTurn ? '#111827' : '#6b7280' }}>
          {myTurn ? '🎯 Dein Zug' : '⌛ Gegner ist dran'}
        </div>
        <div className="helper">
          {myTurn
            ? (state.phase==='select' ? 'Wähle Attacke oder Wechsel.' : 'Aktion läuft…')
            : 'Bitte warten…'}
        </div>
      </div>

      {/* Stage */}
      <div className="battle-stage">
        <div className="stage-layer stage-sky" />
        <div className="stage-layer stage-ground" />
        <div className="platform enemy" />
        <div className="platform player" />

        <div className="info-box info-top">
          <div className="info-row"><div className="info-name">{p2.name}</div><div className="info-lv">Lv{Math.max(1, Math.round(p2.stats.speed/10))}</div></div>
          <div className="info-row">{hpFillNode(p2.currentHp, p2.stats.hp)}<div className="small">{p2.currentHp}/{p2.stats.hp}</div></div>
        </div>
        <div className="info-box info-bottom">
          <div className="info-row"><div className="info-name">{p1.name}</div><div className="info-lv">Lv{Math.max(1, Math.round(p1.stats.speed/10))}</div></div>
          <div className="info-row">{hpFillNode(p1.currentHp, p1.stats.hp)}<div className="small">{p1.currentHp}/{p1.stats.hp}</div></div>
        </div>

        <img className={`sprite enemy ${atkP2 ? 'attack-left' : ''} ${defP2 ? 'defend-shake' : ''}`} src={p2.sprite} alt={p2.name}/>
        <img className={`sprite player ${atkP1 ? 'attack-right' : ''} ${defP1 ? 'defend-shake' : ''}`} src={p1.sprite} alt={p1.name}/>
      </div>

      {/* UI */}
      <div className="ui-area">
        {/* Commands */}
        <div className="command">
          <div className="grid grid-2" style={{ marginBottom: 10 }}>
            {p1.moves.map((m, i) => (
              <button key={i} className="btn" onClick={() => lockMove(i)} disabled={!canClick} title={m.name}>
                {m.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap:'wrap' }}>
            <button className="btn secondary" onClick={() => setShowParty(v=>!v)} disabled={!canClick}>🔄 Pokémon wechseln</button>
            <button className="btn ghost" onClick={() => window.location.reload()}>🔁 Neues Match</button>
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
                    <button className="btn" style={{ marginTop: 6 }} disabled={!canSwitchTo(i) || !canClick} onClick={() => lockSwitch(i)}>
                      Wechseln
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dialog + Log */}
        <div className="dialog">
          <div style={{ minHeight: 48 }}>{lastLine}</div>
          <div className="small" style={{ marginTop: 8, opacity: .7 }}>Battle-Log</div>
          <div className="log" ref={logRef}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
