import { useState } from 'react';

export default function TeamBuilder() {
  const [team, setTeam] = useState([]);
  const addPokemon = (id) => setTeam([...team, id]);
  return (
    <div>
      <h2>Team Builder</h2>
      <button onClick={() => addPokemon(1)}>Add Bulbasaur</button>
      <button onClick={() => addPokemon(4)}>Add Charmander</button>
      <p>Team: {team.join(', ')}</p>
    </div>
  );
}
