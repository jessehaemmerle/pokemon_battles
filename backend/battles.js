const { getCache, setCache } = require('./cache');
const { TYPE_CHART, typeEffectiveness } = require('./shared/typeChart');

const POKEAPI = 'https://pokeapi.co/api/v2';
const rooms = new Map();
const replays = new Map();

async function fetchJson(url) {
  const cached = getCache(url);
  if (cached) return cached;
  let fetchFn = global.fetch;
  if (!fetchFn) {
    const mod = await import('node-fetch');
    fetchFn = mod.default;
  }
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  const data = await res.json();
  setCache(url, data);
  return data;
}

const GEN_RANGES = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025]
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function calcStat(base, level, isHp) {
  if (isHp) return Math.floor(((2 * base) * level) / 100) + level + 10;
  return Math.floor(((2 * base) * level) / 100) + 5;
}

function stageMultiplier(stage) {
  const s = clamp(stage, -6, 6);
  if (s >= 0) return (2 + s) / 2;
  return 2 / (2 + Math.abs(s));
}

function accStageMultiplier(stage) {
  const s = clamp(stage, -6, 6);
  if (s >= 0) return (3 + s) / 3;
  return 3 / (3 - s);
}

function applyDamage(target, dmg, log, context) {
  let actual = dmg;
  if (target.item === 'focus-sash' && !target.itemUsed && target.hp === target.maxHp && dmg >= target.hp) {
    target.hp = 1;
    target.itemUsed = true;
    if (log) log.push({ type: 'message', text: `${target.name} hung on with Focus Sash!` });
    return 1;
  }
  target.hp = clamp(target.hp - actual, 0, target.maxHp);
  if (target.hp === 0) target.fainted = true;
  return actual;
}

function getMovePower(move) {
  return move.power || 0;
}

function getTypeEffect(moveType, targetTypes) {
  return typeEffectiveness(moveType, targetTypes);
}

function chooseAbility(abilities) {
  const known = ['intimidate', 'levitate', 'flash-fire', 'overgrow', 'blaze', 'torrent', 'guts'];
  const lower = abilities.map(a => a.ability.name);
  const pick = known.find(k => lower.includes(k));
  return pick || abilities[0]?.ability?.name || 'overgrow';
}

function chooseItem(pokemon) {
  const items = ['leftovers', 'choice-scarf', 'focus-sash', 'life-orb'];
  return pickRandom(items);
}

async function getPokemonById(id) {
  return fetchJson(`${POKEAPI}/pokemon/${id}`);
}

async function getPokemonByName(name) {
  return fetchJson(`${POKEAPI}/pokemon/${name.toLowerCase()}`);
}

async function getMoveByName(name) {
  return fetchJson(`${POKEAPI}/move/${name.toLowerCase()}`);
}

async function pickRealMoves(pokemon) {
  const moves = pokemon.moves.map(m => m.move.name);
  const shuffled = moves.sort(() => 0.5 - Math.random()).slice(0, 10);
  const details = [];
  for (const m of shuffled) {
    try {
      const d = await getMoveByName(m);
      details.push(d);
    } catch (err) {
      // ignore
    }
  }
  const damaging = details.filter(d => d.power && d.damage_class?.name !== 'status');
  const status = details.filter(d => d.damage_class?.name === 'status');
  const picked = [];
  if (damaging.length) {
    damaging.sort((a, b) => b.power - a.power);
    picked.push(...damaging.slice(0, 3));
  }
  if (status.length) picked.push(status[0]);
  while (picked.length < 4 && damaging.length > picked.length) {
    picked.push(damaging[picked.length]);
  }
  return picked.slice(0, 4).map(m => normalizeMove(m));
}

function buildPokemonFromApi(pokemon, moves) {
  const stats = {};
  pokemon.stats.forEach(s => {
    stats[s.stat.name] = s.base_stat;
  });
  const level = 50;
  const maxHp = calcStat(stats.hp, level, true);
  return {
    id: pokemon.id,
    name: pokemon.name,
    types: pokemon.types.map(t => t.type.name),
    stats: {
      hp: maxHp,
      atk: calcStat(stats.attack, level, false),
      def: calcStat(stats.defense, level, false),
      spa: calcStat(stats['special-attack'], level, false),
      spd: calcStat(stats['special-defense'], level, false),
      spe: calcStat(stats.speed, level, false)
    },
    level,
    moves,
    ability: chooseAbility(pokemon.abilities),
    item: chooseItem(pokemon),
    status: null,
    statusTurns: 0,
    hp: maxHp,
    maxHp,
    fainted: false,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    itemUsed: false,
    flashFire: false,
    volatiles: {
      protect: false,
      seeded: false,
      seedSource: null,
      confusion: 0,
      flinch: false,
      substitute: 0,
      taunt: 0,
      encoreMove: null,
      encoreTurns: 0
    },
    lastMove: null
  };
}

function normalizeMove(moveData) {
  return {
    name: moveData.name,
    type: moveData.type?.name || 'normal',
    power: moveData.power || 0,
    accuracy: moveData.accuracy ?? 100,
    pp: moveData.pp || 10,
    currentPP: moveData.pp || 10,
    category: moveData.damage_class?.name || 'physical',
    priority: moveData.priority || 0,
    target: moveData.target?.name || 'selected-pokemon',
    stat_changes: moveData.stat_changes || [],
    meta: moveData.meta || {},
    flags: (moveData.flags || []).map((f) => f.name)
  };
}

