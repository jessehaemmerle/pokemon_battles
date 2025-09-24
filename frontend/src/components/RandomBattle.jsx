import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

const ALL_GENS = ['1','2','3','4','5','6','7','8','9'];

export default function RandomBattle({ setBattleRoom, setTeams }) {
  const [mode, setMode] = useState('single'); // 'single' | 'multi'
  const [singleGen, setSingleGen] = useState('1');
  const [multiGens, setMultiGens] = useState(['1']);

  useEffect(() => {
    const onStart = ({ room, teams }) => {
      setBattleRoom(room);
      setTeams(teams);
    };
    socket.on('battle-start', onStart);
    return () => socket.off('battle-start', onStart);
  }, [setBattleRoom, setTeams]);

  const toggleGen = (g) => {
    setMultiGens(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const selectAll = () => setMultiGens([...ALL_GENS]);
  const selectNone = () => setMultiGens([]);

  const payload = () => {
    if (mode === 'single') return { generation: Number(singleGen) };
    const gens = multiGens.length ? multiGens : ALL_GENS;
    return { generations: gens };
    // Server unterstützt beide Varianten
  };

  const startOnline = () => socket.emit('join-random', payload());
  const startBot = () => socket.emit('start-bot-battle', payload());

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🎮 Kampf starten</h2>

      {/* Mode Switch */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 12 }}>
          <label>
            <input
              type="radio"
              name="mode"
              value="single"
              checked={mode === 'single'}
              onChange={() => setMode('single')}
            />{' '}
            Single-Generation
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="multi"
              checked={mode === 'multi'}
              onChange={() => setMode('multi')}
            />{' '}
            Multi-Generationen
          </label>
        </div>

        {mode === 'single' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div>Generation:</div>
            <select className="btn" value={singleGen} onChange={(e) => setSingleGen(e.target.value)}>
              {ALL_GENS.map(g => <option key={g} value={g}>Gen {g}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn" onClick={selectAll}>Alle 9 wählen</button>
              <button className="btn secondary" onClick={selectNone}>Leeren</button>
            </div>
            <div className="grid grid-3">
              {ALL_GENS.map(g => (
                <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={multiGens.includes(g)}
                    onChange={() => toggleGen(g)}
                  />
                  Generation {g}
                </label>
              ))}
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              Hinweis: Wenn du keine Generation auswählst, wird automatisch **alle 9** verwendet.
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={startOnline}>🌐 Online-Battle</button>
        <button className="btn secondary" onClick={startBot}>🤖 Bot-Battle</button>
      </div>
    </div>
  );
}
