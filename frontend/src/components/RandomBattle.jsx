import io from 'socket.io-client';
import { useState } from 'react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

export default function RandomBattle({ setBattleRoom }) {
  const [generation, setGeneration] = useState('1');

  const startRandomBattle = () => {
    socket.emit('join-random', { generation });
    socket.on('battle-start', ({ room }) => setBattleRoom(room));
  };

  return (
    <div>
      <h2>Random Battle</h2>
      <select onChange={(e) => setGeneration(e.target.value)}>
        <option value="1">Generation 1</option>
        <option value="2">Generation 2</option>
        <option value="3">Generation 3</option>
      </select>
      <button onClick={startRandomBattle}>Start Battle</button>
    </div>
  );
}
