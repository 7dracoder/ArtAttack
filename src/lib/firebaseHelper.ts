import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteField,
  Firestore,
} from 'firebase/firestore';
import { BattleAction, RoomData, PlayerId, FighterData } from '../types';
import { chooseOpeningActor, resolveBattleTurn } from './battleSimulation';
import { GenerationClaimVersion } from './generationLease';
import { matchesFinishedOrResetRound, matchesFinishedRound } from './roomLifecycle';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

let firebaseApp: FirebaseApp | null = null;
let db: Firestore | null = null;

export interface FighterGenerationClaimResult {
  acquired: boolean;
  observedClaim?: GenerationClaimVersion;
}

// Initialize Firebase automatically with provisioned config
export function initFirebaseConfig(configJson?: string | object): boolean {
  try {
    let parsedConfig: any = configJson;
    if (typeof configJson === 'string') {
      if (!configJson.trim()) {
        parsedConfig = defaultFirebaseConfig;
      } else {
        parsedConfig = JSON.parse(configJson);
      }
    } else if (!configJson) {
      parsedConfig = defaultFirebaseConfig;
    }

    if (!parsedConfig || !parsedConfig.projectId) {
      console.warn('Invalid Firebase config object provided.');
      return false;
    }

    if (getApps().length > 0) {
      firebaseApp = getApp();
    } else {
      firebaseApp = initializeApp(parsedConfig);
    }

    const dbId = parsedConfig.firestoreDatabaseId || parsedConfig.databaseId;
    if (dbId && dbId !== '(default)') {
      db = getFirestore(firebaseApp, dbId);
    } else {
      db = getFirestore(firebaseApp);
    }
    return true;
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
    return false;
  }
}

// Auto-run init on module load
initFirebaseConfig();

// Get or generate a persistent user session ID
export function getSessionUserId(): string {
  let uid = sessionStorage.getItem('art_attack_uid');
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('art_attack_uid', uid);
  }
  return uid;
}

export function isFirebaseReady(): boolean {
  return db !== null;
}

// Generate random 5-character alphanumeric room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create Room as Player 1
export async function createRoom(): Promise<{ roomCode: string; playerId: PlayerId }> {
  if (!db) {
    throw new Error('The battle cloud is unavailable. Check the server configuration and retry.');
  }

  const userId = getSessionUserId();
  const roomCode = generateRoomCode();
  const roomRef = doc(db, 'art_attack_rooms', roomCode);

  const initialRoom: RoomData = {
    roomCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'WAITING',
    player1: {
      id: userId,
      joinedAt: Date.now(),
      ready: true,
      drawingLocked: false,
    },
    player2: null,
  };

  await setDoc(roomRef, initialRoom);
  return { roomCode, playerId: 'player1' };
}

// Join Room as Player 2 with MAX 2 PLAYER CAP
export async function joinRoom(roomCode: string): Promise<{ playerId: PlayerId }> {
  if (!db) {
    throw new Error('The battle cloud is unavailable. Check the server configuration and retry.');
  }

  const cleanCode = roomCode.trim().toUpperCase();
  const userId = getSessionUserId();
  const roomRef = doc(db, 'art_attack_rooms', cleanCode);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${cleanCode}" not found. Please check the code.`);
    }

    const room = snapshot.data() as RoomData;
    if (room.player1?.id === userId) return { playerId: 'player1' as const };
    if (room.player2?.id === userId) return { playerId: 'player2' as const };
    if (room.player1 && room.player2) {
      throw new Error(`Room "${cleanCode}" is full! Maximum 2 fighters allowed.`);
    }
    if (room.status !== 'WAITING') {
      throw new Error(`Room "${cleanCode}" has already started.`);
    }

    const now = Date.now();
    transaction.update(roomRef, {
      player2: {
        id: userId,
        joinedAt: now,
        ready: true,
        drawingLocked: false,
      },
      status: 'DRAWING',
      updatedAt: now,
    });

    return { playerId: 'player2' as const };
  });
}

