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
    <div className="mb-6">
      <h2 className="text-xl font-bold">Team Builder</h2>
      <input
        className="border p-2 rounded mr-2"
        type="text"
        value={pokemonId}
        onChange={(e) => setPokemonId(e.target.value)}
        placeholder="Pokémon ID oder Name"
      />
      <button className="bg-green-500 text-white px-4 py-2 rounded" onClick={addPokemon}>
        Hinzufügen
      </button>

      <div className="flex mt-4 space-x-4">
        {team.map((p) => (
          <div key={p.id} className="text-center">
            <img src={p.sprite} alt={p.name} className="w-20 mx-auto" />
            <p>{p.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
