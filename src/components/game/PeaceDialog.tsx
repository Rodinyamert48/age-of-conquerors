'use client';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Flag, Modal, Segmented, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from './hooks';
import { provincesOf } from '@/game/ctx';
import { evaluatePeace, scoreFor, termCost, termsCost, validTerm } from '@/game/war';
import { warSide } from '@/game/query';
import type { PeaceTerm, Tag } from '@/game/types';
import { formatMoney } from '@/lib/format';
import { termText } from './right/InboxPanel';
import { warTitle } from './text';

type Mode = 'demand' | 'concede' | 'white';

export default function PeaceDialog() {
  const t = useT();
  const lang = useLang();
  const peace = useUI((s) => s.peace);
  const close = useUI((s) => s.closePeace);
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  const name = useCountryName();
  const push = useToasts((s) => s.push);
  const [target, setTarget] = useState<Tag | null>(null);
  const [mode, setMode] = useState<Mode>('demand');
  const [provs, setProvs] = useState<number[]>([]);
  const [rep, setRep] = useState({ on: false, amount: 0, months: 60 });
  const [release, setRelease] = useState<Tag[]>([]);
  const [vassal, setVassal] = useState(false);
  const [annex, setAnnex] = useState(false);
  const [result, setResult] = useState<{ reason: string; counter: PeaceTerm[] | null } | null>(null);

  const war = peace && state ? state.wars[peace.warId] : undefined;
  const me = state?.player ?? '';
  const counterpart = target ?? peace?.target ?? null;
  const beneficiary = mode === 'concede' ? counterpart : me;
  const loser = mode === 'concede' ? me : counterpart;

  const counterparts = useMemo(() => {
    if (!war || !state) return [];
    const side = warSide(war, me);
    const enemies = side === 'attackers' ? war.defenders : war.attackers;
    const iLead = war.attackerLeader === me || war.defenderLeader === me;
    const enemyLeader = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
    return iLead ? enemies.filter((e) => e !== 'REB') : [enemyLeader];
  }, [war, state, me]);

  const candidates = useMemo(() => {
    if (!ctx || !war || !loser || !beneficiary || mode === 'white') return { provinces: [] as number[], nations: [] as Tag[] };
    const list = provincesOf(ctx, loser).filter((p) => validTerm(ctx, war, beneficiary, loser, { type: 'province', province: p }));
    list.sort((a, b) => termCost(ctx, war, beneficiary, loser, { type: 'province', province: b }) - termCost(ctx, war, beneficiary, loser, { type: 'province', province: a }));
    const nations = new Set<Tag>();
    for (const p of provincesOf(ctx, loser)) for (const c of ctx.s.provinces[p].cores) if (c !== loser && c !== beneficiary && ctx.s.countries[c] && c !== 'REB') nations.add(c);
    return { provinces: list.slice(0, 80), nations: [...nations].filter((n) => validTerm(ctx, war, beneficiary, loser, { type: 'release', nation: n })) };
  }, [ctx, war, loser, beneficiary, mode]);

  const terms: PeaceTerm[] = useMemo(() => {
    if (mode === 'white') return [];
    const out: PeaceTerm[] = [];
    if (annex) return [{ type: 'annex' }];
    for (const p of provs) out.push({ type: 'province', province: p });
    if (rep.on && rep.amount > 0) out.push({ type: 'reparations', amount: rep.amount, months: rep.months });
    for (const n of release) out.push({ type: 'release', nation: n });
    if (vassal) out.push({ type: 'vassalize' });
    return out;
  }, [mode, provs, rep, release, vassal, annex]);

  if (!peace || !war || !state || !ctx || !counterpart || !beneficiary || !loser) return null;
  const myScore = scoreFor(war, me);
  const cost = termsCost(ctx, war, beneficiary, loser, terms);
  const ev = evaluatePeace(ctx, war, me, counterpart, beneficiary, terms);
  const loserIncome = state.countries[loser]?.budget.income ?? 0;

  const reset = () => {
    setProvs([]);
    setRelease([]);
    setVassal(false);
    setAnnex(false);
    setRep({ on: false, amount: 0, months: 60 });
    setResult(null);
  };

  const send = async (useTerms: PeaceTerm[]) => {
    const r = await cmd({ type: 'proposePeace', war: war.id, target: counterpart, beneficiary, terms: useTerms });
    if (!r.ok) return;
    const d = r.data as { accepted: boolean; counter: PeaceTerm[] | null; reason: string };
    if (d.accepted) {
      push(t('peace.accepted'), 'good');
      close();
      reset();
    } else setResult({ reason: d.reason, counter: d.counter });
  };

  return (
    <Modal
      open
      wide
      onClose={() => {
        close();
        reset();
      }}
      title={t('peace.title', { war: warTitle(war, t) })}
      footer={
        <>
          <Button onClick={() => close()}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => send(terms)}>
            {t('peace.send')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">{t('peace.counterpart')}</span>
            <select
              value={counterpart}
              onChange={(e) => {
                setTarget(e.target.value);
                reset();
              }}
              className="rounded border border-line-2 bg-bg-2 px-2 py-1"
            >
              {counterparts.map((c) => (
                <option key={c} value={c}>
                  {name(c)}
                  {c !== war.attackerLeader && c !== war.defenderLeader ? ` (${t('peace.separate')})` : ''}
                </option>
              ))}
            </select>
          </div>
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              reset();
            }}
            options={[
              { value: 'demand', label: t('peace.mode.demand') },
              { value: 'concede', label: t('peace.mode.concede') },
              { value: 'white', label: t('peace.mode.white') },
            ]}
          />
          {mode !== 'white' && (
            <>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.15em] text-gold-soft">{t('peace.province')}</div>
                {candidates.provinces.length === 0 && <p className="text-xs text-muted">{t('peace.occupiedOnly')}</p>}
                <div className="grid max-h-52 grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2">
                  {candidates.provinces.map((p) => {
                    const c = termCost(ctx, war, beneficiary, loser, { type: 'province', province: p });
                    const on = provs.includes(p);
                    return (
                      <label key={p} className={`flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-0.5 text-xs ${on ? 'bg-gold/15' : 'hover:bg-white/5'}`}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <input type="checkbox" checked={on} disabled={annex} onChange={() => setProvs(on ? provs.filter((x) => x !== p) : [...provs, p])} />
                          <span className="truncate">{lang === 'en' ? ctx.w.data.provinces[p].nameEn : ctx.w.data.provinces[p].name}</span>
                        </span>
                        <span className="tabular text-muted">{c.toFixed(1)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={rep.on} disabled={annex} onChange={() => setRep({ ...rep, on: !rep.on, amount: rep.amount || Math.round(loserIncome * 0.1 * 100) / 100 })} />
                  <span className="uppercase tracking-[0.15em] text-gold-soft">{t('peace.reparations')}</span>
                </label>
                {rep.on && (
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <label>
                      <div className="text-muted">
                        {t('peace.amount')}: {formatMoney(rep.amount, lang)}
                      </div>
                      <input type="range" min={0} max={Math.max(0.01, loserIncome * 0.5)} step={Math.max(0.0001, loserIncome / 100)} value={rep.amount} onChange={(e) => setRep({ ...rep, amount: Number(e.target.value) })} className="w-full" />
                    </label>
                    <label>
                      <div className="text-muted">
                        {t('peace.months')}: {rep.months}
                      </div>
                      <input type="range" min={6} max={120} step={6} value={rep.months} onChange={(e) => setRep({ ...rep, months: Number(e.target.value) })} className="w-full" />
                    </label>
                  </div>
                )}
              </div>
              {candidates.nations.length > 0 && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.15em] text-gold-soft">{t('peace.release')}</div>
                  <div className="flex flex-wrap gap-1">
                    {candidates.nations.map((n) => {
                      const on = release.includes(n);
                      return (
                        <button
                          type="button"
                          key={n}
                          disabled={annex}
                          onClick={() => setRelease(on ? release.filter((x) => x !== n) : [...release, n])}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${on ? 'border-gold bg-gold/15' : 'border-line-2'}`}
                        >
                          <Flag code={state.countries[n]?.flag ?? 'x-unknown'} className="h-2.5" />
                          {name(n)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs">
                {validTerm(ctx, war, beneficiary, loser, { type: 'vassalize' }) && (
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={vassal} disabled={annex} onChange={() => setVassal(!vassal)} />
                    {t('peace.vassalize')}
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={annex} onChange={() => setAnnex(!annex)} />
                  {t('peace.annex')}
                </label>
              </div>
            </>
          )}
        </div>
        <aside className="h-fit rounded border border-line bg-panel-2 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{t('peace.available')}</span>
            <span className={`tabular ${myScore >= 0 ? 'text-good' : 'text-danger'}`}>{Math.round(myScore)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{t('peace.cost')}</span>
            <span className="tabular">{Math.round(cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{t('peace.willingness')}</span>
            <span className="tabular">{Math.round(ev.willingness)}</span>
          </div>
          <Bar value={Math.max(0, Math.min(100, cost))} max={Math.max(1, Math.abs(ev.willingness), cost)} color={ev.accept ? 'bg-good' : 'bg-danger'} className="mt-2" />
          <div className={`mt-2 text-xs ${ev.accept ? 'text-good' : 'text-danger'}`}>{ev.accept ? t('diplo.likely', { score: Math.round(ev.willingness - cost) }) : t(ev.reasonKey)}</div>
          <ul className="mt-2 list-inside list-disc text-xs text-ink-2">
            {terms.length === 0 && <li>{t('peace.noTerms')}</li>}
            {terms.slice(0, 10).map((x, i) => (
              <li key={i}>{termText(x, ctx, t, lang, name)}</li>
            ))}
            {terms.length > 10 && <li>… +{terms.length - 10}</li>}
          </ul>
          {result && (
            <div className="mt-3 rounded border border-danger/40 bg-danger/10 p-2 text-xs">
              <div className="text-[#f3c2bc]">
                {t('peace.refused')} {t(result.reason)}
              </div>
              {result.counter && result.counter.length > 0 && (
                <>
                  <div className="mt-1 text-ink-2">{t('peace.counter')}</div>
                  <ul className="list-inside list-disc text-ink-2">
                    {result.counter.map((x, i) => (
                      <li key={i}>{termText(x, ctx, t, lang, name)}</li>
                    ))}
                  </ul>
                  <Button size="sm" variant="primary" className="mt-1.5 w-full" onClick={() => send(result.counter!)}>
                    {t('peace.acceptCounter')}
                  </Button>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