// Subscribe to real-time room updates
export function subscribeToRoom(
  roomCode: string,
  onUpdate: (room: RoomData) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    if (onError) onError(new Error('Firebase DB not initialized'));
    return () => {};
  }

  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  return onSnapshot(
    roomRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as RoomData);
      }
    },
    (err) => {
      console.error('Room snapshot error:', err);
      if (onError) onError(err);
    }
  );
}

// Lock in Drawing
export async function lockInDrawing(roomCode: string, playerId: PlayerId, drawingUrl: string) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  const field = playerId === 'player1' ? 'player1' : 'player2';
  await updateDoc(roomRef, {
    [`${field}.drawingUrl`]: drawingUrl,
    [`${field}.drawingLocked`]: true,
    updatedAt: Date.now(),
  });
}

// Claim one missing fighter before starting a billable generation request.
// Either connected creator may claim either drawing; an abandoned claim expires
// so the remaining player can finish the Forge after a disconnect.
export async function claimFighterGeneration(
  roomCode: string,
  playerId: PlayerId,
  claimId: string,
  replaceClaim?: GenerationClaimVersion
): Promise<FighterGenerationClaimResult> {
  if (!db) return { acquired: false };
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const userId = getSessionUserId();
  const field = playerId === 'player1' ? 'player1' : 'player2';

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    const fighterOwner = room[playerId];
    if (
      !['ANALYZING', 'SPRITE_GEN'].includes(room.status) ||
      !fighterOwner?.drawingLocked ||
      !fighterOwner.drawingUrl ||
      fighterOwner.fighterData
    ) {
      return { acquired: false };
    }

    const now = Date.now();
    const claim = fighterOwner.generationClaim;
    const currentClaim: GenerationClaimVersion | undefined = claim
      ? {
          claimId: claim.claimId || `legacy:${claim.ownerId}:${claim.claimedAt}`,
          heartbeat: Number(claim.heartbeat) || 0,
        }
      : undefined;
    const sameWorker =
      claim?.ownerId === userId && currentClaim?.claimId === claimId;
    const replacesObservedClaim =
      currentClaim &&
      replaceClaim?.claimId === currentClaim.claimId &&
      replaceClaim.heartbeat === currentClaim.heartbeat;

    if (currentClaim && !sameWorker && !replacesObservedClaim) {
      return { acquired: false, observedClaim: currentClaim };
    }

    transaction.update(roomRef, {
      [`${field}.generationClaim`]: {
        ownerId: userId,
        claimId,
        heartbeat: sameWorker ? currentClaim.heartbeat + 1 : 0,
        claimedAt: now,
      },
      updatedAt: now,
    });
    return { acquired: true };
  });
}

export async function releaseFighterGeneration(
  roomCode: string,
  playerId: PlayerId,
  claimId: string
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const userId = getSessionUserId();
  const field = playerId === 'player1' ? 'player1' : 'player2';

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return true;

    const room = snapshot.data() as RoomData;
    const fighterOwner = room[playerId];
    if (fighterOwner?.fighterData) return true;
    if (
      fighterOwner?.generationClaim?.ownerId !== userId ||
      fighterOwner.generationClaim.claimId !== claimId
    ) {
      return false;
    }

    transaction.update(roomRef, {
      [`${field}.generationClaim`]: deleteField(),
      updatedAt: Date.now(),
    });
    return true;
  });
}

// Heartbeats may only renew an existing exact worker claim. They never acquire
// a missing claim, so an in-flight renewal cannot resurrect a released job.
export async function renewFighterGeneration(
  roomCode: string,
  playerId: PlayerId,
  claimId: string
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const userId = getSessionUserId();
  const field = playerId === 'player1' ? 'player1' : 'player2';

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return false;

    const room = snapshot.data() as RoomData;
    const fighterOwner = room[playerId];
    const claim = fighterOwner?.generationClaim;
    if (
      !['ANALYZING', 'SPRITE_GEN'].includes(room.status) ||
      fighterOwner?.fighterData ||
      claim?.ownerId !== userId ||
      claim.claimId !== claimId
    ) {
      return false;
    }

    const now = Date.now();
    transaction.update(roomRef, {
      [`${field}.generationClaim`]: {
        ...claim,
        heartbeat: (Number(claim.heartbeat) || 0) + 1,
        claimedAt: now,
      },
      updatedAt: now,
    });
    return true;
  });
}

