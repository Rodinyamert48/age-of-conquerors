'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT } from '@/i18n';
import { listSaves, readSave } from '@/lib/saves';
import GameScreen from '@/components/game/GameScreen';

/**
 * Oyun ekranı. Bellekte etkin oyun yoksa (ör. sayfa yenilendiğinde) en son kayıt yüklenir;
 * kayıt da yoksa ana menüye dönülür.
 */
export default function PlayPage() {
  const t = useT();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const [status, setStatus] = useState<'checking' | 'loading' | 'failed'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    useUI.getState().reset();
  }, []);

  useEffect(() => {
    if (state) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus('loading');
        await useGame.getState().init();
        const saves = await listSaves();
        if (!saves.length) {
          if (!cancelled) router.replace('/');
          return;
        }
        const world = useGame.getState().world!;
        const st = await readSave(saves[0].id, world.P);
        if (cancelled) return;
        await useGame.getState().loadState(st);
      } catch (e) {
        if (!cancelled) {
          setStatus('failed');
          setMessage(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, router]);

  if (!state) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 bg-bg text-muted">
        <div className="font-display text-2xl tracking-wide text-ink">AGE OF CONQUERORS</div>
        <div>{status === 'failed' ? t('saves.loadError', { error: message }) : t('loading.save')}</div>
        {status === 'failed' && (
          <button type="button" className="text-gold underline" onClick={() => router.replace('/')}>
            {t('menu.backToMenu')}
          </button>
        )}
      </main>
    );
  }
  return <GameScreen />;
}
