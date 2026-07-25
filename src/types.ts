export type GamePhase =
  | 'CONFIG'
  | 'LOBBY'
  | 'DRAWING'
  | 'ANALYZING'
  | 'SPRITE_GEN'
  | 'INTRO'
  | 'FIGHT'
  | 'VICTORY';

export type PlayerId = 'player1' | 'player2';

export interface FighterStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  damage: number;
  cooldown: number; // in seconds
  type: 'projectile' | 'melee' | 'buff' | 'area';
  element?: string;
  icon?: string;
}

export interface FighterData {
  characterName: string;
  element: string; // fire, water, lightning, shadow, cyber, nature, light, ice, etc.
  personality: string;
  stats: FighterStats;
  abilities: Ability[];
  musicMood: string;
  entryDialogue: string;
  victoryDialogue: string;
  environmentName: string;
  spriteUrl: string;
  spriteBackgroundRemoved?: boolean;
}

export interface FighterGenerationClaim {
  ownerId: string;
  claimId: string;
  heartbeat: number;
  claimedAt: number;
}

export interface PlayerFightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  facingLeft: boolean;
  isGrounded: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  currentAction: string | null; // e.g., "ability_0", "punch", "block"
  cooldowns: Record<string, number>; // ability index -> remaining ms
  lastHitBy?: string;
  updatedAt: number;
}

export interface BattleAction {
  turn: number;
  actor: PlayerId;
  target: PlayerId;
  abilityId: string;
  abilityName: string;
  abilityType: Ability['type'] | 'basic';
  element: string;
  damage: number;
  healing: number;
  critical: boolean;
  blocked: boolean;
  dodged: boolean;
  elementMultiplier: number;
  attackScore: number;
  defenseScore: number;
  actorHpAfter: number;
  targetHpAfter: number;
  summary: string;
  resolvedAt: number;
}

export interface RoomData {
  roomCode: string;
  createdAt: number;
  updatedAt: number;
  status: 'WAITING' | 'DRAWING' | 'ANALYZING' | 'SPRITE_GEN' | 'INTRO' | 'FIGHT' | 'FINISHED';
  player1: {
    id: string;
    joinedAt: number;
    ready: boolean;
    drawingLocked: boolean;
    drawingUrl?: string;
    fighterData?: FighterData;
    generationClaim?: FighterGenerationClaim | null;
  } | null;
  player2: {
    id: string;
    joinedAt: number;
    ready: boolean;
    drawingLocked: boolean;
    drawingUrl?: string;
    fighterData?: FighterData;
    generationClaim?: FighterGenerationClaim | null;
  } | null;
  fightState?: {
    player1: PlayerFightState;
    player2: PlayerFightState;
    winner?: PlayerId | 'DRAW';
    stageEnvironment?: string;
    bgMusicStyle?: string;
    announcerCommentary?: string;
    startedAt?: number;
    turn: number;
    nextActor: PlayerId;
    simulationStatus: 'FIGHTING' | 'COMPLETE';
    lastAction?: BattleAction;
    battleLog: BattleAction[];
  };
  restarts?: number;
  lastCompletedStartedAt?: number | null;
}

export interface UserConfig {
  geminiApiKey: string;
  firebaseConfigRaw: string; // JSON string or object
}
