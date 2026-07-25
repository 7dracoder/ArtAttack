// Web Audio API Sound Effects & Dynamic Procedural Fighting Music Engine

let audioCtx: AudioContext | null = null;
let bgMusicOscs: { stop: () => void }[] = [];
let isBgMusicPlaying = false;
let bgMusicLoopInterval: any = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play raw 24kHz PCM / base64 TTS audio from Gemini
export async function playGeminiAudio(base64Audio: string, sampleRate = 24000): Promise<void> {
  try {
    const ctx = getAudioContext();
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert 16-bit PCM little-endian data
    const pcm16 = new Int16Array(bytes.buffer);
    const numSamples = pcm16.length;
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Add gain boost for announcer voice clarity
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.3;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.error('Error playing Gemini Audio:', err);
  }
}

// Play Sound Effect: Punch / Hit
export function playHitSfx(intensity = 1) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160 * intensity, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {}
}

// Play Sound Effect: Ability Blast / Fireball / Lightning
export function playAbilitySfx(element = 'fire') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (element.toLowerCase().includes('lightning') || element.toLowerCase().includes('cyber')) {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    } else if (element.toLowerCase().includes('water') || element.toLowerCase().includes('ice')) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.25);
    } else {
      // Fire / Shadow
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.35);
    }

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {}
}

// Play Sound Effect: Shield Block
export function playBlockSfx() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.1);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {}
}

// Play Sound Effect: Countdown Beep
export function playBeepSfx(isFinal = false) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {}
}

// Play Sound Effect: KO Victory Gong
export function playKoSfx() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Resonant Gong Chord
    const freqs = [130.81, 164.81, 196.0, 261.63];
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 2.5);
    });
  } catch (e) {}
}

// Start Procedural Dynamic Background Music tuned to character elements / theme
export function startFightBgMusic(element = 'cyber', bpm = 130) {
  stopFightBgMusic();
  isBgMusicPlaying = true;

  try {
    const ctx = getAudioContext();
    let noteStep = 0;

    // Scale notes based on element
    let scale: number[];
    if (element.toLowerCase().includes('fire') || element.toLowerCase().includes('shadow')) {
      // Phrygian / Metal scale: C, Db, E, F, G, Ab, Bb
      scale = [130.81, 138.59, 164.81, 174.61, 196.0, 207.65, 233.08, 261.63];
    } else if (element.toLowerCase().includes('water') || element.toLowerCase().includes('nature')) {
      // Pentatonic / Serene scale: C, D, E, G, A
      scale = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63];
    } else {
      // Cyber / Lightning synthwave scale: A minor / Dorian
      scale = [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 196.0, 220.0];
    }

    const stepDuration = 60 / bpm / 2; // 16th notes

    bgMusicLoopInterval = setInterval(() => {
      if (!isBgMusicPlaying) return;
      const now = ctx.currentTime;

      // Bass pulse on steps 0, 4, 8, 12
      if (noteStep % 4 === 0) {
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();

        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(scale[0] / 2, now);

        bassGain.gain.setValueAtTime(0.18, now);
        bassGain.gain.exponentialRampToValueAtTime(0.01, now + stepDuration * 2);

        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);

        bassOsc.start(now);
        bassOsc.stop(now + stepDuration * 2);
      }

      // Synth Arpeggio lead
      const noteFreq = scale[noteStep % scale.length];
      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();

      leadOsc.type = element.includes('cyber') ? 'square' : 'sawtooth';
      leadOsc.frequency.setValueAtTime(noteFreq, now);

      leadGain.gain.setValueAtTime(0.08, now);
      leadGain.gain.exponentialRampToValueAtTime(0.005, now + stepDuration);

      leadOsc.connect(leadGain);
      leadGain.connect(ctx.destination);

      leadOsc.start(now);
      leadOsc.stop(now + stepDuration);

      noteStep = (noteStep + 1) % 16;
    }, stepDuration * 1000);
  } catch (err) {
    console.error('Failed to start BG music:', err);
  }
}

export function stopFightBgMusic() {
  isBgMusicPlaying = false;
  if (bgMusicLoopInterval) {
    clearInterval(bgMusicLoopInterval);
    bgMusicLoopInterval = null;
  }
}
