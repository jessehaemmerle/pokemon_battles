import fetch from 'node-fetch';

const rooms = new Map();           // roomId -> state
const replays = new Map();         // replayId -> { seed, log, meta, teams }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --------- RNG ----------
function rnd() { return Math.random(); }

// --------- Type Chart, Gen-Ranges ----------
const TYPE_CHART = {
  normal:{rock:0.5,ghost:0,steel:0.5}, fire:{fire:0.5,water:0.5,grass:2,ice:2,bug:2,rock:0.5,dragon:0.5,steel:2},
  water:{fire:2,water:0.5,grass:0.5,ground:2,rock:2,dragon:0.5}, electric:{water:2,electric:0.5,grass:0.5,ground:0,flying:2,dragon:0.5},
  grass:{fire:0.5,water:2,grass:0.5,poison:0.5,ground:2,flying:0.5,bug:0.5,rock:2,dragon:0.5,steel:0.5},
  ice:{fire:0.5,water:0.5,ice:0.5,ground:2,flying:2,dragon:2,grass:2,steel:0.5},
  fighting:{normal:2,ice:2,rock:2,dark:2,steel:2,poison:0.5,flying:0.5,psychic:0.5,bug:0.5,ghost:0,fairy:0.5},
  poison:{grass:2,fairy:2,poison:0.5,ground:0.5,rock:0.5,ghost:0.5,steel:0},
  ground:{fire:2,electric:2,poison:2,rock:2,steel:2,grass:0.5,bug:0.5,flying:0},
  flying:{grass:2,fighting:2,bug:2,rock:0.5,electric:0.5,steel:0.5},
  psychic:{fighting:2,poison:2,psychic:0.5,steel:0.5,dark:0},
  bug:{grass:2,psychic:2,dark:2,fighting:0.5,fire:0.5,flying:0.5,ghost:0.5,steel:0.5,fairy:0.5,poison:0.5},
  rock:{fire:2,ice:2,flying:2,bug:2,fighting:0.5,ground:0.5,steel:0.5},
  ghost:{ghost:2,psychic:2,normal:0,dark:0.5},
  dragon:{dragon:2,steel:0.5,fairy:0},
  dark:{ghost:2,psychic:2,fighting:0.5,dark:0.5,fairy:0.5},
  steel:{rock:2,ice:2,fairy:2,fire:0.5,water:0.5,electric:0.5,steel:0.5},
  fairy:{fighting:2,dragon:2,dark:2,fire:0.5,poison:0.5,steel:0.5}
};
const GEN_RANGES = {
  1:[1,151],2:[152,251],3:[252,386],4:[387,493],5:[494,649],
  6:[650,721],7:[722,809],8:[810,898],9:[899,1010]
};

// --- caches ---
const pokemonCache = new Map();
const moveCache = new Map();
async function fetchJson(url){ const r = await fetch(url); if(!r.ok) throw new Error(url); return r.json(); }
async function getPokemonByIdOrSlug(idOrSlug){
  const key = String(idOrSlug).toLowerCase();
  if(pokemonCache.has(key)) return pokemonCache.get(key);
  const d=await fetchJson(`https://pokeapi.co/api/v2/pokemon/${key}`);
  pokemonCache.set(key,d); return d;
}
async function getMoveByRef(ref){ const key = typeof ref==='string'?ref:ref.url; if(moveCache.has(key)) return moveCache.get(key); const d=await fetchJson(typeof ref==='string'?ref:ref.url); moveCache.set(key,d); return d; }

// --- helpers ---
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const stageMult = (n)=>n>=0?(2+n)/2:2/(2-n);
const grounded = (mon)=>!mon.types.includes('flying');
const typeMultiplier=(a,defs)=>defs.reduce((acc,t)=>acc*(TYPE_CHART[a]?.[t]??1),1);

function normalizeGens(gens){ if(Array.isArray(gens)&&gens.length) return gens.map(Number).filter(g=>GEN_RANGES[g]); const n=Number(gens)||1; return GEN_RANGES[n]?[n]:[1]; }
function pickRandomIdFromGens(gens){
  const ranges = normalizeGens(gens).map(g=>GEN_RANGES[g]);
  const sizes = ranges.map(([a,b])=>b-a+1);
  const total = sizes.reduce((s,x)=>s+x,0);
  let r = Math.floor(rnd()*total)+1;
  for(let i=0;i<ranges.length;i++){ if(r<=sizes[i]){ const [a,b]=ranges[i]; return Math.floor(rnd()*(b-a+1))+a; } r-=sizes[i]; }
  const [a,b]=ranges[0]; return Math.floor(rnd()*(b-a+1))+a;
}

// --- moves picking + PP ---
const KNOWN_STATUS = new Set([
  'swords-dance','growl','calm-mind','stealth-rock','spikes','toxic-spikes',
  'rain-dance','sunny-day','sandstorm','hail','electric-terrain','grassy-terrain'
]);

