import { useEffect, useRef, useState, useMemo } from 'react';
import { socket } from '../lib/socket';

// --- Type chart (client copy for previews) ---
const TYPE_CHART = {
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  fire:     { fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2 },
  water:    { fire:2, water:0.5, grass:0.5, ground:2, rock:2, dragon:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, ground:0, flying:2, dragon:0.5 },
  grass:    { fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5 },
  ice:      { fire:0.5, water:0.5, ice:0.5, ground:2, flying:2, dragon:2, grass:2, steel:0.5 },
  fighting: { normal:2, ice:2, rock:2, dark:2, steel:2, poison:0.5, flying:0.5, psychic:0.5, bug:0.5, ghost:0, fairy:0.5 },
  poison:   { grass:2, fairy:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0 },
  ground:   { fire:2, electric:2, poison:2, rock:2, steel:2, grass:0.5, bug:0.5, flying:0 },
  flying:   { grass:2, fighting:2, bug:2, rock:0.5, electric:0.5, steel:0.5 },
  psychic:  { fighting:2, poison:2, psychic:0.5, steel:0.5, dark:0 },
  bug:      { grass:2, psychic:2, dark:2, fighting:0.5, fire:0.5, flying:0.5, ghost:0.5, steel:0.5, fairy:0.5, poison:0.5 },
  rock:     { fire:2, ice:2, flying:2, bug:2, fighting:0.5, ground:0.5, steel:0.5 },
  ghost:    { ghost:2, psychic:2, normal:0, dark:0.5 },
  dragon:   { dragon:2, steel:0.5, fairy:0 },
  dark:     { ghost:2, psychic:2, fighting:0.5, dark:0.5, fairy:0.5 },
  steel:    { rock:2, ice:2, fairy:2, fire:0.5, water:0.5, electric:0.5, steel:0.5 },
  fairy:    { fighting:2, dragon:2, dark:2, fire:0.5, poison:0.5, steel:0.5 }
};
const effMultiplier = (moveType, defTypes=[]) =>
  defTypes.reduce((acc,t)=>acc*(TYPE_CHART[moveType]?.[t] ?? 1), 1);

