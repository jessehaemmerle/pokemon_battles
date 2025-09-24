import { useState } from 'react';
import BattleScreen from './components/BattleScreen';
import TeamBuilder from './components/TeamBuilder';
import RandomBattle from './components/RandomBattle';

export default function App() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);

  return (
    <div className="p-4">
      {!battleRoom && (
        <>
          <RandomBattle setBattleRoom={setBattleRoom} setTeams={setTeams} />
          <TeamBuilder />
        </>
      )}
      {battleRoom && (
        <BattleScreen room={battleRoom} teams={teams} />
      )}
    </div>
  );
}
