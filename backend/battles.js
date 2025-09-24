import fetch from 'node-fetch';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rooms = new Map();

/** ----------------------------
 * Battle State & Helpers
 * -----------------------------
 * Room State:
 * {
 *   mode: 'pvp' | 'bot',
 *   teams: { player1: Pokemon[], player2: Pokemon[] },
 *   active: { player1: number, player2: number },
 *   over: boolean, winner: 'player1'|'player2'|null,
 *   phase: 'select'|'acting',
 *   turnOwner: 'player1'|'player2',
 *   field: {
 *     weather: { type: 'rain'|'sun'|'sand'|'hail'|null, turns: number },
 *     terrain: { type: 'electric'|'grassy'|null, turns: number }
 *   },
 *   sideConditions: {
 *     player1: { stealthRock?:1, spikes?:0-3, toxicSpikes?:0-2 },
 *     player2: { ... }
 *   }
 * }
 *
 * Pokemon:
 * {
 *   id, name, sprite, types: string[],
 *   stats: { hp, attack, defense, spAttack, spDefense, speed },
 *   currentHp: number,
 *   status?: { type:'burn'|'paralysis'|'poison'|'toxic'|'sleep'|'freeze', turnsLeft?:number, toxicCounter?:number },
 *   stages: { atk, def, spa, spd, spe, acc, eva },  // -6..+6
 *   ability?: 'intimidate'|'levitate'|'flash-fire'|'overgrow'|'blaze'|'torrent'|'guts',
 *   abilityState?: { flashFireBoost?: boolean },
 *   item?: 'leftovers'|'choice-scarf'|'focus-sash'|'life-orb',
 *   choiceLock?: string|null, // bei choice-scarf: move name
 *   moves: [{ name, power, type, category, accuracy, priority, ailment, ailmentChance }]
 * }
 */

