type AudioContextCtor = typeof AudioContext;

function getContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

let cachedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (cachedCtx) return cachedCtx;
  const Ctor = getContextCtor();
  if (!Ctor) return null;
  try {
    cachedCtx = new Ctor();
    return cachedCtx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  startOffset: number;
  duration: number;
  peak: number;
}

const SHORT_NOTE_RATIO = 0.7;
const FINAL_NOTE_DURATION_S = 1.8;

function buildSting(beatS: number): Note[] {
  const shortDuration = beatS * SHORT_NOTE_RATIO;
  return [
    { freq: 165, startOffset: 0, duration: shortDuration, peak: 0.22 },
    { freq: 147, startOffset: beatS, duration: shortDuration, peak: 0.22 },
    { freq: 110, startOffset: beatS * 2, duration: FINAL_NOTE_DURATION_S, peak: 0.45 },
  ];
}

export function playVillainSting(beatMs: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const sting = buildSting(beatMs / 1000);

  for (const note of sting) {
    const start = now + note.startOffset;
    const end = start + note.duration;

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = note.freq;

    const harmonic = ctx.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.value = note.freq * 2;

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.35;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(note.peak, start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    fundamental.connect(envelope);
    harmonic.connect(harmonicGain).connect(envelope);
    envelope.connect(master);

    fundamental.start(start);
    fundamental.stop(end + 0.05);
    harmonic.start(start);
    harmonic.stop(end + 0.05);
  }
}
