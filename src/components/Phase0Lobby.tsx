import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  PlusCircle,
  LogIn,
  Copy,
  Check,
  QrCode,
  Users,
  ShieldAlert,
  Loader2,
  Sparkles,
  Bot,
} from 'lucide-react';
import { createRoom, joinRoom } from '../lib/firebaseHelper';
import { RoomData, PlayerId } from '../types';

interface Phase0LobbyProps {
  roomCode: string | null;
  setRoomCode: (code: string) => void;
  playerId: PlayerId | null;
  setPlayerId: (id: PlayerId) => void;
  roomData: RoomData | null;
  isFirebaseConnected: boolean;
}

export const Phase0Lobby: React.FC<Phase0LobbyProps> = ({
  roomCode,
  setRoomCode,
  playerId,
  setPlayerId,
  roomData,
  isFirebaseConnected,
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

  const handleCreateRoom = async () => {
    if (!isFirebaseConnected) {
      setError('The battle cloud is unavailable. Check the server configuration and retry.');
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
      setError('The battle cloud is unavailable. Check the server configuration and retry.');
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

  return (
    <div id="phase0-lobby" className="flex min-h-[82vh] flex-col items-center justify-center px-1 py-8 sm:px-4">
      {/* Header Banner */}
      <div className="mx-auto mb-8 max-w-3xl space-y-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Two creators · One AI showdown</span>
        </div>
        <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl md:text-7xl">
          Draw it. Forge it.{' '}
          <span className="bg-gradient-to-r from-amber-300 via-rose-400 to-cyan-300 bg-clip-text text-transparent">
            Watch it fight.
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Each player sketches a contender. AI creates its stats, powers, personality, and
          transparent arcade fighter—then pilots both drawings through a live battle simulation.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1 text-[11px] font-bold text-slate-500">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">1 · Sketch</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">2 · AI Forge</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">3 · Autonomous battle</span>
        </div>
      </div>

      {error && (
        <div className="w-full max-w-md bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs flex items-center space-x-2 mb-6">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Room Lobby Card */}
      {!roomCode ? (
        <div className="glass-panel w-full max-w-lg space-y-5 rounded-3xl border border-white/10 p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Create Room Button */}
            <button
              id="create-room-btn"
              onClick={handleCreateRoom}
              disabled={loading || !isFirebaseConnected}
              className="focus-ring flex min-h-36 flex-col items-center justify-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400 to-blue-600 p-5 font-bold text-slate-950 shadow-lg shadow-cyan-500/15 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <PlusCircle className="mb-2 h-8 w-8" />
              <span className="text-sm font-black">Create a battle</span>
              <span className="mt-1 text-[11px] font-semibold text-slate-900/70">Invite one other artist</span>
            </button>

            {/* Join Room Form */}
            <div className="flex min-h-36 flex-col justify-between rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                  <LogIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>Join with code</span>
                </span>
                <input
                  id="join-code-input"
                  type="text"
                  maxLength={6}
                  placeholder="ENTER CODE"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  aria-label="Battle room code"
                  className="focus-ring mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-center text-sm font-black uppercase tracking-[0.2em] text-amber-300 placeholder:text-slate-700"
                />
              </div>
              <button
                id="join-room-submit-btn"
                onClick={() => handleJoinByCode()}
                disabled={loading || !isFirebaseConnected || !joinInput.trim()}
                className="focus-ring mt-2 w-full rounded-lg bg-amber-300 py-2 text-xs font-black text-slate-950 transition-all hover:bg-amber-200 disabled:opacity-50"
              >
                Enter battle
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
        <div className="glass-panel w-full max-w-lg space-y-6 rounded-3xl border border-cyan-300/25 p-5 text-slate-100 shadow-2xl shadow-black/30 sm:p-6">
          <div className="text-center space-y-1 border-b border-slate-800 pb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Invite code</span>
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
            <p className="text-xs text-slate-400">Share the code or QR link with a second creator.</p>
          </div>

          {/* Player Connection Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Player 1 Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center relative overflow-hidden">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute top-3 right-3 animate-ping" />
              <Users className="w-8 h-8 mx-auto mb-1 text-cyan-400" />
              <div className="font-bold text-sm text-cyan-300">Creator 1 (Host)</div>
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
                  <div className="font-bold text-sm text-rose-300">Creator 2</div>
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
                  <div className="text-xs font-semibold text-amber-400">Waiting for a second creator…</div>
                  <div className="text-[10px] text-slate-500">Sketchpads open as soon as they join</div>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2 text-center">
            {roomData?.player2 ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-xs font-bold text-emerald-300">
                <Bot className="h-4 w-4" />
                Both creators connected. Opening the sketchpads…
              </div>
            ) : (
              <div className="text-xs italic text-slate-400">
                Invite a second artist. Sketchpads open automatically when they join.
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
