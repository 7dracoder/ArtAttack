import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseOpeningActor,
  getElementMultiplier,
  resolveBattleTurn,
} from '../src/lib/battleSimulation';
import { parseImageDataUrl } from '../src/lib/dataUrl';
import { normalizeFighterAnalysis } from '../src/lib/fighterData';
import {
  canTakeOverGenerationClaim,
  observeGenerationClaim,
} from '../src/lib/generationLease';
import { getGamePhase } from '../src/lib/gameFlow';
import { removeConnectedLightBackground } from '../src/lib/imageData';
import {
  matchesFinishedOrResetRound,
  matchesFinishedRound,
} from '../src/lib/roomLifecycle';
import { FighterData, PlayerFightState, RoomData } from '../src/types';

test('room statuses drive every client through the full match flow', () => {
  assert.equal(getGamePhase('WAITING'), 'LOBBY');
  assert.equal(getGamePhase('DRAWING'), 'DRAWING');
  assert.equal(getGamePhase('ANALYZING'), 'ANALYZING');
  assert.equal(getGamePhase('SPRITE_GEN'), 'ANALYZING');
  assert.equal(getGamePhase('INTRO'), 'INTRO');
  assert.equal(getGamePhase('FIGHT'), 'FIGHT');
  assert.equal(getGamePhase('FINISHED'), 'FIGHT');
});

test('Forge claims expire only after an unchanged heartbeat is observed locally', () => {
  const first = observeGenerationClaim(undefined, { claimId: 'worker-a', heartbeat: 0 }, 1_000);
  assert.equal(canTakeOverGenerationClaim(first, 45_999), false);
  assert.equal(canTakeOverGenerationClaim(first, 46_000), true);

  const unchanged = observeGenerationClaim(
    first,
    { claimId: 'worker-a', heartbeat: 0 },
    30_000
  );
  assert.equal(unchanged?.observedAt, 1_000);

  const heartbeat = observeGenerationClaim(
    first,
    { claimId: 'worker-a', heartbeat: 1 },
    30_000
  );
  assert.equal(heartbeat?.observedAt, 30_000);
  assert.equal(canTakeOverGenerationClaim(heartbeat, 74_999), false);
  assert.equal(canTakeOverGenerationClaim(heartbeat, 75_000), true);
});

test('completed-round tokens keep concurrent rematch and leave actions safe', () => {
  const finishedRoom = {
    status: 'FINISHED',
    fightState: { winner: 'player1', startedAt: 123 },
  } as RoomData;
  const resetRoom = {
    status: 'DRAWING',
    fightState: null,
    lastCompletedStartedAt: 123,
  } as unknown as RoomData;
  const waitingRoom = {
    status: 'WAITING',
    fightState: null,
    lastCompletedStartedAt: 123,
  } as unknown as RoomData;

  assert.equal(matchesFinishedRound(finishedRoom, 123), true);
  assert.equal(matchesFinishedRound(finishedRoom, 999), false);
  assert.equal(matchesFinishedOrResetRound(resetRoom, 123), true);
  assert.equal(matchesFinishedOrResetRound(waitingRoom, 123), true);
  assert.equal(matchesFinishedOrResetRound(resetRoom, 999), false);
});

test('WebP drawings retain their MIME type when sent to Gemini', () => {
  assert.deepEqual(parseImageDataUrl('data:image/webp;base64,UklGRg=='), {
    mimeType: 'image/webp',
    data: 'UklGRg==',
  });
  assert.deepEqual(parseImageDataUrl('raw-png-base64'), {
    mimeType: 'image/png',
    data: 'raw-png-base64',
  });
});

test('Forge validation rejects empty output and safely normalizes model values', () => {
  assert.throws(
    () => normalizeFighterAnalysis({}, 'data:image/webp;base64,UklGRg=='),
    /incomplete fighter profile/
  );

  const fighter = normalizeFighterAnalysis(
    {
      characterName: '  Prism Knight  ',
      element: '',
      personality: '',
      stats: { hp: 999, attack: -5, defense: '12', speed: Number.NaN },
      abilities: [
        {
          id: 'same',
          name: 'Prism Cut',
          description: '',
          damage: 999,
          cooldown: 0,
          type: 'unknown',
        },
        {
          id: 'same',
          name: 'Prism Guard',
          description: 'A refracted defense.',
          damage: 20,
          cooldown: 4,
          type: 'buff',
        },
      ],
    },
    'data:image/webp;base64,UklGRg=='
  );

  assert.equal(fighter.characterName, 'Prism Knight');
  assert.equal(fighter.element, 'arcane');
  assert.equal(fighter.personality, 'adaptable wildcard');
  assert.deepEqual(fighter.stats, { hp: 150, maxHp: 150, attack: 15, defense: 12, speed: 6 });
  assert.equal(fighter.abilities.length, 3);
  assert.equal(new Set(fighter.abilities.map((ability) => ability.id)).size, 3);
  assert.equal(fighter.abilities[0].damage, 40);
  assert.equal(fighter.abilities[0].cooldown, 2);
  assert.equal(fighter.abilities[0].type, 'melee');
  assert.equal(fighter.spriteBackgroundRemoved, true);
});

