import React, { useState } from 'react';

const GEN_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function RandomBattle({ onOnline, onBot }) {
  const [gens, setGens] = useState([1]);

  const toggleGen = (g) => {
    setGens((prev) => {
      if (prev.includes(g)) return prev.filter((x) => x !== g);
      return [...prev, g];
    });
  };

  return (
    <div className="stack">
      <div className="gens">
        {GEN_LIST.map((g) => (
          <label key={g} className={`chip ${gens.includes(g) ? 'active' : ''}`}>
            <input type="checkbox" checked={gens.includes(g)} onChange={() => toggleGen(g)} />
            Gen {g}
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={() => onOnline(gens.length ? gens : [1])}>Online-Battle</button>
        <button onClick={() => onBot(gens.length ? gens : [1])}>Bot-Battle</button>
      </div>
    </div>
  );
}