const TYPE_CHART = {
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

const GEN_RANGES = {
  1: [1,151], 2: [152,251], 3: [252,386],
  4: [387,493], 5: [494,649], 6: [650,721],
  7: [722,809], 8: [810,898], 9: [899,1010]
};

// --- simple caches for PokeAPI ---
const pokemonCache = new Map();
const moveCache = new Map();
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`Fetch ${r.status} ${url}`); return r.json(); }
async function getPokemonById(id){ if (pokemonCache.has(id)) return pokemonCache.get(id); const d = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`); pokemonCache.set(id, d); return d; }
async function getMoveByRef(ref){ const key = typeof ref === 'string' ? ref : ref.url; if (moveCache.has(key)) return moveCache.get(key); const d = await fetchJson(typeof ref === 'string' ? ref : ref.url); moveCache.set(key, d); return d; }

// ---------- math helpers ----------
function typeMultiplier(attackType, defenderTypes) {
  return defenderTypes.reduce((acc, t) => acc * (TYPE_CHART[attackType]?.[t] ?? 1), 1);
}
function normalizeGens(gens) { if (Array.isArray(gens) && gens.length) return gens.map(Number).filter(g=>GEN_RANGES[g]); const n = Number(gens)||1; return GEN_RANGES[n]?[n]:[1]; }
function pickRandomIdFromGens(gens) {
  const ranges = normalizeGens(gens).map(g => GEN_RANGES[g]);
  const sizes = ranges.map(([a,b]) => b-a+1);
  const total = sizes.reduce((s,x)=>s+x,0);
  let r = Math.floor(Math.random()*total)+1;
  for (let i=0;i<ranges.length;i++){ if (r<=sizes[i]){ const [a,b]=ranges[i]; return Math.floor(Math.random()*(b-a+1))+a; } r-=sizes[i]; }
  const [a,b]=ranges[0]; return Math.floor(Math.random()*(b-a+1))+a;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const stageMult = (n) => n>=0 ? (2+n)/2 : 2/(2-n); // -6..+6 → 0.25..4
const grounded = (mon) => !mon.types.includes('flying'); // simple, Levitate handled elsewhere

// ---------- move selection (adds a chance for useful status/hazard/weather moves) ----------
const KNOWN_STATUS = new Set([
  'swords-dance','growl','calm-mind',
  'stealth-rock','spikes','toxic-spikes',
  'rain-dance','sunny-day','sandstorm','hail',
  'electric-terrain','grassy-terrain'
]);

async function pickRealMoves(pokemonData) {
  const take = async (list) => Promise.all(list.map(async (m) => {
    try {
      const mv = await getMoveByRef(m.move);
      return {
        name: mv.name,
        power: mv.power,
        type: mv.type?.name,
        category: mv.damage_class?.name,
        accuracy: mv.accuracy ?? 100,
        priority: mv.priority ?? 0,
        ailment: mv.meta?.ailment?.name ?? null,
        ailmentChance: mv.meta?.ailment_chance ?? 0,
        statChanges: (mv.stat_changes || []).map(sc => ({ stat: sc.stat.name, change: sc.change }))
      };
    } catch { return null; }
  }));

  const all = (pokemonData.moves || []).map(m => m).slice(0, 100);
  const details = (await take(all)).filter(Boolean);

  const damaging = details.filter(mv => mv.power > 0 && (mv.category==='physical'||mv.category==='special') && mv.type);
  const statusUseful = details.filter(mv =>
    mv.category==='status' && (
      KNOWN_STATUS.has(mv.name) || mv.statChanges?.length > 0
    )
  );

  // diversify by type
  const byType = new Map();
  for (const mv of damaging) {
    if (!byType.has(mv.type)) byType.set(mv.type, []);
    byType.get(mv.type).push(mv);
  }
  const selected = [];
  for (const [, arr] of byType) { selected.push(arr[0]); if (selected.length>=3) break; }
  // ensure at least 1 status move if available
  if (statusUseful.length) selected.push(statusUseful[0]);
  // fill up to 4
  let i=0;
  while (selected.length<4 && i<damaging.length) { if (!selected.includes(damaging[i])) selected.push(damaging[i]); i++; }
  while (selected.length<4) selected.push({ name:'tackle', power:40, type:'normal', category:'physical', accuracy:95, priority:0 });

  return selected.slice(0,4);
}

// ---------- team generation ----------
const RAND_ABILITIES = ['intimidate','levitate','flash-fire','overgrow','blaze','torrent','guts'];
const RAND_ITEMS = ['leftovers','choice-scarf','focus-sash','life-orb', null, null];

export async function generateTeam(gens=1, size=6) {
  const team = []; const chosen = new Set();
  while (team.length < size) {
    const id = pickRandomIdFromGens(gens);
    if (chosen.has(id)) continue; chosen.add(id);
    const data = await getPokemonById(id);
    const types = (data.types || []).map(t => t.type.name);
    const stats = Object.fromEntries(data.stats.map(s => [s.stat.name, s.base_stat]));
    const moves = await pickRealMoves(data);
    const ability = RAND_ABILITIES[Math.floor(Math.random()*RAND_ABILITIES.length)];
    const item = RAND_ITEMS[Math.floor(Math.random()*RAND_ITEMS.length)] || null;
    team.push({
      id: data.id,
      name: data.name,
      sprite: data.sprites.front_default,
      types,
      stats: {
        hp: stats['hp'] ?? 60, attack: stats['attack'] ?? 60, defense: stats['defense'] ?? 60,
        spAttack: stats['special-attack'] ?? 60, spDefense: stats['special-defense'] ?? 60, speed: stats['speed'] ?? 60
      },
      currentHp: stats['hp'] ?? 60,
      status: null,
      stages: { atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:0 },
      ability,
      abilityState: {},
      item,
      choiceLock: null,
      moves
    });
  }
  return team;
}

// ---------- core calc ----------
function calcDamage(attacker, defender, move, state) {
  const level = 50;
  const isPhysical = move.category === 'physical';

  // stage modifiers
  const atkStage = stageMult(isPhysical ? attacker.stages.atk : attacker.stages.spa);
  const defStage = stageMult(isPhysical ? defender.stages.def : defender.stages.spd);

  // burn halves physical atk UNLESS Guts
  const burnedAtkMod = (isPhysical && attacker.status?.type === 'burn' && attacker.ability!=='guts') ? 0.5 : 1;

  // base A/D
  let Araw = isPhysical ? attacker.stats.attack : attacker.stats.spAttack;
  let Draw = isPhysical ? defender.stats.defense : defender.stats.spDefense;

  // abilities that boost STAB at low HP
  const lowHp = attacker.currentHp <= attacker.stats.hp/3;
  let stabAbilityBoost = 1;
  if (lowHp) {
    if (attacker.ability==='overgrow' && move.type==='grass') stabAbilityBoost=1.5;
    if (attacker.ability==='blaze'    && move.type==='fire')  stabAbilityBoost=1.5;
    if (attacker.ability==='torrent'  && move.type==='water') stabAbilityBoost=1.5;
  }

  // Guts: +50% Atk und Burn-Malus ignoriert (bereits oben)
  if (attacker.ability==='guts' && attacker.status?.type) {
    if (isPhysical) Araw = Math.floor(Araw * 1.5);
  }

  // Choice Scarf: Speed x1.5 (nur für Anzeige / spätere Initiative; in Ein-Zug-Modus egal)
  let speed = attacker.stats.speed;
  if (attacker.item==='choice-scarf') speed = Math.floor(speed * 1.5);

  let A = Math.max(1, Math.floor(Araw * atkStage * burnedAtkMod));
  let D = Math.max(1, Math.floor(Draw * defStage));

  // base power + STAB/Eff
  const base = move.power || 40;
  let stab = attacker.types.includes(move.type) ? 1.5 : 1;
  stab *= stabAbilityBoost;

  // Weather multipliers
  const w = state.field.weather?.type;
  if (w==='rain') {
    if (move.type==='water') stab *= 1.5;
    if (move.type==='fire')  stab *= 0.5;
  } else if (w==='sun') {
    if (move.type==='fire')  stab *= 1.5;
    if (move.type==='water') stab *= 0.5;
  }

  // Terrain multipliers (only grounded)
  const t = state.field.terrain?.type;
  if (grounded(attacker)) {
    if (t==='electric' && move.type==='electric') stab *= 1.3;
    if (t==='grassy'   && move.type==='grass')    stab *= 1.3;
  }

  // Flash Fire: absorb (handled before), but boost when active
  if (attacker.ability==='flash-fire' && attacker.abilityState?.flashFireBoost && move.type==='fire') {
    stab *= 1.5;
  }

  // Effectiveness with Levitate immunity
  let eff = typeMultiplier(move.type, defender.types);
  if (defender.ability==='levitate' && move.type==='ground') eff = 0;

  // random/crit
  const rand = 0.85 + Math.random()*0.15;
  const crit = (Math.random() < (1/24)) ? 1.5 : 1;

  // Life Orb: +30% dmg
  let postMult = 1;
  if (attacker.item==='life-orb') postMult *= 1.3;

  const dmg = Math.floor(((((2*level)/5+2)*base*(A/Math.max(1,D)))/50 + 2)*stab*eff*rand*crit*postMult);
  return {
    dmg: Math.max(1, dmg),
    eff, stab, crit: crit>1,
    speed
  };
}

function aliveMons(team){ return team.filter(p=>p.currentHp>0); }
function autoSwitchIfNeeded(state, side){
  const team = state.teams[side];
  const idx  = state.active[side];
  if (team[idx].currentHp>0) return null;
  for (let i=0;i<team.length;i++){ if (team[i].currentHp>0){ state.active[side]=i; onSwitchIn(state, side); return i; } }
  return null;
}
function checkBattleEnd(state){
  const a = aliveMons(state.teams.player1).length>0;
  const b = aliveMons(state.teams.player2).length>0;
  if (!a || !b){ state.over=true; state.winner = a ? 'player1' : 'player2'; return true; }
  return false;
}
function toggleTurn(state){ state.turnOwner = state.turnOwner === 'player1' ? 'player2' : 'player1'; }

// ---------- ABILITIES / ITEMS / HAZARDS / FIELD ----------
function onSwitchIn(state, side){
  const opp = side==='player1' ? 'player2' : 'player1';
  const mon = state.teams[side][state.active[side]];

  // Choice-Lock reset
  mon.choiceLock = null;

  // Entry hazards damage / status
  const sc = state.sideConditions[side] || {};
  // Stealth Rock
  if (sc.stealthRock) {
    const eff = typeMultiplier('rock', mon.types);
    const dmg = Math.max(1, Math.floor(mon.stats.hp * 0.125 * eff));
    mon.currentHp = Math.max(0, mon.currentHp - dmg);
  }
  // Spikes (only grounded)
  if (sc.spikes && grounded(mon)) {
    const layer = clamp(sc.spikes, 1,3);
    const pct = layer===1?0.125:layer===2?0.167:0.25;
    const dmg = Math.max(1, Math.floor(mon.stats.hp * pct));
    mon.currentHp = Math.max(0, mon.currentHp - dmg);
  }
  // Toxic Spikes (only grounded)
  if (sc.toxicSpikes && grounded(mon)) {
    const layers = clamp(sc.toxicSpikes, 1,2);
    const isPoison = mon.types.includes('poison');
    const isSteel = mon.types.includes('steel');
    const isFlying = mon.types.includes('flying');
    if (isPoison) {
      // absorb and clear
      state.sideConditions[side].toxicSpikes = 0;
    } else if (!isSteel && !isFlying) {
      // apply poison or toxic if no status
      if (!mon.status?.type) {
        if (layers>=2) mon.status = { type:'toxic', toxicCounter: 1 };
        else mon.status = { type:'poison' };
      }
    }
  }

  // Ability: Intimidate (opp atk -1)
  if (mon.ability==='intimidate') {
    const om = state.teams[opp][state.active[opp]];
    om.stages.atk = clamp(om.stages.atk - 1, -6, 6);
  }
}

function setWeather(state, type, turns=5){
  state.field.weather = { type, turns };
}
function setTerrain(state, type, turns=5){
  state.field.terrain = { type, turns };
}
function addHazard(state, side, kind, amount=1, max=3){
  const sc = state.sideConditions[side];
  if (!sc[kind]) sc[kind]=0;
  sc[kind] = clamp(sc[kind] + amount, 0, max);
}

// ---------- End-of-turn pipeline ----------
function endOfTurn(state, io, room){
  // Terrain healing (grassy), grounded only
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon || mon.currentHp<=0) continue;
    if (state.field.terrain?.type==='grassy' && grounded(mon)) {
      const heal = Math.max(1, Math.floor(mon.stats.hp * 0.0625));
      mon.currentHp = clamp(mon.currentHp + heal, 0, mon.stats.hp);
      io.to(room).emit('status-heal', { side, type:'grassy', heal });
    }
  }

  // Leftovers
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon || mon.currentHp<=0) continue;
    if (mon.item==='leftovers'){
      const heal = Math.max(1, Math.floor(mon.stats.hp * 0.0625));
      mon.currentHp = Math.min(mon.stats.hp, mon.currentHp + heal);
      io.to(room).emit('item-heal', { side, item:'leftovers', heal });
    }
  }

  // Poison/Toxic
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon || mon.currentHp<=0) continue;
    if (mon.status?.type==='poison'){
      const dmg = Math.max(1, Math.floor(mon.stats.hp * 0.125));
      mon.currentHp = Math.max(0, mon.currentHp - dmg);
      io.to(room).emit('status-tick', { side, type:'poison', damage: dmg });
    } else if (mon.status?.type==='toxic'){
      mon.status.toxicCounter = (mon.status.toxicCounter || 1) + 1;
      const pct = 0.0625 * mon.status.toxicCounter; // 1/16, 2/16, 3/16 ...
      const dmg = Math.max(1, Math.floor(mon.stats.hp * Math.min(pct, 0.9375)));
      mon.currentHp = Math.max(0, mon.currentHp - dmg);
      io.to(room).emit('status-tick', { side, type:'toxic', damage: dmg, stacks: mon.status.toxicCounter });
    }
  }

  // Burn
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon || mon.currentHp<=0) continue;
    if (mon.status?.type==='burn'){
      const dmg = Math.max(1, Math.floor(mon.stats.hp * 0.0625));
      mon.currentHp = Math.max(0, mon.currentHp - dmg);
      io.to(room).emit('status-tick', { side, type:'burn', damage: dmg });
    }
  }

  // Weather chip (sand/hail)
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon || mon.currentHp<=0) continue;
    const w = state.field.weather?.type;
    if (w==='sand'){
      const immune = mon.types.some(t => ['rock','ground','steel'].includes(t));
      if (!immune){
        const dmg = Math.max(1, Math.floor(mon.stats.hp * 0.0625));
        mon.currentHp = Math.max(0, mon.currentHp - dmg);
        io.to(room).emit('weather-chip', { side, type:'sand', damage: dmg });
      }
    } else if (w==='hail'){
      const immune = mon.types.includes('ice');
      if (!immune){
        const dmg = Math.max(1, Math.floor(mon.stats.hp * 0.0625));
        mon.currentHp = Math.max(0, mon.currentHp - dmg);
        io.to(room).emit('weather-chip', { side, type:'hail', damage: dmg });
      }
    }
  }

  // Sleep decrement
  for (const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if (!mon?.status) continue;
    if (mon.status.type==='sleep'){
      mon.status.turnsLeft = Math.max(0, (mon.status.turnsLeft ?? 0) - 1);
      if (mon.status.turnsLeft===0) mon.status = null;
    }
  }

  // Weather/Terrain duration
  if (state.field.weather?.type){
    state.field.weather.turns -= 1;
    if (state.field.weather.turns<=0) state.field.weather = { type:null, turns:0 };
  }
  if (state.field.terrain?.type){
    state.field.terrain.turns -= 1;
    if (state.field.terrain.turns<=0) state.field.terrain = { type:null, turns:0 };
  }
}

// ---------------------- Public Snapshots ----------------------
export function getRoomSnapshot(room){
  const s = rooms.get(room);
  if (!s) return null;
  return {
    room,
    phase: s.phase,
    teams: s.teams,
    active: s.active,
    over: !!s.over,
    winner: s.winner ?? null,
    turnOwner: s.turnOwner,
    field: s.field,
    sideConditions: s.sideConditions
  };
}

// ---------------------- Start Battles ----------------------
export async function startPvpQuickMatch(io, socket, gens=1){
  const room = `pvp-${socket.id}-${Math.random().toString(36).slice(2,8)}`;
  const p1 = await generateTeam(gens, 6);
  const p2 = await generateTeam(gens, 6);

  const state = {
    mode: 'pvp',
    teams: { player1: p1, player2: p2 },
    active: { player1: 0, player2: 0 },
    over: false, winner: null,
    phase: 'select',
    turnOwner: 'player1',
    field: { weather: { type:null, turns:0 }, terrain: { type:null, turns:0 } },
    sideConditions: { player1: {}, player2: {} }
  };
  rooms.set(room, state);

  socket.join(room);
  onSwitchIn(state, 'player1'); // apply hazards (none yet) and ability hooks if needed
  onSwitchIn(state, 'player2');

  io.to(room).emit('battle-start', getRoomSnapshot(room));
}

export async function startBotBattle(io, socket, gens=1){
  const room = `bot-${socket.id}`;
  const p1 = await generateTeam(gens, 6);
  const p2 = await generateTeam(gens, 6);

  const state = {
    mode: 'bot',
    teams: { player1: p1, player2: p2 },
    active: { player1: 0, player2: 0 },
    over: false, winner: null,
    phase: 'select',
    turnOwner: 'player1',
    field: { weather: { type:null, turns:0 }, terrain: { type:null, turns:0 } },
    sideConditions: { player1: {}, player2: {} }
  };
  rooms.set(room, state);

  socket.join(room);
  onSwitchIn(state, 'player1');
  onSwitchIn(state, 'player2');

  io.to(room).emit('battle-start', getRoomSnapshot(room));
}

// ---------------------- Turn Engine (Ein-Zug) ----------------------
async function executeAction(io, room, side, action){
  const state = rooms.get(room);
  if (!state || state.over) return;
  const opp = side === 'player1' ? 'player2' : 'player1';
  const atkMon = state.teams[side][state.active[side]];
  if (atkMon.currentHp <= 0) return;

  state.phase = 'acting';
  io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });

  // Sleep: guaranteed skip while turnsLeft > 0
  if (atkMon.status?.type==='sleep'){
    io.to(room).emit('message', `💤 ${atkMon.name} schläft und kann nicht angreifen.`);
    await sleep(350);
  }
  // Freeze: 20% thaw per attempt
  else if (atkMon.status?.type==='freeze'){
    if (Math.random() < 0.2){
      atkMon.status = null;
      io.to(room).emit('message', `❄️ ${atkMon.name} taut auf!`);
      await sleep(250);
      // continue to action
    } else {
      io.to(room).emit('message', `❄️ ${atkMon.name} ist eingefroren und kann sich nicht bewegen.`);
      await sleep(350);
    }
  }

  if (action.type === 'switch'){
    const to = action.index;
    const team = state.teams[side];
    if (to>=0 && to<team.length && team[to].currentHp>0 && to!==state.active[side]){
      state.active[side] = to;
      onSwitchIn(state, side);
      io.to(room).emit('switch-ok', { side, toIndex: to });
      io.to(room).emit('message', `🔄 ${side} wechselt zu ${team[to].name}.`);
      await sleep(400);
    }
  } else if (action.type === 'move'){
    const moveIndex = action.index;

    // Choice Scarf: lock on first chosen move
    if (atkMon.item==='choice-scarf'){
      if (atkMon.choiceLock && atkMon.moves[moveIndex]?.name !== atkMon.choiceLock){
        io.to(room).emit('error-message', 'Choice Scarf: Du bist auf deinen ersten Move gelockt.');
        state.phase = 'select';
        io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });
        return;
      }
      if (!atkMon.choiceLock) atkMon.choiceLock = atkMon.moves[moveIndex]?.name || null;
    }

    const attacker = atkMon;
    const defender = state.teams[opp][state.active[opp]];
    if (attacker?.moves?.[moveIndex] && defender?.currentHp>0){
      const mv = attacker.moves[moveIndex];

      // Paralysis: 25% full para
      if (attacker.status?.type === 'paralysis' && Math.random() < 0.25) {
        io.to(room).emit('message', `⚡ ${attacker.name} ist paralysiert! Es kann sich nicht bewegen!`);
        await sleep(350);
      } else if (mv.category === 'status') {
        // handle named effects
        const name = mv.name;
        if (name==='swords-dance'){ attacker.stages.atk = clamp(attacker.stages.atk+2, -6, 6); io.to(room).emit('message', `🗡️ ${attacker.name}s Angriff steigt stark! (+2)`); }
        else if (name==='growl'){ defender.stages.atk = clamp(defender.stages.atk-1, -6, 6); io.to(room).emit('message', `📢 Angriff von ${defender.name} sinkt! (-1)`); }
        else if (name==='calm-mind'){ attacker.stages.spa = clamp(attacker.stages.spa+1, -6, 6); attacker.stages.spd = clamp(attacker.stages.spd+1, -6, 6); io.to(room).emit('message', `🧠 ${attacker.name} bündelt die Sinne! (SpA/SpD +1)`); }
        else if (name==='stealth-rock'){ addHazard(state, opp, 'stealthRock', 1, 1); io.to(room).emit('message', '🪨 Tarnsteine legen sich auf die Gegnerseite.'); }
        else if (name==='spikes'){ addHazard(state, opp, 'spikes', 1, 3); io.to(room).emit('message', '🧷 Stachler liegen auf der Gegnerseite.'); }
        else if (name==='toxic-spikes'){ addHazard(state, opp, 'toxicSpikes', 1, 2); io.to(room).emit('message', '☠️ Giftspitzen liegen auf der Gegnerseite.'); }
        else if (name==='rain-dance'){ setWeather(state, 'rain', 5); io.to(room).emit('message', '🌧️ Es begann zu regnen!'); }
        else if (name==='sunny-day'){ setWeather(state, 'sun', 5); io.to(room).emit('message', '☀️ Die Sonne scheint grell!'); }
        else if (name==='sandstorm'){ setWeather(state, 'sand', 5); io.to(room).emit('message', '🌪️ Ein Sandsturm tobt!'); }
        else if (name==='hail'){ setWeather(state, 'hail', 5); io.to(room).emit('message', '🌨️ Hagel setzt ein!'); }
        else if (name==='electric-terrain'){ setTerrain(state, 'electric', 5); io.to(room).emit('message', '⚡ Der Boden ist elektrisch geladen!'); }
        else if (name==='grassy-terrain'){ setTerrain(state, 'grassy', 5); io.to(room).emit('message', '🌿 Gräser bedecken den Boden!'); }
        else {
          io.to(room).emit('message', `🛡️ ${attacker.name} setzt ${mv.name} ein.`);
        }
        await sleep(320);
      } else {
        // Accuracy/Evasion check with stages
        const accStage = stageMult(attacker.stages.acc);
        const evaStage = stageMult(defender.stages.eva);
        const acc = (mv.accuracy ?? 100) * (accStage/ evaStage);

        // Immunities via abilities: Flash Fire (absorb fire)
        if (defender.ability==='flash-fire' && mv.type==='fire'){
          defender.abilityState.flashFireBoost = true;
          io.to(room).emit('message', `🔥 ${defender.name} absorbiert Feuer durch Flash Fire!`);
          await sleep(280);
        } else if (defender.ability==='levitate' && mv.type==='ground'){
          io.to(room).emit('message', `🌀 ${defender.name} schwebt! Boden-Attacke verfehlt.`);
          await sleep(280);
        } else if (Math.random()*100 > acc){
          io.to(room).emit('message', `😬 ${attacker.name}'s ${mv.name} verfehlt!`);
          io.to(room).emit('move-missed', { side, move: mv.name, target: opp });
          await sleep(320);
        } else {
          io.to(room).emit('message', `➡️ ${attacker.name} nutzt ${mv.name}!`);
          await sleep(250);

          const result = calcDamage(attacker, defender, mv, state);
          let finalDmg = result.dmg;

          // Focus Sash: prevent OHKO from full or >1HP → leave at 1HP (once)
          if (defender.item==='focus-sash' && defender.currentHp===defender.stats.hp && finalDmg >= defender.currentHp) {
            finalDmg = defender.currentHp - 1;
            defender.item = null; // consumed
            io.to(room).emit('message', `🎗️ Focus Sash rettet ${defender.name} bei 1 KP!`);
          }

          defender.currentHp = Math.max(0, defender.currentHp - finalDmg);

          io.to(room).emit('move-made', {
            side, move: mv.name, damage: finalDmg,
            target: opp, effectiveness: result.eff, crit: result.crit, stab: result.stab
          });

          await sleep(380);

          // Ailments from move.meta (respect Electric Terrain: prevents sleep on grounded)
          if (mv.ailment) {
            const terrainBlocksSleep = state.field.terrain?.type==='electric' && grounded(defender);
            const already = defender.status?.type;
            if (!already && Math.random()*100 < (mv.ailmentChance || 0)) {
              let applied = null;
              const map = { burn:'burn', paralysis:'paralysis', poison:'poison', sleep:'sleep', freeze:'freeze' };
              const n = map[mv.ailment];
              if (n==='sleep' && terrainBlocksSleep) {
                // no sleep under electric terrain for grounded
              } else if (n) {
                if (n==='sleep') applied = { type:'sleep', turnsLeft: Math.floor(Math.random()*3)+1 };
                else if (n==='freeze') applied = { type:'freeze' };
                else applied = { type:n };
              }
              if (applied) {
                defender.status = applied;
                io.to(room).emit('status-applied', { target: opp, type: defender.status.type });
                await sleep(250);
              }
            }
          }

          // Life Orb recoil (after successful damaging move)
          if (attacker.item==='life-orb') {
            const recoil = Math.max(1, Math.floor(attacker.stats.hp * 0.1));
            attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
            io.to(room).emit('message', `🩸 ${attacker.name} erleidet Rückstoß durch Life Orb (${recoil}).`);
            await sleep(220);
          }

          if (defender.currentHp === 0){
            io.to(room).emit('pokemon-fainted', { fainted: defender.name, target: opp });
            await sleep(300);
            const switched = autoSwitchIfNeeded(state, opp);
            if (switched !== null){
              io.to(room).emit('switch-ok', { side: opp, toIndex: switched });
              io.to(room).emit('message', `⚠️ ${opp} sendet ${state.teams[opp][switched].name} in den Kampf!`);
              await sleep(300);
            } else if (checkBattleEnd(state)){
              io.to(room).emit('battle-end', { winner: state.winner });
              return;
            }
          }
        }
      }
    }
  }

  // End-of-Turn Pipeline (korrekte Reihenfolge)
  endOfTurn(state, io, room);

  // KO durch Residual?
  if (checkBattleEnd(state)){
    io.to(room).emit('battle-end', { winner: state.winner });
    return;
  }

  // Rundenende
  io.to(room).emit('turn-end', {});
  state.phase = 'select';
  toggleTurn(state);
  io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });
  io.to(room).emit('state-update', getRoomSnapshot(room));

  // Bot am Zug?
  if (state.mode === 'bot' && state.turnOwner === 'player2' && !state.over){
    await sleep(450);
    const botAction = decideBotAction(state);
    await executeAction(io, room, 'player2', botAction);
  }
}