async function pickRealMoves(pokemonData){
  const take = async list => Promise.all(list.map(async m=>{
    try{
      const mv = await getMoveByRef(m.move);
      return {
        name: mv.name, power: mv.power, type: mv.type?.name,
        category: mv.damage_class?.name, accuracy: mv.accuracy ?? 100,
        priority: mv.priority ?? 0, ailment: mv.meta?.ailment?.name ?? null,
        ailmentChance: mv.meta?.ailment_chance ?? 0,
        pp: mv.pp ?? 10,
        statChanges: (mv.stat_changes||[]).map(sc=>({ stat:sc.stat.name, change:sc.change }))
      };
    }catch{ return null; }
  }));
  const details = (await take((pokemonData.moves||[]).slice(0,100))).filter(Boolean);
  const damaging = details.filter(m=>m.power>0 && (m.category==='physical'||m.category==='special') && m.type);
  const statusUseful = details.filter(m=>m.category==='status' && (KNOWN_STATUS.has(m.name) || m.statChanges?.length));
  const byType = new Map();
  for(const mv of damaging){ if(!byType.has(mv.type)) byType.set(mv.type,[]); byType.get(mv.type).push(mv); }
  const selected=[];
  for(const [,arr] of byType){ selected.push(arr[0]); if(selected.length>=3) break; }
  if(statusUseful.length) selected.push(statusUseful[0]);
  let i=0; while(selected.length<4 && i<damaging.length){ if(!selected.includes(damaging[i])) selected.push(damaging[i]); i++; }
  while(selected.length<4) selected.push({ name:'tackle', power:40, type:'normal', category:'physical', accuracy:95, priority:0, pp:35 });
  return selected.slice(0,4).map(m=>({ ...m, currentPP: m.pp }));
}

// --- team generation ---
const RAND_ABILITIES = ['intimidate','levitate','flash-fire','overgrow','blaze','torrent','guts'];
const RAND_ITEMS = ['leftovers','choice-scarf','focus-sash','life-orb', null];

export async function generateTeam(gens=1, size=6){
  const team=[]; const chosen=new Set();
  while(team.length<size){
    const id = pickRandomIdFromGens(gens);
    if(chosen.has(id)) continue; chosen.add(id);
    const data = await getPokemonByIdOrSlug(id);
    const types = (data.types||[]).map(t=>t.type.name);
    const stats = Object.fromEntries(data.stats.map(s=>[s.stat.name,s.base_stat]));
    const moves = await pickRealMoves(data);
    const ability = RAND_ABILITIES[Math.floor(rnd()*RAND_ABILITIES.length)];
    const item = RAND_ITEMS[Math.floor(rnd()*RAND_ITEMS.length)] || null;
    team.push({
      id:data.id, name:data.name, sprite:data.sprites.front_default, types,
      stats: { hp:stats.hp??60, attack:stats.attack??60, defense:stats.defense??60, spAttack:stats['special-attack']??60, spDefense:stats['special-defense']??60, speed:stats.speed??60 },
      currentHp: stats.hp ?? 60,
      status:null,
      stages:{ atk:0,def:0,spa:0,spd:0,spe:0,acc:0,eva:0 },
      ability, abilityState:{},
      item, choiceLock:null,
      moves
    });
  }
  return team;
}

// 🆕 Materialisiere Team aus Showdown-Lite Slots
async function materializeTeamFromLite(lite=[], gens=1){
  const team=[];
  for(const slot of (lite||[]).slice(0,6)){
    const speciesKey = String(slot?.species || '').toLowerCase().trim().replace(/\s+/g,'-');
    if(!speciesKey) continue;
    const data = await getPokemonByIdOrSlug(speciesKey);
    const types = (data.types||[]).map(t=>t.type.name);
    const stats = Object.fromEntries(data.stats.map(s=>[s.stat.name,s.base_stat]));
    // Moves: nehme gewünschte Moves, fülle fehlende mit pickRealMoves auf
    const desired = Array.isArray(slot.moves) ? slot.moves.map(m => (typeof m==='string' ? m : m?.name)).filter(Boolean) : [];
    const chosen = [];
    for(const name of desired.slice(0,4)){
      try{
        const mv = await getMoveByRef(`https://pokeapi.co/api/v2/move/${name.toLowerCase()}`);
        chosen.push({
          name: mv.name, power: mv.power, type: mv.type?.name,
          category: mv.damage_class?.name, accuracy: mv.accuracy ?? 100,
          priority: mv.priority ?? 0, ailment: mv.meta?.ailment?.name ?? null,
          ailmentChance: mv.meta?.ailment_chance ?? 0,
          pp: mv.pp ?? 10, currentPP: mv.pp ?? 10,
          statChanges: (mv.stat_changes||[]).map(sc=>({ stat:sc.stat.name, change:sc.change }))
        });
      } catch { /* ignore invalid move name */ }
    }
    if(chosen.length<4){
      const auto = await pickRealMoves(data);
      for(const mv of auto){
        if(chosen.length>=4) break;
        if(!chosen.some(x=>x.name===mv.name)) chosen.push(mv);
      }
    }
    const ability = slot.ability && RAND_ABILITIES.includes(slot.ability) ? slot.ability : (RAND_ABILITIES[Math.floor(rnd()*RAND_ABILITIES.length)]);
    const item = (slot.item && RAND_ITEMS.includes(slot.item)) ? slot.item : (RAND_ITEMS[Math.floor(rnd()*RAND_ITEMS.length)] || null);
    team.push({
      id:data.id, name:data.name, sprite:data.sprites.front_default, types,
      stats: { hp:stats.hp??60, attack:stats.attack??60, defense:stats.defense??60, spAttack:stats['special-attack']??60, spDefense:stats['special-defense']??60, speed:stats.speed??60 },
      currentHp: stats.hp ?? 60,
      status:null,
      stages:{ atk:0,def:0,spa:0,spd:0,spe:0,acc:0,eva:0 },
      ability, abilityState:{},
      item, choiceLock:null,
      moves: chosen.slice(0,4)
    });
  }
  // Falls Lite-Array leer/ungültig → fallback
  if(team.length===0) return generateTeam(gens,6);
  return team;
}

