// Mode table, colour tones and small pure helpers shared by the body-scanner modules.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';

// Wellness-observation modes only. Disease/condition-inference modes are
// intentionally NOT exposed — they fall outside a general-wellness framing.
export const MODES = [
  { id: 'heart', icon: icons.heart, label: 'Pulse', desc: 'Resting pulse estimate (camera)', guide: 'face', facingMode: 'user' },
  { id: 'face', icon: icons.user, label: 'Face', desc: 'Skin appearance reflection', guide: 'face', facingMode: 'user' },
  { id: 'tongue', icon: icons.droplet, label: 'Tongue', desc: 'Traditional wellness observations', guide: 'face', facingMode: 'user' },
  { id: 'body', icon: icons.body, label: 'Body', desc: 'Posture & proportion', guide: 'body', facingMode: 'environment' },
];

// Colour tokens — every coloured element also carries its meaning in text.
export const TONE = {
  good: { color: 'var(--viz-green)', dim: 'var(--viz-green-dim)' },
  watch: { color: 'var(--viz-amber)', dim: 'var(--viz-amber-dim)' },
  note: { color: 'var(--error)', dim: 'var(--error-dim)' },
  neutral: { color: 'var(--text-tertiary)', dim: 'var(--surface-2)' },
};
export const scoreTone = (score) => (score >= 80 ? TONE.good : score >= 55 ? TONE.watch : TONE.note);
const SEVERITY_TONE = { clear: TONE.good, none: TONE.good, intact: TONE.good, mild: TONE.watch, compromised_mild: TONE.watch, moderate: TONE.note, compromised_moderate: TONE.note, severe: TONE.note, compromised_severe: TONE.note };
export const toneFor = (level) => SEVERITY_TONE[level] || TONE.neutral;

// Human-readable, escaped rendering of an AI enum/label ("dark_red" → "dark red").
export const words = (v, fallback = '—') => (v == null || v === '' ? fallback : esc(String(v).replace(/_/g, ' ')));
export const num = (v, fallback = '—') => (Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : fallback);

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('This took too long to get a response.');
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function getInstructions(mode) {
  const map = {
    heart: 'Hold your face still in the oval for 15 seconds. Even lighting, no movement.',
    face: 'Position your face in the oval with good, even lighting. Remove glasses and keep a neutral expression.',
    tongue: 'Open your mouth and extend your tongue fully. Good lighting, camera level with your mouth.',
    body: 'Stand upright with your full body visible. Use the rear camera. Front and side views help.',
  };
  return map[mode] || '';
}
