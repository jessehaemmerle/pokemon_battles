import fetch from 'node-fetch';

//
// ---------- Room State ----------
//
/** rooms Map:
 * roomId -> {
 *   mode: 'pvp' | 'bot',
 *   players: string[], // socket ids (nur 1 nötig für pvp-quick/bot)
 *   teams: { player1: Team, player2: Team },
 *   active: { player1: number, player2: number },
 *   over: boolean,
 *   winner?: 'player1' | 'player2',
 * }
 *
 * Team = Array<Pokemon>
 * Pokemon = {
 *   id, name, sprites, types: string[], stats: {...}, currentHp, moves: Move[],
 * }
 * Move = { name, type, power, category }
 */
const rooms = new Map();

//
// ---------- Vollständiger Typen-Chart (Angriff -> Verteidiger) ----------
// Quelle: an das Standard-Matrixschema angelehnte Werte. 1 wenn nicht aufgeführt.
//
const types = [
  'normal','fire','water','electric','grass','ice',
  'fighting','poison','ground','flying','psychic','bug',
  'rock','ghost','dragon','dark','steel','fairy'
];

const chart = {
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  fire:     { fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2 },
  water:    { fire:2, water:0.5, grass:0.5, ground:2, rock:2, dragon:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, ground:0, flying:2, dragon:0.5 },
  grass:    { fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5 },
  ice:      { fire:0.5, water:0.5, ice:0.5, ground:2, flying:2, dragon:2, grass:2, steel:0.5 },
  fighting: { normal:2, ice:2, rock:2, dark:2, steel:2, poison:0.5, flying:0.5, psychic:0.5, bug:0.5, ghost:0, fairy:0.5 },
  poison:   { grass:2, fairy:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0 },
  ground:   { fire:2, electric:2, poison:2, rock:2, steel:2, grass:0.5, bug:0.5, flying:0 },
  flying:   { grass:2, fighting:2, bug:2, rock:0.5, electric:0.5, steel:0.5 },
  psychic:  { fighting:2, poison:2, psychic:0.5, steel:0.5, dark:0 },
  bug:      { grass:2, psychic:2, dark:2, fighting:0.5, fire:0.5, flying:0.5, ghost:0.5, steel:0.5, fairy:0.5, poison:0.5 },
  rock:     { fire:2, ice:2, flying:2, bug:2, fighting:0.5, ground:0.5, steel:0.5 },
  ghost:    { ghost:2, psychic:2, normal:0, dark:0.5 },
  dragon:   { dragon:2, steel:0.5, fairy:0 },
  dark:     { ghost:2, psychic:2, fighting:0.5, dark:0.5, fairy:0.5 },
  steel:    { rock:2, ice:2, fairy:2, fire:0.5, water:0.5, electric:0.5, steel:0.5 },
  fairy:    { fighting:2, dragon:2, dark:2, fire:0.5, poison:0.5, steel:0.5 }
};

function typeMultiplier(attackType, defenderTypes) {
  return defenderTypes.reduce((acc, t) => acc * (chart[attackType]?.[t] ?? 1), 1);
}

//
// ---------- PokéAPI Helpers ----------
//
const GEN_RANGES = {
  1: [1,151], 2: [152,251], 3: [252,386],
  4: [387,493], 5: [494,649], 6: [650,721],
  7: [722,809], 8: [810,898], 9: [899,1010]
};

// Cache, um Rate Limits zu schonen
const pokemonCache = new Map();
const moveCache = new Map();

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${url}`);
  return r.json();
}

async function getPokemonById(id) {
  if (pokemonCache.has(id)) return pokemonCache.get(id);
  const data = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`);
  pokemonCache.set(id, data);
  return data;
}

async function getMoveByNameOrUrl(moveRef) {
  const key = typeof moveRef === 'string' ? moveRef : moveRef.url;
  if (moveCache.has(key)) return moveCache.get(key);
  const data = await fetchJson(typeof moveRef === 'string' ? moveRef : moveRef.url);
  moveCache.set(key, data);
  return data;
}

