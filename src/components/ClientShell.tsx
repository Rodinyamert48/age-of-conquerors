'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '@/store/settings';
import { ConfirmHost, ToastHost } from './ui';
import { startMusic, stopMusic, updateMusicVolume } from '@/lib/audio';

/** Ayarları belgeye uygular (dil, animasyon, müzik) ve ortak katmanları barındırır */
export default function ClientShell({ children }: { children: ReactNode }) {
  const language = useSettings((s) => s.language);
  const animations = useSettings((s) => s.animations);
  const musicEnabled = useSettings((s) => s.musicEnabled);
  const musicVolume = useSettings((s) => s.musicVolume);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    document.documentElement.dataset.animations = animations ? 'on' : 'off';
  }, [animations]);
  // Tarayıcılar sesi ilk kullanıcı etkileşiminden sonra başlatmaya izin verir
  useEffect(() => {
    const on = () => setInteracted(true);
    window.addEventListener('pointerdown', on, { once: true });
    window.addEventListener('keydown', on, { once: true });
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, []);
  useEffect(() => {
    if (!interacted) return;
    if (musicEnabled) startMusic();
    else stopMusic();
  }, [musicEnabled, interacted]);
  useEffect(() => {
    updateMusicVolume(musicVolume);
  }, [musicVolume]);

  return (
    <>
      {children}
      <ConfirmHost />
      <ToastHost />
    </>
  );
}