// Persist generated data only if this browser still owns the generation claim.
// A stale request cannot overwrite a rematch or another client's recovered job.
export async function updateFighterData(
  roomCode: string,
  playerId: PlayerId,
  fighterData: FighterData,
  claimId: string
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const userId = getSessionUserId();
  const field = playerId === 'player1' ? 'player1' : 'player2';

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    const fighterOwner = room[playerId];
    if (fighterOwner?.fighterData) return true;
    if (
      !['ANALYZING', 'SPRITE_GEN'].includes(room.status) ||
      !fighterOwner?.drawingUrl ||
      fighterOwner.generationClaim?.ownerId !== userId ||
      fighterOwner.generationClaim.claimId !== claimId
    ) {
      return false;
    }

    transaction.update(roomRef, {
      [`${field}.fighterData`]: fighterData,
      [`${field}.generationClaim`]: deleteField(),
      updatedAt: Date.now(),
    });
    return true;
  });
}

// Advance a phase only from an expected state. Either connected creator can
// perform the transition, while the transaction keeps duplicate clients safe.
export async function advanceRoomStatus(
  roomCode: string,
  expectedStatus: RoomData['status'] | RoomData['status'][],
  nextStatus: RoomData['status']
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    if (room.status === nextStatus) return true;
    if (!expectedStatuses.includes(room.status)) return false;

    transaction.update(roomRef, {
      status: nextStatus,
      updatedAt: Date.now(),
    });
    return true;
  });
}

// Initialize Fight State
export async function initFightState(roomCode: string) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    if (room.status === 'FIGHT' && room.fightState) return;
    if (room.status !== 'INTRO') {
      throw new Error('The battle intro is no longer active.');
    }

    const player1Fighter = room.player1?.fighterData;
    const player2Fighter = room.player2?.fighterData;
    if (!player1Fighter || !player2Fighter) {
      throw new Error('Both AI fighters must finish forging before the simulation can begin.');
    }

    const now = Date.now();
    const player1Hp = Math.max(1, Math.round(Number(player1Fighter.stats.hp) || 100));
    const player2Hp = Math.max(1, Math.round(Number(player2Fighter.stats.hp) || 100));
    const fightState: NonNullable<RoomData['fightState']> = {
      player1: {
        x: 210,
        y: 320,
        vx: 0,
        vy: 0,
        hp: player1Hp,
        facingLeft: false,
        isGrounded: true,
        isAttacking: false,
        isBlocking: false,
        currentAction: null,
        cooldowns: {},
        updatedAt: now,
      },
      player2: {
        x: 590,
        y: 320,
        vx: 0,
        vy: 0,
        hp: player2Hp,
        facingLeft: true,
        isGrounded: true,
        isAttacking: false,
        isBlocking: false,
        currentAction: null,
        cooldowns: {},
        updatedAt: now,
      },
      stageEnvironment:
        player1Fighter.environmentName ||
        player2Fighter.environmentName ||
        'The Infinite Canvas',
      bgMusicStyle: player1Fighter.musicMood || player2Fighter.musicMood || 'arcade',
      startedAt: now,
      turn: 0,
      nextActor: chooseOpeningActor(player1Fighter, player2Fighter, `${roomCode}:${now}`),
      simulationStatus: 'FIGHTING',
      battleLog: [],
    };

    transaction.update(roomRef, {
      status: 'FIGHT',
      fightState,
      updatedAt: now,
    });
  });
}

