import React, { useState, useEffect } from 'react';
import { TopConfigBar } from './components/TopConfigBar';
import { Phase0Lobby } from './components/Phase0Lobby';
import { Phase1DrawingRoom } from './components/Phase1DrawingRoom';
import { Phase2Phase3FighterGen } from './components/Phase2Phase3FighterGen';
import { Phase4AnnouncerIntro } from './components/Phase4AnnouncerIntro';
import { Phase5FightArena } from './components/Phase5FightArena';
import { RoomData, PlayerId, GamePhase } from './types';
import { isFirebaseReady, updateRoomStatus, initFightState } from './lib/firebaseHelper';

export default function App() {
  const [isFbReady, setIsFbReady] = useState(true);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [phase, setPhase] = useState<GamePhase>('LOBBY');

  // Check Firebase readiness on startup
  useEffect(() => {
    setIsFbReady(isFirebaseReady());
  }, []);

  // Sync phase with room status from Firebase
  useEffect(() => {
    if (!roomData) return;
    switch (roomData.status) {
      case 'WAITING':
        setPhase('LOBBY');
        break;
      case 'DRAWING':
        setPhase('DRAWING');
        break;
      case 'ANALYZING':
      case 'SPRITE_GEN':
        setPhase('ANALYZING');
        break;
      case 'INTRO':
        setPhase('INTRO');
        break;
      case 'FIGHT':
      case 'FINISHED':
        setPhase('FIGHT');
        break;
      default:
        break;
    }
  }, [roomData?.status]);

  const handleLeaveRoom = () => {
    setRoomCode(null);
    setPlayerId(null);
    setRoomData(null);
    setPhase('LOBBY');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Header Bar */}
      <TopConfigBar />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        {phase === 'LOBBY' && (
          <Phase0Lobby
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            playerId={playerId}
            setPlayerId={setPlayerId}
            roomData={roomData}
            setRoomData={setRoomData}
            isFirebaseConnected={isFbReady}
            onAdvanceToDrawing={() => setPhase('DRAWING')}
          />
        )}

        {phase === 'DRAWING' && roomCode && playerId && (
          <Phase1DrawingRoom
            roomCode={roomCode}
            playerId={playerId}
            roomData={roomData}
            onBothLocked={() => {
              if (playerId === 'player1') {
                updateRoomStatus(roomCode, 'ANALYZING');
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
            onComplete={() => setPhase('INTRO')}
          />
        )}

        {phase === 'INTRO' && (
          <Phase4AnnouncerIntro
            roomData={roomData}
            geminiApiKey=""
            onFightStart={async () => {
              if (playerId === 'player1') {
                await initFightState(
                  roomCode,
                  roomData.player1?.fighterData?.stats?.hp || 100,
                  roomData.player2?.fighterData?.stats?.hp || 100,
                  roomData.player1?.fighterData?.element || 'cyber',
                  roomData.player1?.fighterData?.musicMood || 'arcade'
                );
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