// --------- battle calc (Items/Abilities/Weather/Terrain) ----------
function calcDamage(attacker, defender, move, state){
  const level=50;
  const isPhysical = move.category==='physical';
  const atkStage = stageMult(isPhysical?attacker.stages.atk:attacker.stages.spa);
  const defStage = stageMult(isPhysical?defender.stages.def:defender.stages.spd);
  const burnedAtkMod = (isPhysical && attacker.status?.type==='burn' && attacker.ability!=='guts') ? 0.5 : 1;
  let Araw = isPhysical?attacker.stats.attack:attacker.stats.spAttack;
  let Draw = isPhysical?defender.stats.defense:defender.stats.spDefense;

  const lowHp = attacker.currentHp <= attacker.stats.hp/3;
  let stabAbilityBoost=1;
  if(lowHp){
    if(attacker.ability==='overgrow'&&move.type==='grass') stabAbilityBoost=1.5;
    if(attacker.ability==='blaze'&&move.type==='fire')   stabAbilityBoost=1.5;
    if(attacker.ability==='torrent'&&move.type==='water')stabAbilityBoost=1.5;
  }
  if(attacker.ability==='guts' && attacker.status?.type){ if(isPhysical) Araw=Math.floor(Araw*1.5); }

  let A=Math.max(1,Math.floor(Araw*atkStage*burnedAtkMod));
  let D=Math.max(1,Math.floor(Draw*defStage));

  let stab = attacker.types.includes(move.type)?1.5:1;
  stab*=stabAbilityBoost;

  const w = state.field.weather?.type;
  if(w==='rain'){ if(move.type==='water') stab*=1.5; if(move.type==='fire') stab*=0.5; }
  else if(w==='sun'){ if(move.type==='fire') stab*=1.5; if(move.type==='water') stab*=0.5; }

  const t = state.field.terrain?.type;
  if(grounded(attacker)){ if(t==='electric' && move.type==='electric') stab*=1.3; if(t==='grassy'&&move.type==='grass') stab*=1.3; }
  if(attacker.ability==='flash-fire' && attacker.abilityState?.flashFireBoost && move.type==='fire') stab*=1.5;

  let eff = typeMultiplier(move.type, defender.types);
  if(defender.ability==='levitate' && move.type==='ground') eff=0;

  const rand = 0.85 + rnd()*0.15;
  const crit = (rnd() < 1/24) ? 1.5 : 1;

  let post=1; if(attacker.item==='life-orb') post*=1.3;

  const dmg = Math.floor(((((2*level)/5+2)*(move.power||40)*(A/Math.max(1,D)))/50 + 2)*stab*eff*rand*crit*post);
  return { dmg: Math.max(1,dmg), eff, crit: crit>1 };
}

// --------- state helpers ---------
function aliveMons(team){ return team.filter(p=>p.currentHp>0); }
function checkBattleEnd(state){
  const a = aliveMons(state.teams.player1).length>0;
  const b = aliveMons(state.teams.player2).length>0;
  if(!a || !b){ state.over=true; state.winner=a?'player1':'player2'; return true; }
  return false;
}
function toggleTurn(state){ state.turnOwner = state.turnOwner==='player1'?'player2':'player1'; }

// --------- Hazards/Abilities on switch-in ---------
function onSwitchIn(state, side){
  const opp = side==='player1'?'player2':'player1';
  const mon = state.teams[side][state.active[side]];
  mon.choiceLock = null;

  const sc = state.sideConditions[side]||{};
  if(sc.stealthRock){
    const eff = typeMultiplier('rock', mon.types);
    const dmg = Math.max(1, Math.floor(mon.stats.hp*0.125*eff));
    mon.currentHp = Math.max(0, mon.currentHp - dmg);
  }
  if(sc.spikes && grounded(mon)){
    const layer = clamp(sc.spikes,1,3);
    const pct = layer===1?0.125:layer===2?0.167:0.25;
    const dmg = Math.max(1, Math.floor(mon.stats.hp*pct));
    mon.currentHp = Math.max(0, mon.currentHp - dmg);
  }
  if(sc.toxicSpikes && grounded(mon)){
    const layers = clamp(sc.toxicSpikes,1,2);
    const isPoison = mon.types.includes('poison');
    const isSteel = mon.types.includes('steel');
    if(isPoison){ state.sideConditions[side].toxicSpikes=0; }
    else if(!isSteel && !mon.types.includes('flying') && !mon.status?.type){
      mon.status = layers>=2 ? { type:'toxic', toxicCounter:1 } : { type:'poison' };
    }
  }
  if(mon.ability==='intimidate'){
    const om = state.teams[opp][state.active[opp]];
    om.stages.atk = clamp(om.stages.atk-1, -6, 6);
  }
}

// --------- Field setters ---------
function setWeather(state, type, turns=5){ state.field.weather={ type, turns }; }
function setTerrain(state, type, turns=5){ state.field.terrain={ type, turns }; }
function addHazard(state, side, kind, amount=1, max=3){
  const sc = state.sideConditions[side]; if(!sc[kind]) sc[kind]=0;
  sc[kind]=clamp(sc[kind]+amount,0,max);
}

