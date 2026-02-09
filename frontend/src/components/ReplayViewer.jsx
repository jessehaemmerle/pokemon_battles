import React, { useEffect, useMemo, useState } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function ReplayViewer() {
  const [replayId, setReplayId] = useState('');
  const [replay, setReplay] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const loadReplay = async () => {
    if (!replayId) return;
    const res = await fetch(`${backendUrl}/replays/${replayId}`);
    if (!res.ok) return;
    const json = await res.json();
    setReplay(json);
    setIndex(0);
  };

  useEffect(() => {
    if (!playing || !replay) return;
    const timer = setInterval(() => {
      setIndex((prev) => {
        if (prev >= replay.log.length) return prev;
        return prev + 1;
      });
    }, 800 / speed);
    return () => clearInterval(timer);
  }, [playing, replay, speed]);

  const currentLog = useMemo(() => replay?.log.slice(0, index) || [], [replay, index]);

  const simulated = useMemo(() => {
    if (!replay) return null;
    const clone = JSON.parse(JSON.stringify(replay.teams || {}));
    const state = {
      weather: null,
      terrain: null,
      sides: {
        p1: { team: clone.p1 || [], active: 0 },
        p2: { team: clone.p2 || [], active: 0 }
      }
    };
    const applyDamage = (sideKey, amount) => {
      const mon = state.sides[sideKey].team[state.sides[sideKey].active];
      if (!mon) return;
      mon.hp = Math.max(0, mon.hp - amount);
      if (mon.hp === 0) mon.fainted = true;
    };
    const applyHeal = (sideKey, amount) => {
      const mon = state.sides[sideKey].team[state.sides[sideKey].active];
      if (!mon) return;
      mon.hp = Math.min(mon.maxHp, mon.hp + amount);
    };
    for (const e of currentLog) {
      if (e.type === 'switch-ok') {
        state.sides[e.side].active = e.index;
      }
      if (e.type === 'damage') {
        const target = e.side === 'p1' ? 'p2' : 'p1';
        applyDamage(target, e.amount || 0);
      }
      if (e.type === 'hazard') {
        applyDamage(e.side, e.amount || 0);
      }
      if (e.type === 'item-heal') {
        applyHeal(e.side, e.amount || 0);
      }
      if (e.type === 'status-tick') {
        if (e.amount) applyDamage(e.side, e.amount);
      }
      if (e.type === 'status-applied') {
        const target = e.target === 'opponent' ? (e.side === 'p1' ? 'p2' : 'p1') : e.side;
        const mon = state.sides[target]?.team[state.sides[target]?.active];
        if (mon && e.status && e.status !== 'cured') mon.status = e.status;
        if (mon && e.status === 'cured') mon.status = null;
      }
      if (e.type === 'pokemon-fainted') {
        const mon = state.sides[e.side]?.team[state.sides[e.side]?.active];
        if (mon) mon.fainted = true;
      }
      if (e.type === 'weather-chip') {
        if (e.weather === 'grassy-terrain') state.terrain = 'grassy';
        else if (e.weather === 'electric-terrain') state.terrain = 'electric';
        else state.weather = e.weather;
      }
    }
    return state;
  }, [replay, currentLog]);

  return (
    <div className="replay">
      <div className="row">
        <input value={replayId} onChange={(e) => setReplayId(e.target.value)} placeholder="Replay ID" />
        <button onClick={loadReplay}>Load</button>
      </div>
      {replay && (
        <div className="replay-body">
          <div className="row">
            <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
            <input
              type="range"
              min="0"
              max={replay.log.length}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
          </div>
          <div className="meta">
            <div>Gen: {replay.meta?.genList?.join(', ')}</div>
            <div>Events: {replay.log.length}</div>
            {simulated?.weather && <div>Weather: {simulated.weather}</div>}
            {simulated?.terrain && <div>Terrain: {simulated.terrain}</div>}
          </div>
          <div className="row">
            <div>Team P1: {(replay.teams?.p1 || []).map((m) => m.name).join(', ')}</div>
          </div>
          <div className="row">
            <div>Team P2: {(replay.teams?.p2 || []).map((m) => m.name).join(', ')}</div>
          </div>
          {simulated && (
            <div className="stage">
              <div className="mon-card">
                <div className="name">{simulated.sides.p2.team[simulated.sides.p2.active]?.name}</div>
                <div className="hp">
                  <div className="bar" style={{ width: `${(simulated.sides.p2.team[simulated.sides.p2.active]?.hp / simulated.sides.p2.team[simulated.sides.p2.active]?.maxHp) * 100 || 0}%` }} />
                </div>
              </div>
              <div className="mon-card">
                <div className="name">{simulated.sides.p1.team[simulated.sides.p1.active]?.name}</div>
                <div className="hp">
                  <div className="bar" style={{ width: `${(simulated.sides.p1.team[simulated.sides.p1.active]?.hp / simulated.sides.p1.team[simulated.sides.p1.active]?.maxHp) * 100 || 0}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="log">
            {currentLog.slice(-15).map((e, i) => (
              <div key={i}>{JSON.stringify(e)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
