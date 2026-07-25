import {
  Ability,
  BattleAction,
  FighterData,
  PlayerFightState,
  PlayerId,
  RoomData,
} from '../types';

type FightState = NonNullable<RoomData['fightState']>;

export interface BattleTurnResolution {
  fightState: FightState;
  winner?: PlayerId;
}

interface SelectedMove {
  id: string;
  name: string;
  damage: number;
  cooldown: number;
  type: Ability['type'] | 'basic';
}

const MAX_BATTLE_TURNS = 30;
const LOG_LIMIT = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(safeNumber(value, fallback), min, max);
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  return hashText(seed) / 0x100000000;
}

function getElementKey(element: string): string {
  const normalized = element.toLowerCase();
  const knownElements = [
    'fire',
    'water',
    'lightning',
    'nature',
    'earth',
    'ice',
    'light',
    'shadow',
    'cyber',
    'wind',
  ];
  return knownElements.find((known) => normalized.includes(known)) || normalized.trim() || 'neutral';
}

const ELEMENT_ADVANTAGES: Record<string, string[]> = {
  fire: ['nature', 'ice'],
  water: ['fire'],
  lightning: ['water', 'cyber'],
  nature: ['water', 'lightning', 'earth'],
  earth: ['lightning', 'fire'],
  ice: ['nature', 'wind'],
  wind: ['earth', 'fire'],
  light: ['shadow'],
  shadow: ['light', 'cyber'],
  cyber: ['nature', 'wind'],
};

export function getElementMultiplier(attackerElement: string, defenderElement: string): number {
  const attacker = getElementKey(attackerElement);
  const defender = getElementKey(defenderElement);

  if (ELEMENT_ADVANTAGES[attacker]?.includes(defender)) return 1.12;
  if (ELEMENT_ADVANTAGES[defender]?.includes(attacker)) return 0.9;
  return 1;
}

export function getCombatRating(fighter: FighterData): number {
  const abilities = Array.isArray(fighter.abilities) ? fighter.abilities : [];
  const averageAbilityDamage = abilities.length
    ? abilities.reduce(
        (total, ability) => total + boundedNumber(ability.damage, 12, 1, 100),
        0
      ) / abilities.length
    : 12;

  return Math.round(
    boundedNumber(fighter.stats?.hp, 100, 40, 300) * 0.18 +
      boundedNumber(fighter.stats?.attack, 18, 1, 80) * 2 +
      boundedNumber(fighter.stats?.defense, 8, 0, 50) * 1.6 +
      boundedNumber(fighter.stats?.speed, 5, 1, 25) * 2.2 +
      averageAbilityDamage * 0.8
  );
}

export function chooseOpeningActor(
  player1: FighterData,
  player2: FighterData,
  seed: string
): PlayerId {
  const player1Speed = boundedNumber(player1.stats?.speed, 5, 1, 25);
  const player2Speed = boundedNumber(player2.stats?.speed, 5, 1, 25);
  if (player1Speed !== player2Speed) {
    return player1Speed > player2Speed ? 'player1' : 'player2';
  }

  const player1Rating = getCombatRating(player1);
  const player2Rating = getCombatRating(player2);
  if (player1Rating !== player2Rating) {
    return player1Rating > player2Rating ? 'player1' : 'player2';
  }

  return seededUnit(`${seed}:opening`) >= 0.5 ? 'player1' : 'player2';
}

