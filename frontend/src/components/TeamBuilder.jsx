const LS_TTL = 1000*60*60*24; // 24h
function cachedFetch(url){
  const key='cache:'+url; const now=Date.now();
  try{ const v = JSON.parse(localStorage.getItem(key)||'null'); if(v && now < v.exp){ return Promise.resolve(v.data); } }catch{}
  return fetch(url).then(r=>{ if(!r.ok) throw new Error(url); return r.json(); }).then(data=>{ try{ localStorage.setItem(key, JSON.stringify({exp:now+LS_TTL,data})) }catch{}; return data; });
}
import { useEffect, useMemo, useState } from 'react';
import { socket } from '../lib/socket';
import { useToast } from './ToastProvider.jsx';
import { copyText } from '../lib/clipboard.js';
import { downloadJSON } from '../lib/download.js';

/**
 * Features:
 * - Showdown-Lite Import/Export/Legality (REST)
 * - Lokale Speicherung/Laden
 * - Moveset-Picker (per Pokémon, bis zu 4 Moves, von PokéAPI)
 * - Start: Mit eigenem Team vs Bot / Online (Socket)
 * - Battle-Start Listener (setzt BattleRoom via Props)
 */

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const toast = useToast();
const [copiedPulse, setCopiedPulse] = useState(false);

function useLocalTeams() {
  const KEY = 'pb_teams';
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  };
  const [saved, setSaved] = useState(load);
  const saveAll = (arr) => { setSaved(arr); localStorage.setItem(KEY, JSON.stringify(arr)); };
  const add = (entry) => saveAll([{ id: crypto.randomUUID(), ...entry }, ...saved]);
  const remove = (id) => saveAll(saved.filter(t => t.id !== id));
  const update = (id, patch) => saveAll(saved.map(t => t.id === id ? { ...t, ...patch } : t));
  return { saved, add, remove, update };
}

