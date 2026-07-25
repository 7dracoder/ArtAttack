import React, { useRef, useState, useEffect } from 'react';
import {
  Paintbrush,
  Eraser,
  RotateCcw,
  CheckCircle2,
  Lock,
  Loader2,
  Sparkles,
  Palette,
} from 'lucide-react';
import { lockInDrawing } from '../lib/firebaseHelper';
import { exportCompactImage } from '../lib/imageData';
import { RoomData, PlayerId } from '../types';

interface Phase1DrawingRoomProps {
  roomCode: string;
  playerId: PlayerId;
  roomData: RoomData | null;
  onBothLocked: () => void;
}

const COLOR_PRESETS = [
  '#000000', // Black
  '#ef4444', // Red (Fire)
  '#3b82f6', // Blue (Water)
  '#eab308', // Yellow (Lightning)
  '#22c55e', // Green (Nature)
  '#a855f7', // Purple (Shadow)
  '#ec4899', // Pink (Cyber)
  '#06b6d4', // Cyan (Ice)
  '#f97316', // Orange
  '#ffffff', // White
];

export const Phase1DrawingRoom: React.FC<Phase1DrawingRoomProps> = ({
  roomCode,
  playerId,
  roomData,
  onBothLocked,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const me = playerId === 'player1' ? roomData?.player1 : roomData?.player2;
  const opponent = playerId === 'player1' ? roomData?.player2 : roomData?.player1;

  // Preserve a submitted drawing when a player reloads or reconnects mid-phase.
  useEffect(() => {
    if (me?.drawingLocked) {
      setIsLocked(true);
    }
  }, [me?.drawingLocked]);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Check if both locked in
  useEffect(() => {
    if (roomData?.player1?.drawingLocked && roomData?.player2?.drawingLocked) {
      onBothLocked();
    }
  }, [roomData]);

  // Handle Drawing events (mouse & touch for mobile!)
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isLocked) return;
    setIsDrawing(true);
    draw(e);
  };

  const stopDraw = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraser ? '#ffffff' : brushColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleClear = () => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleLockIn = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLocking(true);
    setSubmitError(null);

    try {
      const drawingDataUrl = exportCompactImage(canvas, {
        maxDimension: 500,
        maxCharacters: 120_000,
      });
      await lockInDrawing(roomCode, playerId, drawingDataUrl);
      setIsLocked(true);
    } catch (err) {
      console.error('Failed to lock in drawing:', err);
      setSubmitError(err instanceof Error ? err.message : 'The sketch could not be sent to the AI Forge.');
    } finally {
      setLocking(false);
    }
  };

  return (
    <div id="phase1-drawing-room" className="flex min-h-[82vh] flex-col items-center justify-center px-1 py-6 sm:px-4">
      {/* Header Info */}
      <div className="mx-auto mb-5 max-w-2xl space-y-2 text-center">
        <span className="phase-kicker mx-auto gap-1.5">
          <Sparkles className="w-4 h-4" />
          <span>1 / 3 · DRAW</span>
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Sketch a fighter. <span className="text-cyan-300">Messy is welcome.</span>
        </h1>
        <p className="text-sm leading-6 text-slate-400">
          Give it a silhouette, bold colors, and one signature detail. The AI Forge reads those
          choices to build the stats and powers that decide the simulation.
        </p>
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-bold text-slate-500">
          <Palette className="h-3.5 w-3.5 text-violet-300" />
          Color hints at element · shape hints at fighting style
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Canvas + Controls */}
        <div className="glass-panel space-y-4 rounded-3xl border border-white/10 p-3 shadow-2xl shadow-black/30 sm:p-4 lg:col-span-2">
          {/* Canvas Board */}
          <div className="relative aspect-square max-w-[450px] mx-auto bg-white rounded-xl overflow-hidden border-4 border-slate-800 shadow-inner">
            <canvas
              ref={canvasRef}
              width={500}
              height={500}
              onMouseDown={startDraw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onMouseMove={draw}
              onTouchStart={startDraw}
              onTouchEnd={stopDraw}
              onTouchMove={draw}
              className={`w-full h-full touch-none ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-crosshair'}`}
            />
            {isLocked && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-emerald-400 space-y-2">
                <Lock className="w-12 h-12" />
                <span className="text-sm font-bold tracking-wider uppercase">Sketch sent to the AI Forge</span>
              </div>
            )}
          </div>

          {/* Drawing Tools Toolbar */}
          {!isLocked && (
            <div className="space-y-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
              {/* Color Presets */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                <Palette className="w-4 h-4 text-slate-400 shrink-0" />
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${color} brush color`}
                    aria-pressed={!isEraser && brushColor === color}
                    onClick={() => {
                      setBrushColor(color);
                      setIsEraser(false);
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform transform active:scale-90 shrink-0 ${
                      !isEraser && brushColor === color ? 'border-amber-400 scale-110 shadow-md' : 'border-slate-700'
                    }`}
                  />
                ))}
                {/* Custom Color Input */}
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => {
                    setBrushColor(e.target.value);
                    setIsEraser(false);
                  }}
                  className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent shrink-0"
                  title="Custom Color"
                />
              </div>

              {/* Brush size + Tool selectors */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
                {/* Mode Toggles */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsEraser(false)}
                    className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-all ${
                      !isEraser ? 'bg-cyan-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    <span>Brush</span>
                  </button>
                  <button
                    onClick={() => setIsEraser(true)}
                    className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-all ${
                      isEraser ? 'bg-rose-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Eraser</span>
                  </button>
                </div>

                {/* Brush Size Slider */}
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-[11px]">Size: {brushSize}px</span>
                  <input
                    type="range"
                    min={2}
                    max={28}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-24 accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Clear Canvas */}
                <button
                  onClick={handleClear}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center space-x-1 font-medium transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Readiness & Lock-in Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-6 text-slate-100">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
            Match Readiness
          </h3>

          <div className="space-y-4">
            {/* My Status */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-cyan-300">Your Fighter Drawing</span>
                {me?.drawingLocked ? (
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Locked
                  </span>
                ) : (
                  <span className="text-amber-400">Drawing...</span>
                )}
              </div>
              {!isLocked ? (
                <button
                  id="lock-in-drawing-btn"
                  onClick={handleLockIn}
                  disabled={locking}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow transition-all flex items-center justify-center space-x-1.5"
                >
                  {locking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>Send to AI Forge</span>
                </button>
              ) : (
                <div className="text-[11px] text-slate-400 italic text-center py-1">
                  Waiting for opponent to lock in their drawing...
                </div>
              )}
            </div>

            {/* Opponent Status */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-rose-300">Rival sketch</span>
                {opponent?.drawingLocked ? (
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Locked In!
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center space-x-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Drawing...
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                {opponent?.drawingLocked
                  ? 'The rival sketch is ready for its combat profile.'
                  : 'Waiting for the other creator to send their sketch.'}
              </p>
            </div>
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200"
            >
              {submitError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