// --------- End-of-turn pipeline ---------
function endOfTurn(state, io, room){
  // Terrain heal
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon || mon.currentHp<=0) continue;
    if(state.field.terrain?.type==='grassy' && grounded(mon)){
      const heal = Math.max(1, Math.floor(mon.stats.hp*0.0625));
      mon.currentHp = clamp(mon.currentHp+heal,0,mon.stats.hp);
      io.to(room).emit('status-heal', { side, type:'grassy', heal });
    }
  }
  // Leftovers
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon || mon.currentHp<=0) continue;
    if(mon.item==='leftovers'){
      const heal = Math.max(1, Math.floor(mon.stats.hp*0.0625));
      mon.currentHp = Math.min(mon.stats.hp, mon.currentHp+heal);
      io.to(room).emit('item-heal', { side, item:'leftovers', heal });
    }
  }
  // Poison/Toxic
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon || mon.currentHp<=0) continue;
    if(mon.status?.type==='poison'){
      const dmg = Math.max(1, Math.floor(mon.stats.hp*0.125));
      mon.currentHp = Math.max(0, mon.currentHp-dmg);
      io.to(room).emit('status-tick', { side, type:'poison', damage:dmg });
    } else if(mon.status?.type==='toxic'){
      mon.status.toxicCounter = (mon.status.toxicCounter||1)+1;
      const pct = 0.0625 * mon.status.toxicCounter;
      const dmg = Math.max(1, Math.floor(mon.stats.hp*Math.min(pct,0.9375)));
      mon.currentHp = Math.max(0, mon.currentHp-dmg);
      io.to(room).emit('status-tick', { side, type:'toxic', damage:dmg, stacks: mon.status.toxicCounter });
    }
  }
  // Burn
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon || mon.currentHp<=0) continue;
    if(mon.status?.type==='burn'){
      const dmg = Math.max(1, Math.floor(mon.stats.hp*0.0625));
      mon.currentHp = Math.max(0, mon.currentHp-dmg);
      io.to(room).emit('status-tick', { side, type:'burn', damage:dmg });
    }
  }
  // Weather chip
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon || mon.currentHp<=0) continue;
    const w=state.field.weather?.type;
    if(w==='sand'){
      const immune = mon.types.some(t=>['rock','ground','steel'].includes(t));
      if(!immune){ const dmg=Math.max(1,Math.floor(mon.stats.hp*0.0625)); mon.currentHp=Math.max(0,mon.currentHp-dmg); io.to(room).emit('weather-chip',{ side,type:'sand',damage:dmg }); }
    } else if(w==='hail'){
      const immune = mon.types.includes('ice');
      if(!immune){ const dmg=Math.max(1,Math.floor(mon.stats.hp*0.0625)); mon.currentHp=Math.max(0,mon.currentHp-dmg); io.to(room).emit('weather-chip',{ side,type:'hail',damage:dmg }); }
    }
  }
  // Sleep decrement
  for(const side of ['player1','player2']){
    const mon = state.teams[side][state.active[side]];
    if(!mon?.status) continue;
    if(mon.status.type==='sleep'){
      mon.status.turnsLeft = Math.max(0,(mon.status.turnsLeft||0)-1);
      if(mon.status.turnsLeft===0) mon.status=null;
    }
  }
  // Weather/Terrain duration
  if(state.field.weather?.type){ state.field.weather.turns -= 1; if(state.field.weather.turns<=0) state.field.weather={ type:null, turns:0 }; }
  if(state.field.terrain?.type){ state.field.terrain.turns -= 1; if(state.field.terrain.turns<=0) state.field.terrain={ type:null, turns:0 }; }
}

// --------- Logging / Replay ----------
function logEvent(state, ev){ state.eventLog.push({ t: Date.now(), ...ev }); }
function finalizeReplay(state){
  const id = `${state.room}-${Math.random().toString(36).slice(2,8)}`;
  replays.set(id, {
    id,
    seed: state.seed || null,
    log: state.eventLog,
    meta: { winner: state.winner, startedAt: state.startedAt, endedAt: Date.now(), gens: state.gens },
    teams: state.teams
  });
  return id;
}
export function getReplay(id){ return replays.get(id) || null; }

// --------- Timer ----------
function clearTurnTimer(state){
  if(state.turnTimer?.id){ clearTimeout(state.turnTimer.id); state.turnTimer.id=null; }
}
function startTurnTimer(io, room){
  const state = rooms.get(room); if(!state || state.over) return;
  clearTurnTimer(state);
  state.turnTimer = { seconds: state.turnTimer?.duration || 60, duration: state.turnTimer?.duration || 60, id: null };
  // simple countdown tick to clients
  const tick = () => {
    if(state.over) return clearTurnTimer(state);
    state.turnTimer.seconds -= 1;
    io.to(room).emit('timer', { seconds: state.turnTimer.seconds, turnOwner: state.turnOwner });
    if(state.turnTimer.seconds <= 0){
      clearTurnTimer(state);
      // Auto-Move bei Timeout: wähle ersten verfügbaren Move (mit PP) oder Struggle
      autoTimeoutMove(io, room, state.turnOwner);
    } else {
      state.turnTimer.id = setTimeout(tick, 1000);
    }
  };
  io.to(room).emit('timer', { seconds: state.turnTimer.seconds, turnOwner: state.turnOwner });
  state.turnTimer.id = setTimeout(tick, 1000);
}

