import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  Firestore,
} from 'firebase/firestore';
import { RoomData, PlayerId, FighterData, PlayerFightState } from '../types';
import { buildPlayerStateSyncUpdates } from './fightState';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

let firebaseApp: FirebaseApp | null = null;
let db: Firestore | null = null;

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
    throw new Error('Firebase is not initialized. Please enter your Firebase Config at the top of the app.');
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
    throw new Error('Firebase is not initialized. Please enter your Firebase Config at the top of the app.');
  }

  const cleanCode = roomCode.trim().toUpperCase();
  const userId = getSessionUserId();
  const roomRef = doc(db, 'art_attack_rooms', cleanCode);
  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    throw new Error(`Room "${cleanCode}" not found. Please check the code.`);
  }

  const room = snap.data() as RoomData;

  // Re-joining check
  if (room.player1?.id === userId) {
    return { playerId: 'player1' };
  }
  if (room.player2?.id === userId) {
    return { playerId: 'player2' };
  }

  // 2 Player Cap Check
  if (room.player1 && room.player2) {
    throw new Error(`Room "${cleanCode}" is full! Maximum 2 fighters allowed.`);
  }

  // Join as Player 2
  await updateDoc(roomRef, {
    player2: {
      id: userId,
      joinedAt: Date.now(),
      ready: true,
      drawingLocked: false,
    },
    status: 'DRAWING', // auto-advance to drawing once both present
    updatedAt: Date.now(),
  });

  return { playerId: 'player2' };
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

// Update Fighter Data after Gemini Analysis & Sprite Gen
export async function updateFighterData(roomCode: string, playerId: PlayerId, fighterData: FighterData) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  const field = playerId === 'player1' ? 'player1' : 'player2';

  await updateDoc(roomRef, {
    [`${field}.fighterData`]: fighterData,
    updatedAt: Date.now(),
  });
}

// Update Room Status
export async function updateRoomStatus(roomCode: string, status: RoomData['status']) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  await updateDoc(roomRef, { status, updatedAt: Date.now() });
}

// Initialize Fight State
export async function initFightState(
  roomCode: string,
  p1Hp: number,
  p2Hp: number,
  stageEnv: string,
  bgMusic: string
) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  const fightState = {
    player1: {
      x: 200,
      y: 350,
      vx: 0,
      vy: 0,
      hp: p1Hp,
      facingLeft: false,
      isGrounded: true,
      isAttacking: false,
      isBlocking: false,
      currentAction: null,
      cooldowns: {},
      updatedAt: Date.now(),
    },
    player2: {
      x: 600,
      y: 350,
      vx: 0,
      vy: 0,
      hp: p2Hp,
      facingLeft: true,
      isGrounded: true,
      isAttacking: false,
      isBlocking: false,
      currentAction: null,
      cooldowns: {},
      updatedAt: Date.now(),
    },
    stageEnvironment: stageEnv,
    bgMusicStyle: bgMusic,
    startedAt: Date.now(),
  };

  await updateDoc(roomRef, {
    status: 'FIGHT',
    fightState,
    updatedAt: Date.now(),
  });
}

// Sync Fight Tick
export async function syncPlayerState(roomCode: string, playerId: PlayerId, state: PlayerFightState) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  // HP is intentionally excluded. Damage updates are authoritative; including a
  // client's stale HP here would immediately undo hits received from its opponent.
  await updateDoc(roomRef, buildPlayerStateSyncUpdates(playerId, state));
}

// Sync Damage / Hit
export async function applyDamageToPlayer(
  roomCode: string,
  targetPlayer: PlayerId,
  damage: number,
  attacker: PlayerId
): Promise<boolean> {
  if (!db) return false;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`Room "${roomCode}" no longer exists.`);
    }

    const room = snapshot.data() as RoomData;
    const fightState = room.fightState;
    if (!fightState || fightState.winner) return false;

    const currentHp = fightState[targetPlayer].hp;
    if (currentHp <= 0) return false;

    const newHp = Math.max(0, currentHp - Math.max(0, damage));
    const knockout = newHp <= 0;
    const updates: Record<string, unknown> = {
      [`fightState.${targetPlayer}.hp`]: newHp,
      updatedAt: Date.now(),
    };

    if (knockout) {
      updates['fightState.winner'] = attacker;
      updates.status = 'FINISHED';
    }

    transaction.update(roomRef, updates);
    return knockout;
  });
}

// Set Commentary
export async function setMatchCommentary(roomCode: string, commentary: string) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  await updateDoc(roomRef, {
    'fightState.announcerCommentary': commentary,
    updatedAt: Date.now(),
  });
}

// Reset Room for Rematch
export async function resetRoomForRematch(roomCode: string) {
  if (!db) return;
  const roomRef = doc(db, 'art_attack_rooms', roomCode.toUpperCase());
  await updateDoc(roomRef, {
    status: 'DRAWING',
    'player1.drawingLocked': false,
    'player1.drawingUrl': null,
    'player1.fighterData': null,
    'player2.drawingLocked': false,
    'player2.drawingUrl': null,
    'player2.fighterData': null,
    fightState: null,
    updatedAt: Date.now(),
  });
}
