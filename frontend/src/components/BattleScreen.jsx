import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

export default function BattleScreen({ room }) {
  const [teams, setTeams] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    socket.on('battle-start', ({ teams }) => setTeams(teams));
    socket.on('move-made', (data) => {
      setTeams(prev => {
        const updated = { ...prev };
        const targetTeam = data.target === 'player1' ? 'player1' : 'player2';
        updated[targetTeam][0].currentHp -= data.damage;
        if (updated[targetTeam][0].currentHp < 0) updated[targetTeam][0].currentHp = 0;
        return updated;
      });
    });
    socket.on('pokemon-fainted', ({ fainted }) => alert(`${fainted} ist besiegt!`));
  }, []);

  if (!teams) return <div>Warte auf Gegner...</div>;

  const player = teams.player1[activeIndex];
  const enemy = teams.player2[0];

  const makeMove = (move) => socket.emit('move', { move, targetPlayer: 'player2', activeIndex });
  const switchPokemon = (index) => setActiveIndex(index);

  return (
    <div>
      <h2>Battle Room: {room}</h2>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <div>
          <img src={player.sprite} alt={player.name} />
          <p>{player.name} HP: {player.currentHp}/{player.stats.hp}</p>
          {player.moves.map((m,i) => <button key={i} onClick={() => makeMove(m)}>{m.name}</button>)}
          <h4>Team wechseln:</h4>
          {teams.player1.map((p,i) => <button key={i} onClick={() => switchPokemon(i)}>{p.name}</button>)}
        </div>
        <div>
          <img src={enemy.sprite} alt={enemy.name} />
          <p>{enemy.name} HP: {enemy.currentHp}/{enemy.stats.hp}</p>
        </div>
      </div>
    </div>
  );
}
