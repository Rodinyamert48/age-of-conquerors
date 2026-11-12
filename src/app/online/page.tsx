'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import MenuFrame from '@/components/MenuFrame';
import { useT } from '@/i18n';
import { useOnline } from '@/store/online';
import { useGame } from '@/store/game';
import { Button, useToasts } from '@/components/ui';

/** Çevrimiçi oyuna katıl: oda sahibinin davet kodunu yapıştır, cevap kodunu geri ilet */
export default function OnlinePage() {
  const t = useT();
  const router = useRouter();
  const push = useToasts((s) => s.push);
  const [offer, setOffer] = useState('');
  const [name, setName] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const role = useOnline((s) => s.role);
  const hasState = useGame((s) => !!s.state);
  useEffect(() => {
    if (role === 'guest' && hasState) router.push('/play');
  }, [role, hasState, router]);
  return (
    <MenuFrame title={t('online.join')}>
      <div className="space-y-3 text-sm text-ink-2">
        <section className="rounded border border-line bg-panel/90 p-4">
          <p className="text-xs text-muted">{t('online.joinHelp')}</p>
          <label className="mt-3 block text-xs text-muted">{t('online.yourName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-line-2 bg-bg-2 px-2 py-1.5" />
          <label className="mt-3 block text-xs text-muted">{t('online.step1join')}</label>
          <textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={4} className="w-full resize-none rounded border border-line-2 bg-bg-2 p-1.5 font-mono text-[10px]" />
          <Button
            className="mt-2"
            variant="primary"
            disabled={!offer.trim() || busy || !!answer}
            onClick={async () => {
              setBusy(true);
              try {
                await useGame.getState().init();
                setAnswer(await useOnline.getState().join(offer, name.trim() || 'Oyuncu'));
              } catch (e) {
                push(e instanceof Error ? e.message : String(e), 'bad');
              }
              setBusy(false);
            }}
          >
            {t('online.makeAnswer')}
          </Button>
        </section>
        {answer && (
          <section className="rounded border border-gold-2/60 bg-panel/90 p-4">
            <label className="block text-xs text-muted">{t('online.step2join')}</label>
            <div className="mt-1 flex gap-1.5">
              <textarea readOnly value={answer} rows={4} className="min-w-0 flex-1 resize-none rounded border border-line-2 bg-bg-2 p-1.5 font-mono text-[10px]" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" onClick={() => navigator.clipboard?.writeText(answer).then(() => push(t('online.copied'), 'good')).catch(() => {})}>
                <Copy size={13} />
              </Button>
            </div>
            <p className="mt-2 text-xs text-warn">{t('online.waitingHost')}</p>
          </section>
        )}
      </div>
    </MenuFrame>
  );
}
