import React from 'react';
import { Bot, CheckCircle2, Cloud, Paintbrush, Sparkles, Wand2 } from 'lucide-react';
import { GamePhase, PlayerId } from '../types';

interface TopConfigBarProps {
  phase: GamePhase;
  isCloudReady: boolean;
  roomCode: string | null;
  playerId: PlayerId | null;
}

const STEPS = [
  { label: 'Draw', icon: Paintbrush, phases: ['DRAWING'] },
  { label: 'AI Forge', icon: Wand2, phases: ['ANALYZING', 'SPRITE_GEN', 'INTRO'] },
  { label: 'Battle', icon: Bot, phases: ['FIGHT', 'VICTORY'] },
];

export const TopConfigBar: React.FC<TopConfigBarProps> = ({
  phase,
  isCloudReady,
  roomCode,
  playerId,
}) => {
  return (
    <header
      id="top-config-bar"
      className="sticky top-0 z-50 border-b border-white/10 bg-[#070914]/85 text-slate-100 shadow-lg shadow-black/20 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-gradient-to-br from-amber-300/20 via-rose-400/15 to-cyan-300/20">
            <Sparkles className="h-5 w-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="bg-gradient-to-r from-amber-300 via-rose-400 to-cyan-300 bg-clip-text text-sm font-black tracking-[0.15em] text-transparent sm:text-base">
              ART ATTACK
            </div>
            <div className="hidden truncate text-[10px] font-semibold text-slate-500 sm:block">
              Sketch it. Forge it. Watch it fight.
            </div>
          </div>
        </div>

        <nav aria-label="Game progress" className="hidden items-center gap-1 md:flex">
          {STEPS.map((step, index) => {
            const active = step.phases.includes(phase);
            const Icon = step.icon;
            return (
              <React.Fragment key={step.label}>
                {index > 0 && <div className="h-px w-5 bg-white/10" />}
                <div
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${
                    active
                      ? 'border border-violet-300/30 bg-violet-300/10 text-violet-200'
                      : 'text-slate-600'
                  }`}
                >
                  <span className="font-mono text-[9px]">{index + 1}</span>
                  <Icon className="h-3.5 w-3.5" />
                  {step.label}
                </div>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {roomCode && (
            <div className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-right sm:block">
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                Room · {playerId === 'player1' ? 'Creator 1' : 'Creator 2'}
              </div>
              <div className="font-mono text-xs font-black tracking-[0.16em] text-white">
                {roomCode}
              </div>
            </div>
          )}
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide ${
              isCloudReady
                ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-300'
                : 'border-rose-300/25 bg-rose-300/10 text-rose-300'
            }`}
          >
            {isCloudReady ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{isCloudReady ? 'Cloud configured' : 'Offline'}</span>
          </span>
        </div>
      </div>
    </header>
  );
};
