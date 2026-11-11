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

/** Yavaş değişen akorlarla ortam müziği */
export function startMusic(): void {
  const st = useSettings.getState();
  if (!st.musicEnabled || musicNodes) return;
  const a = ctx();
  if (!a) return;
  const master = a.createGain();
  master.gain.value = st.musicVolume * 0.12;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(master).connect(a.destination);
  const chords = [
    [110, 164.81, 220, 261.63],
    [98, 146.83, 196, 246.94],
    [87.31, 130.81, 174.61, 220],
    [103.83, 155.56, 207.65, 261.63],
  ];
  const oscs = chords[0].map((f) => {
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.value = 0.25;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });
  let i = 0;
  const timer = setInterval(() => {
    i = (i + 1) % chords.length;
    const now = a.currentTime;
    oscs.forEach((o, k) => o.frequency.linearRampToValueAtTime(chords[i][k], now + 3));
  }, 8000);
  musicNodes = {
    gain: master,
    stop: () => {
      clearInterval(timer);
      const now = a.currentTime;
      master.gain.linearRampToValueAtTime(0, now + 0.5);
      setTimeout(() => oscs.forEach((o) => o.stop()), 600);
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
