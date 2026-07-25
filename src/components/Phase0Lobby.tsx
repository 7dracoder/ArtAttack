import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Swords,
  PlusCircle,
  LogIn,
  Copy,
  Check,
  QrCode,
  Users,
  ShieldAlert,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { createRoom, joinRoom, updateRoomStatus, subscribeToRoom } from '../lib/firebaseHelper';
import { RoomData, PlayerId } from '../types';

interface Phase0LobbyProps {
  roomCode: string | null;
  setRoomCode: (code: string) => void;
  playerId: PlayerId | null;
  setPlayerId: (id: PlayerId) => void;
  roomData: RoomData | null;
  setRoomData: (data: RoomData) => void;
  isFirebaseConnected: boolean;
  onAdvanceToDrawing: () => void;
}

export const Phase0Lobby: React.FC<Phase0LobbyProps> = ({
  roomCode,
  setRoomCode,
  playerId,
  setPlayerId,
  roomData,
  setRoomData,
  isFirebaseConnected,
  onAdvanceToDrawing,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check URL query parameters for auto-join room code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !roomCode && isFirebaseConnected) {
      setJoinInput(roomParam);
      handleJoinByCode(roomParam);
    }
  }, [isFirebaseConnected]);

  // Generate QR code when roomCode is set
  useEffect(() => {
    if (roomCode) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      QRCode.toDataURL(shareUrl, { width: 250, margin: 2, color: { dark: '#06b6d4', light: '#0f172a' } })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code error:', err));
    }
  }, [roomCode]);

  // Subscribe to room updates
  useEffect(() => {
    if (roomCode && isFirebaseConnected) {
      const unsubscribe = subscribeToRoom(
        roomCode,
        (data) => {
          setRoomData(data);
          // If status changes to DRAWING by host, advance player 2 automatically
          if (data.status === 'DRAWING') {
            onAdvanceToDrawing();
          }
        },
        (err) => setError(err.message)
      );
      return () => unsubscribe();
    }
  }, [roomCode, isFirebaseConnected]);

  const handleCreateRoom = async () => {
    if (!isFirebaseConnected) {
      setError('Please paste and apply your Firebase Config in the top bar first!');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createRoom();
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
    } catch (err: any) {
      setError(err.message || 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async (codeToJoin?: string) => {
    const code = (codeToJoin || joinInput).trim().toUpperCase();
    if (!code) {
      setError('Please enter a room code.');
      return;
    }
    if (!isFirebaseConnected) {
      setError('Please paste and apply your Firebase Config in the top bar first!');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await joinRoom(code);
      setRoomCode(code);
      setPlayerId(res.playerId);
    } catch (err: any) {
      setError(err.message || 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (roomCode) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartGame = async () => {
    if (!roomCode) return;
    try {
      await updateRoomStatus(roomCode, 'DRAWING');
      onAdvanceToDrawing();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div id="phase0-lobby" className="min-h-[85vh] flex flex-col items-center justify-center p-4">
      {/* Header Banner */}
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Real-time Multiplayer Arcade</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white uppercase italic drop-shadow-md">
          Art <span className="bg-gradient-to-r from-amber-400 via-rose-500 to-cyan-400 bg-clip-text text-transparent">Attack</span>
        </h1>
        <p className="text-slate-400 text-sm md:text-base">
          Draw your fighter freehand, let Gemini AI extract stats & generate polished 2D sprites, then battle live over Firebase!
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs flex items-center space-x-2 mb-6">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Room Lobby Card */}
      {!roomCode ? (
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            {/* Create Room Button */}
            <button
              id="create-room-btn"
              onClick={handleCreateRoom}
              disabled={loading || !isFirebaseConnected}
              className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 border border-cyan-400/40 text-white rounded-xl font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-50"
            >
              <PlusCircle className="w-8 h-8 mb-2 text-cyan-200" />
              <span className="text-sm">Create Room</span>
              <span className="text-[10px] text-cyan-200/80 font-normal mt-0.5">Host as Player 1</span>
            </button>

            {/* Join Room Form */}
            <div className="flex flex-col justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>Join Room</span>
                </span>
                <input
                  id="join-code-input"
                  type="text"
                  maxLength={6}
                  placeholder="ENTER CODE"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 text-amber-300 uppercase tracking-widest text-center font-bold text-sm py-1.5 rounded focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                id="join-room-submit-btn"
                onClick={() => handleJoinByCode()}
                disabled={loading || !isFirebaseConnected || !joinInput.trim()}
                className="w-full mt-2 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs transition-all disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center space-x-2 text-cyan-400 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting to Firebase Room...</span>
            </div>
          )}
        </div>
      ) : (
        /* Room Display & Lobby Waiting Screen */
        <div className="w-full max-w-lg bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-2xl space-y-6 text-slate-100">
          <div className="text-center space-y-1 border-b border-slate-800 pb-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lobby Room Code</span>
            <div className="flex items-center justify-center space-x-3">
              <span className="text-4xl md:text-5xl font-black text-amber-400 tracking-widest font-mono">
                {roomCode}
              </span>
              <button
                id="copy-code-btn"
                onClick={handleCopyCode}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-slate-700 transition-all"
                title="Copy Invite Link"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
              {qrDataUrl && (
                <button
                  id="show-qr-btn"
                  onClick={() => setShowQrModal(true)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg border border-slate-700 transition-all"
                  title="Show QR Code for Mobile"
                >
                  <QrCode className="w-5 h-5 text-cyan-400" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">Share this code or QR link with your opponent to battle!</p>
          </div>

          {/* Player Connection Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Player 1 Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center relative overflow-hidden">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute top-3 right-3 animate-ping" />
              <Users className="w-8 h-8 mx-auto mb-1 text-cyan-400" />
              <div className="font-bold text-sm text-cyan-300">Player 1 (Host)</div>
              <div className="text-[11px] text-emerald-400 font-medium mt-1">Ready</div>
              {playerId === 'player1' && (
                <span className="inline-block mt-2 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold">
                  (You)
                </span>
              )}
            </div>

            {/* Player 2 Card */}
            <div
              className={`border rounded-xl p-4 text-center relative overflow-hidden transition-all ${
                roomData?.player2
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-950/50 border-dashed border-slate-800'
              }`}
            >
              {roomData?.player2 ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute top-3 right-3 animate-ping" />
                  <Users className="w-8 h-8 mx-auto mb-1 text-rose-400" />
                  <div className="font-bold text-sm text-rose-300">Player 2</div>
                  <div className="text-[11px] text-emerald-400 font-medium mt-1">Connected!</div>
                  {playerId === 'player2' && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold">
                      (You)
                    </span>
                  )}
                </>
              ) : (
                <div className="py-2 space-y-1">
                  <Loader2 className="w-6 h-6 mx-auto text-amber-400 animate-spin" />
                  <div className="text-xs font-semibold text-amber-400">Waiting for Player 2...</div>
                  <div className="text-[10px] text-slate-500">Only 2 players allowed per room</div>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2 text-center">
            {roomData?.player2 ? (
              playerId === 'player1' ? (
                <button
                  id="host-start-drawing-btn"
                  onClick={handleStartGame}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-slate-950 font-black text-base uppercase rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                  <Swords className="w-5 h-5" />
                  <span>Both Ready! Start Drawing Phase</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              ) : (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-300 text-xs font-semibold animate-pulse">
                  Connected! Host is launching the drawing room...
                </div>
              )
            ) : (
              <div className="text-xs text-slate-400 italic">
                Send the code to a friend. Once joined, Player 1 can start the game!
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && qrDataUrl && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center justify-center space-x-2">
              <QrCode className="w-5 h-5 text-cyan-400" />
              <span>Scan QR Code to Join</span>
            </h3>
            <img src={qrDataUrl} alt="Room QR Code" className="w-48 h-48 mx-auto rounded-lg border border-slate-700 shadow-md" />
            <p className="text-xs text-slate-400">
              Scan with mobile camera to auto-join room <strong className="text-amber-400 font-mono">{roomCode}</strong>.
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
