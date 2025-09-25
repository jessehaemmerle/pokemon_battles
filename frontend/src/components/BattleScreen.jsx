import { useEffect, useRef, useState, useMemo } from 'react';
import { socket } from '../lib/socket';

// --- Type chart moved to shared ---
import { TYPE_CHART } from '../shared/typeChart.js'

// (new) helper to render type chips
function TypeRow({ types=[] }) {
  if (!types.length) return null;
  return (
    <div className="type-row" aria-label="Pokémon-Typen">
      {types.map(t => (
        <span key={t} className={`type-chip type-${t}`} title={t}>
          {t[0].toUpperCase()+t.slice(1)}
        </span>
      ))}
    </div>
  );
}

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
    sleep: 'status-sleep', freeze: 'status-freeze', toxic:'status-poison'
  };
  const titleMap = {
    burn: 'Burn: 6.25% Schaden am Rundenende, physischer Angriff halbiert',
    poison: 'Gift: 12.5% Schaden am Rundenende',
    paralysis: 'Paralyse: 25% Ausfallchance',
    sleep: 'Schlaf: 1–3 Züge handlungsunfähig',
    freeze: 'Freeze: blockiert, 20% Auftauchance pro Zug',
    toxic: 'Toxic: stapelnder Giftschaden (1/16 → n/16)'
  };
  const label = { burn:'BRN', paralysis:'PAR', poison:'PSN', sleep:'SLP', freeze:'FRZ', toxic:'TXC' }[type] || type.toUpperCase();
  return <span className={`status-pill ${map[type]}`} title={titleMap[type]}>{label}</span>;
}

function ItemPill({ item }) {
  if (!item) return null;
  const title = item === 'leftovers'
    ? 'Leftovers: heilt 1/16 KP am Rundenende'
    : item === 'choice-scarf'
      ? 'Choice Scarf: Speed↑, auf den ersten Move gelockt bis zum Wechsel'
      : item === 'focus-sash'
        ? 'Focus Sash: überlebt einen potentiellen OHKO mit 1 KP'
        : item === 'life-orb'
          ? 'Life Orb: +30% Schaden, 10% Rückstoß'
          : item;
  const label = item?.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ');
  return <span className="item-pill" title={title}>{label}</span>;
}