function mapAilment(ailment) {
  if (!ailment || ailment === 'none') return null;
  if (['paralysis', 'burn', 'poison', 'sleep', 'freeze', 'toxic'].includes(ailment)) return ailment;
  if (ailment === 'confusion') return 'confusion';
  return null;
}

async function generateRandomTeam(genList) {
  const team = [];
  const gens = genList?.length ? genList : [randInt(1, 9)];
  while (team.length < 6) {
    const gen = pickRandom(gens);
    const range = GEN_RANGES[gen] || GEN_RANGES[1];
    const id = randInt(range[0], range[1]);
    const data = await getPokemonById(id);
    const moves = await pickRealMoves(data);
    const mon = buildPokemonFromApi(data, moves);
    team.push(mon);
  }
  return team;
}

function makeSide(name, team) {
  return {
    name,
    team,
    active: 0,
    hazards: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
    choiceLock: null,
    forfeited: false
  };
}

function currentActive(side) {
  return side.team[side.active];
}

function otherSide(room, sideKey) {
  return sideKey === 'p1' ? room.sides.p2 : room.sides.p1;
}

function getSpeed(mon, side) {
  if (!mon) return 0;
  let speed = mon.stats.spe * stageMultiplier(mon.stages.spe);
  if (mon.status === 'paralysis') speed *= 0.5;
  if (mon.item === 'choice-scarf') speed *= 1.5;
  return speed;
}

function calcDamage(attacker, defender, move, weather, terrain) {
  if (!move || move.power === 0) return 0;
  const level = attacker.level;
  let atkStat = move.category === 'special' ? attacker.stats.spa : attacker.stats.atk;
  const defStat = move.category === 'special' ? defender.stats.spd : defender.stats.def;
  const atkMod = stageMultiplier(attacker.stages[move.category === 'special' ? 'spa' : 'atk']);
  const defMod = stageMultiplier(defender.stages[move.category === 'special' ? 'spd' : 'def']);
  const base = Math.floor((((2 * level) / 5 + 2) * move.power * (atkStat * atkMod) / (defStat * defMod)) / 50) + 2;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  let typeEff = getTypeEffect(move.type, defender.types);
  if (defender.ability === 'levitate' && move.type === 'ground') typeEff = 0;
  if (typeEff === 0) return 0;
  let weatherMod = 1;
  if (weather === 'rain' && move.type === 'water') weatherMod = 1.5;
  if (weather === 'sun' && move.type === 'fire') weatherMod = 1.5;
  if (terrain === 'grassy' && move.type === 'grass') weatherMod *= 1.3;
  if (terrain === 'electric' && move.type === 'electric') weatherMod *= 1.3;
  if (terrain === 'psychic' && move.type === 'psychic') weatherMod *= 1.3;
  if (terrain === 'misty' && move.type === 'fairy') weatherMod *= 1.3;
  if (attacker.ability === 'overgrow' && attacker.hp / attacker.maxHp <= 1 / 3 && move.type === 'grass') weatherMod *= 1.5;
  if (attacker.ability === 'blaze' && attacker.hp / attacker.maxHp <= 1 / 3 && move.type === 'fire') weatherMod *= 1.5;
  if (attacker.ability === 'torrent' && attacker.hp / attacker.maxHp <= 1 / 3 && move.type === 'water') weatherMod *= 1.5;
  if (attacker.ability === 'flash-fire' && attacker.flashFire && move.type === 'fire') weatherMod *= 1.5;
  if (attacker.ability === 'guts' && attacker.status && move.category === 'physical') atkStat *= 1.5;
  if (attacker.status === 'burn' && attacker.ability !== 'guts' && move.category === 'physical') weatherMod *= 0.5;
  const crit = Math.random() < 0.0625 ? 1.5 : 1;
  const rand = 0.85 + Math.random() * 0.15;
  return Math.max(1, Math.floor(base * stab * typeEff * weatherMod * crit * rand));
}

function applyStatus(side, target, status) {
  if (target.status) return false;
  if ((status === 'poison' || status === 'toxic') && target.types.some(t => t === 'poison' || t === 'steel')) return false;
  if (status === 'burn' && target.types.includes('fire')) return false;
  if (status === 'freeze' && target.types.includes('ice')) return false;
  target.status = status;
  if (status === 'sleep') target.statusTurns = randInt(1, 3);
  if (status === 'freeze') target.statusTurns = randInt(1, 3);
  if (status === 'toxic') target.statusTurns = 1;
  return true;
}

