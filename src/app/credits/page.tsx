'use client';
import MenuFrame from '@/components/MenuFrame';
import { useT } from '@/i18n';

export default function CreditsPage() {
  const t = useT();
  return (
    <MenuFrame title={t('credits.title')}>
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">
        <section className="rounded border border-line bg-panel/90 p-4">
          <p>{t('credits.about')}</p>
          <p className="mt-2 text-muted">{t('credits.license')}</p>
        </section>
        <section className="rounded border border-line bg-panel/90 p-4">
          <h2 className="font-display text-lg text-gold-soft">{t('credits.data')}</h2>
          <ul className="mt-1.5 list-inside list-disc space-y-1">
            <li>{t('credits.naturalEarth')}</li>
            <li>{t('credits.flags')}</li>
            <li>{t('credits.icons')}</li>
            <li>{t('credits.military')}</li>
            <li>{t('credits.audio')}</li>
          </ul>
          <p className="mt-2 text-xs text-muted">{t('credits.approx')}</p>
        </section>
        <section className="rounded border border-line bg-panel/90 p-4">
          <h2 className="font-display text-lg text-gold-soft">{t('credits.tech')}</h2>
          <p className="mt-1">Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Zustand · Canvas 2D · Web Workers · IndexedDB · Vitest · Lucide</p>
        </section>
      </div>
    </MenuFrame>
  );
}
