import React, { useEffect, useState } from 'react';
import {
  Sparkles,
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
import {
  advanceRoomStatus,
  claimFighterGeneration,
  releaseFighterGeneration,
  renewFighterGeneration,
  updateFighterData,
} from '../lib/firebaseHelper';
import { normalizeFighterAnalysis } from '../lib/fighterData';
import {
  canTakeOverGenerationClaim,
  observeGenerationClaim,
  ObservedGenerationClaim,
} from '../lib/generationLease';
import { compactImageDataUrl } from '../lib/imageData';
import { RoomData, PlayerId, FighterData } from '../types';

function createWorkerClaimId(playerId: PlayerId): string {
  const nonce =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${playerId}:${nonce}`;
}

interface Phase2Phase3FighterGenProps {
  roomCode: string;
  geminiApiKey: string;
  roomData: RoomData | null;
}

export const Phase2Phase3FighterGen: React.FC<Phase2Phase3FighterGenProps> = ({
  roomCode,
  geminiApiKey,
  roomData,
}) => {
  const [p1Loading, setP1Loading] = useState(false);
  const [p2Loading, setP2Loading] = useState(false);
  const [p1Stage, setP1Stage] = useState<'Analyzing Drawing...' | 'Rendering 2D Sprite...' | 'Ready!'>('Analyzing Drawing...');
  const [p2Stage, setP2Stage] = useState<'Analyzing Drawing...' | 'Rendering 2D Sprite...' | 'Ready!'>('Analyzing Drawing...');
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  const p1Data = roomData?.player1?.fighterData;
  const p2Data = roomData?.player2?.fighterData;

  const advanceToIntro = async () => {
    try {
      setError(null);
      await advanceRoomStatus(roomCode, ['ANALYZING', 'SPRITE_GEN'], 'INTRO');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to open the battle intro.';
      setError(message);
    }
  };

  // Process fighter drawings using Gemini Vision + Image Gen APIs
  useEffect(() => {
    let active = true;
    const processingPlayers = new Set<PlayerId>();
    const failedPlayers = new Set<PlayerId>();
    const requestControllers = new Set<AbortController>();
    const observedClaims = new Map<PlayerId, ObservedGenerationClaim>();

    async function processPlayerFighter(targetPlayer: PlayerId) {
      const pObj = targetPlayer === 'player1' ? roomData?.player1 : roomData?.player2;
      const setStage = targetPlayer === 'player1' ? setP1Stage : setP2Stage;
      const setLoading = targetPlayer === 'player1' ? setP1Loading : setP2Loading;

      if (
        !active ||
        !pObj?.drawingUrl ||
        pObj.fighterData ||
        processingPlayers.has(targetPlayer) ||
        failedPlayers.has(targetPlayer)
      ) {
        return;
      }

      processingPlayers.add(targetPlayer);
      const workerClaimId = createWorkerClaimId(targetPlayer);
      let requestController: AbortController | null = null;
      let requestTimeout: number | null = null;
      let claimHeartbeat: number | null = null;
      let requestTimedOut = false;
      let claimLost = false;
      let ownsClaim = false;
      let claimPersisted = false;

      try {
        const previousObservation = observedClaims.get(targetPlayer);
        const observationTime = performance.now();
        const replaceClaim = canTakeOverGenerationClaim(
          previousObservation,
          observationTime
        )
          ? previousObservation
          : undefined;
        const claimResult = await claimFighterGeneration(
          roomCode,
          targetPlayer,
          workerClaimId,
          replaceClaim
        );
        if (!claimResult.acquired) {
          const nextObservation = observeGenerationClaim(
            previousObservation,
            claimResult.observedClaim,
            observationTime
          );
          if (nextObservation) observedClaims.set(targetPlayer, nextObservation);
          else observedClaims.delete(targetPlayer);
          return;
        }

        ownsClaim = true;
        observedClaims.delete(targetPlayer);
        if (!active) return;

        setLoading(true);
        setStage('Analyzing Drawing...');
        setError(null);
        requestController = new AbortController();
        requestControllers.add(requestController);
        requestTimeout = window.setTimeout(() => {
          requestTimedOut = true;
          requestController?.abort();
        }, 90_000);
        claimHeartbeat = window.setInterval(() => {
          void renewFighterGeneration(roomCode, targetPlayer, workerClaimId)
            .then((renewed) => {
              if (!renewed) {
                claimLost = true;
                requestController?.abort();
              }
            })
            .catch(() => {
              // Persistence verifies ownership again before accepting the result.
            });
        }, 15_000);

        // Step 1: Multimodal Vision Analysis (Structured Output)
        const analyzeRes = await fetch('/api/gemini/analyze-fighter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestController.signal,
          body: JSON.stringify({
            drawing: pObj.drawingUrl,
            customApiKey: geminiApiKey,
          }),
        });

        const analyzeJson = await analyzeRes.json();
        if (!analyzeRes.ok || !analyzeJson.success) {
          throw new Error(analyzeJson.error || 'Gemini Vision Analysis failed');
        }

        const data = analyzeJson.data;

        // Step 2: Gemini Sprite Generation (Polished 2D Artwork)
        setStage('Rendering 2D Sprite...');
        const spriteRes = await fetch('/api/gemini/generate-sprite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestController.signal,
          body: JSON.stringify({
            drawing: pObj.drawingUrl,
            characterName: data.characterName,
            element: data.element,
            customApiKey: geminiApiKey,
          }),
        });

        const spriteJson = await spriteRes.json();
        const rawSpriteUrl = spriteJson.spriteUrl || spriteJson.fallbackUrl || pObj.drawingUrl;
        const spriteUrl = await compactImageDataUrl(rawSpriteUrl, {
          maxDimension: 512,
          maxCharacters: 180_000,
          background: null,
          removeLightBackground: true,
        });
        const completeFighterData = normalizeFighterAnalysis(data, spriteUrl);

        if (active) {
          claimPersisted = await updateFighterData(
            roomCode,
            targetPlayer,
            completeFighterData,
            workerClaimId
          );
          if (claimPersisted) setStage('Ready!');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          if (active && requestTimedOut) {
            failedPlayers.add(targetPlayer);
            setError('The AI Forge timed out. Retry to resume the missing fighter.');
          }
          if (claimLost || !active) return;
          return;
        }
        console.error(`Error processing ${targetPlayer}:`, err);
        failedPlayers.add(targetPlayer);
        if (active) {
          setError(err.message || 'Gemini AI processing error');
        }
      } finally {
        if (requestTimeout !== null) window.clearTimeout(requestTimeout);
        if (claimHeartbeat !== null) window.clearInterval(claimHeartbeat);
        if (requestController) {
          requestControllers.delete(requestController);
        }
        if (ownsClaim && !claimPersisted) {
          await releaseFighterGeneration(roomCode, targetPlayer, workerClaimId).catch(
            () => undefined
          );
        }
        processingPlayers.delete(targetPlayer);
        if (active) setLoading(false);
      }
    }

    const processMissingFighters = () => {
      void processPlayerFighter('player1');
      void processPlayerFighter('player2');
    };

    // The transaction chooses one worker per drawing. Retrying the claim lets
    // either remaining browser recover an abandoned job after its lease expires.
    const startTimer = window.setTimeout(processMissingFighters, 0);
    const recoveryTimer = window.setInterval(processMissingFighters, 10_000);

    return () => {
      active = false;
      window.clearTimeout(startTimer);
      window.clearInterval(recoveryTimer);
      requestControllers.forEach((controller) => controller.abort());
    };
  }, [
    roomCode,
    geminiApiKey,
    roomData?.player1?.drawingUrl,
    roomData?.player2?.drawingUrl,
    retryVersion,
  ]);

  // Advance to Intro when both fighters have full data
  useEffect(() => {
    if (p1Data && p2Data) {
      const timer = setTimeout(async () => {
        await advanceToIntro();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [p1Data, p2Data]);

  return (
    <div id="phase2-3-fighter-gen" className="flex min-h-[82vh] flex-col items-center justify-center px-1 py-6 sm:px-4">
      {/* Header Banner */}
      <div className="mx-auto mb-6 max-w-2xl space-y-2 text-center">
        <span className="phase-kicker mx-auto gap-1.5">
          <Wand2 className="w-4 h-4 animate-spin" />
          <span>2 / 3 · AI FORGE</span>
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Your sketches are becoming{' '}
          <span className="bg-gradient-to-r from-violet-300 to-amber-300 bg-clip-text text-transparent">
            contenders.
          </span>
        </h1>
        <p className="text-sm leading-6 text-slate-400">
          The Forge reads shape and color, builds a combat profile, invents signature moves, and
          cuts each fighter cleanly away from its drawing background.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs mb-6 space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          {!(p1Data && p2Data) && (
            <button
              type="button"
              onClick={() => setRetryVersion((version) => version + 1)}
              disabled={p1Loading || p2Loading}
              className="rounded-lg bg-rose-400 px-3 py-1.5 font-black uppercase text-slate-950 hover:bg-rose-300 disabled:cursor-wait disabled:opacity-50"
            >
              Retry Fighter Generation
            </button>
          )}
        </div>
      )}

      {/* Grid comparing Player 1 & Player 2 Fighters */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Player 1 Fighter Card */}
        <FighterDisplayCard
          playerLabel="Creator 1"
          fighter={p1Data}
          loading={p1Loading}
          stage={p1Stage}
          fallbackDrawing={roomData?.player1?.drawingUrl}
        />

        {/* Player 2 Fighter Card */}
        <FighterDisplayCard
          playerLabel="Creator 2"
          fighter={p2Data}
          loading={p2Loading}
          stage={p2Stage}
          fallbackDrawing={roomData?.player2?.drawingUrl}
        />
      </div>

      {p1Data && p2Data && (
        <div className="mt-8 text-center space-y-3">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full font-bold text-sm shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Forge complete. The autonomous showdown is loading…</span>
          </div>
          {error && (
            <button
              type="button"
              onClick={() => void advanceToIntro()}
              className="block mx-auto rounded-lg bg-amber-500 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:bg-amber-400"
            >
              Retry Arena Transition
            </button>
          )}
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
    <div className="glass-panel relative flex flex-col justify-between space-y-4 overflow-hidden rounded-3xl border border-white/10 p-5 shadow-2xl shadow-black/30">
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
          <span className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase text-amber-300">
            <Sparkles className="w-3 h-3" /> Battle cutout
          </span>
          <div className="sprite-checker relative mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-amber-300/30 p-1 shadow">
            {fighter?.spriteUrl ? (
              <img src={fighter.spriteUrl} alt={`${fighter.characterName} transparent fighter sprite`} className="block max-h-full max-w-full bg-transparent object-contain" />
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

          <p className="rounded-xl border border-violet-300/15 bg-violet-300/[0.06] px-3 py-2 text-xs leading-5 text-violet-100">
            The Forge interpreted this as a <strong>{fighter.element}</strong> build with a{' '}
            {fighter.personality.toLowerCase()} style. These values will drive its AI decisions.
          </p>

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
              <span>AI combat loadout</span>
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {fighter.abilities.slice(0, 3).map((ability, idx) => (
                <div key={idx} className="space-y-1 rounded-lg border border-white/[0.07] bg-slate-950 p-2 text-[11px]">
                  <div className="font-bold text-amber-300 truncate">{ability.name}</div>
                  <div className="line-clamp-2 text-[10px] leading-4 text-slate-400">{ability.description}</div>
                  <div className="font-semibold text-rose-300">Power {ability.damage} · {ability.cooldown}s charge</div>
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