export default function TeamBuilder({ setBattleRoom, setTeams }) {
  const [team, setTeam] = useState([]);
  const [pokemonQuery, setPokemonQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [isLegal, setIsLegal] = useState(null);
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [teamName, setTeamName] = useState('Mein Team');
  const { saved, add: saveTeam, remove: deleteTeam } = useLocalTeams();

  // Moveset-Picker Modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(-1);
  const [pickerMoves, setPickerMoves] = useState([]);
  const [pickerFilter, setPickerFilter] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);

  // --- Battle Start Listener (damit TeamBuilder selbst den Kampf starten kann) --- //
  useEffect(() => {
    const onStart = ({ room, teams }) => { setBattleRoom?.(room); setTeams?.(teams); };
    socket.on('battle-start', onStart);
    return () => socket.off('battle-start', onStart);
  }, [setBattleRoom, setTeams]);

  // --- Helpers --- //
  const canAddMore = team.length < 6;
  const empty = team.length === 0;
  const toast = (m) => alert(m);

  async function enrichSlot(slot) {
    const speciesKey = String(slot.species || '').toLowerCase().trim().replace(/\s+/g, '-');
    if (!speciesKey) return null;
    try {
      const r = await cachedFetch(`https://pokeapi.co/api/v2/pokemon/${speciesKey}`);
      if (!r.ok) throw new Error('not ok');
      const p = await r.json();
      return {
        id: p.id,
        name: p.name,
        sprite: p.sprites.front_default,
        species: slot.species?.toLowerCase(),
        item: slot.item || null,
        ability: slot.ability || null,
        moves: Array.isArray(slot.moves) ? slot.moves.slice(0, 4).map(m => (typeof m==='string'? m : (m?.name || ''))) : []
      };
    } catch {
      return {
        id: speciesKey,
        name: slot.species,
        sprite: '',
        species: slot.species?.toLowerCase(),
        item: slot.item || null,
        ability: slot.ability || null,
        moves: Array.isArray(slot.moves) ? slot.moves.slice(0, 4).map(m => (typeof m==='string'? m : (m?.name || ''))) : []
      };
    }
  }

  async function addPokemon() {
    if (!pokemonQuery || !canAddMore) return;
    const key = pokemonQuery.toLowerCase().trim();
    try {
      const res = await cachedFetch(`https://pokeapi.co/api/v2/pokemon/${key}`);
      if (!res.ok) throw new Error('Pokémon nicht gefunden');
      const poke = await res.json();
      setTeam(prev => [
        ...prev,
        { id: poke.id, name: poke.name, sprite: poke.sprites.front_default, species: poke.name, item: null, ability: null, moves: [] }
      ]);
      setPokemonQuery('');
      setIsLegal(null);
    } catch {
      toast('Pokémon nicht gefunden. Versuche ID oder englischen Namen (z. B. pikachu).');
    }
  }

  function removeAt(idx) {
    setTeam(prev => prev.filter((_, i) => i !== idx));
    setIsLegal(null);
  }

  // --- Backend Calls --- //
  async function parseShowdownLite(text) {
    const res = await fetch(`${API}/teams/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error || 'Parse fehlgeschlagen');
    }
    const data = await res.json();
    return data?.team || [];
  }

  async function exportShowdownLite(currentTeam) {
    const res = await fetch(`${API}/teams/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: currentTeam })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error || 'Export fehlgeschlagen');
    }
    const data = await res.json();
    return data?.text || '';
  }

  async function checkTeamLegal(currentTeam) {
    setChecking(true);
    try {
      const res = await fetch(`${API}/teams/legal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: currentTeam, generations: [1,2,3,4,5,6,7,8,9] })
      });
      const data = await res.json();
      setIsLegal(!!data?.ok);
    } catch {
      setIsLegal(false);
    } finally {
      setChecking(false);
    }
  }

  // --- Import / Export Aktionen --- //
  async function doImport() {
    if (!importText.trim()) return;
    try {
      const slots = await parseShowdownLite(importText.trim());
      const enriched = [];
      for (const s of slots.slice(0, 6)) {
        const e = await enrichSlot(s);
        if (e) enriched.push(e);
      }
      setTeam(enriched);
      setIsLegal(null);
      toast(`Team importiert (${enriched.length} Pokémon).`);
    } catch (e) {
      toast(`Import fehlgeschlagen: ${e.message}`);
    }
  }

  async function doExport() {
    if (team.length === 0) {
      setExportText('');
      return;
    }
    try {
      const minimal = team.map(t => ({
        species: (t.species || t.name || 'pokemon').toLowerCase(),
        item: t.item || null,
        ability: t.ability || null,
        moves: (t.moves || []).map(m => (typeof m === 'string' ? { name: m } : m))
      }));
      const txt = await exportShowdownLite(minimal);
      setExportText(txt);
      navigator.clipboard?.writeText(txt).catch(()=>{});
    } catch (e) {
      toast(`Export fehlgeschlagen: ${e.message}`);
    }
  }

  useEffect(() => { setExportText(''); }, [team]);

  // --- Local Storage --- //
  const saveCurrent = () => {
    if (team.length === 0) return toast('Leeres Team kann nicht gespeichert werden.');
    if (!teamName.trim()) return toast('Bitte einen Team-Namen eingeben.');
    saveTeam({ name: teamName.trim(), team });
    toast('Team gespeichert.');
  };

  const loadSaved = (entry) => {
    setTeam(entry.team || []);
    setTeamName(entry.name || 'Mein Team');
    setIsLegal(null);
    toast('Team geladen.');
  };

  // --- Legality automatisch ---
  useEffect(() => {
    if (team.length > 0) {
      const t = setTimeout(() => {
        const minimal = team.map(t => ({
          species: (t.species || t.name || 'pokemon').toLowerCase(),
          item: t.item || null,
          ability: t.ability || null,
          moves: (t.moves || []).map(m => (typeof m === 'string' ? { name: m } : m))
        }));
        checkTeamLegal(minimal);
      }, 300);
      return () => clearTimeout(t);
    } else {
      setIsLegal(null);
    }
  }, [team]);

  const legalBadge = useMemo(() => {
    if (isLegal === null) return <span className="badge" style={{ background: '#6b7280' }}>⏳ ungeprüft</span>;
    if (isLegal === true) return <span className="badge" style={{ background: '#14532d' }}>✅ legal</span>;
    return <span className="badge" style={{ background: '#7f1d1d' }}>⛔ nicht legal</span>;
  }, [isLegal]);

  // --- Start mit eigenem Team --- //
  const startWithTeam = (mode='bot') => {
    if (team.length === 0) return toast('Bitte erst ein Team bauen.');
    const minimal = team.map(t => ({
      species: (t.species || t.name).toLowerCase(),
      item: t.item || null,
      ability: t.ability || null,
      moves: (t.moves || []).map(m => (typeof m === 'string' ? { name: m } : m))
    }));
    if (mode === 'bot') socket.emit('start-custom-bot', { team: minimal, generations: [1,2,3,4,5,6,7,8,9] });
    if (mode === 'pvp') socket.emit('start-custom-pvp', { team: minimal, generations: [1,2,3,4,5,6,7,8,9] });
  };

  // --- Moveset-Picker ---
  async function openPickerFor(idx) {
    const mon = team[idx];
    if (!mon?.species && !mon?.name) return;
    setPickerOpen(true);
    setPickerIndex(idx);
    setPickerLoading(true);
    try {
      const key = String(mon.species || mon.name).toLowerCase().replace(/\s+/g, '-');
      const r = await cachedFetch(`https://pokeapi.co/api/v2/pokemon/${key}`);
      if (!r.ok) throw new Error('Pokémon nicht gefunden');
      const p = await r.json();
      // moves -> { name } (einfach)
      const list = (p.moves || []).map(m => m.move?.name).filter(Boolean);
      setPickerMoves(list);
    } catch {
      setPickerMoves([]);
    } finally {
      setPickerLoading(false);
    }
  }

  function toggleMoveSelection(name) {
    setTeam(prev => prev.map((m,i) => {
      if (i !== pickerIndex) return m;
      const current = Array.isArray(m.moves) ? [...m.moves] : [];
      const has = current.includes(name);
      if (has) return { ...m, moves: current.filter(x => x !== name) };
      if (current.length >= 4) return m; // max 4
      return { ...m, moves: [...current, name] };
    }));
  }

  function clearMoves() {
    setTeam(prev => prev.map((m,i) => i===pickerIndex ? { ...m, moves: [] } : m));
  }

  const filteredMoves = useMemo(() => {
    const q = pickerFilter.toLowerCase().trim();
    return pickerMoves.filter(n => n.includes(q));
  }, [pickerMoves, pickerFilter]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>👥 Team Builder</h2>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div className="helper">Bis zu 6 Pokémon. Importiere Showdown-Text oder wähle Moves individuell.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {legalBadge}
          <button className="btn ghost" onClick={() => setTeam([])} aria-label="Team leeren">🧹 Leeren</button>
        </div>
      </div>

      {/* Hinzufügen */}
      <div className="selector" style={{ marginBottom: 12 }}>
        <h3>Pokémon hinzufügen</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="ID oder Name (z. B. 25 oder pikachu)"
            value={pokemonQuery}
            onChange={(e) => setPokemonQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPokemon(); }}
            style={{ minWidth: 240 }}
          />
          <button className="btn" onClick={addPokemon} disabled={!pokemonQuery || !canAddMore} aria-label="Pokémon hinzufügen">➕ Hinzufügen</button>
          <div className="helper">Noch {Math.max(0, 6 - team.length)} Plätze frei</div>
        </div>
      </div>

      {/* Zwischenablage */}
      <button
        className={`btn ghost ${copiedPulse ? 'pulse' : ''}`}
        onClick={async () => {
          const json = JSON.stringify(team, null, 2);
          const ok = await copyText(json);
          if (ok) {
            toast.success('Team in die Zwischenablage kopiert.');
            setCopiedPulse(true);
            setTimeout(() => setCopiedPulse(false), 520);
          } else {
            toast.error('Kopieren fehlgeschlagen – bitte manuell kopieren.');
          }
        }}
        aria-label="Team in die Zwischenablage kopieren"
        title="Team kopieren"
      >📋 Team kopieren</button>

      {/* JSON-Download */}
      <button
        className="btn"
        onClick={() => {
          const name = team?.name?.trim() || 'team';
          downloadJSON(`${name}.json`, team);
          toast.success('Team als JSON exportiert.');
        }}
        aria-label="Team als JSON exportieren"
        title="JSON herunterladen"
      >💾 JSON exportieren</button>

      {/* Team Grid */}
      {team.length > 0 ? (
        <div className="grid grid-3" style={{ marginBottom: 14 }}>
          {team.map((p, idx) => (
            <div key={`${p.id}-${idx}`} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {p.sprite
                  ? <img src={p.sprite} alt={p.name} className="sprite" style={{ width: 72 }} />
                  : <div style={{ width: 72, height: 72, background: '#eef2ff', border: '2px solid #c7d2fe', borderRadius: 10, display: 'grid', placeItems: 'center' }}>?</div>
                }
                <div style={{ fontWeight: 800, textTransform: 'capitalize' }}>{p.name || p.species}</div>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {p.item ? <span className="tag" style={{ background: '#eef2ff' }}>Item: {p.item}</span> : <span className="tag" style={{ background: '#f3f4f6' }}>Item: –</span>}{' '}
                {p.ability ? <span className="tag" style={{ background: '#e0e7ff' }}>Ability: {p.ability}</span> : <span className="tag" style={{ background: '#f3f4f6' }}>Ability: –</span>}
              </div>
              {Array.isArray(p.moves) && p.moves.length > 0 && (
                <div className="small" style={{ marginTop: 6 }}>
                  Moves: {p.moves.slice(0, 4).join(', ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => openPickerFor(idx)}>🎯 Moves wählen</button>
                <button className="btn ghost" onClick={() => removeAt(idx)}>🗑️ Entfernen</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.7, marginBottom: 12 }}>Füge Pokémon zu deinem Team hinzu oder importiere unten.</div>
      )}

      {/* Start mit eigenem Team */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn" onClick={() => startWithTeam('bot')} disabled={empty || isLegal===false}>🤖 Mit Team vs Bot</button>
        <button className="btn secondary" onClick={() => startWithTeam('pvp')} disabled={empty || isLegal===false}>🌐 Mit Team Online</button>
        <div className="helper">Hinweis: Für Online/ Bot ist ein legales Team empfohlen.</div>
      </div>

      {/* Import / Export */}
      <div className="selector" style={{ marginBottom: 12 }}>
        <h3>Import / Export (Showdown-Lite)</h3>
        <div className="grid grid-2">
          <div>
            <div className="small" style={{ marginBottom: 6 }}>Import</div>
            <textarea
              className="input"
              rows={8}
              placeholder={`Beispiel:\nPikachu @ light ball\nAbility: static\n- thunderbolt\n- volt switch\n- thunder wave\n- protect`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn" onClick={doImport}>📥 Importieren</button>
            </div>
          </div>
          <div>
            <div className="small" style={{ marginBottom: 6 }}>Export</div>
            <textarea
              className="input"
              rows={8}
              readOnly
              placeholder="Export-Text erscheint hier…"
              value={exportText}
              style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn secondary" onClick={doExport} disabled={empty}>📤 Exportieren</button>
              <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(exportText).catch(()=>{})} disabled={!exportText}>📋 In Zwischenablage</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn ghost"
            onClick={() => {
              const minimal = team.map(t => ({
                species: (t.species || t.name || 'pokemon').toLowerCase(),
                item: t.item || null,
                ability: t.ability || null,
                moves: (t.moves || []).map(m => (typeof m === 'string' ? { name: m } : m))
              }));
              checkTeamLegal(minimal);
            }}
            disabled={checking || empty}
          >
            {checking ? '🔎 Prüfe…' : '🔎 Legalität prüfen'}
          </button>
          <div className="helper">Nutze Import/Export, um Teams zu teilen oder zu archivieren.</div>
        </div>
      </div>

      {/* Lokale Teams */}
      <div className="selector">
        <h3>Teams speichern & laden (lokal)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Team-Name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button className="btn" onClick={saveCurrent} disabled={empty}>💾 Speichern</button>
        </div>

        {saved.length > 0 ? (
          <div style={{ marginTop: 10 }} className="grid grid-3">
            {saved.map(entry => (
              <div key={entry.id} className="card">
                <div style={{ fontWeight: 900 }}>{entry.name}</div>
                <div className="small" style={{ marginTop: 4 }}>{(entry.team || []).length} Pokémon</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(entry.team || []).slice(0, 6).map((m, i) =>
                    m?.sprite
                      ? <img key={i} src={m.sprite} alt={m.name} style={{ width: 36, imageRendering: 'pixelated' }} />
                      : <div key={i} style={{ width: 36, height: 36, background: '#eef2ff', border: '2px solid #c7d2fe', borderRadius: 8 }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={() => loadSaved(entry)}>📂 Laden</button>
                  <button className="btn ghost" onClick={() => deleteTeam(entry.id)}>🗑️ Löschen</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small" style={{ marginTop: 8, opacity: .8 }}>Noch keine gespeicherten Teams.</div>
        )}
      </div>

      {/* Moveset Picker Modal */}
      {pickerOpen && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={() => setPickerOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-header">
              <span>🎯 Moves wählen</span>
            </div>
            <div className="modal-row" style={{ gridTemplateColumns: '1fr' }}>
              <div className="modal-card">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="input"
                    placeholder="Filter (z. B. thunder)"
                    value={pickerFilter}
                    onChange={(e)=>setPickerFilter(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn ghost" onClick={clearMoves}>♻️ Auswahl leeren</button>
                </div>
                {pickerLoading ? (
                  <div className="small">Lade Moves…</div>
                ) : (
                  <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                    {filteredMoves.map(name => {
                      const selected = (team[pickerIndex]?.moves||[]).includes(name);
                      return (
                        <button
                          key={name}
                          className={`btn ${selected ? '' : 'ghost'}`}
                          onClick={()=>toggleMoveSelection(name)}
                          title={name}
                        >
                          {selected ? '✅ ' : ''}{name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setPickerOpen(false)}>Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
