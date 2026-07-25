import { Ability, FighterData } from '../types';

type UnknownRecord = Record<string, unknown>;

const FALLBACK_ABILITIES: Array<Omit<Ability, 'id'>> = [
  {
    name: 'Sketch Strike',
    description: 'A dependable attack shaped by the original drawing.',
    damage: 20,
    cooldown: 2,
    type: 'melee',
  },
  {
    name: 'Ink Pulse',
    description: 'A burst of energy drawn from the fighter silhouette.',
    damage: 24,
    cooldown: 4,
    type: 'projectile',
  },
  {
    name: 'Canvas Breaker',
    description: 'A wide finishing technique powered by its dominant colors.',
    damage: 28,
    cooldown: 6,
    type: 'area',
  },
];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown, fallback: string, maxLength = 180): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(max, Math.max(min, parsed)));
}

function abilityType(value: unknown): Ability['type'] {
  return value === 'projectile' || value === 'melee' || value === 'buff' || value === 'area'
    ? value
    : 'melee';
}

export function normalizeFighterAnalysis(raw: unknown, spriteUrl: string): FighterData {
  if (!isRecord(raw) || !isRecord(raw.stats) || !Array.isArray(raw.abilities)) {
    throw new Error('The AI returned an incomplete fighter profile. Please retry the Forge.');
  }

  const characterName = textValue(raw.characterName, '');
  if (!characterName || raw.abilities.length === 0) {
    throw new Error('The AI returned an incomplete fighter profile. Please retry the Forge.');
  }

  const stats = raw.stats;
  const hp = boundedInteger(stats.hp, 120, 100, 150);
  const usedIds = new Set<string>();
  const normalizedAbilities = raw.abilities.slice(0, 3).map((candidate, index) => {
    const value = isRecord(candidate) ? candidate : {};
    const fallback = FALLBACK_ABILITIES[index];
    const requestedId = textValue(value.id, `ability_${index}`, 48)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_');
    const id = usedIds.has(requestedId) ? `${requestedId}_${index}` : requestedId;
    usedIds.add(id);

    return {
      id,
      name: textValue(value.name, fallback.name, 60),
      description: textValue(value.description, fallback.description, 220),
      damage: boundedInteger(value.damage, fallback.damage, 15, 40),
      cooldown: boundedInteger(value.cooldown, fallback.cooldown, 2, 8),
      type: abilityType(value.type),
    } satisfies Ability;
  });

  while (normalizedAbilities.length < 3) {
    const index = normalizedAbilities.length;
    let id = `ability_${index}`;
    while (usedIds.has(id)) id = `${id}_fallback`;
    usedIds.add(id);
    normalizedAbilities.push({
      id,
      ...FALLBACK_ABILITIES[index],
    });
  }

  return {
    characterName,
    element: textValue(raw.element, 'arcane', 40),
    personality: textValue(raw.personality, 'adaptable wildcard', 160),
    stats: {
      hp,
      maxHp: hp,
      attack: boundedInteger(stats.attack, 20, 15, 30),
      defense: boundedInteger(stats.defense, 10, 5, 15),
      speed: boundedInteger(stats.speed, 6, 3, 9),
    },
    abilities: normalizedAbilities,
    musicMood: textValue(raw.musicMood, 'kinetic arcade synth', 100),
    entryDialogue: textValue(raw.entryDialogue, 'The sketch is alive.', 180),
    victoryDialogue: textValue(raw.victoryDialogue, 'The canvas chose me.', 180),
    environmentName: textValue(raw.environmentName, 'The Infinite Canvas', 100),
    spriteUrl,
    spriteBackgroundRemoved: true,
  };
}
