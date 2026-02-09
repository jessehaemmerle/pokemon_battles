import React, { useEffect, useMemo, useRef, useState } from 'react';
import { copyToClipboard } from '../lib/clipboard.js';
import { downloadJson } from '../lib/download.js';
import { useToast } from './ToastProvider.jsx';

const API = 'https://pokeapi.co/api/v2';
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function TeamBuilder({ onStartBot, onStartPvp }) {
  const toast = useToast();
  const [team, setTeam] = useState([]);
  const [input, setInput] = useState('');
  const [legal, setLegal] = useState(null);
  const [modal, setModal] = useState({ open: false, index: null });
  const [moveFilter, setMoveFilter] = useState('');
  const cacheRef = useRef(new Map());

  const cachedFetch = async (url) => {
    if (cacheRef.current.has(url)) return cacheRef.current.get(url);
    const res = await fetch(url);
    const json = await res.json();
    cacheRef.current.set(url, json);
    return json;
  };

  const toMoveNames = (moves) => (moves || []).map((m) => (typeof m === 'string' ? m : m.name));

  const buildEntry = (data, moves = []) => ({
    name: data.name,
    id: data.id,
    sprite: data.sprites?.front_default,
    data,
    moves
  });

  const addPokemon = async () => {
    if (!input.trim()) return;
    if (team.length >= 6) return toast('Team full');
    try {
      const data = await cachedFetch(`${API}/pokemon/${input.toLowerCase()}`);
      const entry = buildEntry(data, []);
      setTeam((prev) => [...prev, entry]);
      setInput('');
    } catch (err) {
      toast('Pokemon not found');
    }
  };

  const removePokemon = (index) => {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  };

  const openMoves = (index) => setModal({ open: true, index });
  const closeMoves = () => setModal({ open: false, index: null });

  const availableMoves = useMemo(() => {
    if (!modal.open) return [];
    const mon = team[modal.index];
    if (!mon?.data?.moves) return [];
    const moves = mon.data.moves.map((m) => m.move.name);
    return moves.filter((m) => m.includes(moveFilter.toLowerCase()));
  }, [modal, moveFilter, team]);

  const toggleMove = (moveName) => {
    setTeam((prev) => {
      const next = [...prev];
      const mon = { ...next[modal.index] };
      const moves = new Set(mon.moves);
      if (moves.has(moveName)) moves.delete(moveName);
      else if (moves.size < 4) moves.add(moveName);
      mon.moves = Array.from(moves);
      next[modal.index] = mon;
      return next;
    });
  };

  const exportTeam = async () => {
    const res = await fetch(`${backendUrl}/teams/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team })
    });
    const json = await res.json();
    await copyToClipboard(json.text || '');
    toast('Copied to clipboard');
  };

  const importTeam = async () => {
    const text = prompt('Paste Showdown-Lite text');
    if (!text) return;
    const res = await fetch(`${backendUrl}/teams/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const json = await res.json();
    const imported = [];
    for (const mon of json.team || []) {
      try {
        const data = await cachedFetch(`${API}/pokemon/${mon.name}`);
        imported.push(buildEntry(data, toMoveNames(mon.moves)));
      } catch (err) {
        // ignore
      }
    }
    setTeam(imported);
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (team.length === 0) return setLegal(null);
      try {
        const res = await fetch(`${backendUrl}/teams/legal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team, generations: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
        });
        const json = await res.json();
        setLegal(json.ok);
      } catch (err) {
        setLegal(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [team]);

  const saveLocal = () => {
    localStorage.setItem('pb_team', JSON.stringify(team));
    toast('Saved');
  };

  const loadLocal = () => {
    const raw = localStorage.getItem('pb_team');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    setTeam(parsed.map((p) => ({
      ...p,
      moves: toMoveNames(p.moves)
    })));
  };

  return (
    <div className="team-builder">
      <div className="row">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pokemon name" />
        <button onClick={addPokemon}>Add</button>
        <button onClick={importTeam}>Import</button>
        <button onClick={exportTeam}>Export</button>
      </div>
      <div className="row">
        <button onClick={saveLocal}>Save</button>
        <button onClick={loadLocal}>Load</button>
        <button onClick={() => downloadJson('team.json', team)}>Download</button>
        <span className={`badge ${legal ? 'ok' : 'bad'}`}>{legal === null ? 'Unknown' : legal ? 'Legal' : 'Illegal'}</span>
      </div>

      <div className="team-grid">
        {team.map((p, i) => (
          <div key={p.name + i} className="team-card">
            <img src={p.sprite} alt={p.name} />
            <div className="name">{p.name}</div>
            <div className="moves">{(p.moves || []).map((m) => (typeof m === 'string' ? m : m.name)).join(', ') || 'No moves'}</div>
            <div className="row">
              <button onClick={() => openMoves(i)}>Moves</button>
              <button onClick={() => removePokemon(i)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <button onClick={() => onStartBot(team, [1, 2, 3, 4, 5, 6, 7, 8, 9])}>Start custom vs Bot</button>
        <button onClick={() => onStartPvp(team, [1, 2, 3, 4, 5, 6, 7, 8, 9])}>Start custom Online</button>
      </div>

      {modal.open && (
        <div className="modal">
          <div className="card">
            <div className="row">
              <input value={moveFilter} onChange={(e) => setMoveFilter(e.target.value)} placeholder="Filter moves" />
              <button onClick={closeMoves}>Close</button>
            </div>
            <div className="moves-list">
              {availableMoves.slice(0, 50).map((m) => (
                <button key={m} onClick={() => toggleMove(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