// --------- Core Turn Engine ----------
async function executeAction(io, room, side, action){
  const state = rooms.get(room); if(!state || state.over) return;
  const opp = side==='player1'?'player2':'player1';
  const atkMon = state.teams[side][state.active[side]];
  if(atkMon.currentHp<=0) return;
  clearTurnTimer(state);

  state.phase='acting';
  io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });
  logEvent(state, { type:'phase', phase:'acting' });

  // Sleep skip
  if(atkMon.status?.type==='sleep'){
    io.to(room).emit('message', `💤 ${atkMon.name} schläft und kann nicht angreifen.`);
    logEvent(state, { type:'sleep-skip', side });
    await sleep(300);
  }
  // Freeze 20% thaw
  else if(atkMon.status?.type==='freeze'){
    if(rnd()<0.2){ atkMon.status=null; io.to(room).emit('message', `❄️ ${atkMon.name} taut auf!`); logEvent(state,{ type:'thaw', side }); await sleep(250); }
    else { io.to(room).emit('message', `❄️ ${atkMon.name} ist eingefroren und kann sich nicht bewegen.`); logEvent(state,{ type:'freeze-skip', side }); await sleep(300); }
  }

  if(action.type==='switch'){
    const to=action.index, team=state.teams[side];
    if(to>=0 && to<team.length && team[to].currentHp>0 && to!==state.active[side]){
      state.active[side]=to; onSwitchIn(state, side);
      io.to(room).emit('switch-ok', { side, toIndex: to });
      io.to(room).emit('message', `🔄 ${side} wechselt zu ${team[to].name}.`);
      logEvent(state, { type:'switch', side, to });
      await sleep(300);
    }
  } else if(action.type==='move'){
    // Choice Scarf Lock
    if(atkMon.item==='choice-scarf'){
      if(atkMon.choiceLock && atkMon.moves[action.index]?.name !== atkMon.choiceLock){
        io.to(room).emit('error-message','Choice-Lock aktiv.');
        state.phase='select'; io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner }); startTurnTimer(io, room);
        return;
      }
      if(!atkMon.choiceLock) atkMon.choiceLock = atkMon.moves[action.index]?.name || null;
    }

    const defender = state.teams[opp][state.active[opp]];
    const mv = atkMon.moves[action.index];

    // PP Check / Struggle
    if(mv && mv.currentPP<=0){
      io.to(room).emit('error-message','Keine PP!'); // Client blockt meist schon
      state.phase='select'; io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner }); startTurnTimer(io, room);
      return;
    }

    // Paralysis: 25% full para
    if(atkMon.status?.type==='paralysis' && rnd()<0.25){
      io.to(room).emit('message', `⚡ ${atkMon.name} ist paralysiert und kann sich nicht bewegen!`);
      logEvent(state, { type:'full-para', side });
      await sleep(250);
    } else if(mv?.category==='status'){
      // Named utility (stages, hazards, weather/terrain)
      const name = mv.name;
      if(name==='swords-dance'){ atkMon.stages.atk = clamp(atkMon.stages.atk+2,-6,6); io.to(room).emit('message',`🗡️ ${atkMon.name}s Angriff steigt stark!`); }
      else if(name==='growl'){ defender.stages.atk = clamp(defender.stages.atk-1,-6,6); io.to(room).emit('message',`📢 Angriff von ${defender.name} sinkt!`); }
      else if(name==='calm-mind'){ atkMon.stages.spa=clamp(atkMon.stages.spa+1,-6,6); atkMon.stages.spd=clamp(atkMon.stages.spd+1,-6,6); io.to(room).emit('message','🧠 Konzentration! SpA/SpD steigen.'); }
      else if(name==='stealth-rock'){ addHazard(state, opp, 'stealthRock', 1, 1); io.to(room).emit('message','🪨 Tarnsteine liegen.'); }
      else if(name==='spikes'){ addHazard(state, opp, 'spikes', 1, 3); io.to(room).emit('message','🧷 Stachler liegen.'); }
      else if(name==='toxic-spikes'){ addHazard(state, opp, 'toxicSpikes', 1, 2); io.to(room).emit('message','☠️ Giftspitzen liegen.'); }
      else if(name==='rain-dance'){ setWeather(state, 'rain', 5); io.to(room).emit('message','🌧️ Es begann zu regnen!'); }
      else if(name==='sunny-day'){ setWeather(state, 'sun', 5); io.to(room).emit('message','☀️ Die Sonne brennt!'); }
      else if(name==='sandstorm'){ setWeather(state, 'sand', 5); io.to(room).emit('message','🌪️ Sandsturm wütet!'); }
      else if(name==='hail'){ setWeather(state, 'hail', 5); io.to(room).emit('message','🌨️ Hagel setzt ein!'); }
      else if(name==='electric-terrain'){ setTerrain(state,'electric',5); io.to(room).emit('message','⚡ Elektrofeld!'); }
      else if(name==='grassy-terrain'){ setTerrain(state,'grassy',5); io.to(room).emit('message','🌿 Grasfeld!'); }
      mv.currentPP = Math.max(0, (mv.currentPP ?? mv.pp ?? 0) - 1);
      logEvent(state, { type:'move-status', side, name });
      await sleep(250);
    } else {
      // Wenn kein Move (z.B. alle PP 0) -> Struggle
      let usingStruggle = false;
      let moveToUse = mv;
      if(!moveToUse){
        usingStruggle = true;
      } else {
        // Accuracy mit Stages
        const acc = (mv.accuracy ?? 100) * (stageMult(atkMon.stages.acc)/stageMult(defender.stages.eva));
        // Ability Imms
        if(defender.ability==='flash-fire' && mv.type==='fire'){
          defender.abilityState.flashFireBoost = true; io.to(room).emit('message',`🔥 ${defender.name} absorbiert Feuer!`); logEvent(state,{ type:'flash-fire', target: 'defender' });
          moveToUse = null;
        } else if(defender.ability==='levitate' && mv.type==='ground'){
          io.to(room).emit('message',`🌀 ${defender.name} ist immun gegen Boden!`); logEvent(state,{ type:'levitate-immune' });
          moveToUse = null;
        } else if(rnd()*100 > acc){
          io.to(room).emit('move-missed', { side, move: mv.name, target: opp }); logEvent(state,{ type:'miss', side, name: mv.name });
          moveToUse = null;
        }
      }

      if(!moveToUse){
        // keine Wirkung / Miss → kein Schaden, PP nur verbrauchen wenn Move existiert
        if(mv) mv.currentPP = Math.max(0, (mv.currentPP ?? mv.pp ?? 0) - 1);
        await sleep(250);
      } else if(usingStruggle || (mv && mv.power>0)){
        // Struggle-Ersatz falls benötigt
        const use = usingStruggle ? { name:'struggle', power:50, type:'normal', category:'physical', accuracy:100, priority:0 } : mv;

        // PP -1
        if(!usingStruggle) use.currentPP = Math.max(0, (use.currentPP ?? use.pp ?? 0) - 1);

        const result = calcDamage(atkMon, defender, use, state);
        let dmg = result.dmg;

        // Focus Sash
        if(defender.item==='focus-sash' && defender.currentHp===defender.stats.hp && dmg>=defender.currentHp){
          dmg = defender.currentHp - 1; defender.item = null;
          io.to(room).emit('message',`🎗️ Focus Sash rettet ${defender.name}!`);
        }

        defender.currentHp = Math.max(0, defender.currentHp - dmg);
        io.to(room).emit('move-made', { side, move: use.name, damage: dmg, target: opp, effectiveness: result.eff, crit: result.crit, stab: 1 });
        logEvent(state, { type:'move', side, name: use.name, dmg });

        await sleep(320);

        // Ailments Chance
        if(mv && mv.ailment){
          const terrainBlocksSleep = state.field.terrain?.type==='electric' && grounded(defender);
          if(!defender.status?.type && rnd()*100 < (mv.ailmentChance||0)){
            const map={ burn:'burn', paralysis:'paralysis', poison:'poison', sleep:'sleep', freeze:'freeze' };
            const n = map[mv.ailment];
            if(!(n==='sleep' && terrainBlocksSleep) && n){
              defender.status = n==='sleep' ? { type:'sleep', turnsLeft: Math.floor(rnd()*3)+1 } : { type:n };
              io.to(room).emit('status-applied', { target: opp, type: defender.status.type });
              logEvent(state, { type:'status', target: opp, status: defender.status.type });
              await sleep(200);
            }
          }
        }

        // Life Orb recoil
        if(atkMon.item==='life-orb'){
          const recoil = Math.max(1, Math.floor(atkMon.stats.hp*0.1));
          atkMon.currentHp = Math.max(0, atkMon.currentHp - recoil);
          io.to(room).emit('message',`🩸 ${atkMon.name} erleidet Life Orb Rückstoß (${recoil}).`);
        }

        // Struggle recoil 25% max HP
        if(usingStruggle){
          const r = Math.max(1, Math.floor(atkMon.stats.hp*0.25));
          atkMon.currentHp = Math.max(0, atkMon.currentHp - r);
          io.to(room).emit('message',`😣 Rückstoß durch Struggle (${r}).`);
        }

        // KO / Auto-Switch
        if(defender.currentHp===0){
          io.to(room).emit('pokemon-fainted', { fainted: defender.name, target: opp }); logEvent(state,{ type:'ko', target: opp });
          await sleep(250);
          const switched = autoSwitchIfNeeded(state, opp);
          if(switched!==null){
            io.to(room).emit('switch-ok', { side: opp, toIndex: switched });
            io.to(room).emit('message',`⚠️ ${opp} sendet ${state.teams[opp][switched].name}!`);
          } else if(checkBattleEnd(state)){
            const repId = finalizeReplay(state);
            io.to(room).emit('battle-end', { winner: state.winner, replayId: repId });
            logEvent(state,{ type:'end', winner: state.winner, replayId: repId });
            return;
          }
        }
      }
    }
  }

  // End-of-Turn
  endOfTurn(state, io, room);
  if(checkBattleEnd(state)){
    const repId = finalizeReplay(state);
    io.to(room).emit('battle-end', { winner: state.winner, replayId: repId });
    logEvent(state,{ type:'end', winner: state.winner, replayId: repId });
    return;
  }

  io.to(room).emit('turn-end', {}); logEvent(state,{ type:'turn-end' });
  state.phase='select'; toggleTurn(state);
  io.to(room).emit('turn-state', { phase: state.phase, turnOwner: state.turnOwner });
  io.to(room).emit('state-update', getRoomSnapshot(room));
  startTurnTimer(io, room);

  // Bot
  if(state.mode==='bot' && state.turnOwner==='player2' && !state.over){
    await sleep(350);
    const bot = decideBotAction(state);
    await executeAction(io, room, 'player2', bot);
  }
}

