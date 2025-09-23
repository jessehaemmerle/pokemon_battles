import { useState } from 'react';
import BattleScreen from './components/BattleScreen';
import TeamBuilder from './components/TeamBuilder';
import RandomBattle from './components/RandomBattle';

export default function App() {
  const [battleRoom, setBattleRoom] = useState(null);

  return (
    <div>
      {!battleRoom && <RandomBattle setBattleRoom={setBattleRoom} />}
      {battleRoom && <BattleScreen room={battleRoom} />}
      <TeamBuilder />
    </div>
  );
}
