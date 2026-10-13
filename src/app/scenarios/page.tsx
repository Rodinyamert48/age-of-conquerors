'use client';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import MenuFrame from '@/components/MenuFrame';
import { useT, useLang, loc } from '@/i18n';
import { SCENARIOS } from '@/game/scenarios';
import { formatDate } from '@/lib/format';
import { parseDate } from '@/game/calendar';

export default function ScenariosPage() {
  const t = useT();
  const lang = useLang();
  return (
    <MenuFrame title={t('scenarios.title')}>
      <div className="flex flex-col gap-2">
        {SCENARIOS.map((s) => (
          <article key={s.id} className={`rounded border px-4 py-3 ${s.available ? 'border-line-2 bg-panel/90' : 'border-line bg-panel/60'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl text-gold-soft">{s.year}</span>
                <span className="font-display text-xl text-ink">{loc(s.name, lang)}</span>
              </div>
              {s.available ? (
                <Link href={`/new-game?scenario=${s.id}`} className="rounded border border-gold-2 bg-gold/90 px-3 py-1 text-sm font-medium text-[#1a1408] hover:bg-gold-soft">
                  {t('scenarios.play')}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Lock size={12} /> {t('newGame.unavailable')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">{loc(s.description, lang)}</p>
            <p className="mt-1 text-xs text-muted">
              {t('newGame.startDate')}: {formatDate(parseDate(s.startDate), lang)}
            </p>
            {s.available ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  <span className="text-ink-2">{t('scenarios.goal')}:</span> {loc(s.victory, lang)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  <span className="text-ink-2">{t('newGame.sources')}:</span> {loc(s.sources, lang)}
                </p>
              </>
            ) : (
              s.status && <p className="mt-1 text-xs text-muted">{loc(s.status, lang)}</p>
            )}
          </article>
        ))}
      </div>
    </MenuFrame>
  );
}