async function pickRealMoves(pokemonData) {
  // Nimm max. 24 Kandidaten, hole Move-Details (Power, Type, Category), filtere unbrauchbare
  const candidates = (pokemonData.moves || []).slice(0, 24);
  const details = await Promise.all(candidates.map(async (m) => {
    try {
      const mv = await getMoveByNameOrUrl(m.move);
      return {
        name: mv.name,
        power: mv.power,
        type: mv.type?.name,
        category: mv.damage_class?.name // 'physical' | 'special' | 'status'
      };
    } catch {
      return null;
    }
  }));

  let usable = details.filter(mv => mv && mv.power && mv.power > 0 && (mv.category === 'physical' || mv.category === 'special') && mv.type);
  if (usable.length < 4) {
    // erweitere Kandidatenliste (weiter hinten)
    const more = (pokemonData.moves || []).slice(24, 60);
    const moreDetails = await Promise.all(more.map(async (m) => {
      try {
        const mv = await getMoveByNameOrUrl(m.move);
        return {
          name: mv.name,
          power: mv.power,
          type: mv.type?.name,
          category: mv.damage_class?.name
        };
      } catch {
        return null;
      }
    }));
    usable = usable.concat(moreDetails.filter(mv => mv && mv.power && mv.power > 0 && (mv.category === 'physical' || mv.category === 'special') && mv.type));
  }

  // Diversität nach Typ wenn möglich
  const byType = new Map();
  for (const mv of usable) {
    if (!byType.has(mv.type)) byType.set(mv.type, []);
    byType.get(mv.type).push(mv);
  }
  const selected = [];
  for (const [t, list] of byType) {
    selected.push(list[0]);
    if (selected.length >= 4) break;
  }
  // Falls <4, ergänzen
  let i = 0;
  while (selected.length < 4 && i < usable.length) {
    if (!selected.includes(usable[i])) selected.push(usable[i]);
    i++;
  }
  // Falls gar nichts: Notfallmoves
  while (selected.length < 4) selected.push({ name: 'tackle', power: 40, type: 'normal', category: 'physical' });

  return selected.slice(0,4);
}

export async function generateTeam(gen = 1, size = 3) {
  const [start, end] = GEN_RANGES[gen] || GEN_RANGES[1];
  const team = [];
  const chosen = new Set();

  while (team.length < size) {
    const id = Math.floor(Math.random() * (end - start + 1)) + start;
    if (chosen.has(id)) continue;
    chosen.add(id);

    const data = await getPokemonById(id);
    const types = (data.types || []).map(t => t.type.name);
    const stats = Object.fromEntries(data.stats.map(s => [s.stat.name, s.base_stat]));
    const moves = await pickRealMoves(data);

    team.push({
      id: data.id,
      name: data.name,
      sprite: data.sprites.front_default,
      types,
      stats: {
        hp: stats['hp'] ?? 60,
        attack: stats['attack'] ?? 60,
        defense: stats['defense'] ?? 60,
        spAttack: stats['special-attack'] ?? 60,
        spDefense: stats['special-defense'] ?? 60,
        speed: stats['speed'] ?? 60
      },
      currentHp: stats['hp'] ?? 60,
      moves
    });
  }
  return team;
}

//
// ---------- Kampflogik ----------
//

function calcDamage(attacker, defender, move) {
  const level = 50;
  const isPhysical = move.category === 'physical';
  const A = isPhysical ? attacker.stats.attack : attacker.stats.spAttack;
  const D = isPhysical ? defender.stats.defense : defender.stats.spDefense;
  const base = move.power || 40;

  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const eff = typeMultiplier(move.type, defender.types);
  const rand = 0.85 + Math.random() * 0.15;
  const crit = (Math.random() < (1/24)) ? 1.5 : 1;

  const dmg = Math.floor(((((2 * level) / 5 + 2) * base * (A / Math.max(1, D))) / 50 + 2) * stab * eff * rand * crit);
  return { dmg: Math.max(1, dmg), eff, stab, crit: crit > 1 };
}

function aliveMons(team) {
  return team.filter(p => p.currentHp > 0);
}

function autoSwitchIfNeeded(state, sideKey) {
  const team = state.teams[sideKey];
  const activeIdx = state.active[sideKey];
  if (team[activeIdx].currentHp > 0) return null; // nichts zu tun

  // nächsten verfügbaren finden
  for (let i = 0; i < team.length; i++) {
    if (team[i].currentHp > 0) {
      state.active[sideKey] = i;
      return i;
    }
  }
  return null; // kein Switch möglich (Team besiegt)
}

function checkBattleEnd(state) {
  const p1Alive = aliveMons(state.teams.player1).length > 0;
  const p2Alive = aliveMons(state.teams.player2).length > 0;
  if (!p1Alive || !p2Alive) {
    state.over = true;
    state.winner = p1Alive ? 'player1' : 'player2';
    return true;
  }
  return false;
}

//
// ---------- Öffentliche API ----------
//

export function getRoomSnapshot(room) {
  const s = rooms.get(room);
  if (!s) return null;
  // Nur notwendige Ansicht
  return {
    room,
    teams: s.teams,
    active: s.active,
    over: s.over || false,
    winner: s.winner || null
  };
}

export async function startPvpQuickMatch(io, socket, gen = 1) {
  const room = `pvp-${socket.id}-${Math.random().toString(36).slice(2,8)}`;
  const p1 = await generateTeam(gen, 3);
  const p2 = await generateTeam(gen, 3);

  const state = {
    mode: 'pvp',
    players: [socket.id],
    teams: { player1: p1, player2: p2 },
    active: { player1: 0, player2: 0 },
    over: false,
    winner: null
  };
  rooms.set(room, state);

  socket.join(room);
  io.to(room).emit('battle-start', { room, teams: state.teams, active: state.active });
}

