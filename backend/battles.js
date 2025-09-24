import fetch from 'node-fetch';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rooms = new Map();

/** State je Room:
 * {
 *   mode: 'pvp' | 'bot',
 *   teams: { player1: Team, player2: Team },
 *   active: { player1: number, player2: number },
 *   over: boolean, winner: 'player1'|'player2'|null,
 *   phase: 'select' | 'acting',
 *   turnOwner: 'player1'|'player2'
 * }
 *
 * Pokemon: {
 *   id, name, sprite, types: string[],
 *   stats: { hp, attack, defense, spAttack, spDefense, speed },
 *   currentHp: number,
 *   status?: { type: 'burn'|'poison'|'paralysis', turns?: number },
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
async function getMoveByRef(ref) {
  const key = typeof ref === 'string' ? ref : ref.url;
  if (moveCache.has(key)) return moveCache.get(key);
  const data = await fetchJson(typeof ref === 'string' ? ref : ref.url);
  moveCache.set(key, data);
  return data;
}

function typeMultiplier(attackType, defenderTypes) {
  return defenderTypes.reduce((acc, t) => acc * (TYPE_CHART[attackType]?.[t] ?? 1), 1);
}
function normalizeGens(gens) {
  if (Array.isArray(gens) && gens.length) return gens.map(Number).filter((g)=>GEN_RANGES[g]);
  const n = Number(gens) || 1; return GEN_RANGES[n] ? [n] : [1];
}
function pickRandomIdFromGens(gens) {
  const ranges = normalizeGens(gens).map(g => GEN_RANGES[g]);
  const sizes  = ranges.map(([a,b]) => (b-a+1));
  const total  = sizes.reduce((s,x)=>s+x,0);
  let r = Math.floor(Math.random()*total)+1;
  for (let i=0;i<ranges.length;i++){
    if (r<=sizes[i]){ const [a,b]=ranges[i]; return Math.floor(Math.random()*(b-a+1))+a; }
    r-=sizes[i];
  }
  const [a,b]=ranges[0]; return Math.floor(Math.random()*(b-a+1))+a;
}

// ---- Move-Auswahl mit echten Werten (inkl. accuracy/priority/ailments) ----
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
        ailment: mv.meta?.ailment?.name ?? null,              // e.g. burn, paralysis, poison
        ailmentChance: mv.meta?.ailment_chance ?? 0           // %
      };
    } catch { return null; }
  }));

  let details = await take((pokemonData.moves || []).slice(0, 30));
  let usable = details.filter(mv =>
    mv && mv.power > 0 &&
    (mv.category==='physical'||mv.category==='special') &&
    mv.type
  );

  if (usable.length < 4) {
    const more = await take((pokemonData.moves || []).slice(30, 80));
    usable = usable.concat(more.filter(mv => mv && mv.power > 0 && (mv.category==='physical'||mv.category==='special') && mv.type));
  }

  // Vielfalt nach Typ
  const byType = new Map();
  for (const mv of usable) {
    if (!byType.has(mv.type)) byType.set(mv.type, []);
    byType.get(mv.type).push(mv);
  }
  const selected = [];
  for (const [, arr] of byType) { selected.push(arr[0]); if (selected.length>=4) break; }
  let i=0; while (selected.length<4 && i<usable.length) { if (!selected.includes(usable[i])) selected.push(usable[i]); i++; }
  while (selected.length<4) selected.push({ name: 'tackle', power: 40, type: 'normal', category: 'physical', accuracy: 95, priority: 0 });

  return selected.slice(0,4);
}

export async function generateTeam(gens=1, size=6) {
  const team = []; const chosen = new Set();
  while (team.length < size) {
    const id = pickRandomIdFromGens(gens);
    if (chosen.has(id)) continue; chosen.add(id);
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
      status: null,
      moves
    });
  }
  return team;
}

// ---- Kampfmathematik (mit Burn/Para-Einflüssen) ----
function calcDamage(attacker, defender, move) {
  const level = 50;
  const isPhysical = move.category === 'physical';
  const burnedAtkMod = (isPhysical && attacker.status?.type === 'burn') ? 0.5 : 1; // Burn halbiert phys. Angriff
  const Araw = isPhysical ? attacker.stats.attack : attacker.stats.spAttack;
  const A = Math.max(1, Math.floor(Araw * burnedAtkMod));
  const D = isPhysical ? defender.stats.defense : defender.stats.spDefense;
  const base = move.power || 40;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const eff = typeMultiplier(move.type, defender.types);
  const rand = 0.85 + Math.random()*0.15;
  const crit = (Math.random() < (1/24)) ? 1.5 : 1;

  const dmg = Math.floor(((((2*level)/5+2)*base*(A/Math.max(1,D)))/50 + 2)*stab*eff*rand*crit);
  return { dmg: Math.max(1, dmg), eff, stab, crit: crit>1 };
}

function aliveMons(team){ return team.filter(p=>p.currentHp>0); }
function autoSwitchIfNeeded(state, side){
  const team = state.teams[side];
  const idx  = state.active[side];
  if (team[idx].currentHp>0) return null;
  for (let i=0;i<team.length;i++){
    if (team[i].currentHp>0){ state.active[side]=i; return i; }
  }
  return null;
}
function checkBattleEnd(state){
  const a = aliveMons(state.teams.player1).length>0;
  const b = aliveMons(state.teams.player2).length>0;
  if (!a || !b){ state.over=true; state.winner = a ? 'player1' : 'player2'; return true; }
  return false;
}
function toggleTurn(state){ state.turnOwner = state.turnOwner === 'player1' ? 'player2' : 'player1'; }

// ---- Status-Helfer ----
function tryApplyAilment(attacker, defender, move){
  // Nur, wenn der Move laut meta einen Ailment hat
  const name = move.ailment;
  const chance = move.ailmentChance || 0;
  if (!name || !chance) return null;

  // Ziel hat schon Status? (vereinfachung: 1 Status gleichzeitig)
  if (defender.status?.type) return null;

  // Mögliche Ailments auf die 3 beschränken
  const map = { burn: 'burn', paralysis: 'paralysis', poison: 'poison' };
  const normalized = map[name];
  if (!normalized) return null;

  if (Math.random()*100 < chance){
    defender.status = { type: normalized };
    return normalized;
  }
  return null;
}

function endOfTurnTicks(state, side, io, room){
  const mon = state.teams[side][state.active[side]];
  if (!mon || mon.currentHp <= 0 || !mon.status) return;

  const maxHp = mon.stats.hp;
  let delta = 0;
  if (mon.status.type === 'burn') {
    delta = Math.max(1, Math.floor(maxHp * 0.0625)); // 6.25%
  } else if (mon.status.type === 'poison') {
    delta = Math.max(1, Math.floor(maxHp * 0.125)); // 12.5%
  } else {
    return; // paralysis: kein DoT
  }

  mon.currentHp = Math.max(0, mon.currentHp - delta);
  io.to(room).emit('status-tick', { side, type: mon.status.type, damage: delta });

  // KO durch Status
  if (mon.currentHp === 0){
    io.to(room).emit('pokemon-fainted', { fainted: mon.name, target: side });
  }
}

// ---------------------- Public API ----------------------
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
    turnOwner: s.turnOwner
  };
}

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
    turnOwner: 'player1'
  };
  rooms.set(room, state);

  socket.join(room);
  io.to(room).emit('battle-start', { room, teams: state.teams, active: state.active, phase: state.phase, turnOwner: state.turnOwner });
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
    turnOwner: 'player1'
  };
  rooms.set(room, state);

  socket.join(room);
  io.to(room).emit('battle-start', { room, teams: state.teams, active: state.active, phase: state.phase, turnOwner: state.turnOwner });
}

// zentrale Ein-Zug-Engine (Accuracy, Para-Block, Ailments, EoT-Ticks)
async function executeAction(io, room, side, action){
  const state = rooms.get(room);
  if (!state || state.over) return;

  const opp = side === 'player1' ? 'player2' : 'player1';
  const atkMon = state.teams[side][state.active[side]];
  if (atkMon.currentHp <= 0) return;

  state.phase = 'acting';
  io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });

  if (action.type === 'switch'){
    const to = action.index;
    const team = state.teams[side];
    if (to>=0 && to<team.length && team[to].currentHp>0 && to!==state.active[side]){
      state.active[side] = to;
      io.to(room).emit('switch-ok', { side, toIndex: to });
      io.to(room).emit('message', `🔄 ${side} wechselt zu ${team[to].name}.`);
      await sleep(400);
    }
  } else if (action.type === 'move'){
    const moveIndex = action.index;
    const attacker = atkMon;
    const defender = state.teams[opp][state.active[opp]];
    if (attacker?.moves?.[moveIndex] && defender?.currentHp>0){
      const mv = attacker.moves[moveIndex];

      // Paralysis: 25% Ausfall
      if (attacker.status?.type === 'paralysis' && Math.random() < 0.25) {
        io.to(room).emit('message', `⚡ ${attacker.name} ist paralysiert! Es kann sich nicht bewegen!`);
        await sleep(450);
      } else {
        // Accuracy-Check
        const acc = mv.accuracy ?? 100;
        if (Math.random()*100 > acc){
          io.to(room).emit('message', `😬 ${attacker.name}'s ${mv.name} verfehlt!`);
          io.to(room).emit('move-missed', { side, move: mv.name, target: opp });
          await sleep(400);
        } else {
          io.to(room).emit('message', `➡️ ${attacker.name} nutzt ${mv.name}!`);
          await sleep(300);

          const result = calcDamage(attacker, defender, mv);
          defender.currentHp = Math.max(0, defender.currentHp - result.dmg);

          io.to(room).emit('move-made', {
            side, move: mv.name, damage: result.dmg,
            target: opp, effectiveness: result.eff, crit: result.crit, stab: result.stab
          });

          await sleep(450);

          // Versuch, Ailment zuzufügen (nur burn/poison/paralysis werden berücksichtigt)
          const applied = tryApplyAilment(attacker, defender, mv);
          if (applied){
            io.to(room).emit('status-applied', { target: opp, type: applied });
            await sleep(300);
          }

          if (defender.currentHp === 0){
            io.to(room).emit('pokemon-fainted', { fainted: defender.name, target: opp });
            await sleep(300);
            const switched = autoSwitchIfNeeded(state, opp);
            if (switched !== null){
              io.to(room).emit('switch-ok', { side: opp, toIndex: switched });
              io.to(room).emit('message', `⚠️ ${opp} sendet ${state.teams[opp][switched].name} in den Kampf!`);
              await sleep(300);
            } else {
              if (checkBattleEnd(state)){
                io.to(room).emit('battle-end', { winner: state.winner });
                return;
              }
            }
          }
        }
      }
    }
  }

  // End-of-Turn Status Ticks (beide Seiten)
  endOfTurnTicks(state, 'player1', io, room);
  endOfTurnTicks(state, 'player2', io, room);

  // KO nach Status?
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

  // 20% defensive Switch wenn HP < 30%
  if (atk.currentHp/atk.stats.hp < 0.3 && Math.random()<0.2){
    for (let i=0;i<state.teams[side].length;i++){
      if (i!==state.active[side] && state.teams[side][i].currentHp>0){
        return { type:'switch', index:i };
      }
    }
  }

  // Besten Move nach (priority, power*effectiveness) wählen
  let best = { idx: 0, score: -Infinity, prio: -99 };
  atk.moves.forEach((m, idx) => {
    const eff = typeMultiplier(m.type, def.types);
    const score = (m.power || 40) * eff + (m.priority ?? 0) * 5;
    if (m.accuracy) { // Accuracy leicht einfließen lassen
      const accFactor = m.accuracy / 100;
      const adj = score * accFactor;
      if (adj > best.score || (adj === best.score && (m.priority ?? 0) > best.prio)) {
        best = { idx, score: adj, prio: m.priority ?? 0 };
      }
    } else {
      if (score > best.score) best = { idx, score, prio: m.priority ?? 0 };
    }
  });
  return { type:'move', index: best.idx };
}

export function clientRequestSnapshot(io, socket, room){
  const snap = getRoomSnapshot(room);
  if (snap) socket.emit('state-update', snap);
}

/** payload: { room, side?: 'player1'|'player2', type:'move'|'switch', index:number } */
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
