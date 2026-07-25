import React from 'react';
import { Database, Sparkles, CheckCircle2, Zap } from 'lucide-react';

export const TopConfigBar: React.FC = () => {
  return (
    <div id="top-config-bar" className="bg-slate-950 border-b border-cyan-500/30 text-slate-100 shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between text-xs md:text-sm">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-black tracking-wider text-cyan-400 text-base">
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            <span className="bg-gradient-to-r from-amber-400 via-rose-500 to-cyan-400 bg-clip-text text-transparent">
              ART ATTACK
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-2 border-l border-slate-800 pl-3">
            <span className="text-[11px] text-slate-400 font-semibold">
              Real-time Multiplayer 2D Fighter Engine
            </span>
          </div>
        </div>

        {/* Right: Live Connection Badges */}
        <div className="flex items-center space-x-2">
          {/* Automatic Firebase Status */}
          <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Firebase Cloud:</span>
            <span className="text-emerald-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" /> Live
            </span>
          </span>

          {/* Automatic Gemini AI Status */}
          <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Gemini AI Engine:</span>
            <span className="text-emerald-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
