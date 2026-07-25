import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Zap,
  Shield,
  Heart,
  Gauge,
  Flame,
  Swords,
  Loader2,
  CheckCircle2,
  Wand2,
  AlertTriangle,
} from 'lucide-react';
import { updateFighterData, updateRoomStatus } from '../lib/firebaseHelper';
import { RoomData, PlayerId, FighterData } from '../types';

interface Phase2Phase3FighterGenProps {
  roomCode: string;
  playerId: PlayerId;
  geminiApiKey: string;
  roomData: RoomData | null;
  onComplete: () => void;
}

export const Phase2Phase3FighterGen: React.FC<Phase2Phase3FighterGenProps> = ({
  roomCode,
  playerId,
  geminiApiKey,
  roomData,
  onComplete,
}) => {
  const [p1Loading, setP1Loading] = useState(false);
  const [p2Loading, setP2Loading] = useState(false);
  const [p1Stage, setP1Stage] = useState<'Analyzing Drawing...' | 'Rendering 2D Sprite...' | 'Ready!'>('Analyzing Drawing...');
  const [p2Stage, setP2Stage] = useState<'Analyzing Drawing...' | 'Rendering 2D Sprite...' | 'Ready!'>('Analyzing Drawing...');
  const [error, setError] = useState<string | null>(null);

  const p1Data = roomData?.player1?.fighterData;
  const p2Data = roomData?.player2?.fighterData;

  // Process fighter drawings using Gemini Vision + Image Gen APIs
  useEffect(() => {
    let active = true;

    async function processPlayerFighter(targetPlayer: PlayerId) {
      const pObj = targetPlayer === 'player1' ? roomData?.player1 : roomData?.player2;
      const setStage = targetPlayer === 'player1' ? setP1Stage : setP2Stage;
      const setLoading = targetPlayer === 'player1' ? setP1Loading : setP2Loading;

      if (!pObj?.drawingUrl || pObj.fighterData) return; // already generated

      setLoading(true);
      setStage('Analyzing Drawing...');

      try {
        // Step 1: Multimodal Vision Analysis (Structured Output)
        const analyzeRes = await fetch('/api/gemini/analyze-fighter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drawing: pObj.drawingUrl,
            customApiKey: geminiApiKey,
          }),
        });

        const analyzeJson = await analyzeRes.json();
        if (!analyzeJson.success) {
          throw new Error(analyzeJson.error || 'Gemini Vision Analysis failed');
        }

        const data = analyzeJson.data;

        // Step 2: Gemini Sprite Generation (Polished 2D Artwork)
        setStage('Rendering 2D Sprite...');
        const spriteRes = await fetch('/api/gemini/generate-sprite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drawing: pObj.drawingUrl,
            characterName: data.characterName,
            element: data.element,
            customApiKey: geminiApiKey,
          }),
        });

        const spriteJson = await spriteRes.json();
        const spriteUrl = spriteJson.spriteUrl || spriteJson.fallbackUrl || pObj.drawingUrl;

        const completeFighterData: FighterData = {
          ...data,
          drawingUrl: pObj.drawingUrl,
          spriteUrl,
        };

        if (active) {
          setStage('Ready!');
          await updateFighterData(roomCode, targetPlayer, completeFighterData);
        }
      } catch (err: any) {
        console.error(`Error processing ${targetPlayer}:`, err);
        if (active) setError(err.message || 'Gemini AI processing error');
      } finally {
        if (active) setLoading(false);
      }
    }

    // Player 1 handles P1, Player 2 handles P2 (or host processes both)
    if (playerId === 'player1' && roomData?.player1?.drawingUrl && !p1Data) {
      processPlayerFighter('player1');
    }
    if (playerId === 'player2' && roomData?.player2?.drawingUrl && !p2Data) {
      processPlayerFighter('player2');
    }
  }, [roomData?.player1?.drawingUrl, roomData?.player2?.drawingUrl]);

  // Advance to Intro when both fighters have full data
  useEffect(() => {
    if (p1Data && p2Data) {
      const timer = setTimeout(async () => {
        if (playerId === 'player1') {
          await updateRoomStatus(roomCode, 'INTRO');
        }
        onComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [p1Data, p2Data]);

  return (
    <div id="phase2-3-fighter-gen" className="min-h-[85vh] flex flex-col items-center justify-center p-4">
      {/* Header Banner */}
      <div className="text-center max-w-xl mx-auto mb-6 space-y-1">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center justify-center space-x-1">
          <Wand2 className="w-4 h-4 animate-spin" />
          <span>Phases 2 & 3: Gemini Multimodal Transformation</span>
        </span>
        <h2 className="text-2xl md:text-3xl font-black text-white uppercase italic">
          Synthesizing <span className="bg-gradient-to-r from-amber-400 to-rose-500 bg-clip-text text-transparent">Fighters</span>
        </h2>
        <p className="text-xs text-slate-400">
          Gemini 2.5 Flash is extracting character elements, stats, abilities & generating polished 2D arcade sprites!
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs flex items-center space-x-2 mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid comparing Player 1 & Player 2 Fighters */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Player 1 Fighter Card */}
        <FighterDisplayCard
          playerLabel="Player 1"
          fighter={p1Data}
          loading={p1Loading}
          stage={p1Stage}
          fallbackDrawing={roomData?.player1?.drawingUrl}
        />

        {/* Player 2 Fighter Card */}
        <FighterDisplayCard
          playerLabel="Player 2"
          fighter={p2Data}
          loading={p2Loading}
          stage={p2Stage}
          fallbackDrawing={roomData?.player2?.drawingUrl}
        />
      </div>

      {p1Data && p2Data && (
        <div className="mt-8 text-center space-y-2 animate-bounce">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full font-bold text-sm shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Both Fighters Generated! Entering Battle Arena...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Component for rendering Fighter Stat Cards
interface FighterDisplayCardProps {
  playerLabel: string;
  fighter?: FighterData;
  loading: boolean;
  stage: string;
  fallbackDrawing?: string;
}

const FighterDisplayCard: React.FC<FighterDisplayCardProps> = ({
  playerLabel,
  fighter,
  loading,
  stage,
  fallbackDrawing,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <span className="font-extrabold text-sm uppercase tracking-wider text-cyan-400">{playerLabel}</span>
        {fighter ? (
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-xs uppercase">
            {fighter.element} Element
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs flex items-center space-x-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{stage}</span>
          </span>
        )}
      </div>

      {/* Main Visuals & Sprites */}
      <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 items-center">
        {/* Drawing Image */}
        <div className="text-center space-y-1">
          <span className="text-[10px] text-slate-500 font-bold uppercase">Original Sketch</span>
          <div className="w-24 h-24 mx-auto bg-white rounded-lg p-1 border border-slate-700 shadow overflow-hidden flex items-center justify-center">
            {fallbackDrawing ? (
              <img src={fallbackDrawing} alt="Original Sketch" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-xs text-slate-400">No Drawing</div>
            )}
          </div>
        </div>

        {/* Gemini Rendered Sprite */}
        <div className="text-center space-y-1">
          <span className="text-[10px] text-amber-400 font-bold uppercase flex items-center justify-center space-x-0.5">
            <Sparkles className="w-3 h-3" /> 2D Sprite
          </span>
          <div className="w-24 h-24 mx-auto bg-slate-900 rounded-lg p-1 border border-amber-500/30 shadow overflow-hidden flex items-center justify-center relative">
            {fighter?.spriteUrl ? (
              <img src={fighter.spriteUrl} alt="Gemini Sprite" className="max-w-full max-h-full object-contain" />
            ) : (
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            )}
          </div>
        </div>
      </div>

      {/* Stats & Abilities Breakdown */}
      {fighter ? (
        <div className="space-y-3">
          <div className="space-y-0.5">
            <h3 className="text-xl font-black text-white italic uppercase">{fighter.characterName}</h3>
            <p className="text-xs text-slate-400 italic">"{fighter.personality}"</p>
          </div>

          {/* Stats Progress Bars */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <div className="flex justify-between text-[11px] text-rose-300 font-semibold mb-0.5">
                <span className="flex items-center space-x-1"><Heart className="w-3 h-3" /> HP</span>
                <span>{fighter.stats.hp}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: `${(fighter.stats.hp / 150) * 100}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-amber-300 font-semibold mb-0.5">
                <span className="flex items-center space-x-1"><Flame className="w-3 h-3" /> ATK</span>
                <span>{fighter.stats.attack}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(fighter.stats.attack / 30) * 100}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-cyan-300 font-semibold mb-0.5">
                <span className="flex items-center space-x-1"><Shield className="w-3 h-3" /> DEF</span>
                <span>{fighter.stats.defense}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${(fighter.stats.defense / 15) * 100}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-emerald-300 font-semibold mb-0.5">
                <span className="flex items-center space-x-1"><Gauge className="w-3 h-3" /> SPD</span>
                <span>{fighter.stats.speed}</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(fighter.stats.speed / 10) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Special Moves */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
              <Swords className="w-3.5 h-3.5 text-amber-400" />
              <span>Gemini Assigned Abilities</span>
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {fighter.abilities.slice(0, 3).map((ability, idx) => (
                <div key={idx} className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] space-y-0.5">
                  <div className="font-bold text-amber-300 truncate">{ability.name}</div>
                  <div className="text-slate-400 text-[9px] line-clamp-1">{ability.description}</div>
                  <div className="text-rose-400 font-semibold">Dmg: {ability.damage} | {ability.cooldown}s</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center space-y-2 text-slate-400 text-xs">
          <Loader2 className="w-8 h-8 mx-auto text-cyan-400 animate-spin" />
          <div>Generating Fighter Blueprint via Gemini AI...</div>
        </div>
      )}
    </div>
  );
};