function decideBotAction(state){
  const side = 'player2';
  const opp = 'player1';
  const atk = state.teams[side][state.active[side]];
  const def = state.teams[opp][state.active[opp]];

  // if severely low, sometimes switch
  if (atk.currentHp/atk.stats.hp < 0.3 && Math.random()<0.2){
    for (let i=0;i<state.teams[side].length;i++){
      if (i!==state.active[side] && state.teams[side][i].currentHp>0){
        return { type:'switch', index:i };
      }
    }
  }

  // choose between setting hazards/status or dealing dmg, rough heuristic
  let bestIdx = 0; let bestScore = -Infinity;
  atk.moves.forEach((m, idx) => {
    let score = 0;
    if (m.category==='status'){
      // prefer key setup early
      score = 20;
      if (m.name==='swords-dance') score += 15;
      if (m.name==='stealth-rock' || m.name==='spikes' || m.name==='toxic-spikes') score += 18;
      if (m.name==='calm-mind') score += 12;
      if (state.sideConditions[opp]?.stealthRock) score -= 8; // don't spam
    } else {
      const eff = typeMultiplier(m.type, def.types);
      score = (m.power || 40) * eff + (m.priority || 0) * 5 + (m.accuracy||100)/10;
    }
    if (score > bestScore) { bestScore=score; bestIdx=idx; }
  });
  return { type:'move', index: bestIdx };
}