function autoSwitchIfNeeded(state, side){
  const team=state.teams[side]; const idx=state.active[side];
  if(team[idx].currentHp>0) return null;
  for(let i=0;i<team.length;i++){ if(team[i].currentHp>0){ state.active[side]=i; onSwitchIn(state, side); return i; } }
  return null;
}

function decideBotAction(state){
  const side='player2', opp='player1';
  const atk=state.teams[side][state.active[side]], def=state.teams[opp][state.active[opp]];
  if(atk.currentHp/atk.stats.hp<0.3 && rnd()<0.2){
    for(let i=0;i<state.teams[side].length;i++){ if(i!==state.active[side] && state.teams[side][i].currentHp>0) return { type:'switch', index:i }; }
  }
  let best=0,bestScore=-1e9;
  atk.moves.forEach((m,i)=>{
    let sc=0;
    if(m.category==='status'){
      sc=15; if(m.name==='swords-dance') sc+=10; if(m.name==='stealth-rock'||m.name==='spikes'||m.name==='toxic-spikes') sc+=14; if(m.name==='calm-mind') sc+=8;
    } else {
      const eff = typeMultiplier(m.type, def.types);
      sc = (m.power||40)*eff + (m.accuracy||100)/10 + (m.priority||0)*5;
    }
    if((m.currentPP??0)<=0) sc -= 999;
    if(sc>bestScore){ bestScore=sc; best=i; }
  });
  // Wenn alles 0 PP → Struggle (move index -1)
  if(atk.moves.every(m=>(m.currentPP??0)<=0)) return { type:'move', index: -1 };
  return { type:'move', index: best };
}

