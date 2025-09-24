import { useState } from 'react';

export default function TeamBuilder() {
  const [team, setTeam] = useState([]);
  const [pokemonId, setPokemonId] = useState('');

  const addPokemon = async () => {
    if (!pokemonId) return;
    const res = await fetch(
      `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/pokemon/${pokemonId}`
    );
    const poke = await res.json();
    setTeam([...team, { id: poke.id, name: poke.name, sprite: poke.sprites.front_default }]);
    setPokemonId('');
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
      <h2 className="text-xl font-bold mb-4">👥 Team Builder</h2>
      <div className="flex gap-2 mb-4">
        <input
          className="border p-2 rounded flex-grow"
          type="text"
          value={pokemonId}
          onChange={(e) => setPokemonId(e.target.value)}
          placeholder="Pokémon ID oder Name"
        />
        <button
          className="bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-600"
          onClick={addPokemon}
        >
          ➕ Hinzufügen
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {team.map((p) => (
          <div
            key={p.id}
            className="bg-gray-100 p-3 rounded-lg text-center shadow hover:scale-105 transition"
          >
            <img src={p.sprite} alt={p.name} className="w-20 mx-auto drop-shadow" />
            <p className="font-semibold">{p.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
