'use client';
import MenuFrame from '@/components/MenuFrame';
import { useT } from '@/i18n';

const SECTIONS = ['intro', 'time', 'map', 'economy', 'army', 'war', 'diplomacy', 'stability', 'shortcuts'];

export default function HowToPlayPage() {
  const t = useT();
  return (
    <MenuFrame title={t('help.title')}>
      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <section key={s} className="rounded border border-line bg-panel/90 p-4">
            <h2 className="font-display text-lg text-gold-soft">{t(`help.${s}.title`)}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t(`help.${s}.body`)}</p>
          </section>
        ))}
      </div>
    </MenuFrame>
  );
}
