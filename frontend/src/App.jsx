import { useState } from 'react';
import RandomBattle from './components/RandomBattle';
import BattleScreen from './components/BattleScreen';
import TeamBuilder from './components/TeamBuilder';
import ReplayViewer from './components/ReplayViewer';

export default function App() {
  const [battleRoom, setBattleRoom] = useState(null);
  const [teams, setTeams] = useState(null);

  return (
    <div className="container">
      {!battleRoom && (
        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card" style={{ flex: 1 }}>
            <RandomBattle setBattleRoom={setBattleRoom} setTeams={setTeams} />
          </div>
          <div className="card" style={{ flex: 1 }}>
            {/* TeamBuilder kann jetzt den Battle selbst starten, daher Setter übergeben */}
            <TeamBuilder setBattleRoom={setBattleRoom} setTeams={setTeams} />
          </div>
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <ReplayViewer />
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
