import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

export default function RandomBattle({ setBattleRoom, setTeams }) {
  const [generation, setGeneration] = useState('1');

  useEffect(() => {
    const onStart = ({ room, teams }) => {
      setBattleRoom(room);
      setTeams(teams);
    };
    socket.on('battle-start', onStart);
    return () => {
      socket.off('battle-start', onStart);
    };
  }, [setBattleRoom, setTeams]);

  const startOnline = () => {
    socket.emit('join-random', { generation });
  };

  const startBot = () => {
    socket.emit('start-bot-battle', { generation });
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🎮 Kampf starten</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label>Generation:</label>
        <select className="select" value={generation} onChange={(e) => setGeneration(e.target.value)}>
          <option value="1">Gen 1</option>
          <option value="2">Gen 2</option>
          <option value="3">Gen 3</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={startOnline}>🌐 Online-Battle</button>
        <button className="btn secondary" onClick={startBot}>🤖 Bot-Battle</button>
      </div>
    </div>
  );
}
