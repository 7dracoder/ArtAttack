import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  Gauge,
  Heart,
  LogOut,
  Radio,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  advanceAiBattleTurn,
  leaveFinishedRoom,
  resetRoomForRematch,
  setMatchCommentary,
} from '../lib/firebaseHelper';
import {
  startFightBgMusic,
  stopFightBgMusic,
  playHitSfx,
  playAbilitySfx,
  playBlockSfx,
  playKoSfx,
} from '../lib/audioEngine';
import { getCombatRating } from '../lib/battleSimulation';
import { compactImageDataUrl } from '../lib/imageData';
import { BattleAction, FighterData, PlayerId, RoomData } from '../types';

interface Phase5FightArenaProps {
  roomCode: string;
  playerId: PlayerId;
  geminiApiKey: string;
  roomData: RoomData | null;
  onLeaveRoom: () => void;
}

interface ArenaPalette {
  player1: string;
  player2: string;
  player1Rgb: string;
  player2Rgb: string;
}

const TURN_DELAY_MS = 1050;
const ACTION_ANIMATION_MS = 900;

export const Phase5FightArena: React.FC<Phase5FightArenaProps> = ({
  roomCode,
  playerId,
  geminiApiKey,
  roomData,
  onLeaveRoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const player1ImageRef = useRef<HTMLImageElement | null>(null);
  const player2ImageRef = useRef<HTMLImageElement | null>(null);
  const actionAnimationStartedRef = useRef(0);
  const lastSoundTurnRef = useRef(0);
  const advanceInFlightRef = useRef(false);
  const commentaryRequestRef = useRef<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [commentaryText, setCommentaryText] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const player1Fighter = roomData?.player1?.fighterData;
  const player2Fighter = roomData?.player2?.fighterData;
  const fightState = roomData?.fightState;
  const winner = fightState?.winner;
  const action = fightState?.lastAction;
  const isHost = playerId === 'player1';
  const player1Hp = fightState?.player1.hp ?? player1Fighter?.stats.hp ?? 100;
  const player2Hp = fightState?.player2.hp ?? player2Fighter?.stats.hp ?? 100;
  const palette = getArenaPalette(player1Fighter?.element, player2Fighter?.element);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  // Repair legacy sprites at render time. Newly forged sprites carry a marker so
  // their feathered light edges are not processed and eroded a second time.
  useEffect(() => {
    let cancelled = false;

    const loadSprite = async (
      fighter: FighterData | undefined,
      targetRef: React.MutableRefObject<HTMLImageElement | null>
    ) => {
      targetRef.current = null;
      if (!fighter?.spriteUrl) return;

      try {
        const normalizedUrl = fighter.spriteBackgroundRemoved
          ? fighter.spriteUrl
          : await compactImageDataUrl(fighter.spriteUrl, {
              maxDimension: 512,
              maxCharacters: 180_000,
              background: null,
              removeLightBackground: true,
            });
        if (cancelled) return;

        const image = new Image();
        image.onload = () => {
          if (!cancelled && image.naturalWidth > 0) targetRef.current = image;
        };
        image.onerror = () => {
          if (!cancelled) targetRef.current = null;
        };
        image.src = normalizedUrl;
      } catch (error) {
        console.warn('Unable to prepare transparent fighter sprite:', error);
      }
    };

    void loadSprite(player1Fighter, player1ImageRef);
    void loadSprite(player2Fighter, player2ImageRef);

    return () => {
      cancelled = true;
    };
  }, [
    player1Fighter?.spriteBackgroundRemoved,
    player1Fighter?.spriteUrl,
    player2Fighter?.spriteBackgroundRemoved,
    player2Fighter?.spriteUrl,
  ]);

  useEffect(() => {
    if (!soundEnabled) {
      stopFightBgMusic();
      return;
    }

    startFightBgMusic(player1Fighter?.element || 'cyber', 126);
    return () => stopFightBgMusic();
  }, [player1Fighter?.element, soundEnabled]);

  // Either spectator may schedule a decision. The Firestore transaction verifies
  // the expected turn, so duplicate clients become no-ops and the match continues
  // even if the room creator disconnects.
  useEffect(() => {
    if (
      !fightState ||
      winner ||
      fightState.simulationStatus === 'COMPLETE'
    ) {
      return;
    }

    const expectedTurn = fightState.turn ?? 0;
    const timer = window.setTimeout(() => {
      advanceInFlightRef.current = true;
      setAdvanceError(null);
      void advanceAiBattleTurn(roomCode, expectedTurn)
        .catch((error) => {
          setAdvanceError(
            error instanceof Error ? error.message : 'The AI simulation could not advance.'
          );
        })
        .finally(() => {
          advanceInFlightRef.current = false;
        });
    }, expectedTurn === 0 ? 700 : TURN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [fightState?.turn, fightState?.simulationStatus, roomCode, winner]);

  useEffect(() => {
    if (!action) return;
    actionAnimationStartedRef.current = performance.now();

    if (!soundEnabled || action.turn <= lastSoundTurnRef.current) return;
    lastSoundTurnRef.current = action.turn;
    playAbilitySfx(action.element);

    const impactTimer = window.setTimeout(() => {
      if (action.blocked) playBlockSfx();
      else if (action.damage > 0) playHitSfx(action.critical ? 1.6 : 1);
      if (winner) playKoSfx();
    }, reducedMotion ? 0 : 430);

    return () => window.clearTimeout(impactTimer);
  }, [action?.turn, reducedMotion, soundEnabled, winner]);

  useEffect(() => {
    if (!winner) {
      setShowResult(false);
      return;
    }

    const resultTimer = window.setTimeout(
      () => setShowResult(true),
      reducedMotion ? 0 : ACTION_ANIMATION_MS
    );
    return () => window.clearTimeout(resultTimer);
  }, [action?.turn, reducedMotion, winner]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrame = 0;
    const drawFrame = () => {
      const elapsed = action
        ? Math.min(ACTION_ANIMATION_MS, performance.now() - actionAnimationStartedRef.current)
        : ACTION_ANIMATION_MS;
      renderArena({
        context,
        player1Fighter,
        player2Fighter,
        player1Image: player1ImageRef.current,
        player2Image: player2ImageRef.current,
        action,
        elapsed,
        palette,
        reducedMotion,
        winner: showResult ? winner : undefined,
      });
    };

    if (showResult) {
      drawFrame();
      return;
    }

    const draw = () => {
      drawFrame();
      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    action?.turn,
    palette.player1,
    palette.player2,
    player1Fighter?.characterName,
    player2Fighter?.characterName,
    reducedMotion,
    showResult,
    winner,
  ]);

  useEffect(() => {
    const syncedCommentary = fightState?.announcerCommentary;
    if (syncedCommentary) setCommentaryText(syncedCommentary);
  }, [fightState?.announcerCommentary]);

  useEffect(() => {
    if (!winner || winner === 'DRAW') return;

    const winningFighter = winner === 'player1' ? player1Fighter : player2Fighter;
    const losingFighter = winner === 'player1' ? player2Fighter : player1Fighter;
    const remainingHp = winner === 'player1' ? player1Hp : player2Hp;
    const fallback = `${winningFighter?.characterName || 'The winning fighter'} converted its drawing-derived build into the decisive advantage after ${fightState?.turn || 0} AI decisions.`;
    setCommentaryText((current) => current || fallback);

    const startedAt = fightState?.startedAt;
    const requestId = `${startedAt || 0}:${winner}`;
    if (
      !isHost ||
      fightState?.announcerCommentary ||
      commentaryRequestRef.current === requestId
    ) {
      return;
    }
    commentaryRequestRef.current = requestId;
    const requestController = new AbortController();

    const duration = Math.max(
      1,
      Math.round(((action?.resolvedAt || Date.now()) - (startedAt || Date.now())) / 1000)
    );

    fetch('/api/gemini/generate-commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: requestController.signal,
      body: JSON.stringify({
        winnerName: winningFighter?.characterName || 'Fighter 1',
        loserName: losingFighter?.characterName || 'Fighter 2',
        duration,
        remainingHp: Math.round(remainingHp),
        customApiKey: geminiApiKey,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('Commentary service unavailable.');
        return response.json();
      })
      .then((data) => {
        if (!data.success || !data.commentary) return;
        setCommentaryText(data.commentary);
        return setMatchCommentary(roomCode, data.commentary, startedAt);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        void setMatchCommentary(roomCode, fallback, startedAt).catch(() => undefined);
      })
      .finally(() => {
        if (commentaryRequestRef.current === requestId) {
          commentaryRequestRef.current = null;
        }
      });

    return () => {
      requestController.abort();
      if (commentaryRequestRef.current === requestId) {
        commentaryRequestRef.current = null;
      }
    };
  }, [
    action?.resolvedAt,
    fightState?.announcerCommentary,
    fightState?.startedAt,
    fightState?.turn,
    isHost,
    player1Fighter,
    player1Hp,
    player2Fighter,
    player2Hp,
    roomCode,
    winner,
  ]);

  const retryAdvance = async () => {
    if (!fightState || advanceInFlightRef.current) return;
    advanceInFlightRef.current = true;
    setAdvanceError(null);
    try {
      await advanceAiBattleTurn(roomCode, fightState.turn ?? 0);
    } catch (error) {
      setAdvanceError(error instanceof Error ? error.message : 'The AI simulation could not advance.');
    } finally {
      advanceInFlightRef.current = false;
    }
  };

  const handleRematch = async () => {
    if (rematchPending || leavePending) return;
    setRematchError(null);
    setRematchPending(true);
    try {
      const reset = await resetRoomForRematch(roomCode, fightState?.startedAt);
      if (!reset) {
        throw new Error('This battle has already moved on. Syncing the latest room state…');
      }
    } catch (error) {
      setRematchError(error instanceof Error ? error.message : 'Unable to reset the drawing room.');
    } finally {
      setRematchPending(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (leavePending || rematchPending) return;
    setRematchError(null);
    setLeavePending(true);
    try {
      const left = await leaveFinishedRoom(roomCode, fightState?.startedAt);
      if (!left) {
        throw new Error('The room changed before it could be left. Please try again.');
      }
      onLeaveRoom();
    } catch (error) {
      setRematchError(error instanceof Error ? error.message : 'Unable to leave the battle room.');
      setLeavePending(false);
    }
  };

  if (!player1Fighter || !player2Fighter || !fightState) {
    return (
      <section
        id="phase5-fight-arena"
        className="flex min-h-[75vh] items-center justify-center px-4"
      >
        <div className="glass-panel flex items-center gap-3 rounded-2xl px-6 py-5 text-sm text-slate-300">
          <RefreshCw className="h-5 w-5 animate-spin text-violet-300" />
          Loading the autonomous battlefield…
        </div>
      </section>
    );
  }

  const winnerFighter =
    winner === 'player1' ? player1Fighter : winner === 'player2' ? player2Fighter : undefined;
  const winnerHp = winner === 'player1' ? player1Hp : winner === 'player2' ? player2Hp : 0;
  const player1Rating = getCombatRating(player1Fighter);
  const player2Rating = getCombatRating(player2Fighter);
  const latestActions = [...(fightState.battleLog || [])].reverse();

  return (
    <section id="phase5-fight-arena" className="mx-auto w-full max-w-7xl px-1 py-5 sm:px-3">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="phase-kicker phase-kicker-battle">3 / 3 · AI BATTLE</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              AI pilots active
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            The drawings decide the fight.
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Both fighters are autonomous. Their forged stats, elements, and signature moves drive
            every decision you see below.
          </p>
        </div>

        <button
          type="button"
          aria-pressed={soundEnabled}
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-cyan-300" />
          ) : (
            <VolumeX className="h-4 w-4 text-slate-500" />
          )}
          {soundEnabled ? 'Sound on' : 'Enable sound'}
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FighterHud
              fighter={player1Fighter}
              playerLabel="Creator 1 AI"
              hp={player1Hp}
              color={palette.player1}
              side="left"
              isActing={action?.actor === 'player1' && !showResult}
            />
            <FighterHud
              fighter={player2Fighter}
              playerLabel="Creator 2 AI"
              hp={player2Hp}
              color={palette.player2}
              side="right"
              isActing={action?.actor === 'player2' && !showResult}
            />
          </div>

          <div className="arena-shell relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#070912] shadow-2xl shadow-black/40">
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              aria-label={`AI battle simulation between ${player1Fighter.characterName} and ${player2Fighter.characterName}`}
              className="block aspect-video w-full"
            />

            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/65 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 backdrop-blur">
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
              Live simulation
            </div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/10 bg-slate-950/65 px-3 py-1.5 font-mono text-[11px] font-black text-white backdrop-blur">
              TURN {String(fightState.turn ?? 0).padStart(2, '0')}
            </div>

            {action && !showResult && (
              <div
                key={action.turn}
                className="battle-callout pointer-events-none relative inset-auto m-2 rounded-xl border border-white/10 bg-slate-950/88 p-2.5 text-center shadow-xl backdrop-blur-md sm:absolute sm:inset-x-3 sm:bottom-3 sm:mx-auto sm:max-w-xl sm:rounded-2xl sm:p-3"
                aria-live="polite"
              >
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300 sm:text-xs">
                  {action.abilityName}
                </div>
                <div className="text-xs font-semibold text-white sm:text-sm">{action.summary}</div>
                <div className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">
                  Power {action.attackScore} − Guard {action.defenseScore}
                  {action.elementMultiplier !== 1
                    ? ` × ${action.elementMultiplier.toFixed(2)} element affinity`
                    : ''}{' '}
                  = <strong className="text-rose-300">{action.damage} damage</strong>
                </div>
              </div>
            )}

            {winner && showResult && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="simulation-result-title"
                className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#060711]/94 p-4 py-8 text-center backdrop-blur-md"
              >
                <div className="max-w-lg space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 shadow-lg shadow-amber-400/10">
                    <Trophy className="h-8 w-8 text-amber-300" />
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
                      Simulation complete
                    </div>
                    <h2 id="simulation-result-title" className="mt-1 text-3xl font-black tracking-tight text-white sm:text-5xl">
                      {winner === 'DRAW' ? 'Perfect draw' : `${winnerFighter?.characterName} wins`}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {winner === 'DRAW'
                        ? 'The drawing-derived builds finished completely even.'
                        : `${winnerFighter?.characterName} finished with ${Math.round(winnerHp)} HP after ${fightState.turn ?? 0} autonomous decisions.`}
                    </p>
                  </div>

                  {commentaryText && (
                    <blockquote className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm italic leading-6 text-amber-100">
                      “{commentaryText}”
                    </blockquote>
                  )}

                  <div className="flex flex-col justify-center gap-2 sm:flex-row">
                    <button
                      id="rematch-btn"
                      type="button"
                      onClick={() => void handleRematch()}
                      disabled={rematchPending || leavePending}
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/15 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                    >
                      {rematchPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {rematchPending ? 'Resetting arena…' : 'Draw new fighters'}
                    </button>
                    <button
                      id="leave-room-btn"
                      type="button"
                      onClick={() => void handleLeaveRoom()}
                      disabled={leavePending || rematchPending}
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
                    >
                      {leavePending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                      {leavePending ? 'Leaving…' : 'Leave room'}
                    </button>
                  </div>

                  {rematchError && <p className="text-xs text-rose-300">{rematchError}</p>}
                </div>
              </div>
            )}
          </div>

          {advanceError && !winner && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {advanceError}
              </span>
              <button
                type="button"
                onClick={() => void retryAdvance()}
                className="focus-ring rounded-lg bg-rose-300 px-3 py-1.5 text-xs font-black uppercase text-slate-950"
              >
                Retry turn
              </button>
            </div>
          )}

          {!winner && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <Radio className="h-3.5 w-3.5 text-emerald-400" />
              Transaction-synchronized AI decision stream
            </div>
          )}
        </div>

        <aside className="glass-panel flex min-h-0 flex-col rounded-[1.4rem] border border-white/10 p-4 lg:max-h-[760px]">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <BrainCircuit className="h-5 w-5 text-violet-300" />
                Battle brain
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                A readable feed of what each AI chose and why it mattered.
              </p>
            </div>
            <span className="rounded-lg bg-violet-300/10 px-2 py-1 font-mono text-[10px] font-bold text-violet-200">
              AUTO
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 py-4 text-center">
            <RatingBadge
              name={player1Fighter.characterName}
              rating={player1Rating}
              color={palette.player1}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">vs</span>
            <RatingBadge
              name={player2Fighter.characterName}
              rating={player2Rating}
              color={palette.player2}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            {latestActions.length ? (
              <ol className="space-y-2" aria-label="AI battle decision log">
                {latestActions.map((logAction) => (
                  <li
                    key={logAction.turn}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em]"
                        style={{
                          color:
                            logAction.actor === 'player1' ? palette.player1 : palette.player2,
                        }}
                      >
                        <Bot className="h-3.5 w-3.5" />
                        Turn {logAction.turn}
                      </span>
                      <ActionTag action={logAction} />
                    </div>
                    <p className="text-xs leading-5 text-slate-300">{logAction.summary}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
                <Sparkles className="mb-3 h-7 w-7 animate-pulse text-violet-300" />
                <p className="text-sm font-bold text-white">Reading both combat profiles…</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Speed picks the opener. Then each AI weighs power, cooldowns, defense, and element
                  affinity.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Drawing → outcome
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <DecisionRule icon={<Heart className="h-3.5 w-3.5" />} label="HP survives" />
              <DecisionRule icon={<Zap className="h-3.5 w-3.5" />} label="ATK powers moves" />
              <DecisionRule icon={<Shield className="h-3.5 w-3.5" />} label="DEF cuts damage" />
              <DecisionRule icon={<Gauge className="h-3.5 w-3.5" />} label="SPD wins tempo" />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

interface FighterHudProps {
  fighter: FighterData;
  playerLabel: string;
  hp: number;
  color: string;
  side: 'left' | 'right';
  isActing: boolean;
}

const FighterHud: React.FC<FighterHudProps> = ({
  fighter,
  playerLabel,
  hp,
  color,
  side,
  isActing,
}) => {
  const maxHp = Math.max(1, fighter.stats.maxHp || fighter.stats.hp || 100);
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  return (
    <div
      className={`glass-panel rounded-2xl border p-3 transition-colors ${
        isActing ? 'border-white/25' : 'border-white/10'
      }`}
      style={{ boxShadow: isActing ? `0 0 30px ${color}22` : undefined }}
    >
      <div className={`flex items-start gap-3 ${side === 'right' ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-black"
          style={{ borderColor: `${color}55`, backgroundColor: `${color}16`, color }}
        >
          {fighter.characterName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center justify-between gap-2 ${side === 'right' ? 'sm:flex-row-reverse' : ''}`}>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                {playerLabel}
              </div>
              <h2 className="truncate text-base font-black text-white">{fighter.characterName}</h2>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide"
              style={{ backgroundColor: `${color}16`, color }}
            >
              {fighter.element}
            </span>
          </div>

          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-500">VITALITY</span>
              <span className="font-mono text-white">
                {Math.round(hp)} / {maxHp}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${fighter.characterName} health`}
              aria-valuemin={0}
              aria-valuemax={maxHp}
              aria-valuenow={Math.round(hp)}
              className="h-2.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-white/10"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${hpPercent}%`,
                  background: `linear-gradient(90deg, ${color}, #f8fafc)`,
                  boxShadow: `0 0 12px ${color}88`,
                }}
              />
            </div>
          </div>

          <div className={`mt-2 flex flex-wrap gap-1.5 ${side === 'right' ? 'sm:justify-end' : ''}`}>
            <MiniStat label="ATK" value={fighter.stats.attack} />
            <MiniStat label="DEF" value={fighter.stats.defense} />
            <MiniStat label="SPD" value={fighter.stats.speed} />
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <span className="rounded-md border border-white/[0.07] bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
    {label} <strong className="text-slate-100">{value}</strong>
  </span>
);

const RatingBadge: React.FC<{ name: string; rating: number; color: string }> = ({
  name,
  rating,
  color,
}) => (
  <div className="min-w-0">
    <div className="truncate text-[10px] font-bold text-slate-500">{name}</div>
    <div className="mt-0.5 font-mono text-lg font-black" style={{ color }}>
      {rating}
    </div>
    <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">combat index</div>
  </div>
);

const ActionTag: React.FC<{ action: BattleAction }> = ({ action }) => {
  const label = action.dodged
    ? 'Evaded'
    : action.blocked
      ? 'Blocked'
      : action.critical
        ? 'Critical'
        : action.healing > 0
          ? `+${action.healing} HP`
          : `−${action.damage} HP`;
  const color = action.dodged
    ? 'text-cyan-300 bg-cyan-300/10'
    : action.blocked
      ? 'text-blue-300 bg-blue-300/10'
      : action.critical
        ? 'text-amber-300 bg-amber-300/10'
        : action.healing > 0
          ? 'text-emerald-300 bg-emerald-300/10'
          : 'text-rose-300 bg-rose-300/10';

  return <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black ${color}`}>{label}</span>;
};

const DecisionRule: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5 text-slate-400">
    <span className="text-violet-300">{icon}</span>
    {label}
  </div>
);

interface RenderArenaOptions {
  context: CanvasRenderingContext2D;
  player1Fighter: FighterData;
  player2Fighter: FighterData;
  player1Image: HTMLImageElement | null;
  player2Image: HTMLImageElement | null;
  action?: BattleAction;
  elapsed: number;
  palette: ArenaPalette;
  reducedMotion: boolean;
  winner?: PlayerId | 'DRAW';
}

function renderArena({
  context,
  player1Fighter,
  player2Fighter,
  player1Image,
  player2Image,
  action,
  elapsed,
  palette,
  reducedMotion,
  winner,
}: RenderArenaOptions) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const groundY = 448;
  const progress = action ? Math.min(1, elapsed / ACTION_ANIMATION_MS) : 1;
  const motionProgress = reducedMotion ? 1 : progress;

  context.clearRect(0, 0, width, height);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#080a15');
  sky.addColorStop(0.58, '#111126');
  sky.addColorStop(1, '#05060d');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const leftGlow = context.createRadialGradient(150, 240, 0, 150, 240, 380);
  leftGlow.addColorStop(0, `rgba(${palette.player1Rgb}, 0.2)`);
  leftGlow.addColorStop(1, `rgba(${palette.player1Rgb}, 0)`);
  context.fillStyle = leftGlow;
  context.fillRect(0, 0, width, height);

  const rightGlow = context.createRadialGradient(width - 150, 240, 0, width - 150, 240, 380);
  rightGlow.addColorStop(0, `rgba(${palette.player2Rgb}, 0.2)`);
  rightGlow.addColorStop(1, `rgba(${palette.player2Rgb}, 0)`);
  context.fillStyle = rightGlow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.3;
  context.strokeStyle = '#8b8daa';
  context.lineWidth = 1;
  for (let x = -160; x < width + 160; x += 80) {
    context.beginPath();
    context.moveTo(width / 2, 205);
    context.lineTo(x, groundY + 92);
    context.stroke();
  }
  for (let row = 0; row < 7; row += 1) {
    const rowProgress = row / 7;
    const y = 210 + rowProgress * rowProgress * 330;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();

  const floor = context.createLinearGradient(0, groundY - 25, 0, height);
  floor.addColorStop(0, 'rgba(255,255,255,0.08)');
  floor.addColorStop(0.08, 'rgba(255,255,255,0.015)');
  floor.addColorStop(1, 'rgba(0,0,0,0.62)');
  context.fillStyle = floor;
  context.fillRect(0, groundY - 25, width, height - groundY + 25);

  context.strokeStyle = 'rgba(255,255,255,0.14)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, groundY);
  context.lineTo(width, groundY);
  context.stroke();

  const basePlayer1X = 240;
  const basePlayer2X = 720;
  let player1X = basePlayer1X;
  let player2X = basePlayer2X;
  let player1Y = groundY;
  let player2Y = groundY;

  if (action && !winner) {
    const isOffensiveAction = action.abilityType !== 'buff';
    const lunge = isOffensiveAction
      ? Math.sin(Math.min(1, motionProgress) * Math.PI) * 115
      : 0;
    const impact = motionProgress > 0.45 ? (motionProgress - 0.45) / 0.55 : 0;
    const shake = action.damage > 0 ? Math.sin(impact * Math.PI * 7) * (1 - impact) * 12 : 0;
    const dodge = action.dodged ? Math.sin(impact * Math.PI) * 55 : 0;

    if (action.actor === 'player1') {
      player1X += lunge;
      player1Y -= action.abilityType === 'area' ? Math.sin(motionProgress * Math.PI) * 26 : 0;
      player2X += shake + dodge;
    } else {
      player2X -= lunge;
      player2Y -= action.abilityType === 'area' ? Math.sin(motionProgress * Math.PI) * 26 : 0;
      player1X += shake - dodge;
    }
  }

  drawGroundShadow(context, player1X, groundY, palette.player1);
  drawGroundShadow(context, player2X, groundY, palette.player2);

  if (action && !winner) {
    drawActionEffect(
      context,
      action,
      motionProgress,
      action.actor === 'player1' ? player1X : player2X,
      action.target === 'player1' ? player1X : player2X,
      groundY,
      action.actor === 'player1' ? palette.player1 : palette.player2
    );
  }

  drawFighterSprite(
    context,
    player1Image,
    player1X,
    player1Y,
    false,
    palette.player1,
    player1Fighter.characterName,
    action?.target === 'player1' && action.blocked
  );
  drawFighterSprite(
    context,
    player2Image,
    player2X,
    player2Y,
    true,
    palette.player2,
    player2Fighter.characterName,
    action?.target === 'player2' && action.blocked
  );
}

function drawGroundShadow(
  context: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  color: string
) {
  context.save();
  context.globalAlpha = 0.34;
  context.fillStyle = color;
  context.filter = 'blur(10px)';
  context.beginPath();
  context.ellipse(x, groundY + 6, 72, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawFighterSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  groundY: number,
  flip: boolean,
  color: string,
  name: string,
  blocking: boolean
) {
  context.save();
  context.translate(x, groundY);

  const aura = context.createRadialGradient(0, -110, 12, 0, -110, 128);
  aura.addColorStop(0, `${color}32`);
  aura.addColorStop(1, `${color}00`);
  context.fillStyle = aura;
  context.fillRect(-140, -250, 280, 260);

  if (blocking) {
    context.strokeStyle = `${color}cc`;
    context.lineWidth = 5;
    context.beginPath();
    context.ellipse(0, -110, 88, 120, 0, 0, Math.PI * 2);
    context.stroke();
  }

  if (flip) context.scale(-1, 1);

  if (image?.complete && image.naturalWidth > 0) {
    const maxWidth = 225;
    const maxHeight = 285;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, -drawWidth / 2, -drawHeight, drawWidth, drawHeight);
  } else {
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, -180, 34, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-32, -150, 64, 126);
  }
  context.restore();

  context.save();
  context.textAlign = 'center';
  context.font = '800 15px ui-sans-serif, system-ui, sans-serif';
  context.fillStyle = '#f8fafc';
  context.shadowColor = '#020617';
  context.shadowBlur = 8;
  context.fillText(name, x, groundY + 34);
  context.restore();
}

function drawActionEffect(
  context: CanvasRenderingContext2D,
  action: BattleAction,
  progress: number,
  actorX: number,
  targetX: number,
  groundY: number,
  color: string
) {
  const direction = targetX > actorX ? 1 : -1;
  const impactProgress = Math.min(1, progress / 0.56);
  const effectX = actorX + (targetX - actorX) * impactProgress;
  const arc = Math.sin(impactProgress * Math.PI) * 70;
  const effectY = groundY - 145 - arc;

  context.save();
  context.globalCompositeOperation = 'lighter';

  if (action.abilityType === 'projectile' || action.abilityType === 'basic') {
    const glow = context.createRadialGradient(effectX, effectY, 0, effectX, effectY, 34);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.24, color);
    glow.addColorStop(1, `${color}00`);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(effectX, effectY, 34, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = `${color}88`;
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(effectX - direction * 75, effectY);
    context.lineTo(effectX, effectY);
    context.stroke();
  } else if (action.abilityType === 'area') {
    context.strokeStyle = `${color}bb`;
    context.lineWidth = 8;
    context.beginPath();
    context.arc(targetX, groundY - 100, 35 + progress * 115, 0, Math.PI * 2);
    context.stroke();
  } else if (action.abilityType === 'buff') {
    context.strokeStyle = `${color}cc`;
    context.lineWidth = 7;
    for (let ring = 0; ring < 3; ring += 1) {
      context.beginPath();
      context.arc(actorX, groundY - 105, 35 + ring * 22 + progress * 20, 0, Math.PI * 2);
      context.stroke();
    }
  } else {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(actorX + direction * 25, groundY - 165);
    context.lineTo(actorX + direction * 115, groundY - 80);
    context.stroke();
  }

  if (progress > 0.46 && !action.dodged && action.abilityType !== 'buff') {
    const burst = Math.min(1, (progress - 0.46) / 0.4);
    context.strokeStyle = action.critical ? '#fde68a' : color;
    context.lineWidth = action.critical ? 6 : 4;
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 12;
      const inner = 24 + burst * 8;
      const outer = 40 + burst * 64;
      context.beginPath();
      context.moveTo(
        targetX + Math.cos(angle) * inner,
        groundY - 125 + Math.sin(angle) * inner
      );
      context.lineTo(
        targetX + Math.cos(angle) * outer,
        groundY - 125 + Math.sin(angle) * outer
      );
      context.stroke();
    }
  }

  context.restore();
}

function getArenaPalette(player1Element?: string, player2Element?: string): ArenaPalette {
  const player1 = getElementColor(player1Element, '#22d3ee');
  const player2 = getElementColor(player2Element, '#fb7185');
  return {
    player1,
    player2,
    player1Rgb: hexToRgb(player1),
    player2Rgb: hexToRgb(player2),
  };
}

function getElementColor(element: string | undefined, fallback: string): string {
  const normalized = element?.toLowerCase() || '';
  if (normalized.includes('fire')) return '#fb5b45';
  if (normalized.includes('water')) return '#38bdf8';
  if (normalized.includes('lightning')) return '#facc15';
  if (normalized.includes('cyber')) return '#d946ef';
  if (normalized.includes('nature')) return '#4ade80';
  if (normalized.includes('earth')) return '#d6a85f';
  if (normalized.includes('shadow')) return '#a78bfa';
  if (normalized.includes('light')) return '#fde68a';
  if (normalized.includes('ice')) return '#67e8f9';
  if (normalized.includes('wind')) return '#5eead4';
  return fallback;
}

function hexToRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}
