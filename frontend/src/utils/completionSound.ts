/**
 * Audio cues for task / badge events. Web Audio synthesis only — no assets.
 *
 * `playCompletionChime` escalates by completion count within the local day:
 *   - Completions 1-5 play five ascending diatonic arpeggios in C major
 *     (I → ii → iii → IV → V — root to dominant), each higher than the last.
 *   - Completions 6+ play a Mario 1-up jingle (square-wave chiptune) for
 *     the rest of the day. Resets at local midnight.
 *
 * `playBadgeFanfare` is a separate, longer brass-ish flourish for badge
 * unlocks; it is NOT affected by the daily count.
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
  peakGain: number;    // 0..1 — gain of the fundamental
}

/**
 * Sine + 2x/3x harmonics — kalimba/bell character. Used for the
 * escalating chimes (completions 1-5).
 */
function playKalimbaNote(ctx: AudioContext, opts: NoteOptions): void {
  const start = ctx.currentTime + opts.startOffset;

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
}

/**
 * Pure square wave with quick attack/release — NES chiptune character.
 * Used for the Mario 1-up jingle.
 */
function playSquareNote(ctx: AudioContext, opts: NoteOptions): void {
  const start = ctx.currentTime + opts.startOffset;
  const end = start + opts.duration;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = opts.frequency;

  // Trapezoidal envelope so the note has a flat sustain and a snap release —
  // matches the on/off character of the NES PSG without being abrasive.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(opts.peakGain, start + 0.005);
  gain.gain.setValueAtTime(opts.peakGain, end - 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.01);
}

// ---------------------------------------------------------------------------
// Daily completion-count tracking — drives the escalating chime
// ---------------------------------------------------------------------------

const DAILY_COUNT_KEY = 'tasks.completionsToday';

interface DailyCount {
  date: string;  // YYYY-MM-DD in viewer's local timezone
  count: number;
}

function localDayKey(d: Date): string {
  // en-CA renders YYYY-MM-DD; locale follows the host timezone.
  return d.toLocaleDateString('en-CA');
}

/**
 * Increment the local-day completion count and return the new value.
 * Resets to 1 if the stored date is stale.
 */
function advanceDailyCount(): number {
  if (typeof window === 'undefined') return 1;
  const today = localDayKey(new Date());
  let prevCount = 0;
  try {
    const raw = window.localStorage.getItem(DAILY_COUNT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyCount>;
      if (parsed.date === today && typeof parsed.count === 'number') {
        prevCount = parsed.count;
      }
    }
  } catch {
    // ignore parse / storage errors — treat as fresh day
  }
  const next = prevCount + 1;
  try {
    const payload: DailyCount = { date: today, count: next };
    window.localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify(payload));
  } catch {
    // best-effort
  }
  return next;
}

// ---------------------------------------------------------------------------
// Sound recipes
// ---------------------------------------------------------------------------

/**
 * Five ascending diatonic arpeggios in C major: I, ii, iii, IV, V.
 * Each arpeggio is a four-note rising triad+root-octave; successive
 * arpeggios share the C-major scale so transitions stay musical.
 */
const ESCALATING_ARPEGGIOS: readonly (readonly number[])[] = [
  // 1 — C major (I)
  [523.25, 659.25, 783.99, 1046.50],
  // 2 — D minor (ii)
  [587.33, 698.46, 880.00, 1174.66],
  // 3 — E minor (iii)
  [659.25, 783.99, 987.77, 1318.51],
  // 4 — F major (IV)
  [698.46, 880.00, 1046.50, 1396.91],
  // 5 — G major (V)
  [783.99, 987.77, 1174.66, 1567.98],
];

/**
 * Mario "1-Up" jingle — fast ascending square-wave melody with a held
 * top note. Frequencies approximate the SMB original (E5 G5 E6 C6 D6 G6).
 */
const ONE_UP_NOTES: readonly { freq: number; offset: number; duration: number }[] = [
  { freq: 659.25,  offset: 0.000, duration: 0.075 }, // E5
  { freq: 783.99,  offset: 0.075, duration: 0.075 }, // G5
  { freq: 1318.51, offset: 0.150, duration: 0.075 }, // E6
  { freq: 1046.50, offset: 0.225, duration: 0.075 }, // C6
  { freq: 1174.66, offset: 0.300, duration: 0.075 }, // D6
  { freq: 1567.98, offset: 0.375, duration: 0.300 }, // G6 — hero, held
];

function playArpeggio(ctx: AudioContext, frequencies: readonly number[]): void {
  const fundamentalGain = 0.10;
  frequencies.forEach((freq, i) => {
    playKalimbaNote(ctx, {
      frequency: freq,
      startOffset: i * 0.07,
      duration: 0.36,
      peakGain: fundamentalGain,
    });
  });
}

function playOneUp(ctx: AudioContext): void {
  const peakGain = 0.07;  // square waves carry — keep them tame
  for (const note of ONE_UP_NOTES) {
    playSquareNote(ctx, {
      frequency: note.freq,
      startOffset: note.offset,
      duration: note.duration,
      peakGain,
    });
  }
}

/**
 * Plays a celebratory sound on task completion. The first 5 completions
 * in the local day each play a higher-pitched arpeggio than the last;
 * completions 6+ play the Mario 1-up jingle. Counter resets at midnight.
 *
 * Silent (no throw) if the browser has no Web Audio support or the
 * context can't resume (e.g. no prior user gesture on the page). The
 * daily counter still advances either way.
 */
export function playCompletionChime(): void {
  const count = advanceDailyCount();
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (count <= ESCALATING_ARPEGGIOS.length) {
    playArpeggio(ctx, ESCALATING_ARPEGGIOS[count - 1]);
  } else {
    playOneUp(ctx);
  }
}

/**
 * Plays a longer, brass-ish fanfare for badge unlocks. ~900ms total.
 * Distinct from the task-done chime via: wider interval (major triad +
 * octave + sustained A5 major-6th hero note), heavier harmonic content
 * (4× and 5× partials layered over a stronger fundamental), and a longer
 * final sustain. NOT affected by the daily completion counter.
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
