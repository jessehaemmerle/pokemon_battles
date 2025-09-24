import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000');

const typeColors = {
  fire: "bg-red-500",
  water: "bg-blue-500",
  electric: "bg-yellow-400 text-black",
  grass: "bg-green-500",
  normal: "bg-gray-400",
  psychic: "bg-pink-500",
  ice: "bg-cyan-400",
  fighting: "bg-orange-700",
  dragon: "bg-purple-700",
};

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
      setLog((prev) => [...prev, `✨ ${data.move} verursacht ${data.damage} Schaden!`]);
    });

    socket.on('pokemon-fainted', ({ fainted }) => {
      setLog((prev) => [...prev, `💀 ${fainted} wurde besiegt!`]);
    });
  }, []);

  if (!battleTeams) return <div>Warte auf Gegner...</div>;

  const player = battleTeams.player1[activeIndex];
  const enemy = battleTeams.player2[0];

  const makeMove = (move) => {
    socket.emit('move', { move, targetPlayer: 'player2', activeIndex });
  };

  const switchPokemon = (index) => setActiveIndex(index);

  const renderHealthBar = (current, total) => {
    const percentage = (current / total) * 100;
    let color = "bg-green-500";
    if (percentage < 50) color = "bg-yellow-400";
    if (percentage < 25) color = "bg-red-500";
    return (
      <div className="w-40 h-5 bg-gray-300 rounded overflow-hidden shadow-inner">
        <div className={`${color} h-5 transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-b from-blue-200 to-green-200 p-6 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-extrabold mb-6 text-center">⚔️ Battle Room: {room}</h2>

      <div className="flex justify-around mb-6">
        {/* Spieler */}
        <div className="text-center bg-white rounded-xl p-4 shadow-md w-64">
          <img src={player.sprite} alt={player.name} className="w-32 mx-auto drop-shadow-lg" />
          <p className="font-bold text-lg">{player.name}</p>
          {renderHealthBar(player.currentHp, player.stats.hp)}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {player.moves.map((m, i) => (
              <button
                key={i}
                className={`${typeColors[m.type] || "bg-gray-500"} text-white px-3 py-2 rounded-lg shadow hover:scale-105 transition`}
                onClick={() => makeMove(m)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <h4 className="mt-4 font-semibold">🔄 Pokémon wechseln:</h4>
          <div className="flex flex-wrap gap-2 justify-center">
            {battleTeams.player1.map((p, i) => (
              <button
                key={i}
                className="bg-gray-700 text-white px-2 py-1 rounded shadow hover:bg-gray-900"
                onClick={() => switchPokemon(i)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Gegner */}
        <div className="text-center bg-white rounded-xl p-4 shadow-md w-64">
          <img src={enemy.sprite} alt={enemy.name} className="w-32 mx-auto drop-shadow-lg" />
          <p className="font-bold text-lg">{enemy.name}</p>
          {renderHealthBar(enemy.currentHp, enemy.stats.hp)}
        </div>
      </div>

      {/* Battle Log */}
      <div className="bg-black text-green-400 font-mono p-4 rounded-lg h-40 overflow-y-auto border-2 border-green-500 shadow-inner">
        <h3 className="font-bold mb-2">📜 Battle Log</h3>
        {log.map((entry, i) => (
          <p key={i}>{entry}</p>
        ))}
      </div>
    </div>
  );
}