function endOfTurn(room, log) {
  for (const key of ['p1', 'p2']) {
    const side = room.sides[key];
    const mon = currentActive(side);
    if (!mon || mon.fainted) continue;
    if (mon.item === 'leftovers') {
      const heal = Math.max(1, Math.floor(mon.maxHp * 0.0625));
      mon.hp = clamp(mon.hp + heal, 0, mon.maxHp);
      log.push({ type: 'item-heal', side: key, amount: heal });
    }
    if (mon.status === 'burn' || mon.status === 'poison') {
      const dmg = Math.max(1, Math.floor(mon.maxHp * 0.0625));
      applyDamage(mon, dmg, log);
      log.push({ type: 'status-tick', side: key, status: mon.status, amount: dmg });
    }
    if (mon.status === 'toxic') {
      const dmg = Math.max(1, Math.floor(mon.maxHp * 0.0625 * mon.statusTurns));
      applyDamage(mon, dmg, log);
      mon.statusTurns += 1;
      log.push({ type: 'status-tick', side: key, status: 'toxic', amount: dmg });
    }
    if (mon.volatiles?.seeded) {
      const dmg = Math.max(1, Math.floor(mon.maxHp * 0.125));
      applyDamage(mon, dmg, log);
      log.push({ type: 'status-tick', side: key, status: 'leech-seed', amount: dmg });
      const sourceKey = mon.volatiles.seedSource;
      const sourceSide = sourceKey ? room.sides[sourceKey] : null;
      const sourceMon = sourceSide ? currentActive(sourceSide) : null;
      if (sourceMon && !sourceMon.fainted) {
        sourceMon.hp = clamp(sourceMon.hp + dmg, 0, sourceMon.maxHp);
        log.push({ type: 'item-heal', side: sourceKey, amount: dmg });
      }
    }
    if (mon.volatiles?.taunt > 0) mon.volatiles.taunt -= 1;
    if (mon.volatiles?.encoreTurns > 0) {
      mon.volatiles.encoreTurns -= 1;
      if (mon.volatiles.encoreTurns <= 0) mon.volatiles.encoreMove = null;
    }
    if (mon.volatiles?.confusion > 0) mon.volatiles.confusion -= 1;
  }
}

function applyHazards(sideKey, side, mon, log) {
  if (!mon || mon.fainted) return;
  if (side.hazards.stealthRock) {
    const eff = getTypeEffect('rock', mon.types);
    const dmg = Math.max(1, Math.floor(mon.maxHp * 0.125 * eff));
    applyDamage(mon, dmg, log);
    log.push({ type: 'hazard', side: sideKey, hazard: 'stealth-rock', amount: dmg });
  }
  if (side.hazards.spikes > 0) {
    const dmg = Math.max(1, Math.floor(mon.maxHp * (0.041 * side.hazards.spikes)));
    applyDamage(mon, dmg, log);
    log.push({ type: 'hazard', side: sideKey, hazard: 'spikes', amount: dmg });
  }
  if (side.hazards.toxicSpikes > 0) {
    if (mon.types.includes('poison')) {
      side.hazards.toxicSpikes = 0;
      log.push({ type: 'message', text: 'Toxic spikes absorbed.' });
    } else {
      const status = side.hazards.toxicSpikes > 1 ? 'toxic' : 'poison';
      if (applyStatus(side, mon, status)) {
        log.push({ type: 'status-applied', side: sideKey, status });
      }
    }
  }
}

function isBattleOver(room) {
  const p1Alive = room.sides.p1.team.some(p => !p.fainted);
  const p2Alive = room.sides.p2.team.some(p => !p.fainted);
  if (!p1Alive || !p2Alive) return true;
  return false;
}

function decideWinner(room) {
  const p1Alive = room.sides.p1.team.some(p => !p.fainted);
  const p2Alive = room.sides.p2.team.some(p => !p.fainted);
  if (p1Alive && !p2Alive) return 'p1';
  if (p2Alive && !p1Alive) return 'p2';
  return null;
}

function getRoomSnapshot(room) {
  return {
    id: room.id,
    turn: room.turn,
    weather: room.weather,
    terrain: room.terrain,
    sides: {
      p1: {
        name: room.sides.p1.name,
        active: room.sides.p1.active,
        team: room.sides.p1.team,
        hazards: room.sides.p1.hazards,
        choiceLock: room.sides.p1.choiceLock
      },
      p2: {
        name: room.sides.p2.name,
        active: room.sides.p2.active,
        team: room.sides.p2.team,
        hazards: room.sides.p2.hazards,
        choiceLock: room.sides.p2.choiceLock
      }
    },
    log: room.log.slice(-40),
    winner: room.winner,
    battleOver: room.battleOver
  };
}

function finalizeReplay(room) {
  const id = `${room.id}-${Date.now()}`;
  const replay = { meta: room.meta, log: room.eventLog, teams: { p1: room.sides.p1.team, p2: room.sides.p2.team } };
  replays.set(id, replay);
  return id;
}

function getReplay(id) {
  return replays.get(id);
}

function createRoom(genList, p1Name, p2Name, team1, team2) {
  const id = `room-${Math.random().toString(36).slice(2, 10)}`;
  const room = {
    id,
    createdAt: Date.now(),
    turn: 1,
    weather: null,
    terrain: null,
    sides: {
      p1: makeSide(p1Name, team1),
      p2: makeSide(p2Name, team2)
    },
    actions: {},
    timer: null,
    winner: null,
    battleOver: false,
    log: [],
    eventLog: [],
    meta: { genList: genList || [1], createdAt: Date.now() }
  };
  rooms.set(id, room);
  return room;
}

function enqueue(room, event) {
  room.eventLog.push(event);
  room.log.push(event);
}

function lockAction(room, side, action) {
  room.actions[side] = action;
}

function autoMove(room, sideKey) {
  const side = room.sides[sideKey];
  const mon = currentActive(side);
  if (!mon || mon.fainted) return { type: 'switch', index: side.team.findIndex(p => !p.fainted) };
  const move = mon.moves.find(m => m.currentPP > 0) || { name: 'struggle', type: 'normal', power: 50, accuracy: 100, pp: 999, currentPP: 999, category: 'physical', priority: 0 };
  return { type: 'move', index: mon.moves.indexOf(move), move };
}

