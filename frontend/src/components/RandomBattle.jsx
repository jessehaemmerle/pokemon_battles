import io from 'socket.io-client';
import { useState } from 'react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

export default function RandomBattle({ setBattleRoom, setTeams }) {
  const [generation, setGeneration] = useState('1');

  const startRandomBattle = () => {
    socket.emit('join-random', { generation });
    socket.on('battle-start', ({ room, teams }) => {
      setBattleRoom(room);
      setTeams(teams);
    });
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold">Random Battle</h2>
      <select
        className="border rounded p-2 mr-2"
        onChange={(e) => setGeneration(e.target.value)}
      >
        <option value="1">Generation 1</option>
        <option value="2">Generation 2</option>
        <option value="3">Generation 3</option>
      </select>
      <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={startRandomBattle}>
        Start Battle
      </button>
    </div>
  );
}