function selectMove(
  fighter: FighterData,
  actor: PlayerId,
  fightState: FightState,
  seed: string
): SelectedMove {
  const abilities = Array.isArray(fighter.abilities) ? fighter.abilities : [];
  const actorHistory = (fightState.battleLog || []).filter((action) => action.actor === actor);
  const currentHp = fightState[actor].hp;
  const maxHp = boundedNumber(fighter.stats?.maxHp || fighter.stats?.hp, 100, 40, 300);
  const available = abilities.filter((ability, index) => {
    const abilityId = ability.id || `ability_${index}`;
    const lastUseIndex = actorHistory.map((action) => action.abilityId).lastIndexOf(abilityId);
    if (lastUseIndex < 0) return true;

    const actionsSinceUse = actorHistory.length - lastUseIndex - 1;
    const cooldownActions = Math.max(1, Math.ceil(safeNumber(ability.cooldown, 2) / 2));
    return actionsSinceUse >= cooldownActions;
  });

  const attackMoves = available.filter((ability) => ability.type !== 'buff');
  const tacticalPool = currentHp / maxHp > 0.72 && attackMoves.length ? attackMoves : available;

  if (!tacticalPool.length) {
    return {
      id: 'basic_strike',
      name: 'Kinetic Strike',
      damage: Math.round(boundedNumber(fighter.stats?.attack, 18, 1, 80) * 0.65 + 5),
      cooldown: 0,
      type: 'basic',
    };
  }

  const scoredMoves = tacticalPool.map((ability, index) => {
    const abilityId = ability.id || `ability_${index}`;
    const usedCount = actorHistory.filter((action) => action.abilityId === abilityId).length;
    const varietyBonus = usedCount === 0 ? 5 : 0;
    const survivalBonus = ability.type === 'buff' && currentHp / maxHp < 0.55 ? 9 : 0;
    const tacticalBonus = ability.type === 'area' ? 3 : ability.type === 'melee' ? 2 : 0;
    const decisionNoise =
      seededUnit(`${seed}:move:${fightState.turn || 0}:${actor}:${abilityId}`) * 8;

    return {
      ability,
      score:
        boundedNumber(ability.damage, 12, 1, 100) +
        varietyBonus +
        survivalBonus +
        tacticalBonus +
        decisionNoise -
        safeNumber(ability.cooldown, 2) * 0.35,
    };
  });

  scoredMoves.sort((left, right) => right.score - left.score);
  const selected = scoredMoves[0].ability;
  const selectedIndex = abilities.indexOf(selected);
  return {
    id: selected.id || `ability_${selectedIndex}`,
    name: selected.name || 'Special Move',
    damage: boundedNumber(selected.damage, 12, 1, 100),
    cooldown: boundedNumber(selected.cooldown, 2, 0, 20),
    type: selected.type || 'melee',
  };
}

function decideTurnLimitWinner(
  fightState: FightState,
  player1: FighterData,
  player2: FighterData,
  seed: string
): PlayerId {
  const player1MaxHp = boundedNumber(player1.stats?.maxHp || player1.stats?.hp, 100, 40, 300);
  const player2MaxHp = boundedNumber(player2.stats?.maxHp || player2.stats?.hp, 100, 40, 300);
  const player1HealthRatio = fightState.player1.hp / player1MaxHp;
  const player2HealthRatio = fightState.player2.hp / player2MaxHp;

  if (player1HealthRatio !== player2HealthRatio) {
    return player1HealthRatio > player2HealthRatio ? 'player1' : 'player2';
  }

  const ratingDifference = getCombatRating(player1) - getCombatRating(player2);
  if (ratingDifference !== 0) return ratingDifference > 0 ? 'player1' : 'player2';
  return seededUnit(`${seed}:decision`) >= 0.5 ? 'player1' : 'player2';
}

function updateActionState(
  state: PlayerFightState,
  isActor: boolean,
  isTarget: boolean,
  action: BattleAction,
  hp: number,
  x: number,
  facingLeft: boolean
): PlayerFightState {
  const nextState: PlayerFightState = {
    ...state,
    x,
    y: 320,
    vx: 0,
    vy: 0,
    hp,
    facingLeft,
    isGrounded: true,
    isAttacking: isActor,
    isBlocking: isTarget && action.blocked,
    currentAction: isActor ? action.abilityName : action.dodged ? 'Evade' : action.blocked ? 'Guard' : null,
    cooldowns: state.cooldowns || {},
    updatedAt: action.resolvedAt,
  };

  if (isTarget && action.damage > 0) {
    nextState.lastHitBy = action.actor;
  }

  return nextState;
}

