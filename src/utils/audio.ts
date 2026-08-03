// Web Audio API helper for synthesizing ukulele plucked sounds & reference tones

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Frequencies for open strings in standard Ukulele tuning (g4 C4 E4 A4)
export const UKULELE_TUNINGS = {
  standard: [
    { string: 4, note: 'G4', freq: 392.00, label: '4ª Corda - Sol (G4)' },
    { string: 3, note: 'C4', freq: 261.63, label: '3ª Corda - Dó (C4)' },
    { string: 2, note: 'E4', freq: 329.63, label: '2ª Corda - Mi (E4)' },
    { string: 1, note: 'A4', freq: 440.00, label: '1ª Corda - Lá (A4)' },
  ],
  lowG: [
    { string: 4, note: 'G3', freq: 196.00, label: '4ª Corda - Sol Grave (G3)' },
    { string: 3, note: 'C4', freq: 261.63, label: '3ª Corda - Dó (C4)' },
    { string: 2, note: 'E4', freq: 329.63, label: '2ª Corda - Mi (E4)' },
    { string: 1, note: 'A4', freq: 440.00, label: '1ª Corda - Lá (A4)' },
  ],
};

// Play a plucked ukulele note given frequency
export function playPluckedNote(freq: number, duration: number = 1.2, volume: number = 0.6) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Main oscillator (triangle wave gives woodsy warm acoustic sound)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Overtone oscillator for brightness/pluck attack
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 2, now);

    // Filter to simulate body resonance
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + duration);

    // Gain envelope for pluck
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(volume * 0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.15); // sharp decay for attack click

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);

    osc.stop(now + duration);
    osc2.stop(now + duration);
  } catch (e) {
    console.error('Audio playback error:', e);
  }
}

// Play a full chord arpeggiated or strummed
// frets array: [G_fret, C_fret, E_fret, A_fret]
export function playUkuleleChord(frets: number[], strumSpeed: number = 0.05) {
  const openFreqs = [392.00, 261.63, 329.63, 440.00]; // G4, C4, E4, A4

  frets.forEach((fret, stringIdx) => {
    if (fret < 0) return; // Muted string
    const baseFreq = openFreqs[stringIdx];
    const pitchFreq = baseFreq * Math.pow(2, fret / 12);

    setTimeout(() => {
      playPluckedNote(pitchFreq, 1.5, 0.5);
    }, stringIdx * strumSpeed * 1000);
  });
}

// Continuous reference tone for tuning
let activeReferenceOsc: OscillatorNode | null = null;
let activeReferenceGain: GainNode | null = null;

export function startContinuousTone(freq: number) {
  stopContinuousTone();
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    activeReferenceOsc = osc;
    activeReferenceGain = gain;
  } catch (e) {
    console.error('Error starting tone:', e);
  }
}

export function stopContinuousTone() {
  if (activeReferenceOsc && activeReferenceGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      activeReferenceGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      setTimeout(() => {
        activeReferenceOsc?.stop();
        activeReferenceOsc?.disconnect();
        activeReferenceGain?.disconnect();
        activeReferenceOsc = null;
        activeReferenceGain = null;
      }, 90);
    } catch {
      activeReferenceOsc = null;
      activeReferenceGain = null;
    }
  }
}

export function playMetronomeClick(highBeat: boolean = false) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(highBeat ? 1000 : 800, now);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {
    console.error(e);
  }
}