export async function startBotBattle(io, socket, gen = 1) {
  const room = `bot-${socket.id}`;
  const p1 = await generateTeam(gen, 3);
  const p2 = await generateTeam(gen, 3);

  const state = {
    mode: 'bot',
    players: [socket.id],
    teams: { player1: p1, player2: p2 },
    active: { player1: 0, player2: 0 },
    over: false,
    winner: null
  };
  rooms.set(room, state);

  socket.join(room);
  io.to(room).emit('battle-start', { room, teams: state.teams, active: state.active });
}

export async function handlePlayerMove(io, socket, payload) {
  // payload: { room, side?: 'player1' | 'player2', moveIndex: number }
  const { room, side = 'player1', moveIndex } = payload || {};
  const state = rooms.get(room);
  if (!state || state.over) return;

  const atkSide = side;
  const defSide = side === 'player1' ? 'player2' : 'player1';

  const atk = state.teams[atkSide][state.active[atkSide]];
  const def = state.teams[defSide][state.active[defSide]];
  const move = atk.moves?.[moveIndex];

  if (!atk || !def || !move) {
    io.to(room).emit('error-message', 'Ungültiger Zug.');
    return;
  }
  if (atk.currentHp <= 0) {
    io.to(room).emit('error-message', `${atk.name} ist kampfunfähig.`);
    return;
  }

  // Zug ausführen
  const result = calcDamage(atk, def, move);
  def.currentHp = Math.max(0, def.currentHp - result.dmg);

  io.to(room).emit('move-made', {
    side: atkSide,
    move: move.name,
    damage: result.dmg,
    target: defSide,
    effectiveness: result.eff,
    crit: result.crit,
    stab: result.stab
  });

  // KO-Prüfung & Autoswitch/Ende
  if (def.currentHp === 0) {
    io.to(room).emit('pokemon-fainted', { fainted: def.name, target: defSide });

    // automatisch wechseln oder Kampfende
    const switchedTo = autoSwitchIfNeeded(state, defSide);
    if (switchedTo !== null) {
      io.to(room).emit('switch-ok', { side: defSide, toIndex: switchedTo });
    } else {
      // Kampf vorbei
      if (checkBattleEnd(state)) {
        io.to(room).emit('battle-end', { winner: state.winner });
        return;
      }
    }
  }

  // Bei Bot-Modus antwortet der Bot sofort (simple KI: Move mit bestem Typ-Multiplikator)
  if (state.mode === 'bot' && defSide === 'player2' && !state.over) {
    const botAtk = state.teams.player2[state.active.player2];
    const botDef = state.teams.player1[state.active.player1];
    if (botAtk?.currentHp > 0 && botDef?.currentHp > 0) {
      // wähle besten Move (größter eff * power)
      let bestIdx = 0;
      let bestScore = -Infinity;
      botAtk.moves.forEach((m, idx) => {
        const score = (m.power || 40) * typeMultiplier(m.type, botDef.types);
        if (score > bestScore) { bestScore = score; bestIdx = idx; }
      });
      await handlePlayerMove(io, socket, { room, side: 'player2', moveIndex: bestIdx });
    }
  }

  // Snapshot (optional)
  io.to(room).emit('state-update', getRoomSnapshot(room));
}

export async function handlePlayerSwitch(io, socket, payload) {
  // payload: { room, side?: 'player1' | 'player2', toIndex: number }
  const { room, side = 'player1', toIndex } = payload || {};
  const state = rooms.get(room);
  if (!state || state.over) return;

  const team = state.teams[side];
  if (toIndex < 0 || toIndex >= team.length) {
    io.to(room).emit('error-message', 'Ungültiger Wechselindex.');
    return;
  }
  if (team[toIndex].currentHp <= 0) {
    io.to(room).emit('error-message', 'Dieses Pokémon ist kampfunfähig.');
    return;
  }
  if (state.active[side] === toIndex) {
    io.to(room).emit('error-message', 'Dieses Pokémon ist bereits aktiv.');
    return;
  }

  state.active[side] = toIndex;
  io.to(room).emit('switch-ok', { side, toIndex });
  io.to(room).emit('state-update', getRoomSnapshot(room));

  // einfache Bot-Reaktion: kontert nach Wechsel
  if (state.mode === 'bot' && side === 'player1' && !state.over) {
    const botAtk = state.teams.player2[state.active.player2];
    const botDef = state.teams.player1[state.active.player1];
    if (botAtk?.currentHp > 0 && botDef?.currentHp > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      botAtk.moves.forEach((m, idx) => {
        const score = (m.power || 40) * typeMultiplier(m.type, botDef.types);
        if (score > bestScore) { bestScore = score; bestIdx = idx; }
      });
      await handlePlayerMove(io, socket, { room, side: 'player2', moveIndex: bestIdx });
    }
  }
}
