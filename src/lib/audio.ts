'use client';
/**
 * Ses: Web Audio ile üretilen arayüz efektleri ve sakin bir ortam müziği.
 * Harici ses dosyası kullanılmaz (lisans gerektirmez).
 */
import { useSettings } from '@/store/settings';

let ac: AudioContext | null = null;
let musicNodes: { stop: () => void; gain: GainNode } | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ac) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ac = new C();
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

type SoundId = 'click' | 'notify' | 'battle' | 'war' | 'success' | 'error';

const SOUNDS: Record<SoundId, { f: number[]; d: number; type: OscillatorType; g: number }> = {
  click: { f: [660], d: 0.05, type: 'triangle', g: 0.15 },
  notify: { f: [520, 780], d: 0.12, type: 'sine', g: 0.18 },
  battle: { f: [180, 140], d: 0.18, type: 'sawtooth', g: 0.08 },
  war: { f: [220, 165, 110], d: 0.35, type: 'square', g: 0.06 },
  success: { f: [523, 659, 784], d: 0.12, type: 'triangle', g: 0.14 },
  error: { f: [200, 150], d: 0.15, type: 'square', g: 0.07 },
};

export function playSound(id: SoundId): void {
  const st = useSettings.getState();
  if (!st.soundEnabled || st.soundVolume <= 0) return;
  const a = ctx();
  if (!a) return;
  const s = SOUNDS[id];
  let t = a.currentTime;
  for (const f of s.f) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = s.type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(s.g * st.soundVolume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + s.d + 0.02);
    t += s.d * 0.8;
  }
}

/** Savaş davulu: alçak frekanslı vuruşlar */
export function playDrums(): void {
  const st = useSettings.getState();
  if (!st.soundEnabled || st.soundVolume <= 0) return;
  const a = ctx();
  if (!a) return;
  const hits = [0, 0.22, 0.44, 0.55, 0.66, 1.0];
  for (const h of hits) {
    const t = a.currentTime + h;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * st.soundVolume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.25);
  }
}

/** Barış fanfarı: pirinç üflemeli tınısında yükselen akor */
export function playFanfare(): void {
  const st = useSettings.getState();
  if (!st.soundEnabled || st.soundVolume <= 0) return;
  const a = ctx();
  if (!a) return;
  const notes: [number, number, number][] = [
    [392, 0, 0.16],
    [392, 0.18, 0.16],
    [523.25, 0.36, 0.2],
    [659.25, 0.58, 0.2],
    [783.99, 0.8, 0.7],
  ];
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.connect(a.destination);
  for (const [f, at, d] of notes) {
    for (const det of [0, 4]) {
      const t = a.currentTime + at;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09 * st.soundVolume, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
}

// 1900'ler salon müziği tarzında vals: bas + akor eşliği + ezgi (tamamı sentezlenir)
const N: Record<string, number> = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F2: 87.31, G2: 98, B2: 123.47, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, GS4: 415.3, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880 };
const BARS: { bass: string; chord: string[]; mel: (string | null)[] }[] = [
  { bass: 'A2', chord: ['A3', 'C4', 'E4'], mel: ['E5', null, 'C5'] },
  { bass: 'A2', chord: ['A3', 'C4', 'E4'], mel: ['A4', 'B4', 'C5'] },
  { bass: 'D3', chord: ['A3', 'D4', 'F4'], mel: ['D5', null, 'F5'] },
  { bass: 'D3', chord: ['A3', 'D4', 'F4'], mel: ['E5', 'D5', 'C5'] },
  { bass: 'E3', chord: ['B3', 'E4', 'GS4'], mel: ['B4', null, 'E5'] },
  { bass: 'E3', chord: ['B3', 'D4', 'GS4'], mel: ['D5', 'C5', 'B4'] },
  { bass: 'A2', chord: ['A3', 'C4', 'E4'], mel: ['A4', null, null] },
  { bass: 'E3', chord: ['B3', 'E4', 'GS4'], mel: ['E4', 'GS4', 'B4'] },
  { bass: 'C3', chord: ['C4', 'E4', 'G4'], mel: ['G5', null, 'E5'] },
  { bass: 'C3', chord: ['C4', 'E4', 'G4'], mel: ['C5', 'D5', 'E5'] },
  { bass: 'G2', chord: ['B3', 'D4', 'G4'], mel: ['D5', null, 'B4'] },
  { bass: 'G2', chord: ['B3', 'D4', 'G4'], mel: ['G4', 'A4', 'B4'] },
  { bass: 'F2', chord: ['A3', 'C4', 'F4'], mel: ['C5', null, 'A4'] },
  { bass: 'D3', chord: ['A3', 'D4', 'F4'], mel: ['F5', 'E5', 'D5'] },
  { bass: 'E3', chord: ['B3', 'E4', 'GS4'], mel: ['E5', 'D5', 'B4'] },
  { bass: 'A2', chord: ['A3', 'C4', 'E4'], mel: ['A4', null, null] },
];

export function startMusic(): void {
  const st = useSettings.getState();
  if (!st.musicEnabled || musicNodes) return;
  const a = ctx();
  if (!a) return;
  const master = a.createGain();
  master.gain.value = st.musicVolume * 0.12;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  filter.connect(master).connect(a.destination);
  const beat = 60 / 112;
  const note = (f: number, t: number, d: number, type: OscillatorType, vol: number) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(filter);
    o.start(t);
    o.stop(t + d + 0.05);
  };
  let bar = 0;
  let next = a.currentTime + 0.2;
  const schedule = () => {
    while (next < a.currentTime + 1.2) {
      const b = BARS[bar % BARS.length];
      note(N[b.bass], next, beat * 0.95, 'triangle', 0.55);
      for (const beatNo of [1, 2]) for (const c of b.chord) note(N[c], next + beatNo * beat, beat * 0.5, 'sine', 0.16);
      b.mel.forEach((m, i) => {
        if (m) note(N[m], next + i * beat, beat * (b.mel[i + 1] === null ? 1.9 : 0.95), 'triangle', 0.3);
      });
      next += beat * 3;
      bar++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 300);
  musicNodes = {
    gain: master,
    stop: () => {
      clearInterval(timer);
      master.gain.linearRampToValueAtTime(0, a.currentTime + 0.4);
      setTimeout(() => master.disconnect(), 1500);
    },
  };
}

export function stopMusic(): void {
  musicNodes?.stop();
  musicNodes = null;
}

export function updateMusicVolume(v: number): void {
  if (musicNodes && ac) musicNodes.gain.gain.linearRampToValueAtTime(v * 0.12, ac.currentTime + 0.2);
}