function chooseBotAction(room, sideKey) {
  const side = room.sides[sideKey];
  const mon = currentActive(side);
  if (!mon || mon.fainted) {
    const idx = side.team.findIndex(p => !p.fainted);
    return { type: 'switch', index: idx };
  }
  const opponentSide = otherSide(room, sideKey);
  const opponent = currentActive(opponentSide);
  let best = null;
  for (let i = 0; i < mon.moves.length; i += 1) {
    const move = mon.moves[i];
    if (move.currentPP <= 0) continue;
    if (move.category === 'status') {
      if (move.name === 'protect') {
        if (!best) best = { type: 'move', index: i, move, score: 4 };
        continue;
      }
      if (move.name === 'defog' && (side.hazards?.spikes || side.hazards?.stealthRock || side.hazards?.toxicSpikes || opponentSide.hazards?.spikes || opponentSide.hazards?.stealthRock || opponentSide.hazards?.toxicSpikes)) {
        best = { type: 'move', index: i, move, score: 14 };
        continue;
      }
      if (move.name === 'leech-seed' && !opponent.volatiles?.seeded) {
        best = { type: 'move', index: i, move, score: 12 };
        continue;
      }
      if (move.name === 'stealth-rock' && !opponentSide.hazards?.stealthRock) {
        best = { type: 'move', index: i, move, score: 20 };
        continue;
      }
      if (move.name === 'spikes' && opponentSide.hazards?.spikes < 3) {
        best = { type: 'move', index: i, move, score: 18 };
        continue;
      }
      if (move.name === 'toxic-spikes' && opponentSide.hazards?.toxicSpikes < 2) {
        best = { type: 'move', index: i, move, score: 16 };
        continue;
      }
      if (!best) best = { type: 'move', index: i, move, score: 5 };
      continue;
    }
    const eff = getTypeEffect(move.type, opponent.types);
    const power = getMovePower(move) * eff;
    if (!best || power > best.score) best = { type: 'move', index: i, move, score: power };
  }
  if (best) {
    if (best.move.category === 'status' && opponent.status) {
      const fallback = mon.moves.findIndex(m => m.category !== 'status' && m.currentPP > 0);
      if (fallback >= 0) return { type: 'move', index: fallback, move: mon.moves[fallback] };
    }
    return best;
  }
  return autoMove(room, sideKey);
}

function resolveSwitch(room, sideKey, index, log) {
  const side = room.sides[sideKey];
  if (index < 0 || index >= side.team.length) return false;
  if (side.team[index].fainted) return false;
  side.active = index;
  side.choiceLock = null;
  applyHazards(sideKey, side, currentActive(side), log);
  const mon = currentActive(side);
  if (mon?.ability === 'intimidate') {
    const opp = otherSide(room, sideKey);
    const oppMon = currentActive(opp);
    if (oppMon) {
      oppMon.stages.atk = clamp(oppMon.stages.atk - 1, -6, 6);
      log.push({ type: 'status-applied', side: sideKey, status: 'intimidate' });
    }
  }
  log.push({ type: 'switch-ok', side: sideKey, index });
  return true;
}

function forceRandomSwitch(room, sideKey, log) {
  const side = room.sides[sideKey];
  const candidates = side.team.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.fainted && i !== side.active);
  if (candidates.length === 0) return false;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  side.active = pick.i;
  side.choiceLock = null;
  applyHazards(sideKey, side, currentActive(side), log);
  log.push({ type: 'switch-ok', side: sideKey, index: pick.i });
  return true;
}

