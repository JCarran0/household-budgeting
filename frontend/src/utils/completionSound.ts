/**
 * Plays a short celebratory chime when a task is marked done. Uses the
 * Web Audio API (no assets, no dependencies) so it ships self-contained.
 *
 * Tone = ascending C major arpeggio (C5 → E5 → G5 → C6) with kalimba-ish
 * overtones: each note is a fundamental sine plus quiet 2× and 3× harmonics,
 * which gives a bell/thumb-piano character without bloating the duration.
 *
 * Call `playCompletionChime()` from a mutation's onSuccess once the server
 * confirms status='done'. Subsequent calls re-use the lazy AudioContext.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

interface NoteOptions {
  frequency: number;
  startOffset: number; // seconds from now
  duration: number;    // seconds
  peakGain: number;    // 0..1 — gain of the fundamental; harmonics are scaled down
}

function playNote(ctx: AudioContext, opts: NoteOptions): void {
  const now = ctx.currentTime;
  const start = now + opts.startOffset;
  const end = start + opts.duration;

  // Fundamental + two harmonics for a kalimba/bell-like timbre. Harmonics
  // decay faster than the fundamental so they act as a bright attack
  // shimmer rather than a sustained drone.
  const partials: { multiplier: number; gain: number; releaseScale: number }[] = [
    { multiplier: 1, gain: opts.peakGain, releaseScale: 1.0 },
    { multiplier: 2, gain: opts.peakGain * 0.28, releaseScale: 0.55 },
    { multiplier: 3, gain: opts.peakGain * 0.14, releaseScale: 0.4 },
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = opts.frequency * p.multiplier;

    const partialEnd = start + opts.duration * p.releaseScale;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(p.gain, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, partialEnd);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(partialEnd + 0.02);
  }
  // (end used only for layout; harmonic stops track their own release)
  void end;
}

/**
 * Plays an ascending C major arpeggio (C5 → E5 → G5 → C6) with a
 * kalimba-style timbre. ~380ms total.
 * Silent (no throw) if the browser has no Web Audio support or the
 * context can't resume (e.g. no prior user gesture on the page).
 */
export function playCompletionChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const fundamentalGain = 0.10; // keep the arpeggio soft — it stacks at the tail

  // C major triad + octave top note. Staggered 70ms apart; each note
  // sustains ~320ms so later notes overlap the tails of earlier ones for
  // a chord-like wash at the peak before everything rings out together.
  const notes = [
    { frequency: 523.25, startOffset: 0.00 },  // C5
    { frequency: 659.25, startOffset: 0.07 },  // E5
    { frequency: 783.99, startOffset: 0.14 },  // G5
    { frequency: 1046.50, startOffset: 0.21 }, // C6 — octave above root
  ];

  for (const note of notes) {
    playNote(ctx, {
      frequency: note.frequency,
      startOffset: note.startOffset,
      duration: 0.36,
      peakGain: fundamentalGain,
    });
  }
}

/**
 * Plays a longer, brass-ish fanfare for badge unlocks. ~900ms total.
 * Distinct from the task-done chime via: wider interval (major triad +
 * octave + sustained A5 major-6th hero note), heavier harmonic content
 * (4× and 5× partials layered over a stronger fundamental), and a longer
 * final sustain. Silent-fail safe exactly like `playCompletionChime`.
 */
export function playBadgeFanfare(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const start = ctx.currentTime;
  const fundamentalGain = 0.14;

  // Brass-ish partial mix: bright attack (4× / 5×) layered on the fundamental.
  const partials: { multiplier: number; gain: number; releaseScale: number }[] = [
    { multiplier: 1, gain: fundamentalGain, releaseScale: 1.0 },
    { multiplier: 2, gain: fundamentalGain * 0.38, releaseScale: 0.75 },
    { multiplier: 3, gain: fundamentalGain * 0.22, releaseScale: 0.55 },
    { multiplier: 4, gain: fundamentalGain * 0.14, releaseScale: 0.4 },
    { multiplier: 5, gain: fundamentalGain * 0.08, releaseScale: 0.3 },
  ];

  const notes = [
    { frequency: 523.25, offset: 0.00, duration: 0.30 },  // C5
    { frequency: 659.25, offset: 0.12, duration: 0.30 },  // E5
    { frequency: 783.99, offset: 0.24, duration: 0.30 },  // G5
    { frequency: 1046.50, offset: 0.36, duration: 0.55 }, // C6 — hero
    { frequency: 880.00, offset: 0.48, duration: 0.45 },  // A5 — major 6th overlay
  ];

  for (const note of notes) {
    const noteStart = start + note.offset;
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.frequency * p.multiplier;

      const partialEnd = noteStart + note.duration * p.releaseScale;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(p.gain, noteStart + 0.010);
      gain.gain.exponentialRampToValueAtTime(0.0001, partialEnd);

      osc.connect(gain).connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(partialEnd + 0.02);
    }
  }
}