function hpFillNode(current, total) {
  const pct = Math.max(0, Math.round((current / total) * 100));
  let cls = ''; if (pct < 50) cls = ' mid'; if (pct < 25) cls = ' low';
  return (
    <div className="hpbar" title={`${current}/${total}`}>
      <div className={`fill${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusPill({ type }) {
  if (!type) return null;
  const map = {
    burn: 'status-burn', paralysis: 'status-para', poison:'status-poison',
    sleep: 'status-sleep', freeze: 'status-freeze'
  };
  const titleMap = {
    burn: 'Burn: 6.25% Schaden am Rundenende, physischer Angriff halbiert',
    poison: 'Gift: 12.5% Schaden am Rundenende',
    paralysis: 'Paralyse: 25% Ausfallchance',
    sleep: 'Schlaf: 1–3 Züge handlungsunfähig',
    freeze: 'Freeze: blockiert, 20% Auftauchance pro Zug'
  };
  const label = { burn:'BRN', paralysis:'PAR', poison:'PSN', sleep:'SLP', freeze:'FRZ' }[type] || type.toUpperCase();
  return <span className={`status-pill ${map[type]}`} title={titleMap[type]}>{label}</span>;
}

function ItemPill({ item }) {
  if (!item) return null;
  const title = item === 'leftovers'
    ? 'Leftovers: heilt 1/16 KP am Rundenende'
    : 'Choice Scarf: Speed↑, auf den ersten Move gelockt bis zum Wechsel';
  const label = item === 'leftovers' ? 'Leftovers' : 'Choice Scarf';
  return <span className="item-pill" title={title}>{label}</span>;
}

export default function BattleScreen({ room, teams, onExit }) {
  const [state, setState] = useState({
    room, teams,
    active: { player1: 0, player2: 0 },
    over: false, winner: null,
    phase: 'select', turnOwner: 'player1'
  });

  // Animations
  const [atkP1, setAtkP1] = useState(false);
  const [atkP2, setAtkP2] = useState(false);
  const [defP1, setDefP1] = useState(false);
  const [defP2, setDefP2] = useState(false);

  const [lastLine, setLastLine] = useState('Ein Kampf beginnt!');
  const [log, setLog] = useState([]);
  const [showParty, setShowParty] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [stats, setStats] = useState({
    turns: 0,
    player1: { damageDealt: 0, movesUsed: 0, switches: 0, faints: 0 },
    player2: { damageDealt: 0, movesUsed: 0, switches: 0, faints: 0 }
  });

  const logRef = useRef(null);

  const p1 = state?.teams?.player1?.[state.active.player1];
  const p2 = state?.teams?.player2?.[state.active.player2];

  const lv = (mon) => Math.max(1, Math.round(mon.stats.speed / 10));
  const hpBox = (mon) => (
    <>
      <div className="info-row">
        <div className="info-name">
          {mon.name}
          <StatusPill type={mon.status?.type} />
          <ItemPill item={mon.item} />
        </div>
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

      setStats(prev => {
        const copy = structuredClone(prev);
        copy[d.side].damageDealt += d.damage;
        copy[d.side].movesUsed += 1;
        return copy;
      });
    };

    const onMiss = ({ side, move }) => setLog(prev => [...prev, `😬 ${side} verfehlt mit ${move}.`]);

    const onStatusApplied = ({ target, type }) => {
      const tag = { burn: 'Burn', paralysis: 'Paralyse', poison: 'Gift', sleep:'Schlaf', freeze:'Freeze' }[type] || type;
      setLog(prev => [...prev, `✨ ${target} wurde mit ${tag} belegt!`]);
    };

    const onStatusTick = ({ side, type, damage }) => {
      const tag = { burn: 'Burn', poison: 'Gift' }[type] || type;
      setLog(prev => [...prev, `☠️ ${side} erleidet ${damage} Schaden durch ${tag}.`]);
    };

    const onStatusClear = ({ target, type, reason }) => {
      const msg = type === 'freeze' && reason === 'thaw' ? 'ist aufgetaut!' : 'ist aufgewacht!';
      setLog(prev => [...prev, `🧼 ${target} ${msg}`]);
    };

    const onItemHeal = ({ side, item, amount }) => {
      if (item === 'leftovers') setLog(prev => [...prev, `🍽️ ${side} heilt ${amount} KP durch Leftovers.`]);
    };

    const onFainted = ({ fainted, target }) => {
      setLog(prev => [...prev, `💀 ${fainted} (${target}) wurde besiegt!`]);
      setStats(prev => {
        const copy = structuredClone(prev);
        copy[target].faints += 1;
        return copy;
      });
    };
    const onSwitchOk = ({ side, toIndex }) => {
      const mon = (state?.teams?.[side] ?? [])[toIndex]?.name || `Slot ${toIndex+1}`;
      setLog(prev => [...prev, `🔄 ${side} wechselt zu ${mon}.`]);
      setStats(prev => {
        const copy = structuredClone(prev);
        copy[side].switches += 1;
        return copy;
      });
    };
    const onTurnEnd = () => {
      setStats(prev => ({ ...prev, turns: prev.turns + 1 }));
      setLog(prev => [...prev, '— Rundenende —']);
    };
    const onEnd = ({ winner }) => {
      setLastLine(`🏆 ${winner} gewinnt den Kampf!`);
      setState(s => ({ ...s, over: true, winner }));
      setShowEnd(true);
    };
    const onError = (msg) => setLog(prev => [...prev, `⚠️ Fehler: ${msg}`]);

    socket.on('battle-start', onBattleStart);
    socket.on('state-update', onState);
    socket.on('turn-state', onTurnState);
    socket.on('message', onMessage);
    socket.on('move-made', onMove);
    socket.on('move-missed', onMiss);
    socket.on('status-applied', onStatusApplied);
    socket.on('status-tick', onStatusTick);
    socket.on('status-clear', onStatusClear);
    socket.on('item-heal', onItemHeal);
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
      socket.off('move-missed', onMiss);
      socket.off('status-applied', onStatusApplied);
      socket.off('status-tick', onStatusTick);
      socket.off('status-clear', onStatusClear);
      socket.off('item-heal', onItemHeal);
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

  // --- Move Preview (Effektivität + Accuracy + Priority + Choice-Lock) ---
  const defTypes = state?.teams?.player2?.[state.active.player2]?.types ?? [];
  const choiceLock = p1?.choiceLock || null;
  const moveHints = useMemo(() => {
    const hints = [];
    (p1.moves || []).forEach((m, i) => {
      const eff = effMultiplier(m.type, defTypes);
      let effTag = null;
      if (eff === 0) effTag = { cls: 'imm', label: 'Immun' };
      else if (eff >= 2) effTag = { cls: 'se', label: 'Sehr effektiv' };
      else if (eff <= 0.5) effTag = { cls: 'ne', label: 'Nicht sehr eff.' };
      const acc = m.accuracy ?? 100;
      const prio = m.priority ?? 0;
      const locked = choiceLock && choiceLock !== m.name;
      hints[i] = { effTag, acc, prio, locked };
    });
    return hints;
  }, [defTypes, p1.moves, choiceLock]);

  const lockMove = (idx) => {
    if (!canClick) return;
    const m = p1.moves[idx];
    if (choiceLock && choiceLock !== m.name) return; // Hard block client-side
    socket.emit('lock-action', { room, side: 'player1', type: 'move', index: idx });
  };
  const canSwitchTo = (idx) => {
    const mon = state.teams.player1[idx];
    return mon.currentHp > 0 && idx !== state.active.player1;
  };
  const lockSwitch = (idx) => {
    if (!canClick) return;
    socket.emit('lock-action', { room, side: 'player1', type: 'switch', index: idx });
    // Choice-Lock entfernt sich serverseitig beim Switch; der Snapshot aktualisiert den Client
    setShowParty(false);
  };

  return (
    <div className="container">
      {/* Turn badge */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
        <div className="badge" style={{ background: myTurn ? '#111827' : '#6b7280' }}>
          {myTurn ? '🎯 Dein Zug' : '⌛ Gegner ist dran'}
        </div>
        <div className="small">
          {choiceLock ? `Choice-Lock: ${choiceLock}` : (myTurn ? (state.phase==='select' ? 'Wähle Attacke oder Wechsel.' : 'Aktion läuft…') : 'Bitte warten…')}
        </div>
      </div>

      {/* Stage */}
      <div className="battle-stage">
        <div className="stage-layer stage-sky" />
        <div className="stage-layer stage-ground" />
        <div className="platform enemy" />
        <div className="platform player" />

        <div className="info-box info-top">{hpBox(p2)}</div>
        <div className="info-box info-bottom">{hpBox(p1)}</div>

        {/* Sprites + animations */}
        <img className={`sprite enemy ${atkP2 ? 'attack-left' : ''} ${defP2 ? 'defend-shake' : ''}`} src={p2.sprite} alt={p2.name}/>
        <img className={`sprite player ${atkP1 ? 'attack-right' : ''} ${defP1 ? 'defend-shake' : ''}`} src={p1.sprite} alt={p1.name}/>
      </div>

      {/* UI */}
      <div className="ui-area">
        {/* Commands */}
        <div className="command">
          <div className="grid grid-2" style={{ marginBottom: 10 }}>
            {p1.moves.map((m, i) => {
              const hint = moveHints[i] || {};
              return (
                <button
                  key={i}
                  className="btn"
                  onClick={() => lockMove(i)}
                  disabled={!canClick || !!hint.locked}
                  title={m.name}
                >
                  <div style={{ fontWeight: 800 }}>{m.name}</div>
                  <div className="move-meta">
                    <span className="tag acc">{(m.accuracy ?? 100)}%</span>
                    {hint.effTag && <span className={`tag ${hint.effTag.cls}`}>{hint.effTag.label}</span>}
                    {m.priority ? <span className="tag pri">{m.priority > 0 ? `Prio +${m.priority}` : `Prio ${m.priority}`}</span> : <span style={{opacity:0.3}} />}
                    {hint.locked && <span className="tag lock">Lock</span>}
                  </div>
                </button>
              );
            })}
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

      {/* End Screen Overlay (wie zuvor) */}
      {showEnd && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <span className="trophy" aria-hidden />
              <span>{state.winner === 'player1' ? '🎉 Sieg!' : '😤 Niederlage'}</span>
              <span className="trophy" aria-hidden />
            </div>

            <div className="modal-row">
              <div className="modal-card">
                <div className="stat"><span>Runden</span><b>{stats.turns}</b></div>
                <div className="stat"><span>Dein Schaden</span><b>{stats.player1.damageDealt}</b></div>
                <div className="stat"><span>Deine Moves</span><b>{stats.player1.movesUsed}</b></div>
                <div className="stat"><span>Deine Wechsel</span><b>{stats.player1.switches}</b></div>
                <div className="stat"><span>Deine KOs erlitten</span><b>{stats.player1.faints}</b></div>
              </div>
              <div className="modal-card">
                <div className="stat"><span>Gegner-Schaden</span><b>{stats.player2.damageDealt}</b></div>
                <div className="stat"><span>Gegner-Moves</span><b>{stats.player2.movesUsed}</b></div>
                <div className="stat"><span>Gegner-Wechsel</span><b>{stats.player2.switches}</b></div>
                <div className="stat"><span>Gegner KOs erlitten</span><b>{stats.player2.faints}</b></div>
                <div style={{ marginTop: 10 }} className="small">Teams</div>
                <div className="team-sprites" style={{ marginTop: 6 }}>
                  {state.teams.player1.map(p => <img key={`p1-${p.id}`} src={p.sprite} alt={p.name} />)}
                </div>
                <div className="team-sprites" style={{ marginTop: 6 }}>
                  {state.teams.player2.map(p => <img key={`p2-${p.id}`} src={p.sprite} alt={p.name} />)}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => window.location.reload()}>🔁 Neues Match</button>
              <button className="btn secondary" onClick={onExit}>⬅️ Zur Auswahl</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
