'use client';
import { useMemo, useState } from 'react';
import { Copy, Globe, Link2, Users } from 'lucide-react';
import { useGame } from '@/store/game';
import { useOnline } from '@/store/online';
import { useT, useLang } from '@/i18n';
import { Button, Flag, Modal, useToasts } from '@/components/ui';
import { provincesOf } from '@/game/ctx';
import { useReadCtx } from './hooks';

/** Oda sahibi: oyuncu davet etme penceresi (duraklatma menüsünden açılır) */
export function OnlineHostButton({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const role = useOnline((s) => s.role);
  if (role === 'guest') return null;
  return (
    <Button onClick={onOpen}>
      <Globe size={14} /> {t('online.host')}
    </Button>
  );
}

export function OnlineHostDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const seats = useOnline((s) => s.seats);
  const turnLimit = useOnline((s) => s.turnLimit);
  const roomError = useOnline((s) => s.roomError);
  const push = useToasts((s) => s.push);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const options = useMemo(() => {
    if (!state || !ctx) return [];
    const taken = new Set([state.player, ...seats.filter((s) => s.status !== 'closed').map((s) => s.tag)]);
    return Object.values(state.countries)
      .filter((c) => c.alive && !c.rebelMovement && !taken.has(c.tag) && c.tag !== 'REB')
      .map((c) => ({ c, n: provincesOf(ctx, c.tag).length }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 60);
  }, [state, ctx, seats]);
  if (!state) return null;
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => push(t('online.copied'), 'good')).catch(() => {});
  };
  return (
    <Modal open={open} onClose={onClose} title={t('online.host')} wide>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-muted">{t('online.hostHelp')}</p>
        <div className="flex gap-1.5">
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-2 py-1.5">
            <option value="">{t('online.pickCountry')}</option>
            {options.map(({ c, n }) => (
              <option key={c.tag} value={c.tag}>
                {lang === 'en' ? c.nameEn : c.name} ({n})
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={!tag || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await useOnline.getState().invite(tag);
                setTag('');
              } catch (e) {
                push(e instanceof Error ? e.message : String(e), 'bad');
              }
              setBusy(false);
            }}
          >
            <Users size={14} /> {t('online.invite')}
          </Button>
          <Button
            disabled={!tag}
            title={t('online.linkHint')}
            onClick={() => {
              copy(useOnline.getState().roomLink(tag));
              setTag('');
            }}
          >
            <Link2 size={14} /> {t('online.copyLink')}
          </Button>
        </div>
        <p className="text-[11px] text-muted">{t('online.linkHint')}</p>
        {roomError && <p className="text-[11px] text-danger">{t('online.signalError')}</p>}
        <label className="flex items-center justify-between gap-2 rounded border border-line bg-panel-2 px-2.5 py-2 text-xs">
          <span className="text-muted">{t('online.turnLimit')}</span>
          <select value={turnLimit} onChange={(e) => useOnline.getState().setTurnLimit(Number(e.target.value))} className="rounded border border-line-2 bg-bg-2 px-2 py-1">
            {[0, 30, 60, 90, 120, 180, 300, 600].map((sec) => (
              <option key={sec} value={sec}>
                {sec === 0 ? t('online.noLimit') : t('online.seconds', { n: sec })}
              </option>
            ))}
          </select>
        </label>
        {seats.map((s) => (
          <div key={s.id} className="rounded border border-line bg-panel-2 p-2.5">
            <div className="flex items-center gap-2">
              <Flag code={state.countries[s.tag]?.flag ?? 'x-unknown'} className="h-3.5" />
              <span className="flex-1 text-ink">{lang === 'en' ? state.countries[s.tag]?.nameEn : state.countries[s.tag]?.name}</span>
              <span className={s.status === 'connected' ? 'text-good' : s.status === 'closed' ? 'text-danger' : 'text-warn'}>{t(`online.status.${s.status}`)}</span>
            </div>
            {s.status === 'waiting' && s.offer && (
              <>
                <div className="mt-2 text-[11px] text-muted">{t('online.step1')}</div>
                <div className="flex gap-1.5">
                  <textarea readOnly value={s.offer} rows={2} className="min-w-0 flex-1 resize-none rounded border border-line-2 bg-bg-2 p-1 font-mono text-[10px]" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" onClick={() => copy(s.offer)}>
                    <Copy size={13} />
                  </Button>
                </div>
                <div className="mt-2 text-[11px] text-muted">{t('online.step2')}</div>
                <div className="flex gap-1.5">
                  <textarea value={answers[s.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [s.id]: e.target.value })} rows={2} className="min-w-0 flex-1 resize-none rounded border border-line-2 bg-bg-2 p-1 font-mono text-[10px]" />
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await useOnline.getState().accept(s.id, answers[s.id] ?? '');
                      } catch (e) {
                        push(e instanceof Error ? e.message : String(e), 'bad');
                      }
                    }}
                  >
                    {t('online.connect')}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        <p className="text-[11px] text-faint">{t('online.turnRule')}</p>
      </div>
    </Modal>
  );
}
