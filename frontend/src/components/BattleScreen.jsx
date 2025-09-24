import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

export default function BattleScreen({ room, teams }) {
  const [battleTeams, setBattleTeams] = useState(teams);
  const [activeIndex, setActiveIndex] = useState(0);
  const [log, setLog] = useState([]);

  useEffect(() => {
    socket.on('move-made', (data) => {
      setBattleTeams((prev) => {
        const updated = JSON.parse(JSON.stringify(prev));
        const targetTeam = data.target === 'player1' ? 'player1' : 'player2';
        updated[targetTeam][0].currentHp -= data.damage;
        if (updated[targetTeam][0].currentHp < 0) updated[targetTeam][0].currentHp = 0;
        return updated;
      });
      setLog((prev) => [...prev, `${data.move} verursachte ${data.damage} Schaden!`]);
    });

    socket.on('pokemon-fainted', ({ fainted }) => {
      setLog((prev) => [...prev, `${fainted} wurde besiegt!`]);
    });
  }, []);

  if (!battleTeams) return <div>Warte auf Gegner...</div>;

  const player = battleTeams.player1[activeIndex];
  const enemy = battleTeams.player2[0];

  const makeMove = (move) => {
    socket.emit('move', { move, targetPlayer: 'player2', activeIndex });
  };

  const switchPokemon = (index) => setActiveIndex(index);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Battle Room: {room}</h2>
      <div className="flex justify-around mb-6">
        <div className="text-center">
          <img src={player.sprite} alt={player.name} className="w-32 mx-auto" />
          <p>{player.name}</p>
          <div className="bg-gray-300 w-40 h-4 mx-auto rounded">
            <div
              className="bg-green-500 h-4 rounded"
              style={{ width: `${(player.currentHp / player.stats.hp) * 100}%` }}
            />
          </div>
          <div className="mt-2">
            {player.moves.map((m, i) => (
              <button
                key={i}
                className="bg-blue-500 text-white px-3 py-1 rounded m-1"
                onClick={() => makeMove(m)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <h4 className="mt-2 font-semibold">Team wechseln:</h4>
          {battleTeams.player1.map((p, i) => (
            <button
              key={i}
              className="bg-gray-500 text-white px-2 py-1 rounded m-1"
              onClick={() => switchPokemon(i)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="text-center">
          <img src={enemy.sprite} alt={enemy.name} className="w-32 mx-auto" />
          <p>{enemy.name}</p>
          <div className="bg-gray-300 w-40 h-4 mx-auto rounded">
            <div
              className="bg-red-500 h-4 rounded"
              style={{ width: `${(enemy.currentHp / enemy.stats.hp) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-3 border rounded h-40 overflow-y-auto">
        <h3 className="font-bold">Battle Log</h3>
        {log.map((entry, i) => (
          <p key={i}>{entry}</p>
        ))}
      </div>
    </div>
  );
}
