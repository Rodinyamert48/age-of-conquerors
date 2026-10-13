'use client';
import { useGame } from '@/store/game';
import { useT, useLang, loc } from '@/i18n';
import { Button, Flag, SectionTitle } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { getEventDef } from '@/game/data/events';
import { formatDate, formatMoney } from '@/lib/format';
import type { PeaceTerm } from '@/game/types';
import type { TFunc } from '@/i18n';
import type { Ctx } from '@/game/ctx';

export function termText(term: PeaceTerm, ctx: Ctx, t: TFunc, lang: 'tr' | 'en', name: (t: string) => string): string {
  switch (term.type) {
    case 'province': {
      const wp = ctx.w.data.provinces[term.province];
      return `${t('peace.province')}: ${lang === 'en' ? wp.nameEn : wp.name}`;
    }
    case 'reparations':
      return `${t('peace.reparations')}: ${t('peace.reparationsDesc', { amount: formatMoney(term.amount, lang), months: term.months })}`;
    case 'release':
      return `${t('peace.release')}: ${name(term.nation)}`;
    case 'vassalize':
      return t('peace.vassalize');
    case 'annex':
      return t('peace.annex');
  }
}

export default function InboxPanel() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  const name = useCountryName();
  if (!state || !ctx) return null;
  const total = state.pendingEvents.length + state.proposals.length + state.peaceOffers.length;

  return (
    <div className="text-sm">
      <h2 className="font-display text-xl text-ink">{t('event.inbox')}</h2>
      {total === 0 && <p className="mt-2 text-xs text-muted">{t('event.noEvents')}</p>}

      {state.pendingEvents.map((pe) => {
        const def = getEventDef(pe.eventId);
        if (!def) return null;
        return (
          <div key={pe.uid} className="mt-3 rounded border border-gold-2/50 bg-panel-2 p-2.5">
            <div className="font-display text-base text-gold-soft">{loc(def.title, lang)}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{loc(def.desc, lang)}</p>
            {pe.target && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                <Flag code={state.countries[pe.target]?.flag ?? 'x-unknown'} className="h-3" />
                {t('event.target', { country: name(pe.target) })}
              </div>
            )}
            <div className="mt-2 flex flex-col gap-1">
              {def.options.map((o, i) => (
                <Button key={i} size="sm" className="justify-start text-left" onClick={() => cmd({ type: 'resolveEvent', uid: pe.uid, option: i })}>
                  {loc(o.text, lang)}
                </Button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-faint">{t('event.expires', { date: formatDate(pe.expires, lang) })}</div>
          </div>
        );
      })}

      {state.peaceOffers.length > 0 && <SectionTitle>{t('war.negotiate')}</SectionTitle>}
      {state.peaceOffers.map((o) => {
        const war = state.wars[o.warId];
        return (
          <div key={o.id} className="mb-2 rounded border border-line-2 bg-panel-2 p-2.5">
            <div className="flex items-center gap-1.5 text-ink">
              <Flag code={state.countries[o.from]?.flag ?? 'x-unknown'} className="h-3.5" />
              {t('peace.offerFrom', { country: name(o.from) })}
            </div>
            {war && <div className="text-xs text-muted">{war.name}</div>}
            <div className="mt-1 text-xs text-muted">{o.beneficiary === state.player ? t('peace.beneficiaryYou') : t('peace.beneficiaryThem')}</div>
            <ul className="mt-1 list-inside list-disc text-xs text-ink-2">
              {o.terms.length === 0 && <li>{t('peace.noTerms')}</li>}
              {o.terms.map((term, i) => (
                <li key={i}>{termText(term, ctx, t, lang, name)}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" onClick={() => cmd({ type: 'answerPeace', id: o.id, accept: true }, t('peace.accepted'))}>
                {t('common.accept')}
              </Button>
              <Button size="sm" onClick={() => cmd({ type: 'answerPeace', id: o.id, accept: false })}>
                {t('common.decline')}
              </Button>
            </div>
          </div>
        );
      })}

      {state.proposals.length > 0 && <SectionTitle>{t('diplo.proposals')}</SectionTitle>}
      {state.proposals.map((p) => {
        const war = p.warId ? state.wars[p.warId] : undefined;
        return (
          <div key={p.id} className="mb-2 rounded border border-line-2 bg-panel-2 p-2.5">
            <div className="flex items-center gap-1.5 text-ink">
              <Flag code={state.countries[p.from]?.flag ?? 'x-unknown'} className="h-3.5" />
              {name(p.from)}
            </div>
            <div className="mt-0.5 text-xs text-ink-2">
              {p.type === 'callToArms' && war ? t('diplo.callToArmsFrom', { country: name(p.from), war: war.name }) : t(`action.${p.type}`)}
            </div>
            {p.type !== 'callToArms' && <p className="text-[11px] text-muted">{t(`action.${p.type}.desc`, { years: 10 })}</p>}
            {p.province !== undefined && <div className="text-xs text-muted">{lang === 'en' ? ctx.w.data.provinces[p.province].nameEn : ctx.w.data.provinces[p.province].name}</div>}
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" onClick={() => cmd({ type: 'answerProposal', id: p.id, accept: true }, t('diplo.done'))}>
                {t('common.accept')}
              </Button>
              <Button size="sm" onClick={() => cmd({ type: 'answerProposal', id: p.id, accept: false })}>
                {t('common.decline')}
              </Button>
            </div>
            <div className="mt-1 text-[10px] text-faint">{formatDate(p.expires, lang)}</div>
          </div>
        );
      })}
    </div>
  );
}
