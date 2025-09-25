import { useState } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

/**
 * Einfache Replay-Anzeige:
 * - Eingabe einer Replay-ID
 * - Lädt GET /replays/:id
 * - Zeigt Meta + Ereignisse in einer Liste
 */
export default function ReplayViewer() {
  const [rid, setRid] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    if (!rid.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const r = await fetch(`${API}/replays/${encodeURIComponent(rid.trim())}`);
      if (!r.ok) throw new Error('Replay nicht gefunden');
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (t) => new Date(t).toLocaleString();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🎞️ Replay Viewer</h2>
      <div className="selector" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Replay-ID (z. B. pvp-abc123-xyz789)"
            value={rid}
            onChange={(e) => setRid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{ minWidth: 260 }}
          />
          <button className="btn" onClick={load} disabled={loading}>{loading ? 'Lade…' : '🔍 Anzeigen'}</button>
        </div>
      </div>

      {!data && !error && <div className="small" style={{ opacity: .8 }}>Gib eine Replay-ID ein und klicke „Anzeigen“.</div>}
      {error && <div className="small" style={{ color: '#7f1d1d' }}>Fehler: {error}</div>}

      {data && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span className="badge">🏆 Winner: {data?.meta?.winner || '—'}</span>
            <span className="badge">⏱️ {data?.meta?.startedAt ? fmt(data.meta.startedAt) : '—'} → {data?.meta?.endedAt ? fmt(data.meta.endedAt) : '—'}</span>
            <span className="badge">Gens: {(data?.meta?.gens || []).join(', ') || '—'}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="modal-card">
              <div className="small" style={{ marginBottom: 6 }}>Team Player 1</div>
              <div className="team-sprites">
                {(data?.teams?.player1 || []).map(p => <img key={`p1-${p.id}`} src={p.sprite} alt={p.name} />)}
              </div>
            </div>
            <div className="modal-card">
              <div className="small" style={{ marginBottom: 6 }}>Team Player 2</div>
              <div className="team-sprites">
                {(data?.teams?.player2 || []).map(p => <img key={`p2-${p.id}`} src={p.sprite} alt={p.name} />)}
              </div>
            </div>
          </div>

          <div className="small" style={{ marginTop: 8, opacity: .7 }}>Log</div>
          <div className="log" style={{ height: 220 }}>
            {(data?.log || []).map((ev, i) => (
              <div key={i}>
                {new Date(ev.t).toLocaleTimeString()} — {ev.type}{ev.name ? `: ${ev.name}` : ''}{ev.dmg ? ` (${ev.dmg})` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