// --------- Public API ----------
export function getRoomSnapshot(room){
  const s=rooms.get(room); if(!s) return null;
  return {
    room: s.room, gens: s.gens, phase:s.phase, teams:s.teams, active:s.active,
    over:!!s.over, winner:s.winner??null, turnOwner:s.turnOwner,
    field: s.field, sideConditions: s.sideConditions,
    timer: { seconds: s.turnTimer?.seconds ?? null }
  };
}

export async function startPvpQuickMatch(io, socket, gens=1, customTeamLite=null){
  const room=`pvp-${socket.id}-${Math.random().toString(36).slice(2,8)}`;
  const p1 = customTeamLite ? await materializeTeamFromLite(customTeamLite, gens) : await generateTeam(gens,6);
  const p2 = await generateTeam(gens,6);
  const state = {
    room, gens: normalizeGens(gens), mode:'pvp',
    teams:{ player1:p1, player2:p2 }, active:{ player1:0, player2:0 },
    over:false, winner:null, phase:'select', turnOwner:'player1',
    field:{ weather:{ type:null, turns:0 }, terrain:{ type:null, turns:0 } },
    sideConditions:{ player1:{}, player2:{} },
    eventLog:[], startedAt: Date.now(),
    turnTimer: { seconds:60, duration:60, id:null }
  };
  rooms.set(room, state);
  socket.join(room);
  onSwitchIn(state,'player1'); onSwitchIn(state,'player2');
  io.to(room).emit('battle-start', getRoomSnapshot(room));
  startTurnTimer(io, room);
}

export async function startBotBattle(io, socket, gens=1, customTeamLite=null){
  const room=`bot-${socket.id}`;
  const p1 = customTeamLite ? await materializeTeamFromLite(customTeamLite, gens) : await generateTeam(gens,6);
  const p2 = await generateTeam(gens,6);
  const state = {
    room, gens: normalizeGens(gens), mode:'bot',
    teams:{ player1:p1, player2:p2 }, active:{ player1:0, player2:0 },
    over:false, winner:null, phase:'select', turnOwner:'player1',
    field:{ weather:{ type:null, turns:0 }, terrain:{ type:null, turns:0 } },
    sideConditions:{ player1:{}, player2:{} },
    eventLog:[], startedAt: Date.now(),
    turnTimer: { seconds:60, duration:60, id:null }
  };
  rooms.set(room, state);
  socket.join(room);
  onSwitchIn(state,'player1'); onSwitchIn(state,'player2');
  io.to(room).emit('battle-start', getRoomSnapshot(room));
  startTurnTimer(io, room);
}

export function clientRequestSnapshot(io, socket, room){
  const snap=getRoomSnapshot(room); if(snap) socket.emit('state-update', snap);
}

export async function clientLockAction(io, socket, payload){
  const { room, side='player1', type, index } = payload||{};
  const state=rooms.get(room); if(!state||state.over) return;
  if(state.phase!=='select'){ io.to(room).emit('error-message','Nur in Auswahlphase.'); return; }
  if(state.turnOwner!==side){ io.to(room).emit('error-message','Nicht dein Zug.'); return; }
  if(type==='switch'){
    const t=state.teams[side]; if(index<0||index>=t.length) return io.to(room).emit('error-message','Ungültiger Wechselindex.');
    if(t[index].currentHp<=0) return io.to(room).emit('error-message','Pokémon ist kampfunfähig.');
    if(state.active[side]===index) return io.to(room).emit('error-message','Bereits aktiv.');
    await executeAction(io, room, side, { type:'switch', index });
  } else if(type==='move'){
    await executeAction(io, room, side, { type:'move', index });
  } else io.to(room).emit('error-message','Unbekannte Aktion.');
}

