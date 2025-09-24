import { useState } from 'react';
import RandomBattle from './components/RandomBattle';
import BattleScreen from './components/BattleScreen';
import TeamBuilder from './components/TeamBuilder';

export default function App() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);

  return (
    <div className="container">
      {!battleRoom && (
        <div className="row">
          <div className="card" style={{ flex: 1 }}>
            <RandomBattle setBattleRoom={setBattleRoom} setTeams={setTeams} />
          </div>
          <div className="card" style={{ flex: 1 }}>
            <TeamBuilder />
          </div>
        </div>
      )}

      {battleRoom && (
        <div className="card">
          <BattleScreen room={battleRoom} teams={teams} onExit={() => { setBattleRoom(null); setTeams(null); }} />
        </div>
      )}
    </div>
  );
}