function makeFighter(
  characterName: string,
  stats: { hp: number; attack: number; defense: number; speed: number },
  element = 'fire'
): FighterData {
  return {
    characterName,
    element,
    personality: 'Tactical',
    stats: { ...stats, maxHp: stats.hp },
    abilities: [
      {
        id: 'signature',
        name: `${characterName} Burst`,
        description: 'A drawing-powered signature attack.',
        damage: Math.max(10, stats.attack + 8),
        cooldown: 2,
        type: 'projectile',
      },
      {
        id: 'guard_break',
        name: 'Guard Break',
        description: 'A close-range pressure move.',
        damage: Math.max(8, stats.attack + 4),
        cooldown: 3,
        type: 'melee',
      },
    ],
    musicMood: 'arcade',
    entryDialogue: 'Ready.',
    victoryDialogue: 'Calculated.',
    environmentName: 'Sketch Grid',
    spriteUrl: 'data:image/webp;base64,UklGRg==',
  };
}

function makeFightState(
  player1: FighterData,
  player2: FighterData,
  nextActor = chooseOpeningActor(player1, player2, 'TEST')
): NonNullable<RoomData['fightState']> {
  const makeState = (hp: number, x: number, facingLeft: boolean): PlayerFightState => ({
    x,
    y: 320,
    vx: 0,
    vy: 0,
    hp,
    facingLeft,
    isGrounded: true,
    isAttacking: false,
    isBlocking: false,
    currentAction: null,
    cooldowns: {},
    updatedAt: 100,
  });

  return {
    player1: makeState(player1.stats.hp, 210, false),
    player2: makeState(player2.stats.hp, 590, true),
    turn: 0,
    nextActor,
    simulationStatus: 'FIGHTING',
    battleLog: [],
    startedAt: 100,
  };
}

test('AI battle turns are deterministic and explain their drawing-derived calculation', () => {
  const player1 = makeFighter('Emberwing', { hp: 125, attack: 28, defense: 9, speed: 8 });
  const player2 = makeFighter('Tideguard', { hp: 140, attack: 18, defense: 14, speed: 4 }, 'water');
  const initial = makeFightState(player1, player2, 'player1');

  const first = resolveBattleTurn(initial, player1, player2, 'ROOM1', 500);
  const replay = resolveBattleTurn(initial, player1, player2, 'ROOM1', 500);

  assert.deepEqual(first, replay);
  assert.equal(first.fightState.turn, 1);
  assert.equal(first.fightState.lastAction?.actor, 'player1');
  assert.equal(first.fightState.lastAction?.attackScore > 0, true);
  assert.equal(first.fightState.lastAction?.defenseScore, Math.round(player2.stats.defense * 0.58));
  assert.equal(first.fightState.lastAction?.summary.includes('Emberwing'), true);
  assert.equal(first.fightState.player2.hp <= player2.stats.hp, true);
});

test('speed controls opening initiative and buff moves heal without fake damage', () => {
  const fastFighter = makeFighter('Quick Ink', { hp: 110, attack: 18, defense: 7, speed: 9 });
  const slowFighter = makeFighter('Stone Line', { hp: 150, attack: 24, defense: 15, speed: 3 });
  assert.equal(chooseOpeningActor(fastFighter, slowFighter, 'SPEED'), 'player1');

  fastFighter.abilities = [
    {
      id: 'reset',
      name: 'Ink Renewal',
      description: 'A defensive reset.',
      damage: 30,
      cooldown: 4,
      type: 'buff',
    },
  ];
  const initial = makeFightState(fastFighter, slowFighter, 'player1');
  initial.player1.hp = 45;
  const resolution = resolveBattleTurn(initial, fastFighter, slowFighter, 'BUFF', 700);

  assert.equal(resolution.fightState.lastAction?.abilityType, 'buff');
  assert.equal(resolution.fightState.lastAction?.damage, 0);
  assert.equal((resolution.fightState.lastAction?.healing || 0) > 0, true);
  assert.equal(resolution.fightState.player2.hp, slowFighter.stats.hp);
  assert.equal(resolution.fightState.player1.hp > 45, true);
});