// manuelles Forfeit
export function clientForfeit(io, room, side){
  const state=rooms.get(room); if(!state||state.over) return;
  state.over=true; state.winner = side==='player1' ? 'player2' : 'player1';
  const repId = finalizeReplay(state);
  io.to(room).emit('battle-end', { winner: state.winner, replayId: repId, forfeit: side });
}

// Rematch (gleiche Gens, neue Teams)
export async function clientRematch(io, room){
  const old=rooms.get(room); if(!old) return;
  const gens = old.gens;
  // reset with fresh teams (Custom-Team wird hier NICHT automatisch erneut verwendet)
  const p1=await generateTeam(gens,6), p2=await generateTeam(gens,6);
  const state = {
    room, gens, mode: old.mode, teams:{ player1:p1, player2:p2 }, active:{ player1:0, player2:0 },
    over:false, winner:null, phase:'select', turnOwner:'player1',
    field:{ weather:{ type:null, turns:0 }, terrain:{ type:null, turns:0 } },
    sideConditions:{ player1:{}, player2:{} },
    eventLog:[], startedAt: Date.now(),
    turnTimer: { seconds:60, duration:60, id:null }
  };
  rooms.set(room, state);
  onSwitchIn(state,'player1'); onSwitchIn(state,'player2');
  io.to(room).emit('battle-start', getRoomSnapshot(room));
  startTurnTimer(io, room);
}

// Spectator
export function addSpectator(io, socket, room){
  const state=rooms.get(room); if(!state) return socket.emit('error-message','Room existiert nicht');
  socket.join(room);
  socket.emit('state-update', getRoomSnapshot(room));
  socket.emit('message', '👀 Du schaust zu (Spectator).');
}

// Timeout: Auto-Action (Move oder Struggle)
function autoTimeoutMove(io, room, side){
  const state=rooms.get(room); if(!state||state.over) return;
  const atk = state.teams[side][state.active[side]];
  let idx = atk.moves.findIndex(m=>(m.currentPP??0)>0);
  if(idx<0) idx = -1; // Struggle
  executeAction(io, room, side, { type:'move', index: idx });
}

// ---------- Team Import/Export (Showdown-Lite) + Legality ----------
export function parseShowdownLite(text=''){
  // Sehr simple Heuristik: Zeilen mit Namen + "@" Item, darunter bis zu 4 Moves mit "- "
  // Abilities optional via "Ability: X"
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const team=[]; let current=null;
  for(const ln of lines){
    if(ln.startsWith('- ')){
      const mv = ln.slice(2).toLowerCase().replace(/\s+/g,'-');
      if(current && current.moves.length<4) current.moves.push({ name: mv });
      continue;
    }
    if(/^ability:/i.test(ln)){
      const ab = ln.split(':')[1].trim().toLowerCase().replace(/\s+/g,'-');
      if(current) current.ability = ab;
      continue;
    }
    if(ln.includes('@')){
      const [name, item] = ln.split('@').map(s=>s.trim());
      if(current) team.push(current);
      current = { species: name.toLowerCase(), item: item.toLowerCase().replace(/\s+/g,'-'), ability:null, moves:[] };
    } else {
      // neue Zeile ohne @ -> neuer Slot (ohne Item)
      if(current) team.push(current);
      current = { species: ln.toLowerCase(), item:null, ability:null, moves:[] };
    }
  }
  if(current) team.push(current);
  if(team.length===0) throw new Error('Kein Team erkannt.');
  return team.slice(0,6);
}

export function exportShowdownLite(team=[]){
  return (team||[]).map(slot=>{
    const name = (slot.species||'pokemon').replace(/-/g,' ');
    const item = slot.item ? ` @ ${slot.item.replace(/-/g,' ')}` : '';
    const ability = slot.ability ? `\nAbility: ${slot.ability.replace(/-/g,' ')}` : '';
    const moves = (slot.moves||[]).slice(0,4).map(m=>`- ${m.name?.replace(/-/g,' ')}`).join('\n');
    return `${name}${item}${ability}${moves?'\n'+moves:''}`;
  }).join('\n\n');
}

export function checkTeamLegality(team, gens){
  const gset = new Set(normalizeGens(gens));
  const [min,max] = [...gset].reduce((acc,g)=>[Math.min(acc[0],GEN_RANGES[g][0]), Math.max(acc[1],GEN_RANGES[g][1])],[99999,0]);
  const abilities = new Set(['intimidate','levitate','flash-fire','overgrow','blaze','torrent','guts']);
  const items = new Set(['leftovers','choice-scarf','focus-sash','life-orb', null]);
  if(!Array.isArray(team) || team.length===0 || team.length>6) return false;
  for(const s of team){
    if(!s?.species) return false;
    if(s.ability && !abilities.has(s.ability)) return false;
    if(s.item && !items.has(s.item)) return false;
    if(!Array.isArray(s.moves) || s.moves.length>4) return false;
  }
  return true;
}
