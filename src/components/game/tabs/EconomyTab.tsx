'use client';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Flag, SectionTitle, Stat } from '@/components/ui';
import { useReadCtx, useCountryName } from '../hooks';
import { taxEfficiency } from '@/game/economy';
import { formatCompact, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { RESOURCE_IDS, type Budget } from '@/game/types';
import { countrySummary } from '@/game/selectors';
import { BAL } from '@/game/balance';

const INCOME: (keyof Budget)[] = ['tax', 'trade', 'production', 'exports', 'tributeIn', 'reparationsIn'];
const EXPENSE: (keyof Budget)[] = ['armyUpkeep', 'navyUpkeep', 'fortUpkeep', 'war', 'policies', 'imports', 'interest', 'tributeOut', 'reparationsOut'];

export default function EconomyTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const name = useCountryName();
  if (!state || !ctx) return null;
  const c = state.countries[state.player];
  const b = c.budget;
  const sum = countrySummary(ctx, state.player);
  const trades = state.treaties.filter((x) => x.type === 'trade' && (x.a === c.tag || x.b === c.tag));
  const projects = state.provinces
    .map((ps, i) => ({ ps, i }))
    .filter(({ ps }) => ps.owner === c.tag && ps.construction)
    .slice(0, 40);
  const debt = c.treasury < 0 ? -c.treasury : 0;
  const rate = debt > 0 ? BAL.baseInterest + 0.12 * Math.min(1.5, debt / Math.max(1, b.income * 12)) : 0;

  return (
    <div className="text-sm">
      <SectionTitle>{t('econ.overview')}</SectionTitle>
      <Stat label={t('budget.treasury')} value={formatMoney(c.treasury, lang)} tone={c.treasury < 0 ? 'bad' : undefined} />
      <Stat label={t('budget.gdp')} value={formatMoney(sum.output, lang)} />
      <Stat label={t('budget.gdpPc')} value={formatCompact((sum.output / Math.max(1, sum.pop)) * 1e6, lang)} />
      <Stat label={t('budget.taxEfficiency')} value={formatPercent(taxEfficiency(ctx, c.tag), lang)} />
      {debt > 0 && (
        <>
          <Stat label={t('budget.debt')} value={formatMoney(debt, lang)} tone="bad" />
          <Stat label={t('econ.interestRate')} value={formatPercent(rate, lang, 1)} tone="bad" />
        </>
      )}
      {c.bankruptUntil > state.day && <div className="mt-1 rounded bg-danger/15 px-2 py-1 text-xs text-[#f3c2bc]">{t('budget.bankrupt')}</div>}

      <SectionTitle right={<span className={`tabular text-xs ${b.balance >= 0 ? 'text-good' : 'text-danger'}`}>{formatMoney(b.balance, lang)}</span>}>{t('budget.title')}</SectionTitle>
      <div className="text-xs font-medium text-good">{t('budget.income')}</div>
      {INCOME.filter((k) => b[k] > 0.0001 || k === 'tax').map((k) => (
        <Stat key={k} label={t(`budget.${k}`)} value={formatMoney(b[k], lang)} />
      ))}
      <Stat label={t('common.total')} value={formatMoney(b.income, lang)} tone="good" />
      <div className="mt-2 text-xs font-medium text-danger">{t('budget.expenses')}</div>
      {EXPENSE.filter((k) => b[k] > 0.0001 || k === 'armyUpkeep').map((k) => (
        <Stat key={k} label={t(`budget.${k}`)} value={formatMoney(b[k], lang)} />
      ))}
      <Stat label={t('common.total')} value={formatMoney(b.expenses, lang)} tone="bad" />
      <div className="mt-2 text-xs text-muted">{t('budget.oneOff')}</div>
      <Stat label={t('budget.construction')} value={formatMoney(c.monthSpend.construction, lang)} />
      <Stat label={t('budget.recruitment')} value={formatMoney(c.monthSpend.recruitment, lang)} />
      <Stat label={t('budget.diplomacy')} value={formatMoney(c.monthSpend.diplomacy, lang)} />

      <SectionTitle>{t('econ.resources')}</SectionTitle>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted">
            <th className="text-left font-normal" />
            <th className="text-right font-normal">{t('resource.stock')}</th>
            <th className="text-right font-normal">{t('resource.production')}</th>
            <th className="text-right font-normal">{t('resource.consumption')}</th>
            <th className="text-right font-normal">±</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {RESOURCE_IDS.map((r) => {
            const led = c.resources;
            const flow = led.imported[r] > 0 ? `+${formatNumber(led.imported[r], lang)}↓` : led.exported[r] > 0 ? `${formatNumber(led.exported[r], lang)}↑` : '—';
            return (
              <tr key={r} className="border-t border-line/50">
                <td className={`py-1 ${led.shortage[r] ? 'text-danger' : 'text-ink-2'}`}>{t(`resource.${r}`)}</td>
                <td className="text-right">{formatNumber(led.stock[r], lang)}</td>
                <td className="text-right">{formatNumber(led.production[r], lang)}</td>
                <td className="text-right">{formatNumber(led.consumption[r], lang)}</td>
                <td className="text-right text-muted">{flow}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] leading-snug text-muted">{t('resource.balanceNote')}</p>

      <SectionTitle right={<span className="text-xs text-muted">{trades.length}</span>}>{t('econ.trade')}</SectionTitle>
      {trades.length === 0 && <p className="text-xs text-muted">{t('econ.noTrade')}</p>}
      <div className="flex flex-wrap gap-1">
        {trades.map((tr) => {
          const o = tr.a === c.tag ? tr.b : tr.a;
          return (
            <button type="button" key={tr.id} onClick={() => ui.openRight({ kind: 'country', tag: o })} className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-panel-3">
              <Flag code={state.countries[o]?.flag ?? 'x-unknown'} className="h-2.5" /> {name(o)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">{t('econ.tradeValue')}</p>

      <SectionTitle>{t('econ.activeProjects')}</SectionTitle>
      {projects.length === 0 && <p className="text-xs text-muted">{t('econ.noProjects')}</p>}
      {projects.map(({ ps, i }) => (
        <button
          type="button"
          key={i}
          onClick={() => {
            ui.openRight({ kind: 'province', id: i });
            ui.focusOn(ctx.w.x[i], ctx.w.y[i]);
          }}
          className="flex w-full justify-between rounded px-1 py-0.5 text-left text-xs hover:bg-white/5"
        >
          <span className="text-ink-2">
            {lang === 'en' ? ctx.w.data.provinces[i].nameEn : ctx.w.data.provinces[i].name}: {t(`building.${ps.construction!.building}`)} {ps.construction!.level}
          </span>
          <span className="text-muted">{t('common.days', { n: Math.ceil(ps.construction!.daysLeft) })}</span>
        </button>
      ))}
      <p className="mt-1 text-[11px] text-muted">{t('econ.investHint')}</p>
    </div>
  );
}