export default function BattleScreen({ room, teams, onExit }) {
  const [state, setState] = useState({
    room, teams,
    active: { player1: 0, player2: 0 },
    over: false, winner: null,
    phase: 'select', turnOwner: 'player1',
    // Field + Timer für Badges/Countdown
    field: { weather: { type: null, turns: 0 }, terrain: { type: null, turns: 0 } },
    timer: { seconds: 60 }
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
  const [replayId, setReplayId] = useState(null);
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
    <TypeRow types={mon.types || []} />
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
      const tag = { burn: 'Burn', paralysis: 'Paralyse', poison: 'Gift', sleep:'Schlaf', freeze:'Freeze', toxic:'Toxic' }[type] || type;
      setLog(prev => [...prev, `✨ ${target} wurde mit ${tag} belegt!`]);
    };

    const onStatusTick = ({ side, type, damage }) => {
      const tag = { burn: 'Burn', poison: 'Gift', toxic:'Toxic' }[type] || type;
      setLog(prev => [...prev, `☠️ ${side} erleidet ${damage} Schaden durch ${tag}.`]);
    };

    const onStatusClear = ({ target, type, reason }) => {
      const msg = type === 'freeze' && reason === 'thaw' ? 'ist aufgetaut!' : 'ist aufgewacht!';
      setLog(prev => [...prev, `🧼 ${target} ${msg}`]);
    };

    // robust für { heal } oder { amount }
    const onItemHeal = (payload) => {
      const { side, item } = payload || {};
      const amount = payload?.amount ?? payload?.heal ?? 0;
      if (item === 'leftovers') setLog(prev => [...prev, `🍽️ ${side} heilt ${amount} KP durch Leftovers.`]);
    };

    const onWeatherChip = ({ side, type, damage }) => {
      setLog(prev => [...prev, `🌪️ ${side} erleidet ${damage} Schaden durch ${type}.`]);
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
    const onEnd = ({ winner, replayId: rid }) => {
      setLastLine(`🏆 ${winner} gewinnt den Kampf!`);
      setReplayId(rid || null);
      setState(s => ({ ...s, over: true, winner }));
      setShowEnd(true);
    };
    const onError = (msg) => setLog(prev => [...prev, `⚠️ Fehler: ${msg}`]);

    const onTimer = ({ seconds, turnOwner }) => {
      setState(s => ({ ...s, timer: { seconds }, turnOwner: turnOwner ?? s.turnOwner }));
    };

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
    socket.on('weather-chip', onWeatherChip);
    socket.on('pokemon-fainted', onFainted);
    socket.on('switch-ok', onSwitchOk);
    socket.on('turn-end', onTurnEnd);
    socket.on('battle-end', onEnd);
    socket.on('error-message', onError);
    socket.on('timer', onTimer);

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
      socket.off('weather-chip', onWeatherChip);
      socket.off('pokemon-fainted', onFainted);
      socket.off('switch-ok', onSwitchOk);
      socket.off('turn-end', onTurnEnd);
      socket.off('battle-end', onEnd);
      socket.off('error-message', onError);
      socket.off('timer', onTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  if (!state.teams || !p1 || !p2) return <div className="container">Warte auf Teams…</div>;

  const myTurn = state.turnOwner === 'player1';
  const canClick = myTurn && state.phase === 'select' && !state.over;

  // --- Move Preview (Effektivität + Accuracy + Priority + Choice-Lock + PP) ---
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
      const remaining = m.currentPP ?? m.pp ?? 0;
      const total = m.pp ?? '?';
      const pp = `${Math.max(0, remaining)}/${total}`;
      const out = remaining <= 0;
      hints[i] = { effTag, acc, prio, locked, pp, out };
    });
    return hints;
  }, [defTypes, p1.moves, choiceLock]);

  const lockMove = (idx) => {
    if (!canClick) return;
    const m = p1.moves[idx];
    const out = (m.currentPP ?? m.pp ?? 0) <= 0;
    if (out) return; // Keine PP
    if (choiceLock && choiceLock !== m.name) return; // Choice-Lock
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

  // Weather-/Terrain-Badges (inkl. Restlaufzeit)
  const weatherLabel = state.field?.weather?.type ? (
    { rain:'🌧️ Regen', sun:'☀️ Sonne', sand:'🌪️ Sandsturm', hail:'🌨️ Hagel' }[state.field.weather.type]
  ) : null;
  const terrainLabel = state.field?.terrain?.type ? (
    { electric:'⚡ Elektrofeld', grassy:'🌿 Grasfeld' }[state.field.terrain.type]
  ) : null;
  const weatherTurns = state.field?.weather?.turns || 0;
  const terrainTurns = state.field?.terrain?.turns || 0;

  const forfeit = () => socket.emit('forfeit', { room, side: 'player1' });
  const rematch = () => socket.emit('rematch', { room });

  // ------------------ Touch Gesten (Mobile) ------------------
  const touch = useRef({ x: 0, y: 0, t: 0, active: false });
  const SWIPE_MIN = 60; // Pixel
  const selectNextAlive = (dir = 1) => {
    const team = state.teams.player1;
    const cur = state.active.player1;
    const n = team.length;
    for (let step = 1; step < n + 1; step++) {
      const i = (cur + dir * step + n) % n;
      if (canSwitchTo(i)) return i;
    }
    return null;
  };

  const handleTouchStart = (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), active: true };
  };
  const handleTouchEnd = (e) => {
    if (!touch.current.active) return;
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current.active = false;

    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < SWIPE_MIN && ay < SWIPE_MIN) return;

    // Vertikal: Menü ein/aus
    if (ay > ax) {
      if (dy < -SWIPE_MIN) {
        setShowParty(true);
        setLastLine('🔄 Wechselmenü geöffnet (Wisch nach oben).');
        return;
      }
      if (dy > SWIPE_MIN) {
        setShowParty(false);
        setLastLine('⬇️ Wechselmenü geschlossen.');
        return;
      }
    }

    // Horizontal: navigiere/wechsel direkt
    const dir = dx < 0 ? +1 : -1; // links → +1 (nach vorne), rechts → -1 (zurück)
    const next = selectNextAlive(dir);
    if (next == null) return;

    // Wenn Menü zu ist, öffnen + sofort wechseln (flott auf Mobile)
    if (!showParty) setShowParty(true);
    // Sofortiger Wechsel (falls erlaubt)
    if (canClick) {
      lockSwitch(next);
    }
  };

  return (
    <div className="container">
      {/* Turn badge + Field Badges + Timer + Choice-Lock-Info + Quick Actions */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div className={`badge ${myTurn ? 'badge-turn' : 'badge-wait'}`}>
            {myTurn ? '🎯 Dein Zug' : '⌛ Gegner ist dran'}
          </div>
          <div className="badge badge-timer" title="Runden-Timer">
            ⏱️ {state.timer?.seconds ?? 60}s
          </div>
          {weatherLabel && (
            <div className="badge badge-field">
              {weatherLabel}{weatherTurns ? ` (${weatherTurns})` : ''}
            </div>
          )}
          {terrainLabel && (
            <div className="badge badge-terrain">
              {terrainLabel}{terrainTurns ? ` (${terrainTurns})` : ''}
            </div>
          )}
          <div className="small">
            {p1?.choiceLock
              ? `Choice-Lock: ${p1.choiceLock}`
              : (myTurn ? (state.phase==='select' ? 'Wähle Attacke oder Wechsel.' : 'Aktion läuft…') : 'Bitte warten…')}
          </div>
        </div>
        <div className="row row-compact">
          <button className="btn ghost" onClick={forfeit} disabled={state.over} aria-label="Aufgeben">🏳️ Aufgabe</button>
          <button className="btn" onClick={rematch} aria-label="Rematch starten">🔁 Rematch</button>
          <button className="btn" onClick={onExit} aria-label="Zurück">⬅️ Zurück</button>
        </div>
      </div>

      {/* Stage (mit Touch-Gesten) */}
      <div
        className="battle-stage"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
        <div className="command mobile-stick">
          <div className="grid grid-2 grid-moves" style={{ marginBottom: 10 }}>
            {p1.moves.map((m, i) => {
              const hint = moveHints[i] || {};
              return (
                <button
                  key={i}
                  className="btn btn-move"
                  onClick={() => lockMove(i)}
                  disabled={!canClick || !!hint.locked || !!hint.out}
                  title={m.name}
                >
                  <div className="move-title">
                    <span>{m.name}</span>
                    <span className="tag acc">PP {hint.pp}</span>
                  </div>
                  <div className="move-meta">
                    <span className="tag acc">{(m.accuracy ?? 100)}%</span>
                    {hint.effTag && <span className={`tag ${hint.effTag.cls}`}>{hint.effTag.label}</span>}
                    {m.priority ? <span className="tag pri">{m.priority > 0 ? `Prio +${m.priority}` : `Prio ${m.priority}`}</span> : <span style={{opacity:0.3}} />}
                    {hint.locked && <span className="tag lock">Lock</span>}
                    {hint.out && <span className="tag" style={{ background:'#fee2e2', color:'#991b1b' }}>Keine PP</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="row row-compact">
            <button className="btn secondary" onClick={() => setShowParty(v=>!v)} disabled={!canClick} aria-label="Pokémon wechseln">🔄 Pokémon wechseln</button>
            <button className="btn ghost" onClick={() => window.location.reload()} aria-label="Neues Match">🔁 Neues Match</button>
          </div>

          {showParty && (
            <div style={{ marginTop: 10 }}>
              <div className="party">
                {state.teams.player1.map((mon, i) => (
                  <div key={mon.id} className={`party-item ${i===state.active.player1?'is-active':''}`}>
                    <img src={mon.sprite} alt={mon.name} style={{ width: 72, imageRendering: 'pixelated' }} />
                    <div className="party-name">{i+1}. {mon.name}</div>
                    <div className="small">{mon.currentHp}/{mon.stats.hp} HP</div>
                    <button className="btn btn-switch" style={{ marginTop: 6 }} disabled={!canSwitchTo(i) || !canClick} onClick={() => lockSwitch(i)}>
                      Wechseln
                    </button>
                  </div>
                ))}
              </div>
              <div className="small" style={{ marginTop: 6, opacity:.7 }}>
                Tipp: Auf dem Feld <b>hoch</b> wischen zum Öffnen, <b>runter</b> wischen zum Schließen. Links/Rechts wischt direkt zum nächsten/vorigen Pokémon.
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
            {replayId && <div style={{ marginTop: 8 }} className="small">Replay-ID: <b>{replayId}</b> (GET /replays/{replayId})</div>}
          </div>
        </div>
      </div>

      {/* End Screen Overlay (unverändert + Rematch) */}
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
              <button className="btn" onClick={rematch} aria-label="Rematch starten">🔁 Rematch</button>
              <button className="btn secondary" onClick={onExit} aria-label="Zur Auswahl">⬅️ Zur Auswahl</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
