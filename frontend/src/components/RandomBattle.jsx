import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

const ALL_GENS = ['1','2','3','4','5','6','7','8','9'];

export default function RandomBattle({ setBattleRoom, setTeams }) {
  const [gens, setGens] = useState(['1']); // Default Gen 1

  useEffect(() => {
    const onStart = ({ room, teams }) => {
      setBattleRoom(room);
      setTeams(teams);
    };
    socket.on('battle-start', onStart);
    return () => socket.off('battle-start', onStart);
  }, [setBattleRoom, setTeams]);

  const toggleGen = (g) => {
    setGens(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const selectAll = () => setGens([...ALL_GENS]);
  const selectNone = () => setGens([]);

  const startOnline = () => {
    const payload = gens.length ? { generations: gens } : { generations: ALL_GENS };
    socket.emit('join-random', payload);
  };

  const startBot = () => {
    const payload = gens.length ? { generations: gens } : { generations: ALL_GENS };
    socket.emit('start-bot-battle', payload);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🎮 Kampf starten</h2>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn" onClick={selectAll}>Alle 9 wählen</button>
          <button className="btn secondary" onClick={selectNone}>Leeren</button>
        </div>
        <div className="grid grid-3">
          {ALL_GENS.map(g => (
            <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={gens.includes(g)}
                onChange={() => toggleGen(g)}
              />
              Generation {g}
            </label>
          ))}
        </div>
        <div style={{ opacity: 0.7, marginTop: 8 }}>
          Tipp: Lässt du die Auswahl leer, wird automatisch **Multi-Gen Zufall (alle 9)** verwendet.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={startOnline}>🌐 Online-Battle</button>
        <button className="btn secondary" onClick={startBot}>🤖 Bot-Battle</button>
      </div>
    </div>
  );
}
