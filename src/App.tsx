import React, { useState, useEffect } from 'react';
import { TopConfigBar } from './components/TopConfigBar';
import { Phase0Lobby } from './components/Phase0Lobby';
import { Phase1DrawingRoom } from './components/Phase1DrawingRoom';
import { Phase2Phase3FighterGen } from './components/Phase2Phase3FighterGen';
import { Phase4AnnouncerIntro } from './components/Phase4AnnouncerIntro';
import { Phase5FightArena } from './components/Phase5FightArena';
import { RoomData, PlayerId, GamePhase } from './types';
import {
  isFirebaseReady,
  updateRoomStatus,
  initFightState,
  subscribeToRoom,
} from './lib/firebaseHelper';
import { getGamePhase } from './lib/gameFlow';

export default function App() {
  const [isFbReady] = useState(() => isFirebaseReady());

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [roomSyncError, setRoomSyncError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');

  // Keep one live room listener for the entire match. Phase components mount and
  // unmount as the game advances, so none of them should own this subscription.
  useEffect(() => {
    if (!roomCode || !isFbReady) return;

    setRoomSyncError(null);
    return subscribeToRoom(
      roomCode,
      (data) => {
        setRoomData(data);
        setRoomSyncError(null);
      },
      (error) => setRoomSyncError(error.message)
    );
  }, [roomCode, isFbReady]);

  // Sync phase with room status from Firebase
  useEffect(() => {
    if (!roomData) return;
    setPhase(getGamePhase(roomData.status));
  }, [roomData?.status]);

  const handleLeaveRoom = () => {
    setRoomCode(null);
    setPlayerId(null);
    setRoomData(null);
    setRoomSyncError(null);
    setPhase('LOBBY');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Header Bar */}
      <TopConfigBar />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        {roomSyncError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"
          >
            Room connection error: {roomSyncError}
          </div>
        )}

        {phase === 'LOBBY' && (
          <Phase0Lobby
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            playerId={playerId}
            setPlayerId={setPlayerId}
            roomData={roomData}
            isFirebaseConnected={isFbReady}
          />
        )}

        {phase === 'DRAWING' && roomCode && playerId && (
          <Phase1DrawingRoom
            roomCode={roomCode}
            playerId={playerId}
            roomData={roomData}
            onBothLocked={() => {
              if (playerId === 'player1') {
                void updateRoomStatus(roomCode, 'ANALYZING').catch((error) => {
                  setRoomSyncError(error instanceof Error ? error.message : 'Unable to advance the room.');
                });
              }
            }}
          />
        )}

        {phase === 'ANALYZING' && roomCode && playerId && (
          <Phase2Phase3FighterGen
            roomCode={roomCode}
            playerId={playerId}
            geminiApiKey=""
            roomData={roomData}
          />
        )}

        {phase === 'INTRO' && roomCode && playerId && roomData && (
          <Phase4AnnouncerIntro
            roomData={roomData}
            geminiApiKey=""
            onFightStart={async () => {
              if (playerId === 'player1') {
                try {
                  await initFightState(
                    roomCode,
                    roomData.player1?.fighterData?.stats?.hp || 100,
                    roomData.player2?.fighterData?.stats?.hp || 100,
                    roomData.player1?.fighterData?.element || 'cyber',
                    roomData.player1?.fighterData?.musicMood || 'arcade'
                  );
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Unable to initialize the battlefield.';
                  setRoomSyncError(message);
                  throw error;
                }
              }
            }}
          />
        )}

        {phase === 'FIGHT' && roomCode && playerId && (
          <Phase5FightArena
            roomCode={roomCode}
            playerId={playerId}
            geminiApiKey=""
            roomData={roomData}
            onLeaveRoom={handleLeaveRoom}
          />
        )}
      </main>
    </div>
  );
}