export function resolveBattleTurn(
  fightState: FightState,
  player1: FighterData,
  player2: FighterData,
  seed: string,
  resolvedAt = Date.now()
): BattleTurnResolution {
  if (fightState.winner || fightState.simulationStatus === 'COMPLETE') {
    return {
      fightState,
      winner: fightState.winner === 'DRAW' ? undefined : fightState.winner,
    };
  }

  const actor = fightState.nextActor || chooseOpeningActor(player1, player2, seed);
  const target: PlayerId = actor === 'player1' ? 'player2' : 'player1';
  const actorFighter = actor === 'player1' ? player1 : player2;
  const targetFighter = target === 'player1' ? player1 : player2;
  const move = selectMove(actorFighter, actor, fightState, seed);
  const nextTurn = (fightState.turn || 0) + 1;

  const actorAttack = boundedNumber(actorFighter.stats?.attack, 18, 1, 80);
  const actorSpeed = boundedNumber(actorFighter.stats?.speed, 5, 1, 25);
  const targetDefense = boundedNumber(targetFighter.stats?.defense, 8, 0, 50);
  const targetSpeed = boundedNumber(targetFighter.stats?.speed, 5, 1, 25);
  const elementMultiplier = getElementMultiplier(actorFighter.element, targetFighter.element);

  const isBuff = move.type === 'buff';
  const dodgeChance =
    isBuff || move.type === 'area'
      ? 0.02
      : clamp(0.045 + (targetSpeed - actorSpeed) * 0.018, 0.02, 0.2);
  const blockChance = clamp(0.06 + targetDefense / 85, 0.08, 0.25);
  const criticalChance = clamp(0.045 + actorAttack / 320 + actorSpeed / 360, 0.08, 0.18);
  const rollSeed = `${seed}:${fightState.startedAt || 0}:${nextTurn}:${actor}:${move.id}`;
  const dodged = !isBuff && seededUnit(`${rollSeed}:dodge`) < dodgeChance;
  const blocked = !isBuff && !dodged && seededUnit(`${rollSeed}:block`) < blockChance;
  const critical = !isBuff && !dodged && seededUnit(`${rollSeed}:critical`) < criticalChance;

  const moveTypeMultiplier =
    move.type === 'melee' ? 1.08 : move.type === 'area' ? 1.04 : move.type === 'buff' ? 0.76 : 1;
  const attackScore = Math.round((move.damage * 0.68 + actorAttack * 0.72) * moveTypeMultiplier);
  const defenseScore = Math.round(targetDefense * 0.58);
  let damage = Math.max(4, Math.round((attackScore - defenseScore) * elementMultiplier));
  if (critical) damage = Math.round(damage * 1.4);
  if (blocked) damage = Math.max(2, Math.round(damage * 0.43));
  if (dodged) damage = 0;
  if (isBuff) damage = 0;

  const actorMaxHp = boundedNumber(
    actorFighter.stats?.maxHp || actorFighter.stats?.hp,
    100,
    40,
    300
  );
  const healing =
    isBuff
      ? Math.min(
          actorMaxHp - fightState[actor].hp,
          Math.max(0, Math.round(move.damage * 0.38 + actorMaxHp * 0.035 + actorSpeed * 0.35))
        )
      : 0;
  const actorHpAfter = Math.min(actorMaxHp, Math.max(0, fightState[actor].hp + healing));
  const targetHpAfter = Math.max(0, fightState[target].hp - damage);

  const actorName = actorFighter.characterName || (actor === 'player1' ? 'Fighter One' : 'Fighter Two');
  const targetName = targetFighter.characterName || (target === 'player1' ? 'Fighter One' : 'Fighter Two');
  const resultPhrase = isBuff
    ? `${actorName} recovered ${healing} HP and reset their stance.`
    : dodged
      ? `${targetName} read it and escaped untouched.`
      : `${damage} damage${critical ? ' — critical hit' : blocked ? ' through the guard' : ''}!`;

  const action: BattleAction = {
    turn: nextTurn,
    actor,
    target,
    abilityId: move.id,
    abilityName: move.name,
    abilityType: move.type,
    element: actorFighter.element || 'neutral',
    damage,
    healing,
    critical,
    blocked,
    dodged,
    elementMultiplier,
    attackScore,
    defenseScore,
    actorHpAfter,
    targetHpAfter,
    summary: `${actorName} used ${move.name}. ${resultPhrase}`,
    resolvedAt,
  };

  let winner: PlayerId | undefined = targetHpAfter <= 0 ? actor : undefined;
  const provisionalState: FightState = {
    ...fightState,
    player1: updateActionState(
      fightState.player1,
      actor === 'player1',
      target === 'player1',
      action,
      actor === 'player1' ? actorHpAfter : targetHpAfter,
      210,
      false
    ),
    player2: updateActionState(
      fightState.player2,
      actor === 'player2',
      target === 'player2',
      action,
      actor === 'player2' ? actorHpAfter : targetHpAfter,
      590,
      true
    ),
    turn: nextTurn,
    lastAction: action,
    battleLog: [...(fightState.battleLog || []), action].slice(-LOG_LIMIT),
    simulationStatus: winner ? 'COMPLETE' : 'FIGHTING',
    nextActor: target,
  };

  if (!winner && nextTurn >= MAX_BATTLE_TURNS) {
    winner = decideTurnLimitWinner(provisionalState, player1, player2, seed);
    provisionalState.simulationStatus = 'COMPLETE';
  }

  if (!winner) {
    const speedGap = actorSpeed - targetSpeed;
    const extraTurnChance = clamp(speedGap * 0.035, 0, 0.2);
    const earnedExtraTurn = seededUnit(`${rollSeed}:initiative`) < extraTurnChance;
    provisionalState.nextActor = earnedExtraTurn ? actor : target;
  } else {
    provisionalState.winner = winner;
  }

  return { fightState: provisionalState, winner };
}