function resolveMove(room, sideKey, action, log) {
  const side = room.sides[sideKey];
  const opponentSide = otherSide(room, sideKey);
  const attacker = currentActive(side);
  const defender = currentActive(opponentSide);
  if (!attacker || attacker.fainted) return;
  let move = action.move || attacker.moves[action.index];
  if (!move) return;
  if (attacker.volatiles?.encoreMove) {
    const encoreIndex = attacker.moves.findIndex(m => m.name === attacker.volatiles.encoreMove);
    if (encoreIndex >= 0) move = attacker.moves[encoreIndex];
  }
  if (side.choiceLock && move.name !== side.choiceLock) {
    const lockedIndex = attacker.moves.findIndex(m => m.name === side.choiceLock);
    move = attacker.moves[lockedIndex] || move;
  }
  if (attacker.volatiles?.flinch) {
    attacker.volatiles.flinch = false;
    log.push({ type: 'status-tick', side: sideKey, status: 'flinch' });
    return;
  }
  if (attacker.status === 'sleep') {
    attacker.statusTurns -= 1;
    log.push({ type: 'status-tick', side: sideKey, status: 'sleep' });
    if (attacker.statusTurns <= 0) {
      attacker.status = null;
      log.push({ type: 'status-applied', side: sideKey, status: 'cured' });
    } else {
      return;
    }
  }
  if (attacker.status === 'freeze') {
    if (Math.random() < 0.2) {
      attacker.status = null;
      log.push({ type: 'status-applied', side: sideKey, status: 'cured' });
    } else {
      log.push({ type: 'status-tick', side: sideKey, status: 'freeze' });
      return;
    }
  }
  if (attacker.status === 'paralysis' && Math.random() < 0.25) {
    log.push({ type: 'status-tick', side: sideKey, status: 'paralysis' });
    return;
  }
  if (attacker.volatiles?.confusion > 0) {
    if (Math.random() < 1 / 3) {
      const selfHit = { name: 'confusion', type: 'normal', power: 40, accuracy: 100, category: 'physical', priority: 0 };
      const dmg = calcDamage(attacker, attacker, selfHit, room.weather, room.terrain);
      applyDamage(attacker, dmg, log);
      log.push({ type: 'status-tick', side: sideKey, status: 'confusion', amount: dmg });
      return;
    }
  }
  if (move.currentPP <= 0 && move.name !== 'struggle') {
    log.push({ type: 'message', text: `${attacker.name} has no PP left.` });
    return;
  }
  if (move.name !== 'struggle') move.currentPP -= 1;
  log.push({ type: 'move-made', side: sideKey, move: move.name });
  attacker.lastMove = move.name;
  const accuracy = move.accuracy ?? 100;
  const accMod = accStageMultiplier(attacker.stages.acc) / accStageMultiplier(defender.stages.eva);
  const finalAcc = clamp(accuracy * accMod, 1, 100);
  const hitRoll = Math.random() * 100;
  if (hitRoll > finalAcc) {
    log.push({ type: 'miss', side: sideKey, move: move.name });
    return;
  }
  const targetIsUser = move.target?.includes('user') || move.target?.includes('ally');
  if (room.terrain === 'psychic' && move.priority > 0 && !targetIsUser) {
    log.push({ type: 'message', text: 'Psychic Terrain blocked the priority move.' });
    return;
  }
  if (move.category === 'status') {
    const healMoves = new Set(['recover', 'roost', 'soft-boiled', 'morningsun', 'synthesis', 'moonlight']);
    const fieldMoves = new Set([
      'stealth-rock',
      'spikes',
      'toxic-spikes',
      'rain-dance',
      'sunny-day',
      'sandstorm',
      'hail',
      'grassy-terrain',
      'electric-terrain',
      'psychic-terrain',
      'misty-terrain',
      'defog'
    ]);

    if (attacker.volatiles?.taunt > 0) {
      log.push({ type: 'message', text: `${attacker.name} is taunted!` });
      return;
    }
    const selfMoves = new Set(['protect', 'substitute', 'rest']);
    if (defender.volatiles?.substitute > 0 && !selfMoves.has(move.name) && !healMoves.has(move.name) && !fieldMoves.has(move.name)) {
      log.push({ type: 'message', text: `${defender.name}'s substitute blocked it!` });
      return;
    }
    if (move.name === 'protect') {
      attacker.volatiles.protect = true;
      log.push({ type: 'status-applied', side: sideKey, status: 'protect' });
      return;
    }
    if (move.name === 'stealth-rock') {
      opponentSide.hazards.stealthRock = true;
      log.push({ type: 'message', text: 'Stealth Rock scattered.' });
    }
    if (move.name === 'spikes') {
      opponentSide.hazards.spikes = clamp(opponentSide.hazards.spikes + 1, 0, 3);
      log.push({ type: 'message', text: 'Spikes scattered.' });
    }
    if (move.name === 'toxic-spikes') {
      opponentSide.hazards.toxicSpikes = clamp(opponentSide.hazards.toxicSpikes + 1, 0, 2);
      log.push({ type: 'message', text: 'Toxic spikes scattered.' });
    }
    if (move.name === 'rain-dance') {
      room.weather = 'rain';
      log.push({ type: 'weather-chip', weather: 'rain' });
    }
    if (move.name === 'sunny-day') {
      room.weather = 'sun';
      log.push({ type: 'weather-chip', weather: 'sun' });
    }
    if (move.name === 'sandstorm') {
      room.weather = 'sand';
      log.push({ type: 'weather-chip', weather: 'sand' });
    }
    if (move.name === 'hail') {
      room.weather = 'hail';
      log.push({ type: 'weather-chip', weather: 'hail' });
    }
    if (move.name === 'grassy-terrain') {
      room.terrain = 'grassy';
      log.push({ type: 'weather-chip', weather: 'grassy-terrain' });
    }
    if (move.name === 'electric-terrain') {
      room.terrain = 'electric';
      log.push({ type: 'weather-chip', weather: 'electric-terrain' });
    }
    if (move.name === 'psychic-terrain') {
      room.terrain = 'psychic';
      log.push({ type: 'weather-chip', weather: 'psychic-terrain' });
    }
    if (move.name === 'misty-terrain') {
      room.terrain = 'misty';
      log.push({ type: 'weather-chip', weather: 'misty-terrain' });
    }
    if (move.name === 'defog') {
      opponentSide.hazards = { spikes: 0, stealthRock: false, toxicSpikes: 0 };
      side.hazards = { spikes: 0, stealthRock: false, toxicSpikes: 0 };
      defender.stages.eva = clamp(defender.stages.eva - 1, -6, 6);
      log.push({ type: 'message', text: 'Hazards were cleared by Defog.' });
      return;
    }
    if (move.name === 'roar' || move.name === 'whirlwind') {
      forceRandomSwitch(room, sideKey === 'p1' ? 'p2' : 'p1', log);
      return;
    }
    if (move.name === 'parting-shot') {
      defender.stages.atk = clamp(defender.stages.atk - 1, -6, 6);
      defender.stages.spa = clamp(defender.stages.spa - 1, -6, 6);
      log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'drop' });
      forceRandomSwitch(room, sideKey, log);
      return;
    }
    if (move.name === 'taunt') {
      defender.volatiles.taunt = 3;
      log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'taunt' });
      return;
    }
    if (move.name === 'encore') {
      if (defender.lastMove) {
        defender.volatiles.encoreMove = defender.lastMove;
        defender.volatiles.encoreTurns = 3;
        log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'encore' });
      }
      return;
    }
    if (['confuse-ray', 'supersonic'].includes(move.name)) {
      if (!defender.volatiles.confusion) {
        defender.volatiles.confusion = randInt(1, 4);
        log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'confusion' });
      }
      return;
    }
    if (move.name === 'substitute') {
      const cost = Math.floor(attacker.maxHp * 0.25);
      if (attacker.hp > cost && attacker.volatiles.substitute === 0) {
        attacker.hp -= cost;
        attacker.volatiles.substitute = cost;
        log.push({ type: 'status-applied', side: sideKey, status: 'substitute' });
      }
      return;
    }
    if (move.name === 'leech-seed') {
      if (!defender.volatiles.seeded && !defender.types.includes('grass')) {
        defender.volatiles.seeded = true;
        defender.volatiles.seedSource = sideKey;
        log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'leech-seed' });
      }
      return;
    }
    if (healMoves.has(move.name)) {
      const heal = Math.max(1, Math.floor(attacker.maxHp * 0.5));
      attacker.hp = clamp(attacker.hp + heal, 0, attacker.maxHp);
      log.push({ type: 'item-heal', side: sideKey, amount: heal });
      return;
    }
    if (move.name === 'rest') {
      attacker.hp = attacker.maxHp;
      attacker.status = 'sleep';
      attacker.statusTurns = 2;
      log.push({ type: 'status-applied', side: sideKey, status: 'sleep' });
      return;
    }
    const utilityMoves = [
      'stealth-rock',
      'spikes',
      'toxic-spikes',
      'rain-dance',
      'sunny-day',
      'sandstorm',
      'hail',
      'grassy-terrain',
      'electric-terrain',
      'psychic-terrain',
      'misty-terrain',
      'defog'
    ];
    if (!utilityMoves.includes(move.name)) {
      const ailment = mapAilment(move.meta?.ailment?.name);
      if (ailment) {
        if (ailment === 'confusion') {
          if (!defender.volatiles.confusion) {
            defender.volatiles.confusion = randInt(1, 4);
            log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'confusion' });
          }
        } else if (applyStatus(opponentSide, defender, ailment)) {
          log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: ailment });
        }
      }
      if (Array.isArray(move.stat_changes) && move.stat_changes.length) {
        const targetMon = targetIsUser ? attacker : defender;
        move.stat_changes.forEach((c) => {
          const key = c.stat?.name === 'special-attack' ? 'spa'
            : c.stat?.name === 'special-defense' ? 'spd'
            : c.stat?.name;
          if (key && targetMon.stages[key] !== undefined) {
            targetMon.stages[key] = clamp(targetMon.stages[key] + c.change, -6, 6);
          }
        });
        log.push({ type: 'status-applied', side: sideKey, target: targetIsUser ? 'self' : 'opponent', status: 'stat-change' });
      }
      if (move.meta?.healing) {
        const heal = Math.max(1, Math.floor(attacker.maxHp * (move.meta.healing / 100)));
        attacker.hp = clamp(attacker.hp + heal, 0, attacker.maxHp);
        log.push({ type: 'item-heal', side: sideKey, amount: heal });
      }
    }
    return;
  }
  const soundMove = move.flags?.includes('sound');
  if (defender.volatiles?.substitute > 0 && !soundMove) {
    const subDmg = Math.max(1, Math.floor(calcDamage(attacker, defender, move, room.weather, room.terrain)));
    defender.volatiles.substitute -= subDmg;
    log.push({ type: 'damage', side: sideKey, amount: subDmg, effective: getTypeEffect(move.type, defender.types) });
    if (defender.volatiles.substitute <= 0) {
      defender.volatiles.substitute = 0;
      log.push({ type: 'message', text: 'Substitute broke!' });
    }
    return;
  }
  if (defender.volatiles?.protect) {
    log.push({ type: 'message', text: `${defender.name} protected itself!` });
    return;
  }
  if (defender.ability === 'flash-fire' && move.type === 'fire') {
    defender.flashFire = true;
    log.push({ type: 'message', text: `${defender.name} absorbed the fire!` });
    return;
  }
  if (defender.ability === 'levitate' && move.type === 'ground') {
    log.push({ type: 'message', text: `${defender.name} is immune!` });
    return;
  }
  const flinchMoves = new Set([
    'air-slash',
    'rock-slide',
    'iron-head',
    'bite',
    'headbutt',
    'zen-headbutt',
    'dark-pulse',
    'waterfall',
    'fake-out',
    'extrasensory',
    'rolling-kick',
    'snore',
    'stomp',
    'twister'
  ]);
  const pivotMoves = new Set(['u-turn', 'volt-switch', 'flip-turn']);
  const metaHits = move.meta?.min_hits && move.meta?.max_hits ? randInt(move.meta.min_hits, move.meta.max_hits) : null;
  const hits = metaHits || 1;
  let totalDamage = 0;
  for (let h = 0; h < hits; h += 1) {
    if (defender.fainted) break;
    let dmg = calcDamage(attacker, defender, move, room.weather, room.terrain);
    if (attacker.item === 'life-orb') dmg = Math.floor(dmg * 1.3);
    applyDamage(defender, dmg, log);
    log.push({ type: 'damage', side: sideKey, amount: dmg, effective: getTypeEffect(move.type, defender.types) });
    totalDamage += dmg;
  }
  if (flinchMoves.has(move.name) || (move.meta?.flinch_chance || 0) > 0) {
    const atkSpeed = getSpeed(attacker, side);
    const defSpeed = getSpeed(defender, opponentSide);
    const chance = move.meta?.flinch_chance ? move.meta.flinch_chance / 100 : 0.3;
    if (atkSpeed > defSpeed && Math.random() < chance) {
      defender.volatiles.flinch = true;
      log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'flinch' });
    }
  }
  if (move.name === 'knock-off' && defender.item) {
    defender.item = null;
    log.push({ type: 'message', text: `${defender.name}'s item was knocked off!` });
  }
  if (move.name === 'rapid-spin') {
    side.hazards = { spikes: 0, stealthRock: false, toxicSpikes: 0 };
    attacker.stages.spe = clamp(attacker.stages.spe + 1, -6, 6);
    log.push({ type: 'message', text: 'Hazards were cleared by Rapid Spin.' });
  }
  if ((move.meta?.drain || 0) > 0 && totalDamage > 0) {
    const ratio = move.meta?.drain ? move.meta.drain / 100 : 0.5;
    const heal = Math.max(1, Math.floor(totalDamage * ratio));
    attacker.hp = clamp(attacker.hp + heal, 0, attacker.maxHp);
    log.push({ type: 'item-heal', side: sideKey, amount: heal });
  }
  if ((move.meta?.recoil || 0) > 0 && totalDamage > 0) {
    const ratio = move.meta?.recoil ? move.meta.recoil / 100 : 1 / 3;
    const recoil = Math.max(1, Math.floor(totalDamage * ratio));
    applyDamage(attacker, recoil, log);
    log.push({ type: 'status-tick', side: sideKey, status: 'recoil', amount: recoil });
  }
  if (attacker.item === 'life-orb') {
    const recoil = Math.max(1, Math.floor(attacker.maxHp * 0.1));
    applyDamage(attacker, recoil, log);
    log.push({ type: 'status-tick', side: sideKey, status: 'recoil', amount: recoil });
  }
  if (defender.fainted) {
    log.push({ type: 'pokemon-fainted', side: sideKey === 'p1' ? 'p2' : 'p1' });
  }
  if (move.meta?.ailment) {
    const ailment = mapAilment(move.meta.ailment.name);
    if (ailment && move.meta.ailment_chance && Math.random() * 100 < move.meta.ailment_chance) {
      if (ailment === 'confusion') {
        if (!defender.volatiles.confusion) defender.volatiles.confusion = randInt(1, 4);
      } else {
        applyStatus(opponentSide, defender, ailment);
      }
    }
  }
  if (Array.isArray(move.stat_changes) && move.stat_changes.length && move.target?.includes('opponent')) {
    move.stat_changes.forEach((c) => {
      const key = c.stat?.name === 'special-attack' ? 'spa'
        : c.stat?.name === 'special-defense' ? 'spd'
        : c.stat?.name;
      if (key && defender.stages[key] !== undefined) {
        defender.stages[key] = clamp(defender.stages[key] + c.change, -6, 6);
      }
    });
    log.push({ type: 'status-applied', side: sideKey, target: 'opponent', status: 'stat-change' });
  }
  if (pivotMoves.has(move.name) && !attacker.fainted) {
    forceRandomSwitch(room, sideKey, log);
  }
  if (attacker.item === 'choice-scarf') {
    side.choiceLock = move.name;
  }
}

