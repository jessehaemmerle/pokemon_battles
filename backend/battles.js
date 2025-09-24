import fetch from 'node-fetch';

let waitingPlayer = null;

const typeEffectiveness = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, ground: 2, rock: 2, flying: 0.5, bug: 0.5, poison: 0.5, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 }
};

function calculateDamage(attacker, defender, move) {
  const level = 50;
  const attackStat = move.category === 'physical' ? attacker.stats.attack : attacker.stats.specialAttack;
  const defenseStat = move.category === 'physical' ? defender.stats.defense : defender.stats.specialDefense;
  const base = move.power;

  let modifier = 1;
  move.types.forEach(type => {
    modifier *= typeEffectiveness[type]?.[defender.types[0]] ?? 1;
  });

  const damage = Math.floor((((2 * level / 5 + 2) * base * (attackStat / defenseStat)) / 50 + 2) * modifier);
  return Math.max(1, damage);
}

function applyStatus(pokemon) {
  if (!pokemon.status) return 0;
  let damage = 0;
  switch (pokemon.status) {
    case 'burn': damage = Math.floor(pokemon.stats.hp / 16); break;
    case 'poison': damage = Math.floor(pokemon.stats.hp / 8); break;
    case 'paralyze': if (Math.random() < 0.25) return 'paralyzed'; break;
    case 'sleep': return 'sleep';
  }
  pokemon.currentHp -= damage;
  if (pokemon.currentHp < 0) pokemon.currentHp = 0;
  return damage;
}

export async function handleBattle(io, socket) {
  if (waitingPlayer) {
    const room = `${waitingPlayer.id}-${socket.id}`;
    socket.join(room);
    waitingPlayer.join(room);

    const player1Team = await generateRandomTeam(waitingPlayer.generation || 1);
    const player2Team = await generateRandomTeam(socket.generation || 1);

    io.to(room).emit('battle-start', { room, teams: { player1: player1Team, player2: player2Team } });

    socket.on('move', ({ move, targetPlayer, activeIndex }) => {
      const attackerTeam = targetPlayer === 'player1' ? player2Team : player1Team;
      const defenderTeam = targetPlayer === 'player1' ? player1Team : player2Team;
      const attacker = attackerTeam[activeIndex];
      const defender = defenderTeam[0];

      const statusCheck = applyStatus(attacker);
      if (statusCheck === 'sleep' || statusCheck === 'paralyzed') {
        io.to(room).emit('move-made', { move: `${attacker.name} ist handlungsunfähig!`, damage: 0, target: targetPlayer });
        return;
      }

      const damage = calculateDamage(attacker, defender, move);
      defender.currentHp -= damage;
      if (defender.currentHp < 0) defender.currentHp = 0;

      io.to(room).emit('move-made', { move: move.name, damage, target: targetPlayer });

      if (defender.currentHp === 0) {
        io.to(room).emit('pokemon-fainted', { fainted: defender.name, target: targetPlayer });
      }
    });

    waitingPlayer = null;
  } else {
    waitingPlayer = socket;
    socket.emit('waiting', { message: 'Warte auf Gegner...' });
  }
}

async function generateRandomTeam(generation) {
  const team = [];
  const ids = Array.from({ length: 151 }, (_, i) => i + 1);
  for (let i = 0; i < 3; i++) {
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    const poke = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`).then(r => r.json());
    const moves = poke.moves.slice(0, 4).map(m => ({
      name: m.move.name,
      power: 50,
      category: 'physical',
      types: [poke.types[0].type.name]
    }));

    team.push({
      id: poke.id,
      name: poke.name,
      sprite: poke.sprites.front_default,
      types: poke.types.map(t => t.type.name),
      stats: {
        hp: poke.stats.find(s => s.stat.name === 'hp').base_stat,
        attack: poke.stats.find(s => s.stat.name === 'attack').base_stat,
        defense: poke.stats.find(s => s.stat.name === 'defense').base_stat,
        specialAttack: poke.stats.find(s => s.stat.name === 'special-attack').base_stat,
        specialDefense: poke.stats.find(s => s.stat.name === 'special-defense').base_stat,
        speed: poke.stats.find(s => s.stat.name === 'speed').base_stat
      },
      currentHp: poke.stats.find(s => s.stat.name === 'hp').base_stat,
      moves,
      status: null
    });
  }
  return team;
}

export async function startBotBattle(socket, generation = 1) {
  const room = `bot-${socket.id}`;
  socket.join(room);

  const playerTeam = await generateRandomTeam(generation);
  const botTeam = await generateRandomTeam(generation);

  // Sende beide Teams an den Client
  socket.emit('battle-start', { room, teams: { player1: playerTeam, player2: botTeam } });

  // Bot-Moves automatisch ablaufen lassen
  const botInterval = setInterval(() => {
    const activeBotPokemon = botTeam[0];
    const move = activeBotPokemon.moves[Math.floor(Math.random() * activeBotPokemon.moves.length)];
    
    const damage = calculateDamage(activeBotPokemon, playerTeam[0], move);
    playerTeam[0].currentHp -= damage;
    if (playerTeam[0].currentHp < 0) playerTeam[0].currentHp = 0;

    socket.emit('move-made', { move: move.name, damage, target: 'player1' });

    if (playerTeam[0].currentHp <= 0) {
      socket.emit('pokemon-fainted', { fainted: playerTeam[0].name, target: 'player1' });
      clearInterval(botInterval);
    }
  }, 15000); // Bot macht alle 3 Sekunden einen Move
}