// Advance one authoritative AI decision. A client passes the turn it rendered;
// the transaction rejects duplicate or stale calls, so Strict Mode, retries, and
// reconnects cannot make the simulation skip actions.
export async function advanceAiBattleTurn(
  roomCode: string,
  expectedTurn: number
): Promise<BattleAction | null> {
  if (!db) return null;
  const cleanRoomCode = roomCode.toUpperCase();
  const roomRef = doc(db, 'art_attack_rooms', cleanRoomCode);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${cleanRoomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    const fightState = room.fightState;
    const player1Fighter = room.player1?.fighterData;
    const player2Fighter = room.player2?.fighterData;

    if (
      room.status !== 'FIGHT' ||
      !fightState ||
      fightState.winner ||
      fightState.simulationStatus === 'COMPLETE'
    ) {
      return null;
    }
    const currentTurn = fightState.turn ?? 0;
    if (currentTurn !== expectedTurn) return null;
    if (!player1Fighter || !player2Fighter) {
      throw new Error('The fighter blueprints are missing from this battle.');
    }

    const now = Date.now();
    const resolution = resolveBattleTurn(
      fightState,
      player1Fighter,
      player2Fighter,
      cleanRoomCode,
      now
    );

    transaction.update(roomRef, {
      fightState: resolution.fightState,
      status: resolution.winner ? 'FINISHED' : 'FIGHT',
      updatedAt: now,
    });

    return resolution.fightState.lastAction || null;
  });
}

// Set Commentary
export async function setMatchCommentary(
  roomCode: string,
  commentary: string,
  expectedStartedAt?: number
) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return;

    const room = snapshot.data() as RoomData;
    if (
      !room.fightState ||
      !room.fightState.winner ||
      (expectedStartedAt !== undefined && room.fightState.startedAt !== expectedStartedAt)
    ) {
      return;
    }

    transaction.update(roomRef, {
      'fightState.announcerCommentary': commentary,
      updatedAt: Date.now(),
    });
  });
}

// Reset only the finished match the caller is currently viewing. This prevents
// a delayed click or offline write from erasing a newer rematch.
export async function resetRoomForRematch(
  roomCode: string,
  expectedStartedAt?: number
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    if (!matchesFinishedRound(room, expectedStartedAt)) {
      return false;
    }

    const now = Date.now();
    const completedStartedAt = room.fightState?.startedAt ?? expectedStartedAt ?? null;
    transaction.update(roomRef, {
      status: 'DRAWING',
      'player1.drawingLocked': false,
      'player1.drawingUrl': null,
      'player1.fighterData': null,
      'player1.generationClaim': null,
      'player2.drawingLocked': false,
      'player2.drawingUrl': null,
      'player2.fighterData': null,
      'player2.generationClaim': null,
      fightState: null,
      restarts: (room.restarts ?? 0) + 1,
      lastCompletedStartedAt: completedStartedAt,
      updatedAt: now,
    });
    return true;
  });
}

// Vacate a completed room without leaving a ghost player behind. If creator 1
// exits first, creator 2 is promoted so the existing invite code can be reused.
export async function leaveFinishedRoom(
  roomCode: string,
  expectedStartedAt?: number
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const userId = getSessionUserId();

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return true;

    const room = snapshot.data() as RoomData;
    if (!matchesFinishedOrResetRound(room, expectedStartedAt)) {
      return false;
    }

    const leavingPlayer =
      room.player1?.id === userId ? 'player1' : room.player2?.id === userId ? 'player2' : null;
    if (!leavingPlayer) return true;

    const remainingPlayer = leavingPlayer === 'player1' ? room.player2 : room.player1;
    if (!remainingPlayer) {
      transaction.delete(roomRef);
      return true;
    }

    const now = Date.now();
    const completedStartedAt =
      expectedStartedAt ?? room.fightState?.startedAt ?? room.lastCompletedStartedAt ?? null;
    transaction.update(roomRef, {
      status: 'WAITING',
      player1: {
        id: remainingPlayer.id,
        joinedAt: remainingPlayer.joinedAt,
        ready: true,
        drawingLocked: false,
      },
      player2: null,
      fightState: null,
      restarts: (room.restarts ?? 0) + 1,
      lastCompletedStartedAt: completedStartedAt,
      updatedAt: now,
    });
    return true;
  });
}
