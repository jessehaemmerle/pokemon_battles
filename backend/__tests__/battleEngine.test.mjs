import { expect, test } from 'vitest';
import battleEngine from '../battles.js';

const {
  createRoom,
  lockAction,
  resolveTurn,
  startCustomPvp
} = battleEngine;

function makeMove(name, overrides = {}) {
  return {
    name,
    type: 'normal',
    power: 40,
    accuracy: 100,
    pp: 35,
    currentPP: 35,
    category: 'physical',
    priority: 0,
    target: 'selected-pokemon',
    stat_changes: [],
    meta: {},
    flags: [],
    ...overrides
  };
}

function makePokemon(name, overrides = {}) {
  const maxHp = overrides.maxHp || 120;
  return {
    id: overrides.id || 1,
    name,
    types: overrides.types || ['normal'],
    stats: {
      hp: maxHp,
      atk: 80,
      def: 80,
      spa: 80,
      spd: 80,
      spe: overrides.speed || 50
    },
    level: 50,
    moves: overrides.moves || [makeMove('tackle')],
    ability: overrides.ability || 'overgrow',
    item: overrides.item || null,
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

test('resolveTurn advances a simple battle without syntax/runtime errors', () => {
  const p1Move = makeMove('quick-attack', { priority: 1 });
  const p2Move = makeMove('tackle');
  const room = createRoom(
    [1],
    'Player 1',
    'Player 2',
    [makePokemon('eevee', { moves: [p1Move], speed: 40 })],
    [makePokemon('snorlax', { moves: [p2Move], speed: 30 })]
  );

  lockAction(room, 'p1', { type: 'move', index: 0, move: p1Move });
  lockAction(room, 'p2', { type: 'move', index: 0, move: p2Move });

  const events = resolveTurn(room);

  expect(room.turn).toBe(2);
  expect(events.some((event) => event.type === 'move-made')).toBe(true);
  expect(room.actions).toEqual({});
});

test('startCustomPvp uses both supplied custom teams', async () => {
  const p1 = [makePokemon('pikachu')];
  const p2 = [makePokemon('raichu')];

  const room = await startCustomPvp([1], p1, p2);

  expect(room.sides.p1.team[0].name).toBe('pikachu');
  expect(room.sides.p2.team[0].name).toBe('raichu');
});
