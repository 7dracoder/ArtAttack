import React, { useEffect, useState } from 'react';
import { Volume2, Swords, AlertTriangle, Loader2 } from 'lucide-react';
import { playGeminiAudio, playBeepSfx } from '../lib/audioEngine';
import { RoomData } from '../types';

interface Phase4AnnouncerIntroProps {
  roomData: RoomData | null;
  geminiApiKey: string;
  onFightStart: () => void | Promise<void>;
}

export const Phase4AnnouncerIntro: React.FC<Phase4AnnouncerIntroProps> = ({
  roomData,
  geminiApiKey,
  onFightStart,
}) => {
  const [announcementText, setAnnouncementText] = useState('PREPARE FOR BATTLE!');
  const [countdown, setCountdown] = useState<number | string>(3);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isStartingFight, setIsStartingFight] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const p1 = roomData?.player1?.fighterData;
  const p2 = roomData?.player2?.fighterData;

  const startFight = async () => {
    setIsStartingFight(true);
    setStartError(null);
    try {
      await onFightStart();
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Unable to initialize the battlefield.');
    } finally {
      setIsStartingFight(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const speechController = new AbortController();

    async function runAnnouncerSequence() {
      if (!p1 || !p2) return;

      try {
        // Step 1: Announce Player 1
        const line1 = `AI pilot one online. Introducing ${p1.characterName}, master of ${p1.element}!`;
        setAnnouncementText(line1);
        void speakText(line1, speechController.signal);

        if (!mounted) return;
        await new Promise((r) => setTimeout(r, 1200));

        // Step 2: Announce Player 2
        const line2 = `AI pilot two online. Facing ${p2.characterName}, master of ${p2.element}!`;
        setAnnouncementText(line2);
        void speakText(line2, speechController.signal);

        if (!mounted) return;
        await new Promise((r) => setTimeout(r, 1200));

        // Step 3: Countdown 3, 2, 1, FIGHT!
        setAnnouncementText('GET READY!');
        playBeepSfx(false);
        setCountdown(3);
        await new Promise((r) => setTimeout(r, 800));

        if (!mounted) return;
        playBeepSfx(false);
        setCountdown(2);
        await new Promise((r) => setTimeout(r, 800));

        if (!mounted) return;
        playBeepSfx(false);
        setCountdown(1);
        await new Promise((r) => setTimeout(r, 800));

        if (!mounted) return;
        playBeepSfx(true);
        setCountdown('FIGHT!');
        setAnnouncementText('FIGHT!');

        // Speak FIGHT callout
        void speakText('FIGHT!', speechController.signal);

        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        console.error('Announcer sequence error:', err);
      }

      if (mounted) await startFight();
    }

    const sequenceTimer = window.setTimeout(() => {
      void runAnnouncerSequence();
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(sequenceTimer);
      speechController.abort();
    };
  }, []);

  const speakText = async (text: string, signal?: AbortSignal) => {
    setIsSpeaking(true);
    try {
      const res = await fetch('/api/gemini/generate-announcer-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          text,
          voice: 'Fenrir',
          customApiKey: geminiApiKey,
        }),
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        await playGeminiAudio(data.audioBase64, data.sampleRate || 24000);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.warn('TTS Speech fallback:', e);
    } finally {
      setIsSpeaking(false);
    }
  };

  return (
    <div id="phase4-announcer-intro" className="flex min-h-[82vh] flex-col items-center justify-center px-1 py-6 sm:px-4">
      <div className="glass-panel relative w-full max-w-4xl space-y-7 overflow-hidden rounded-3xl border border-rose-300/30 p-4 text-center shadow-2xl shadow-black/30 sm:p-8">
        {/* Background Glowing Flare */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Announcer Banner */}
        <div className="space-y-2">
          <div className="phase-kicker phase-kicker-battle mx-auto gap-2">
            <Swords className="h-4 w-4" />
            <span>3 / 3 · AI BATTLE</span>
          </div>
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
            <Volume2 className={`w-4 h-4 ${isSpeaking ? 'text-amber-400 animate-ping' : ''}`} />
            <span>AI pilots online · Announcer feed</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-lg md:text-4xl">
            "{announcementText}"
          </h1>
          <p className="text-xs text-slate-500">
            No player controls from here—the forged combat profiles take over.
          </p>
        </div>

        {/* Versus Face-off Cards */}
        <div className="grid grid-cols-2 gap-4 items-center max-w-2xl mx-auto relative">
          {/* Fighter 1 */}
          <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl p-4 text-center space-y-2 transform -rotate-1 shadow-xl">
            <div className="sprite-checker mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-cyan-500/30 p-2">
              {p1?.spriteUrl ? (
                <img src={p1.spriteUrl} alt={p1.characterName} className="block max-h-full max-w-full bg-transparent object-contain" />
              ) : (
                <Swords className="w-12 h-12 text-cyan-400" />
              )}
            </div>
            <div>
              <div className="font-extrabold text-cyan-300 text-lg uppercase">{p1?.characterName}</div>
              <div className="text-xs text-amber-400 font-bold">{p1?.element} Element</div>
              <p className="text-[10px] text-slate-400 italic mt-1">"{p1?.entryDialogue}"</p>
            </div>
          </div>

          {/* VS Badge */}
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-rose-600 border-2 border-amber-400 text-white font-black text-xl flex items-center justify-center italic shadow-2xl animate-pulse">
            VS
          </div>

          {/* Fighter 2 */}
          <div className="bg-slate-950 border border-rose-500/40 rounded-2xl p-4 text-center space-y-2 transform rotate-1 shadow-xl">
            <div className="sprite-checker mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-rose-500/30 p-2">
              {p2?.spriteUrl ? (
                <img src={p2.spriteUrl} alt={p2.characterName} className="block max-h-full max-w-full bg-transparent object-contain" />
              ) : (
                <Swords className="w-12 h-12 text-rose-400" />
              )}
            </div>
            <div>
              <div className="font-extrabold text-rose-300 text-lg uppercase">{p2?.characterName}</div>
              <div className="text-xs text-amber-400 font-bold">{p2?.element} Element</div>
              <p className="text-[10px] text-slate-400 italic mt-1">"{p2?.entryDialogue}"</p>
            </div>
          </div>
        </div>

        {/* Countdown Number Display */}
        <div className="pt-2">
          <div className="text-6xl md:text-8xl font-black text-amber-400 uppercase tracking-wider animate-pulse drop-shadow-2xl">
            {countdown}
          </div>
        </div>

        {startError && (
          <div className="relative z-10 mx-auto max-w-md space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
            <div className="flex items-center justify-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{startError}</span>
            </div>
            <button
              type="button"
              onClick={() => void startFight()}
              disabled={isStartingFight}
              className="mx-auto flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {isStartingFight && <Loader2 className="h-4 w-4 animate-spin" />}
              Retry Battlefield
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