function resolveTurn(room) {
  const log = [];
  const p1Action = room.actions.p1 || autoMove(room, 'p1');
  const p2Action = room.actions.p2 || autoMove(room, 'p2');

  const p1Mon = currentActive(room.sides.p1);
  const p2Mon = currentActive(room.sides.p2);
  const p1Priority = p1Action.type === 'move' ? (p1Action.move?.priority ?? p1Mon.moves[p1Action.index]?.priority ?? 0) : 0;
  const p2Priority = p2Action.type === 'move' ? (p2Action.move?.priority ?? p2Mon.moves[p2Action.index]?.priority ?? 0) : 0;

  let order = ['p1', 'p2'];
  if (p2Priority > p1Priority) order = ['p2', 'p1'];
  if (p1Priority === p2Priority) {
    const p1Spe = getSpeed(p1Mon, room.sides.p1);
    const p2Spe = getSpeed(p2Mon, room.sides.p2);
    if (p2Spe > p1Spe) order = ['p2', 'p1'];
  }

  for (const sideKey of order) {
    const action = sideKey === 'p1' ? p1Action : p2Action;
    if (action.type === 'switch') {
      resolveSwitch(room, sideKey, action.index, log);
    } else {
      resolveMove(room, sideKey, action, log);
    }
  }

  endOfTurn(room, log);
  if (room.weather === 'sand' || room.weather === 'hail') {
    for (const key of ['p1', 'p2']) {
      const side = room.sides[key];
      const mon = currentActive(side);
      if (!mon || mon.fainted) continue;
      const immune = room.weather === 'sand'
        ? mon.types.includes('rock') || mon.types.includes('ground') || mon.types.includes('steel')
        : mon.types.includes('ice');
      if (!immune) {
        const dmg = Math.max(1, Math.floor(mon.maxHp * 0.0625));
        applyDamage(mon, dmg, log);
        log.push({ type: 'status-tick', side: key, status: room.weather, amount: dmg });
      }
    }
  }
  const p1Mon = currentActive(room.sides.p1);
  const p2Mon = currentActive(room.sides.p2);
  if (p1Mon?.volatiles) p1Mon.volatiles.protect = false;
  if (p2Mon?.volatiles) p2Mon.volatiles.protect = false;
  room.turn += 1;
  room.actions = {};

  log.push({ type: 'turn-end', turn: room.turn });

  for (const e of log) enqueue(room, e);

  if (isBattleOver(room)) {
    room.battleOver = true;
    room.winner = decideWinner(room);
  }

  return log;
}

