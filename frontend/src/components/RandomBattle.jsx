import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

const ALL_GENS = ['1','2','3','4','5','6','7','8','9'];

export default function RandomBattle({ setBattleRoom, setTeams }) {
  const [mode, setMode] = useState('single'); // 'single' | 'multi'
  const [singleGen, setSingleGen] = useState('1');
  const [multiGens, setMultiGens] = useState(['1']);

  useEffect(() => {
    const onStart = ({ room, teams }) => { setBattleRoom(room); setTeams(teams); };
    socket.on('battle-start', onStart);
    return () => socket.off('battle-start', onStart);
  }, [setBattleRoom, setTeams]);

  const toggleGen = (g) => setMultiGens(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  const selectAll = () => setMultiGens([...ALL_GENS]);
  const selectNone = () => setMultiGens([]);

  const payload = () => mode === 'single'
    ? { generation: Number(singleGen) }
    : { generations: (multiGens.length ? multiGens : ALL_GENS) };

  const startOnline = () => socket.emit('join-random', payload());
  const startBot    = () => socket.emit('start-bot-battle', payload());

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <div className="badge">⚔️ Pokémon Battle</div>
        <div className="helper">Wähle den Modus & die Generation(en). Dann Online oder gegen Bot starten.</div>
      </div>

      <div className="selector" style={{ marginBottom: 12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
          <div className="segment">
            <button className={mode==='single' ? 'active' : ''} onClick={()=>setMode('single')}>Single-Gen</button>
            <button className={mode==='multi' ? 'active' : ''}  onClick={()=>setMode('multi')}>Multi-Gen</button>
          </div>
        </div>

        {mode === 'single' ? (
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <div className="helper">Eine Generation:</div>
            <div className="grid grid-5">
              {ALL_GENS.map(g => (
                <button
                  key={g}
                  className={`chip ${singleGen===g ? 'active' : ''}`}
                  onClick={()=>setSingleGen(g)}
                >
                  Gen {g}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', gap:8, marginBottom: 8, flexWrap:'wrap' }}>
              <button className="btn" onClick={selectAll}>Alle 9</button>
              <button className="btn ghost" onClick={selectNone}>Leeren</button>
              <div className="helper">Tipp: Wenn leer, werden automatisch **alle** Generationen genutzt.</div>
            </div>
            <div className="grid grid-5" style={{ marginTop: 6 }}>
              {ALL_GENS.map(g => (
                <button
                  key={g}
                  className={`chip ${multiGens.includes(g) ? 'active' : ''}`}
                  onClick={()=>toggleGen(g)}
                >
                  Gen {g}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display:'flex', gap: 10 }}>
        <button className="btn" onClick={startOnline}>🌐 Online-Battle" aria-label="Online-Battle starten</button>
        <button className="btn secondary" onClick={startBot}>🤖 Bot-Battle" aria-label="Bot-Battle starten</button>
      </div>
    </div>
  );
}
