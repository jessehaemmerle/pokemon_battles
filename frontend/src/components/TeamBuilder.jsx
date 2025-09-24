import { useState } from 'react';

export default function TeamBuilder() {
  const [team, setTeam] = useState([]);
  const [pokemonId, setPokemonId] = useState('');

  const addPokemon = async () => {
    if (!pokemonId) return;
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId.toLowerCase()}`);
      if (!res.ok) throw new Error('Pokémon nicht gefunden');
      const poke = await res.json();
      setTeam(prev => [
        ...prev,
        { id: poke.id, name: poke.name, sprite: poke.sprites.front_default }
      ]);
      setPokemonId('');
    } catch {
      alert('Pokémon nicht gefunden. Versuche ID oder englischen Namen (z.B. pikachu).');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>👥 Team Builder</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="ID oder Name (z.B. 25 oder pikachu)"
          value={pokemonId}
          onChange={(e) => setPokemonId(e.target.value)}
        />
        <button className="btn" onClick={addPokemon}>➕ Hinzufügen</button>
      </div>

      {team.length > 0 && (
        <div className="grid grid-3">
          {team.map(p => (
            <div key={p.id} className="kard">
              <img src={p.sprite} alt={p.name} className="sprite" style={{ width: 96 }} />
              <div style={{ fontWeight: 600, marginTop: 6 }}>{p.name}</div>
            </div>
          ))}
        </div>
      )}
      {team.length === 0 && <div style={{ opacity: 0.7 }}>Füge Pokémon zu deinem Team hinzu.</div>}
    </div>
  );
}