async function startRandomBattle(genList) {
  const team1 = await generateRandomTeam(genList);
  const team2 = await generateRandomTeam(genList);
  const room = createRoom(genList, 'Player 1', 'Player 2', team1, team2);
  return room;
}

async function startBotBattle(genList) {
  const team1 = await generateRandomTeam(genList);
  const team2 = await generateRandomTeam(genList);
  const room = createRoom(genList, 'Player', 'Bot', team1, team2);
  return room;
}

async function startCustomBotBattle(genList, team) {
  const team2 = await generateRandomTeam(genList);
  const room = createRoom(genList, 'Player', 'Bot', team, team2);
  return room;
}

async function startCustomPvp(genList, team) {
  const team2 = await generateRandomTeam(genList);
  const room = createRoom(genList, 'Player 1', 'Player 2', team, team2);
  return room;
}

async function parseShowdownLite(text) {
  const chunks = text.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
  const team = [];
  for (const chunk of chunks) {
    const [namePart, itemPart, abilityPart, movesPart] = chunk.split('|').map(s => s.trim());
    const data = await getPokemonByName(namePart);
    let moves = [];
    if (movesPart) {
      const moveNames = movesPart.split(',').map(s => s.trim()).filter(Boolean);
      for (const mn of moveNames) {
        try {
          const m = await getMoveByName(mn);
          moves.push(normalizeMove(m));
        } catch (err) {
          // ignore
        }
      }
    }
    if (moves.length === 0) moves = await pickRealMoves(data);
    const mon = buildPokemonFromApi(data, moves);
    mon.item = itemPart || mon.item;
    mon.ability = abilityPart || mon.ability;
    team.push(mon);
  }
  return team.slice(0, 6);
}

