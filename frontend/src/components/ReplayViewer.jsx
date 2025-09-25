import { useEffect, useMemo, useRef, useState } from 'react';

function hpFillNode(current, total) {
  const pct = Math.max(0, Math.round((current / total) * 100));
  let cls = ''; if (pct < 50) cls = ' mid'; if (pct < 25) cls = ' low';
  return (
    <div className="hpbar" title={`${current}/${total}`}>
      <div className={`fill${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Kleine Hilfsfunktion für URL-Parameter (?replay=ID)
function getReplayIdFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('replay');
  } catch { return null; }
}

export default function ReplayViewer() {
  const [replayId, setReplayId] = useState(getReplayIdFromUrl() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // { meta, log, teams }
  const [frame, setFrame] = useState(0);  // Index in event-log (+1 == nächster Event)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2 | 4
  const timerRef = useRef(null);
  const logRef = useRef(null);

  // Baseline-Teams (volle HP) aus Replay ableiten
  const base = useMemo(() => {
    if (!data?.teams) return null;
    const deep = (obj) => JSON.parse(JSON.stringify(obj));
    const t = deep(data.teams);
    // Setze Start-HP = Max-HP
    for (const side of ['player1', 'player2']) {
      for (const mon of t[side]) {
        mon.currentHp = mon.stats?.hp ?? mon.currentHp ?? 1;
        mon.status = null;
      }
    }
    return {
      teams: t,
      active: { player1: 0, player2: 0 },
      winner: data?.meta?.winner ?? null
    };
  }, [data]);

  // Zustand nach N Events simulieren
  const sim = useMemo(() => {
    if (!base) return null;
    const s = JSON.parse(JSON.stringify(base));
    const log = data?.log || [];

    const alive = (mon) => (mon?.currentHp ?? 0) > 0;
    const sideFromTarget = (target) => (target === 'player1' || target === 'player2') ? target : null;

    for (let i = 0; i < Math.min(frame, log.length); i++) {
      const ev = log[i];
      switch (ev.type) {
        case 'switch': {
          const side = ev.side;
          if (side && ev.to != null && s.teams?.[side]?.[ev.to]) {
            s.active[side] = ev.to;
          }
          break;
        }
        case 'move': {
          // { side, name, dmg } -> Schaden auf Gegner-Active
          const atk = ev.side;
          const def = atk === 'player1' ? 'player2' : 'player1';
          const defender = s.teams[def][s.active[def]];
          if (defender && alive(defender)) {
            defender.currentHp = Math.max(0, defender.currentHp - (ev.dmg ?? 0));
          }
          break;
        }
        case 'miss':
          // rein kosmetisch – keine Zustandsänderung
          break;

        case 'item-heal': {
          const side = ev.side || ev.target; // je nach Log
          const mon = s.teams[side]?.[s.active[side]];
          const amount = ev.amount ?? ev.heal ?? 0;
          if (mon && alive(mon)) {
            mon.currentHp = Math.min(mon.stats.hp, mon.currentHp + amount);
          }
          break;
        }

        case 'status': {
          const side = sideFromTarget(ev.target);
          if (side) {
            const mon = s.teams[side][s.active[side]];
            if (mon) mon.status = { type: ev.status };
          }
          break;
        }

        case 'status-tick': {
          const side = ev.side || ev.target;
          const mon = s.teams[side]?.[s.active[side]];
          if (mon && alive(mon)) {
            mon.currentHp = Math.max(0, mon.currentHp - (ev.damage ?? 0));
          }
          break;
        }

        case 'weather-chip': {
          const side = ev.side;
          const mon = s.teams[side]?.[s.active[side]];
          if (mon && alive(mon)) {
            mon.currentHp = Math.max(0, mon.currentHp - (ev.damage ?? 0));
          }
          break;
        }

        case 'ko':
          // Bereits durch HP 0 abgebildet
          break;

        case 'end':
          s.winner = ev.winner || s.winner;
          break;

        default:
          // Andere Eventtypen (phase, turn-end, etc.) – Zustand unverändert
          break;
      }
    }
    return s;
  }, [base, data, frame]);

  // Auto-Play
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!playing || !data?.log?.length) return;
    const interval = Math.max(100, 600 / speed);
    timerRef.current = setInterval(() => {
      setFrame(f => {
        const next = f + 1;
        if (next > data.log.length) {
          // Stopp am Ende
          clearInterval(timerRef.current);
          return data.log.length;
        }
        return next;
      });
    }, interval);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, data]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [frame]);

  const loadReplay = async () => {
    setError('');
    if (!replayId) { setError('Bitte Replay-ID eingeben.'); return; }
    try {
      setLoading(true);
      const url = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000') + `/replays/${replayId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Replay nicht gefunden');
      const json = await res.json();
      setData(json);
      setFrame(0);
      setPlaying(false);
      // URL-Param aktualisieren (angenehm zum Teilen)
      const u = new URL(window.location.href);
      u.searchParams.set('replay', replayId);
      window.history.replaceState({}, '', u.toString());
    } catch (e) {
      setError(e.message || 'Fehler beim Laden');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const loaded = !!data && !!base && !!sim;
  const log = data?.log || [];
  const atEnd = frame >= log.length;

  const p1 = loaded ? sim.teams.player1[sim.active.player1] : null;
  const p2 = loaded ? sim.teams.player2[sim.active.player2] : null;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <div className="badge">🎞️ Replay Viewer</div>
        <div className="helper">Gib unten die Replay-ID aus dem Battle-Ende ein (oder nutze ?replay=ID in der URL).</div>
      </div>

      <div className="viewer-controls">
        <input
          className="input"
          placeholder="Replay-ID (z.B. pvp-xyz123-ab12cd)"
          value={replayId}
          onChange={(e)=>setReplayId(e.target.value)}
        />
        <button className="btn" onClick={loadReplay} disabled={loading}>📥 Laden</button>

        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className="btn" onClick={()=>{ setFrame(0); setPlaying(false); }}>⏮️ Start</button>
          <button className="btn" onClick={()=>setPlaying(p=>!p)} disabled={!loaded}>{playing?'⏸ Pause':'▶️ Play'}</button>
          <button className="btn" onClick={()=>setFrame(f=>Math.min(f+1, log.length))} disabled={!loaded}>⏭ Schritt</button>
          <select className="input" value={speed} onChange={(e)=>setSpeed(Number(e.target.value))} style={{ width:120 }}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </div>
      </div>

      {error && <div className="kard" style={{ borderColor:'#ef4444', background:'#fee2e2', color:'#7f1d1d', marginBottom:10 }}>⚠️ {error}</div>}

      {!loaded && !error && (
        <div className="kard" style={{ opacity:.8 }}>
          Noch kein Replay geladen. Trage eine ID ein und klicke <b>Laden</b>.
        </div>
      )}

      {loaded && (
        <>
          {/* Stage */}
          <div className="battle-stage" style={{ marginBottom: 10 }}>
            <div className="stage-layer stage-sky" />
            <div className="stage-layer stage-ground" />
            <div className="platform enemy" />
            <div className="platform player" />

            {/* Info-Boxen */}
            <div className="info-box info-top">
              <div className="info-row">
                <div className="info-name">{p2?.name || '—'}</div>
                <div className="info-lv">Lv{p2 ? Math.max(1, Math.round((p2.stats.speed||50)/10)) : '—'}</div>
              </div>
              <div className="info-row">
                {p2 && hpFillNode(p2.currentHp, p2.stats.hp)}
                <div className="small">{p2?.currentHp ?? 0}/{p2?.stats?.hp ?? 0}</div>
              </div>
            </div>

            <div className="info-box info-bottom">
              <div className="info-row">
                <div className="info-name">{p1?.name || '—'}</div>
                <div className="info-lv">Lv{p1 ? Math.max(1, Math.round((p1.stats.speed||50)/10)) : '—'}</div>
              </div>
              <div className="info-row">
                {p1 && hpFillNode(p1.currentHp, p1.stats.hp)}
                <div className="small">{p1?.currentHp ?? 0}/{p1?.stats?.hp ?? 0}</div>
              </div>
            </div>

            {/* Sprites */}
            {p2 && <img className="sprite enemy" src={p2.sprite} alt={p2.name}/>}
            {p1 && <img className="sprite player" src={p1.sprite} alt={p1.name}/>}
          </div>

          {/* Fortschritt / Meta */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <input
              type="range"
              min={0}
              max={log.length}
              value={frame}
              onChange={(e)=>{ setFrame(Number(e.target.value)); setPlaying(false); }}
              style={{ flex: 1 }}
            />
            <div className="small" style={{ width: 120, textAlign:'right' }}>
              {frame}/{log.length} Events
            </div>
          </div>

          <div className="grid grid-2">
            <div className="kard">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>📊 Meta</div>
              <div className="small">Replay-ID: <b>{replayId}</b></div>
              <div className="small">Winner laut Replay: <b>{sim.winner || data?.meta?.winner || '—'}</b></div>
              <div className="small">Start: {data?.meta?.startedAt ? new Date(data.meta.startedAt).toLocaleString() : '—'}</div>
              <div className="small">Ende: {data?.meta?.endedAt ? new Date(data.meta.endedAt).toLocaleString() : '—'}</div>
              <div className="small">Gens: {(data?.meta?.gens || []).join(', ') || '—'}</div>
              {atEnd && <div className="badge" style={{ marginTop:8 }}>🏁 Ende erreicht</div>}
            </div>
            <div className="kard">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>🧑‍🤝‍🧑 Teams</div>
              <div className="team-sprites" style={{ marginTop: 6 }}>
                {sim.teams.player1.map(p => <img key={`p1-${p.id}`} src={p.sprite} alt={p.name} />)}
              </div>
              <div className="team-sprites" style={{ marginTop: 6 }}>
                {sim.teams.player2.map(p => <img key={`p2-${p.id}`} src={p.sprite} alt={p.name} />)}
              </div>
            </div>
          </div>

          {/* Log-Ansicht – zeigt bis zum aktuellen Frame */}
          <div className="kard" style={{ marginTop: 10 }}>
            <div className="small" style={{ marginBottom: 6, opacity:.7 }}>Replay-Log (bis Event {frame})</div>
            <div className="log" ref={logRef} style={{ height: 200 }}>
              {log.slice(0, frame).map((ev, i) => (
                <div key={i}>
                  <code style={{ fontSize: 12, opacity: .8 }}>{ev.type}</code>
                  {ev.type==='move' && <> — <b>{ev.side}</b> nutzt <b>{ev.name}</b> ({ev.dmg} dmg)</>}
                  {ev.type==='switch' && <> — <b>{ev.side}</b> → Slot {Number(ev.to)+1}</>}
                  {ev.type==='miss' && <> — <b>{ev.side}</b> verfehlt mit <b>{ev.name}</b></>}
                  {ev.type==='status' && <> — <b>{ev.target}</b> erhält <b>{ev.status}</b></>}
                  {ev.type==='status-tick' && <> — <b>{ev.side||ev.target}</b> verliert {ev.damage}</>}
                  {ev.type==='item-heal' && <> — <b>{ev.side||ev.target}</b> heilt {(ev.amount ?? ev.heal) || 0}</>}
                  {ev.type==='weather-chip' && <> — <b>{ev.side}</b> verliert {ev.damage} durch Wetter</>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