test('attack and defense change damage with elements and abilities held constant', () => {
  const defender = makeFighter('Control Guard', { hp: 140, attack: 18, defense: 10, speed: 5 }, 'cyber');
  const lowAttack = makeFighter('Low Power', { hp: 120, attack: 15, defense: 8, speed: 5 }, 'cyber');
  const highAttack = makeFighter('High Power', { hp: 120, attack: 30, defense: 8, speed: 5 }, 'cyber');
  lowAttack.abilities = [{ ...lowAttack.abilities[0], id: 'fixed', name: 'Fixed Move', damage: 24 }];
  highAttack.abilities = [{ ...highAttack.abilities[0], id: 'fixed', name: 'Fixed Move', damage: 24 }];

  const lowAttackResult = resolveBattleTurn(
    makeFightState(lowAttack, defender, 'player1'),
    lowAttack,
    defender,
    'COUNTERFACTUAL',
    800
  ).fightState.lastAction!;
  const highAttackResult = resolveBattleTurn(
    makeFightState(highAttack, defender, 'player1'),
    highAttack,
    defender,
    'COUNTERFACTUAL',
    800
  ).fightState.lastAction!;

  assert.equal(highAttackResult.attackScore > lowAttackResult.attackScore, true);
  assert.equal(highAttackResult.damage > lowAttackResult.damage, true);

  const highDefense = makeFighter('High Guard', { hp: 140, attack: 18, defense: 15, speed: 5 }, 'cyber');
  const highDefenseResult = resolveBattleTurn(
    makeFightState(lowAttack, highDefense, 'player1'),
    lowAttack,
    highDefense,
    'COUNTERFACTUAL',
    800
  ).fightState.lastAction!;

  assert.equal(highDefenseResult.defenseScore > lowAttackResult.defenseScore, true);
  assert.equal(highDefenseResult.damage < lowAttackResult.damage, true);
});

test('AI simulation always reaches one winner and stronger drawing stats matter', () => {
  const player1 = makeFighter('Titan Sketch', { hp: 165, attack: 34, defense: 18, speed: 10 }, 'water');
  const player2 = makeFighter('Tiny Scribble', { hp: 80, attack: 9, defense: 3, speed: 2 }, 'fire');
  let state = makeFightState(player1, player2);

  for (let index = 0; index < 30 && !state.winner; index += 1) {
    state = resolveBattleTurn(state, player1, player2, 'STAT-CHECK', 1_000 + index).fightState;
  }

  assert.equal(state.winner, 'player1');
  assert.equal(state.simulationStatus, 'COMPLETE');
  assert.equal(state.turn <= 30, true);
  assert.equal(state.battleLog.length <= 10, true);
});

test('element matchups influence the simulated damage model', () => {
  assert.equal(getElementMultiplier('water', 'fire'), 1.12);
  assert.equal(getElementMultiplier('fire', 'water'), 0.9);
  assert.equal(getElementMultiplier('cyber', 'ice'), 1);
});

test('sprite matte removal clears perimeter white but preserves enclosed white details', () => {
  const width = 5;
  const height = 5;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    pixels.set([255, 255, 255, 255], index * 4);
  }
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      pixels.set([20, 30, 40, 255], (y * width + x) * 4);
    }
  }
  pixels.set([255, 255, 255, 255], (2 * width + 2) * 4);

  removeConnectedLightBackground(pixels, width, height);

  assert.equal(pixels[3], 0);
  assert.equal(pixels[(2 * width + 2) * 4 + 3], 255);
  assert.deepEqual(
    Array.from(pixels.slice((1 * width + 1) * 4, (1 * width + 1) * 4 + 4)),
    [20, 30, 40, 255]
  );
});

test('sprite matte removal feathers an edge-connected near-white rim', () => {
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255,
    235, 235, 235, 255,
    215, 215, 215, 255,
    200, 40, 50, 255,
  ]);

  removeConnectedLightBackground(pixels, 4, 1);

  assert.equal(pixels[3], 0);
  assert.equal(pixels[7], 0);
  assert.equal(pixels[11] > 0 && pixels[11] < 255, true);
  assert.equal(pixels[15], 255);
});