function exportShowdownLite(team) {
  return team.map(p => {
    const moves = (p.moves || []).map(m => (typeof m === 'string' ? m : m.name)).join(', ');
    return `${p.name} | ${p.item || ''} | ${p.ability || ''} | ${moves || ''}`.trim();
  }).join('\n\n');
}

async function checkTeamLegality(team, generations) {
  if (!Array.isArray(team) || team.length === 0 || team.length > 6) return false;
  const gens = generations && generations.length ? generations : null;
  for (const mon of team) {
    if (!mon.name) return false;
    const data = await getPokemonByName(mon.name);
    if (gens) {
      const okGen = gens.some((g) => {
        const range = GEN_RANGES[g];
        return range && data.id >= range[0] && data.id <= range[1];
      });
      if (!okGen) return false;
    }
    const moveNames = data.moves.map(m => m.move.name);
    if (mon.moves?.length > 4) return false;
    for (const m of mon.moves || []) {
      const name = typeof m === 'string' ? m : m.name;
      if (!name || !moveNames.includes(name)) return false;
    }
  }
  return true;
}

async function hydrateTeam(team) {
  const hydrated = [];
  for (const mon of team || []) {
    if (mon?.stats && Array.isArray(mon.moves) && mon.moves[0]?.power !== undefined) {
      hydrated.push(mon);
      continue;
    }
    const data = await getPokemonByName(mon.name);
    let moves = [];
    const moveNames = Array.isArray(mon.moves) ? mon.moves : [];
    if (moveNames.length) {
      for (const mn of moveNames) {
        try {
          const m = await getMoveByName(mn);
          moves.push(normalizeMove(m));
        } catch (err) {
          // ignore
        }
      }
    }
    if (moves.length === 0) moves = await pickRealMoves(data);
    const built = buildPokemonFromApi(data, moves);
    built.item = mon.item || built.item;
    built.ability = mon.ability || built.ability;
    hydrated.push(built);
  }
  return hydrated.slice(0, 6);
}

module.exports = {
  rooms,
  replays,
  startRandomBattle,
  startBotBattle,
  startCustomBotBattle,
  startCustomPvp,
  lockAction,
  autoMove,
  resolveTurn,
  getRoomSnapshot,
  finalizeReplay,
  getReplay,
  chooseBotAction,
  parseShowdownLite,
  exportShowdownLite,
  checkTeamLegality,
  hydrateTeam,
  createRoom
};
