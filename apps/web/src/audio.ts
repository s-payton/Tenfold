import { Howl, Howler } from 'howler';

/** All sounds are synthesized here, so there are no audio files to license. */
type SoundName =
  | 'select'
  | 'deal'
  | 'draw'
  | 'discard'
  | 'turn'
  | 'laydown'
  | 'win'
  | 'error'
  | 'skip';

const RATE = 22050;

const render = (seconds: number, sample: (t: number) => number): Float32Array => {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / RATE);
  return out;
};

const tone = (freq: number, start: number, length: number, volume = 0.3) => (t: number) => {
  const local = t - start;
  if (local < 0 || local > length) return 0;
  const envelope = Math.min(1, local * 200) * Math.exp((-4 * local) / length);
  return volume * envelope * Math.sin(2 * Math.PI * freq * local);
};

const noise = (length: number, volume: number) => (t: number) =>
  t > length ? 0 : volume * (Math.random() * 2 - 1) * Math.exp((-6 * t) / length);

const mix =
  (...parts: ((t: number) => number)[]) =>
  (t: number) =>
    parts.reduce((sum, part) => sum + part(t), 0);

const toWavDataUri = (samples: Float32Array): string => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const RECIPES: Record<SoundName, () => Float32Array> = {
  select: () => render(0.04, tone(1400, 0, 0.04, 0.12)),
  deal: () => render(0.06, noise(0.05, 0.25)),
  draw: () => render(0.1, mix(noise(0.08, 0.2), tone(900, 0, 0.06, 0.08))),
  discard: () => render(0.16, mix(tone(150, 0, 0.14, 0.45), noise(0.05, 0.15))),
  turn: () => render(0.3, mix(tone(660, 0, 0.14), tone(880, 0.12, 0.18))),
  laydown: () => render(0.42, mix(tone(523, 0, 0.16), tone(659, 0.1, 0.16), tone(784, 0.2, 0.22))),
  win: () =>
    render(
      1,
      mix(tone(523, 0, 0.2), tone(659, 0.15, 0.2), tone(784, 0.3, 0.2), tone(1047, 0.45, 0.5)),
    ),
  error: () => render(0.18, tone(170, 0, 0.18, 0.3)),
  skip: () => render(0.5, mix(tone(520, 0, 0.16), tone(390, 0.14, 0.16), tone(260, 0.28, 0.22))),
};

let sounds: Partial<Record<SoundName, Howl>> | null = null;
let muted = false;

/** Must run inside a user tap: iOS only allows audio after a gesture. */
export const unlockAudio = (): void => {
  if (!sounds) {
    sounds = {};
    for (const name of Object.keys(RECIPES) as SoundName[]) {
      sounds[name] = new Howl({ src: [toWavDataUri(RECIPES[name]())], format: ['wav'] });
    }
  }
  void Howler.ctx.resume().catch(() => undefined);
};

export const playSound = (name: SoundName): void => {
  if (!muted) sounds?.[name]?.play();
};

export const setMuted = (value: boolean): void => {
  muted = value;
};
