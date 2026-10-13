'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Plus, Map as MapIcon, Save, Settings, BookOpen, Info } from 'lucide-react';
import { MenuBackdrop, MenuTitle } from '@/components/MenuFrame';
import { useT, useLang } from '@/i18n';
import { listSaves, readSave, type SaveMeta } from '@/lib/saves';
import { useGame } from '@/store/game';
import { formatDate } from '@/lib/format';
import { Flag, useToasts } from '@/components/ui';

export default function MainMenu() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [latest, setLatest] = useState<SaveMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useGame((s) => s.status);
  const loadingText = useGame((s) => s.loadingText);
  const active = useGame((s) => s.state);
  const pushToast = useToasts((s) => s.push);

  useEffect(() => {
    listSaves()
      .then((l) => setLatest(l[0] ?? null))
      .catch(() => setLatest(null));
  }, []);

  const resume = async () => {
    if (active) {
      router.push('/play');
      return;
    }
    if (!latest) return;
    setBusy(true);
    try {
      await useGame.getState().init();
      const world = useGame.getState().world!;
      const st = await readSave(latest.id, world.P);
      await useGame.getState().loadState(st);
      router.push('/play');
    } catch (e) {
      pushToast(t('saves.loadError', { error: e instanceof Error ? e.message : String(e) }), 'bad');
      setBusy(false);
    }
  };

  const items = [
    { href: '/new-game', icon: Plus, label: t('menu.newGame') },
    { href: '/scenarios', icon: MapIcon, label: t('menu.scenarios') },
    { href: '/saves', icon: Save, label: t('menu.saves') },
    { href: '/settings', icon: Settings, label: t('menu.settings') },
    { href: '/how-to-play', icon: BookOpen, label: t('menu.howToPlay') },
    { href: '/credits', icon: Info, label: t('menu.credits') },
  ];

  return (
    <main className="relative h-full overflow-hidden">
      <MenuBackdrop />
      <div className="relative z-10 flex h-full flex-col justify-center px-6 md:px-16">
        <MenuTitle />
        <nav className="flex w-full max-w-sm flex-col gap-1.5" aria-label="Ana menü">
          {(active || latest) && (
            <button
              type="button"
              onClick={resume}
              disabled={busy}
              className="group flex items-center gap-3 rounded-[3px] border border-gold-2/70 bg-gold/10 px-4 py-3 text-left transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              <Play size={18} className="text-gold" />
              <span className="flex-1">
                <span className="block font-display text-lg tracking-wide text-gold-soft">{active ? t('menu.resumeGame') : t('menu.continue')}</span>
                {!active && latest && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {latest.playerFlag && <Flag code={latest.playerFlag} className="h-3" />}
                    {t('menu.continueHint', { country: latest.playerName, date: formatDate(latest.day, lang) })}
                  </span>
                )}
              </span>
            </button>
          )}
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="group flex items-center gap-3 rounded-[3px] border border-transparent px-4 py-2.5 text-ink-2 transition-colors hover:border-line-2 hover:bg-panel/70 hover:text-ink"
            >
              <it.icon size={17} className="text-gold/70 group-hover:text-gold" />
              <span className="font-display text-lg tracking-wide">{it.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-6 text-xs text-faint md:left-16">
          {t('app.version', { version: '0.1.0' })} · {t('app.mapSource')}
          {status === 'loading' && <span className="ml-2 text-muted">· {t(loadingText)}</span>}
        </div>
      </div>
    </main>
  );
}