// ---------------------- Public API ----------------------
export function clientRequestSnapshot(io, socket, room){
  const snap = getRoomSnapshot(room);
  if (snap) socket.emit('state-update', snap);
}

/** payload: { room, side:'player1'|'player2', type:'move'|'switch', index:number } */
export async function clientLockAction(io, socket, payload){
  const { room, side='player1', type, index } = payload || {};
  const state = rooms.get(room);
  if (!state || state.over) return;

  if (state.phase !== 'select'){ io.to(room).emit('error-message', 'Aktionen nur in der Auswahlphase erlaubt.'); return; }
  if (state.turnOwner !== side){ io.to(room).emit('error-message', 'Nicht dein Zug!'); return; }

  if (type === 'switch'){
    const t = state.teams[side];
    if (index<0 || index>=t.length) return io.to(room).emit('error-message','Ungültiger Wechselindex.');
    if (t[index].currentHp<=0) return io.to(room).emit('error-message','Dieses Pokémon ist kampunfähig.');
    if (state.active[side]===index) return io.to(room).emit('error-message','Dieses Pokémon ist bereits aktiv.');
    await executeAction(io, room, side, { type:'switch', index });
  } else if (type === 'move'){
    const atk = state.teams[side][state.active[side]];
    if (!atk?.moves?.[index]) return io.to(room).emit('error-message','Ungültiger Move.');
    if (atk.currentHp<=0) return io.to(room).emit('error-message',`${atk.name} ist kampunfähig.`);
    await executeAction(io, room, side, { type:'move', index });
  } else {
    io.to(room).emit('error-message','Unbekannter Aktionstyp.');
  }
}
