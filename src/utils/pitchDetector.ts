/**
 * Detecção de pitch (afinador): captura do microfone e análise de frequência (autocorrelação/FFT).
 */
// Pitch detection using Autocorrelation algorithm for Ukulele Tuner

export interface PitchResult {
  frequency: number;
  noteName: string;
  targetNote: string;
  targetFreq: number;
  cents: number; // offset from target (-50 to +50)
  stringNumber: number; // 1, 2, 3, 4
  clarity: number; // 0 to 1 confidence
  isInTune: boolean; // within -5 to +5 cents
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const TARGET_STRINGS = [
  { stringNumber: 4, noteName: 'G4', freq: 392.00, display: '4ª Corda (G)' },
  { stringNumber: 3, noteName: 'C4', freq: 261.63, display: '3ª Corda (C)' },
  { stringNumber: 2, noteName: 'E4', freq: 329.63, display: '2ª Corda (E)' },
  { stringNumber: 1, noteName: 'A4', freq: 440.00, display: '1ª Corda (A)' },
];

export const TARGET_STRINGS_LOW_G = [
  { stringNumber: 4, noteName: 'G3', freq: 196.00, display: '4ª Corda Low-G' },
  { stringNumber: 3, noteName: 'C4', freq: 261.63, display: '3ª Corda (C)' },
  { stringNumber: 2, noteName: 'E4', freq: 329.63, display: '2ª Corda (E)' },
  { stringNumber: 1, noteName: 'A4', freq: 440.00, display: '1ª Corda (A)' },
];

export function autoCorrelate(buf: Float32Array, sampleRate: number): { pitch: number; clarity: number } {
  const SIZE = buf.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // If too quiet (noise floor), return -1
  if (rms < 0.015) {
    return { pitch: -1, clarity: 0 };
  }

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;

  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }

  const buf2 = buf.slice(r1, r2);
  const c = new Float32Array(buf2.length);

  for (let i = 0; i < buf2.length; i++) {
    for (let j = 0; j < buf2.length - i; j++) {
      c[i] = c[i] + buf2[j] * buf2[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;

  for (let i = d; i < buf2.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;

  if (T0 === -1) return { pitch: -1, clarity: 0 };

  // Interpolation for fractional period
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];

  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) {
    T0 = T0 - b / (2 * a);
  }

  const pitch = sampleRate / T0;
  const clarity = maxval / c[0];

  return { pitch, clarity };
}

export function analyzePitch(
  frequency: number,
  isLowG: boolean = false,
  selectedTargetString?: number
): PitchResult | null {
  if (frequency < 80 || frequency > 1200) return null;

  const targets = isLowG ? TARGET_STRINGS_LOW_G : TARGET_STRINGS;

  // MIDI Note Calculation
  const noteNum = 12 * (Math.log2(frequency / 440)) + 69;
  const midiNote = Math.round(noteNum);
  const noteName = NOTE_NAMES[midiNote % 12] + Math.floor(midiNote / 12 - 1);

  let target = targets[0];

  if (selectedTargetString && selectedTargetString >= 1 && selectedTargetString <= 4) {
    target = targets.find((t) => t.stringNumber === selectedTargetString) || targets[0];
  } else {
    // Auto-detect closest string
    let minDiff = Infinity;
    for (const t of targets) {
      const diff = Math.abs(frequency - t.freq);
      if (diff < minDiff) {
        minDiff = diff;
        target = t;
      }
    }
  }

  // Cents offset calculation relative to target frequency
  const cents = Math.round(1200 * Math.log2(frequency / target.freq));
  const isInTune = Math.abs(cents) <= 4;

  return {
    frequency: Math.round(frequency * 10) / 10,
    noteName,
    targetNote: target.noteName,
    targetFreq: target.freq,
    cents: Math.max(-50, Math.min(50, cents)),
    stringNumber: target.stringNumber,
    clarity: 1,
    isInTune,
  };
}
