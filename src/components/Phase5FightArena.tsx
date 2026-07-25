import React, { useRef, useEffect, useState } from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  RotateCcw,
  LogOut,
  Trophy,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
} from 'lucide-react';
import {
  syncPlayerState,
  applyDamageToPlayer,
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
  playGeminiAudio,
} from '../lib/audioEngine';
import { RoomData, PlayerId, PlayerFightState, FighterData } from '../types';

interface Phase5FightArenaProps {
  roomCode: string;
  playerId: PlayerId;
  geminiApiKey: string;
  roomData: RoomData | null;
  onLeaveRoom: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface Projectile {
  id: string;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  damage: number;
  color: string;
  size: number;
}

export const Phase5FightArena: React.FC<Phase5FightArenaProps> = ({
  roomCode,
  playerId,
  geminiApiKey,
  roomData,
  onLeaveRoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [commentaryText, setCommentaryText] = useState<string | null>(null);
  const [loadingCommentary, setLoadingCommentary] = useState(false);

  // Fighter References
  const p1Fighter = roomData?.player1?.fighterData;
  const p2Fighter = roomData?.player2?.fighterData;

  const isHost = playerId === 'player1';
  const myFighter = isHost ? p1Fighter : p2Fighter;
  const oppFighter = isHost ? p2Fighter : p1Fighter;
  const initialMyState = roomData?.fightState?.[playerId];
  const opponentId: PlayerId = isHost ? 'player2' : 'player1';
  const initialOpponentState = roomData?.fightState?.[opponentId];

  // Local physics state
  const myStateRef = useRef<PlayerFightState>(
    initialMyState
      ? { ...initialMyState }
      : {
          x: isHost ? 150 : 650,
          y: 320,
          vx: 0,
          vy: 0,
          hp: myFighter?.stats.hp || 100,
          facingLeft: !isHost,
          isGrounded: true,
          isAttacking: false,
          isBlocking: false,
          currentAction: null,
          cooldowns: {},
          updatedAt: Date.now(),
        }
  );

  const oppStateRef = useRef<PlayerFightState>(
    initialOpponentState
      ? { ...initialOpponentState }
      : {
          x: isHost ? 650 : 150,
          y: 320,
          vx: 0,
          vy: 0,
          hp: oppFighter?.stats.hp || 100,
          facingLeft: isHost,
          isGrounded: true,
          isAttacking: false,
          isBlocking: false,
          currentAction: null,
          cooldowns: {},
          updatedAt: Date.now(),
        }
  );

  // Loaded Sprite Images
  const myImgRef = useRef<HTMLImageElement | null>(null);
  const oppImgRef = useRef<HTMLImageElement | null>(null);

  // Visual Effects
  const particlesRef = useRef<Particle[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);

  // Input Keys State
  const keysRef = useRef<Record<string, boolean>>({});
  const syncInFlightRef = useRef(false);

  const winner = roomData?.fightState?.winner;
  const player1State = isHost ? myStateRef.current : oppStateRef.current;
  const player2State = isHost ? oppStateRef.current : myStateRef.current;

  // Preload Sprites
  useEffect(() => {
    if (myFighter?.spriteUrl) {
      const img = new Image();
      img.src = myFighter.spriteUrl;
      img.onload = () => {
        myImgRef.current = img;
      };
    }
    if (oppFighter?.spriteUrl) {
      const img = new Image();
      img.src = oppFighter.spriteUrl;
      img.onload = () => {
        oppImgRef.current = img;
      };
    }
  }, [myFighter?.spriteUrl, oppFighter?.spriteUrl]);

  // Start Background Music on Arena Enter
  useEffect(() => {
    const stageEnv = p1Fighter?.element || 'cyber';
    if (soundEnabled) {
      startFightBgMusic(stageEnv, 135);
    }
    return () => {
      stopFightBgMusic();
    };
  }, [p1Fighter?.element, soundEnabled]);

  // Apply authoritative fight snapshots. Local movement stays responsive, while
  // HP always comes from Firestore so received damage cannot be overwritten.
  useEffect(() => {
    if (!roomData?.fightState) return;
    const myRemoteState = roomData.fightState[playerId];
    const oppKey = isHost ? 'player2' : 'player1';
    const remoteState = roomData.fightState[oppKey];

    if (myRemoteState) {
      myStateRef.current.hp = myRemoteState.hp;
    }

    if (remoteState) {
      // Lerp opponent position for smooth anti-jitter rendering
      oppStateRef.current = {
        ...remoteState,
        x: oppStateRef.current.x * 0.7 + remoteState.x * 0.3,
        y: oppStateRef.current.y * 0.7 + remoteState.y * 0.3,
      };
    }
  }, [roomData?.fightState]);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;

      // Quick Ability Hotkeys (1, 2, 3 or Z, X, C)
      if (['1', 'z'].includes(e.key.toLowerCase())) triggerAbility(0);
      if (['2', 'x'].includes(e.key.toLowerCase())) triggerAbility(1);
      if (['3', 'c'].includes(e.key.toLowerCase())) triggerAbility(2);
      if (e.key === ' ') performBasicPunch();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [myFighter]);

  // Ability Activation Logic
  const triggerAbility = (index: number) => {
    if (!myFighter || winner || myStateRef.current.hp <= 0) return;
    const ability = myFighter.abilities[index];
    if (!ability) return;

    const cdKey = `ability_${index}`;
    const now = Date.now();
    const lastUsed = myStateRef.current.cooldowns[cdKey] || 0;

    if (now - lastUsed < ability.cooldown * 1000) {
      return; // Still on cooldown
    }

    myStateRef.current.cooldowns[cdKey] = now;
    myStateRef.current.isAttacking = true;
    myStateRef.current.currentAction = ability.name;

    if (soundEnabled) playAbilitySfx(myFighter.element);

    // Spawn Projectile or Area Attack
    const pX = myStateRef.current.x;
    const pY = myStateRef.current.y;
    const dir = myStateRef.current.facingLeft ? -1 : 1;

    if (ability.type === 'projectile') {
      projectilesRef.current.push({
        id: 'proj_' + Math.random(),
        owner: playerId,
        x: pX + dir * 40,
        y: pY - 30,
        vx: dir * 12,
        damage: ability.damage,
        color: getElementColor(myFighter.element),
        size: 16,
      });
    } else {
      // Melee or Area Blast
      checkMeleeHit(ability.damage, 120);
      spawnParticles(pX + dir * 50, pY - 30, getElementColor(myFighter.element), 20);
    }

    setTimeout(() => {
      myStateRef.current.isAttacking = false;
      myStateRef.current.currentAction = null;
    }, 400);
  };

  const performBasicPunch = () => {
    if (winner || myStateRef.current.hp <= 0) return;
    myStateRef.current.isAttacking = true;
    myStateRef.current.currentAction = 'Punch';

    if (soundEnabled) playHitSfx(1);

    const dir = myStateRef.current.facingLeft ? -1 : 1;
    checkMeleeHit(12, 70);
    spawnParticles(myStateRef.current.x + dir * 40, myStateRef.current.y - 30, '#f59e0b', 8);

    setTimeout(() => {
      myStateRef.current.isAttacking = false;
      myStateRef.current.currentAction = null;
    }, 250);
  };

  const checkMeleeHit = (damage: number, reach = 80) => {
    const myPos = myStateRef.current;
    const oppPos = oppStateRef.current;

    const dist = Math.abs(myPos.x - oppPos.x);
    if (dist < reach && Math.abs(myPos.y - oppPos.y) < 60) {
      // Opponent hit!
      const oppKey: PlayerId = isHost ? 'player2' : 'player1';
      let finalDmg = damage - (oppFighter?.stats.defense || 5) * 0.3;
      if (oppPos.isBlocking) {
        finalDmg *= 0.3; // Block reduces damage
        if (soundEnabled) playBlockSfx();
      } else {
        if (soundEnabled) playHitSfx(1.5);
      }

      const dealtDamage = Math.max(2, finalDmg);
      void applyDamageToPlayer(roomCode, oppKey, dealtDamage, playerId)
        .then((isKo) => {
          if (isKo && soundEnabled) playKoSfx();
        })
        .catch((error) => console.warn('Unable to apply melee damage:', error));
    }
  };

  // Main Game Physics & Render Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTick = Date.now();

    const loop = () => {
      const now = Date.now();

      // Update Local Movement Physics
      if (!winner && myStateRef.current.hp > 0) {
        const speed = (myFighter?.stats.speed || 5) * 0.8;
        const keys = keysRef.current;

        // Horizontal Movement
        if (keys['a'] || keys['arrowleft']) {
          myStateRef.current.x -= speed;
          myStateRef.current.facingLeft = true;
        }
        if (keys['d'] || keys['arrowright']) {
          myStateRef.current.x += speed;
          myStateRef.current.facingLeft = false;
        }

        // Jump Physics
        if ((keys['w'] || keys['arrowup']) && myStateRef.current.isGrounded) {
          myStateRef.current.vy = -12;
          myStateRef.current.isGrounded = false;
        }

        // Block
        myStateRef.current.isBlocking = Boolean(keys['s'] || keys['arrowdown']);

        // Gravity
        myStateRef.current.y += myStateRef.current.vy;
        myStateRef.current.vy += 0.6; // Gravity constant

        // Floor collision
        if (myStateRef.current.y >= 320) {
          myStateRef.current.y = 320;
          myStateRef.current.vy = 0;
          myStateRef.current.isGrounded = true;
        }

        // Arena boundary bounds
        myStateRef.current.x = Math.max(40, Math.min(760, myStateRef.current.x));
      }

      // Firestore is not a 60 FPS transport. Keep writes bounded, avoid overlap,
      // and stop immediately after a winner so rematch cleanup cannot be raced.
      if (!winner && !syncInFlightRef.current && now - lastTick > 125) {
        lastTick = now;
        myStateRef.current.updatedAt = now;
        syncInFlightRef.current = true;
        void syncPlayerState(roomCode, playerId, myStateRef.current)
          .catch((error) => console.warn('Unable to sync player state:', error))
          .finally(() => {
            syncInFlightRef.current = false;
          });
      }

      // Update Projectiles
      projectilesRef.current.forEach((p, idx) => {
        p.x += p.vx;
        spawnParticles(p.x, p.y, p.color, 2);

        // Projectile collision with opponent
        const oppPos = oppStateRef.current;
        if (Math.abs(p.x - oppPos.x) < 35 && Math.abs(p.y - oppPos.y) < 50) {
          if (p.owner === playerId) {
            const oppKey: PlayerId = isHost ? 'player2' : 'player1';
            let dmg = p.damage;
            if (oppPos.isBlocking) dmg *= 0.3;
            void applyDamageToPlayer(roomCode, oppKey, dmg, playerId)
              .then((isKo) => {
                if (isKo && soundEnabled) playKoSfx();
              })
              .catch((error) => console.warn('Unable to apply projectile damage:', error));
          }
          projectilesRef.current.splice(idx, 1);
        } else if (p.x < 0 || p.x > 800) {
          projectilesRef.current.splice(idx, 1);
        }
      });

      // Render Stage Environment & Characters
      renderStage(ctx);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [winner, myFighter, oppFighter]);

  // Canvas Stage Renderer
  const renderStage = (ctx: CanvasRenderingContext2D) => {
    // 1. Draw Environment Stage
    const stageEnv = p1Fighter?.element || 'cyber';

    if (stageEnv.toLowerCase().includes('fire')) {
      ctx.fillStyle = '#180707';
      ctx.fillRect(0, 0, 800, 400);
      // Lava glow
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(0, 360, 800, 40);
    } else if (stageEnv.toLowerCase().includes('water')) {
      ctx.fillStyle = '#061727';
      ctx.fillRect(0, 0, 800, 400);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 360, 800, 40);
    } else {
      // Cyber Grid Stage
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 800, 400);

      // Grid lines
      ctx.strokeStyle = '#06b6d422';
      ctx.lineWidth = 1;
      for (let x = 0; x < 800; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 400);
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 360, 800, 40);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 360, 800, 2);
    }

    // 2. Draw Fighters (My Sprite & Opponent Sprite)
    drawFighter(ctx, myStateRef.current, myImgRef.current, myFighter?.characterName || 'Player 1', true);
    drawFighter(ctx, oppStateRef.current, oppImgRef.current, oppFighter?.characterName || 'Player 2', false);

    // 3. Draw Projectiles
    projectilesRef.current.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Draw Particles
    particlesRef.current.forEach((part, i) => {
      part.x += part.vx;
      part.y += part.vy;
      part.life--;
      ctx.fillStyle = part.color;
      ctx.fillRect(part.x, part.y, part.size, part.size);
      if (part.life <= 0) particlesRef.current.splice(i, 1);
    });
  };

  const drawFighter = (
    ctx: CanvasRenderingContext2D,
    state: PlayerFightState,
    img: HTMLImageElement | null,
    name: string,
    isMe: boolean
  ) => {
    ctx.save();
    ctx.translate(state.x, state.y);

    if (state.facingLeft) {
      ctx.scale(-1, 1);
    }

    // Draw Shield aura if blocking
    if (state.isBlocking) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -35, 45, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Sprite or Stickman Fallback
    if (img && img.complete) {
      ctx.drawImage(img, -45, -80, 90, 90);
    } else {
      ctx.fillStyle = isMe ? '#06b6d4' : '#f43f5e';
      ctx.fillRect(-20, -70, 40, 70);
    }

    ctx.restore();

    // Draw Character Name & Action Overhead
    ctx.fillStyle = isMe ? '#38bdf8' : '#fb7185';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, state.x, state.y - 90);

    if (state.currentAction) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(state.currentAction.toUpperCase(), state.x, state.y - 105);
    }
  };

  const spawnParticles = (x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        color,
        life: 15 + Math.random() * 15,
        maxLife: 30,
        size: 3 + Math.random() * 3,
      });
    }
  };

  // Generate Match Commentary on Winner
  useEffect(() => {
    if (winner && !commentaryText && !loadingCommentary) {
      setLoadingCommentary(true);
      const winnerName = winner === 'player1' ? p1Fighter?.characterName : p2Fighter?.characterName;
      const loserName = winner === 'player1' ? p2Fighter?.characterName : p1Fighter?.characterName;

      fetch('/api/gemini/generate-commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerName: winnerName || 'Fighter 1',
          loserName: loserName || 'Fighter 2',
          duration: 35,
          remainingHp: 45,
          customApiKey: geminiApiKey,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.commentary) {
            setCommentaryText(data.commentary);
            if (playerId === 'player1') {
              setMatchCommentary(roomCode, data.commentary);
            }
          }
        })
        .finally(() => setLoadingCommentary(false));
    }
  }, [winner]);

  const handleRematch = async () => {
    try {
      await resetRoomForRematch(roomCode);
    } catch (err) {
      console.error('Error resetting rematch:', err);
    }
  };

  return (
    <div id="phase5-fight-arena" className="min-h-[85vh] flex flex-col items-center justify-center p-2 md:p-4">
      {/* Top Match HUD: Health Bars & Cooldowns */}
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-3 mb-3 shadow-2xl space-y-2">
        <div className="grid grid-cols-2 gap-4 items-center">
          {/* Player 1 HUD */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-black text-cyan-300">
              <span className="uppercase">{p1Fighter?.characterName || 'Player 1'}</span>
              <span>
                {player1State.hp} / {p1Fighter?.stats.maxHp || p1Fighter?.stats.hp || 100} HP
              </span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-200"
                style={{
                  width: `${Math.max(
                    0,
                    (player1State.hp / (p1Fighter?.stats.maxHp || p1Fighter?.stats.hp || 100)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Player 2 HUD */}
          <div className="space-y-1 text-right">
            <div className="flex justify-between items-center text-xs font-black text-rose-300">
              <span>
                {player2State.hp} / {p2Fighter?.stats.maxHp || p2Fighter?.stats.hp || 100} HP
              </span>
              <span className="uppercase">{p2Fighter?.characterName || 'Player 2'}</span>
            </div>
            <div className="w-full bg-slate-950 h-3 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-200 ml-auto"
                style={{
                  width: `${Math.max(
                    0,
                    (player2State.hp / (p2Fighter?.stats.maxHp || p2Fighter?.stats.hp || 100)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Ability Hotkey Bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Abilities (Hotkeys 1, 2, 3):</span>
            {myFighter?.abilities.map((ability, idx) => (
              <button
                key={idx}
                onClick={() => triggerAbility(idx)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 font-bold text-[11px] flex items-center space-x-1"
              >
                <span>[{idx + 1}] {ability.name}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
            title="Toggle Audio"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
        </div>
      </div>

      {/* 2D Fighting Stage Canvas Container */}
      <div
        ref={containerRef}
        className="w-full max-w-4xl aspect-[2/1] bg-slate-950 rounded-2xl border-4 border-slate-800 shadow-2xl overflow-hidden relative"
      >
        <canvas ref={canvasRef} width={800} height={400} className="w-full h-full block" />

        {/* KO / Victory Overlay */}
        {winner && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4 animate-fade-in z-30">
            <Trophy className="w-16 h-16 text-amber-400 animate-bounce" />
            <h2 className="text-3xl md:text-5xl font-black text-amber-300 uppercase tracking-tight italic">
              VICTORY!
            </h2>
            <div className="text-lg font-extrabold text-white">
              {winner === 'player1' ? p1Fighter?.characterName : p2Fighter?.characterName} Claims Total Victory!
            </div>

            {/* Commentary Recap */}
            {commentaryText && (
              <div className="max-w-md bg-slate-900 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 italic shadow">
                "{commentaryText}"
              </div>
            )}

            {/* Post Match Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                id="rematch-btn"
                onClick={handleRematch}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase rounded-xl shadow-lg transition-all flex items-center space-x-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Rematch</span>
              </button>
              <button
                id="leave-room-btn"
                onClick={onLeaveRoom}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm uppercase rounded-xl border border-slate-700 transition-all flex items-center space-x-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave Room</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* On-Screen Mobile & Touch Gamepad Controls */}
      <div className="w-full max-w-4xl mt-3 grid grid-cols-2 gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-3 md:hidden">
        {/* Direction Pad */}
        <div className="flex items-center space-x-2 justify-center">
          <button
            onTouchStart={() => (keysRef.current['a'] = true)}
            onTouchEnd={() => (keysRef.current['a'] = false)}
            className="p-3 bg-slate-800 active:bg-cyan-600 text-white rounded-xl border border-slate-700 font-bold"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <button
            onTouchStart={() => (keysRef.current['w'] = true)}
            onTouchEnd={() => (keysRef.current['w'] = false)}
            className="p-3 bg-slate-800 active:bg-cyan-600 text-white rounded-xl border border-slate-700 font-bold"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
          <button
            onTouchStart={() => (keysRef.current['d'] = true)}
            onTouchEnd={() => (keysRef.current['d'] = false)}
            className="p-3 bg-slate-800 active:bg-cyan-600 text-white rounded-xl border border-slate-700 font-bold"
          >
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 justify-center">
          <button
            onClick={performBasicPunch}
            className="px-4 py-3 bg-amber-500 active:bg-amber-400 text-slate-950 font-black rounded-xl text-xs uppercase"
          >
            Punch
          </button>
          <button
            onClick={() => triggerAbility(0)}
            className="px-4 py-3 bg-rose-600 active:bg-rose-500 text-white font-black rounded-xl text-xs uppercase"
          >
            Move 1
          </button>
        </div>
      </div>
    </div>
  );
};

function getElementColor(element?: string): string {
  if (!element) return '#06b6d4';
  const el = element.toLowerCase();
  if (el.includes('fire')) return '#ef4444';
  if (el.includes('water')) return '#3b82f6';
  if (el.includes('lightning') || el.includes('cyber')) return '#eab308';
  if (el.includes('nature') || el.includes('earth')) return '#22c55e';
  if (el.includes('shadow')) return '#a855f7';
  if (el.includes('ice')) return '#06b6d4';
  return '#f59e0b';
}
