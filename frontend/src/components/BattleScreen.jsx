import React, { useMemo } from 'react';
import typeChart from '../shared/typeChart.js';

const { typeEffectiveness } = typeChart;

export default function BattleScreen({
  room,
  side,
  teams,
  snapshot,
  events,
  battleEnd,
  timer,
  onMove,
  onForfeit,
  onRematch,
  requestState
}) {
  const [hoveredMove, setHoveredMove] = React.useState(null);
  const [selectedMove, setSelectedMove] = React.useState(null);
  const [compactPanel, setCompactPanel] = React.useState(false);
  const pressTimerRef = React.useRef(null);
  const activeData = useMemo(() => {
    if (!snapshot) return null;
    const mySide = snapshot.sides[side];
    const oppSide = snapshot.sides[side === 'p1' ? 'p2' : 'p1'];
    return {
      me: mySide.team[mySide.active],
      opp: oppSide.team[oppSide.active],
      mySide,
      oppSide
    };
  }, [snapshot, side]);

  if (!room || !snapshot || !activeData) {
    return <div className="empty">No active battle yet.</div>;
  }

  const { me, opp, mySide, oppSide } = activeData;
  const sideNames = {
    p1: snapshot.sides.p1.name,
    p2: snapshot.sides.p2.name
  };

  const formatEvent = (e) => {
    switch (e.type) {
      case 'move-made':
        return `${sideNames[e.side]} used ${e.move}`;
      case 'miss':
        return `${sideNames[e.side]} missed`;
      case 'status-applied':
        return `${sideNames[e.side]} status: ${e.status}`;
      case 'status-tick':
        return `${sideNames[e.side]} suffered ${e.status}`;
      case 'item-heal':
        return `${sideNames[e.side]} healed`;
      case 'pokemon-fainted':
        return `${sideNames[e.side]} fainted`;
      case 'switch-ok':
        return `${sideNames[e.side]} switched`;
      case 'weather-chip':
        return `Weather: ${e.weather}`;
      case 'turn-end':
        return `Turn ${e.turn} ended`;
      case 'message':
        return e.text;
      default:
        return e.type;
    }
  };

  const typeIcon = (type) => {
    const map = {
      fire: 'FIR',
      water: 'WAT',
      grass: 'GRA',
      electric: 'ELE',
      ice: 'ICE',
      fighting: 'FIG',
      poison: 'PSN',
      ground: 'GRD',
      flying: 'FLY',
      psychic: 'PSY',
      bug: 'BUG',
      rock: 'ROC',
      ghost: 'GHO',
      dragon: 'DRG',
      dark: 'DRK',
      steel: 'STL',
      fairy: 'FRY',
      normal: 'NRM'
    };
    return map[type] || 'NRM';
  };

  const handleMove = (index) => {
    const move = me.moves[index];
    onMove({ room, side, type: 'move', index, move });
  };

  const handleSwitch = (index) => {
    onMove({ room, side, type: 'switch', index });
  };

  return (
    <div className="battle">
      {(snapshot.weather || snapshot.terrain) && (
        <div className="weather-chip">
          {snapshot.weather && `Weather: ${snapshot.weather}`} {snapshot.terrain && `Terrain: ${snapshot.terrain}`}
        </div>
      )}
      <div className="stage">
        <div className="mon-card">
          <div className="name">{opp.name}</div>
          <div className="hp">
            <div className="bar" style={{ width: `${(opp.hp / opp.maxHp) * 100}%` }} />
          </div>
          <div className="chips">
            {opp.types.map((t) => <span key={t} className="type-chip">{t}</span>)}
            {opp.status && <span className="status">{opp.status}</span>}
            {opp.item && <span className="item">{opp.item}</span>}
          </div>
        </div>
        <div className="mon-card">
          <div className="name">{me.name}</div>
          <div className="hp">
            <div className="bar" style={{ width: `${(me.hp / me.maxHp) * 100}%` }} />
          </div>
          <div className="chips">
            {me.types.map((t) => <span key={t} className="type-chip">{t}</span>)}
            {me.status && <span className="status">{me.status}</span>}
            {me.item && <span className="item">{me.item}</span>}
          </div>
        </div>
      </div>

      <div className="controls">
        <div className="moves">
          {me.moves.map((m, i) => {
            const eff = typeEffectiveness(m.type, opp.types);
            const locked = mySide.choiceLock && mySide.choiceLock !== m.name;
            const tags = [];
            if (m.meta?.ailment?.name && m.meta.ailment.name !== 'none') tags.push(`Ailment: ${m.meta.ailment.name}`);
            if (m.meta?.ailment_chance) tags.push(`Ailment%: ${m.meta.ailment_chance}`);
            if (m.meta?.flinch_chance) tags.push(`Flinch%: ${m.meta.flinch_chance}`);
            if (m.meta?.drain) tags.push(`Drain: ${m.meta.drain}%`);
            if (m.meta?.recoil) tags.push(`Recoil: ${m.meta.recoil}%`);
            if (m.meta?.min_hits && m.meta?.max_hits) tags.push(`Hits: ${m.meta.min_hits}-${m.meta.max_hits}`);
            if (m.meta?.healing) tags.push(`Heal: ${m.meta.healing}%`);
            if (m.flags?.includes('sound')) tags.push('Sound');
            if (m.flags?.includes('contact')) tags.push('Contact');
            return (
              <div
                key={m.name + i}
                className="move-card"
                onTouchStart={() => {
                  pressTimerRef.current = setTimeout(() => setSelectedMove(m), 500);
                }}
                onTouchEnd={() => {
                  if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
                }}
                onTouchMove={() => {
                  if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
                }}
              >
                <button
                  disabled={m.currentPP <= 0 || locked}
                  onClick={() => handleMove(i)}
                  onMouseEnter={() => setHoveredMove(m)}
                  onMouseLeave={() => setHoveredMove(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedMove(m);
                  }}
                >
                  <div className="move-name">{m.name}</div>
                  <div className="move-meta">PP {m.currentPP}/{m.pp} | Acc {m.accuracy} | Prio {m.priority}</div>
                  <div className="move-meta">Type {typeIcon(m.type)} {m.type}</div>
                  {tags.length > 0 && <div className="move-meta">{tags.join(' • ')}</div>}
                  <div className={`eff eff-${eff}`}>{eff === 2 ? 'Super' : eff === 0.5 ? 'Resist' : eff === 0 ? 'No effect' : 'Neutral'}</div>
                  {mySide.choiceLock && <div className="lock">Choice lock: {mySide.choiceLock}</div>}
                </button>
                <button
                  type="button"
                  className="info-btn"
                  onClick={() => setSelectedMove(m)}
                >
                  Info
                </button>
              </div>
            );
          })}
        </div>
        <div className={`effects-panel ${compactPanel ? 'compact' : ''}`}>
          <div className="panel-title">
            <span>Move Effects</span>
            <button className="compact-toggle" onClick={() => setCompactPanel((v) => !v)}>
              {compactPanel ? 'Expand' : 'Compact'}
            </button>
          </div>
          {hoveredMove ? (
            <div className="panel-body">
              <div className="tag-row">
                <span className="tag type">Type: {hoveredMove.type}</span>
                <span className="tag meta">Acc: {hoveredMove.accuracy}</span>
                <span className="tag meta">Prio: {hoveredMove.priority}</span>
              </div>
              {hoveredMove.meta?.ailment?.name && hoveredMove.meta.ailment.name !== 'none' && (
                <span className="tag ailment">Ailment: {hoveredMove.meta.ailment.name}</span>
              )}
              {hoveredMove.meta?.ailment_chance && <span className="tag ailment">Ailment%: {hoveredMove.meta.ailment_chance}</span>}
              {hoveredMove.meta?.flinch_chance && <span className="tag flinch">Flinch%: {hoveredMove.meta.flinch_chance}</span>}
              {hoveredMove.meta?.drain && <span className="tag drain">Drain: {hoveredMove.meta.drain}%</span>}
              {hoveredMove.meta?.recoil && <span className="tag recoil">Recoil: {hoveredMove.meta.recoil}%</span>}
              {hoveredMove.meta?.healing && <span className="tag heal">Heal: {hoveredMove.meta.healing}%</span>}
              {hoveredMove.meta?.min_hits && hoveredMove.meta?.max_hits && (
                <span className="tag hits">Hits: {hoveredMove.meta.min_hits}-{hoveredMove.meta.max_hits}</span>
              )}
              {hoveredMove.flags?.includes('sound') && <span className="tag sound">Sound</span>}
              {hoveredMove.flags?.includes('contact') && <span className="tag contact">Contact</span>}
              {Array.isArray(hoveredMove.stat_changes) && hoveredMove.stat_changes.length > 0 && (
                <span className="tag stat">Stat: {hoveredMove.stat_changes.map((c) => `${c.stat.name}:${c.change}`).join(', ')}</span>
              )}
            </div>
          ) : (
            <div className="panel-empty">Hover a move to see effects.</div>
          )}
          <div className="panel-hint">Tip: Right-click a move for a detail drawer (touch users: long-press).</div>
        </div>
        <div className="switches">
          {mySide.team.map((p, i) => (
            <button key={p.name + i} disabled={p.fainted || i === mySide.active} onClick={() => handleSwitch(i)}>
              {p.name} {p.fainted ? '(FNT)' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="battle-footer">
        <div>Turn {snapshot.turn}</div>
        <div>Timer {timer}s</div>
        <div className="actions">
          <button onClick={() => onForfeit({ room, side })}>Forfeit</button>
          <button onClick={() => onRematch({ room })}>Rematch</button>
          <button onClick={requestState}>Refresh</button>
        </div>
      </div>

      <div className="log">
        {events.slice(-10).map((e, idx) => (
          <div key={`${e.type}-${idx}`}>{formatEvent(e)}</div>
        ))}
      </div>

      {battleEnd && (
        <div className="overlay">
          <div className="card">
            <h3>Battle Ended</h3>
            <p>Winner: {battleEnd.winner}</p>
            <p>Replay ID: {battleEnd.replayId}</p>
          </div>
        </div>
      )}

      {selectedMove && (
        <div className="drawer" onClick={() => setSelectedMove(null)}>
          <div className="drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div className="drawer-title">Move Detail</div>
              <button className="drawer-close" onClick={() => setSelectedMove(null)}>Close</button>
            </div>
            <div className="drawer-body">
              <div className="tag-row">
                <span className="tag type">Type: {selectedMove.type}</span>
                <span className="tag meta">Acc: {selectedMove.accuracy}</span>
                <span className="tag meta">Prio: {selectedMove.priority}</span>
                <span className="tag meta">PP: {selectedMove.currentPP}/{selectedMove.pp}</span>
              </div>
              {selectedMove.meta?.ailment?.name && selectedMove.meta.ailment.name !== 'none' && (
                <span className="tag ailment">Ailment: {selectedMove.meta.ailment.name}</span>
              )}
              {selectedMove.meta?.ailment_chance && <span className="tag ailment">Ailment%: {selectedMove.meta.ailment_chance}</span>}
              {selectedMove.meta?.flinch_chance && <span className="tag flinch">Flinch%: {selectedMove.meta.flinch_chance}</span>}
              {selectedMove.meta?.drain && <span className="tag drain">Drain: {selectedMove.meta.drain}%</span>}
              {selectedMove.meta?.recoil && <span className="tag recoil">Recoil: {selectedMove.meta.recoil}%</span>}
              {selectedMove.meta?.healing && <span className="tag heal">Heal: {selectedMove.meta.healing}%</span>}
              {selectedMove.meta?.min_hits && selectedMove.meta?.max_hits && (
                <span className="tag hits">Hits: {selectedMove.meta.min_hits}-{selectedMove.meta.max_hits}</span>
              )}
              {selectedMove.flags?.includes('sound') && <span className="tag sound">Sound</span>}
              {selectedMove.flags?.includes('contact') && <span className="tag contact">Contact</span>}
              {Array.isArray(selectedMove.stat_changes) && selectedMove.stat_changes.length > 0 && (
                <span className="tag stat">Stat: {selectedMove.stat_changes.map((c) => `${c.stat.name}:${c.change}`).join(', ')}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
