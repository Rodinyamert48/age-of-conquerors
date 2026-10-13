'use client';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { SectionTitle } from '@/components/ui';
import { useCommand, useReadCtx } from '../hooks';
import { POLICY_DEFS, TAX_RATES } from '@/game/defs/policies';
import { POLICY_IDS } from '@/game/types';
import { formatMoney } from '@/lib/format';

export default function PoliciesTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  if (!state || !ctx) return null;
  const c = state.countries[state.player];
  const grossTax = c.budget.tax;
  const modText = (mods: Record<string, number | undefined>) =>
    Object.entries(mods)
      .map(([k, v]) => {
        const n = v ?? 0;
        const val = Math.abs(n) < 1 && n !== 0 && !['stability', 'unrest', 'acceptance'].includes(k) ? `${Math.round(n * 1000) / 10}%` : `${n}`;
        return `${t(`mod.${k}`)} ${n > 0 ? '+' : ''}${val}`;
      })
      .join(' · ');

  return (
    <div className="text-sm">
      {POLICY_IDS.map((pid) => {
        const def = POLICY_DEFS[pid];
        const lvl = c.policies[pid];
        return (
          <div key={pid} className="mb-3">
            <SectionTitle>{t(`policy.${pid}`)}</SectionTitle>
            <p className="text-xs text-muted">{t(`policy.${pid}.desc`)}</p>
            <div className="mt-1.5 grid grid-cols-5 overflow-hidden rounded-[3px] border border-line-2">
              {[0, 1, 2, 3, 4].map((l) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => lvl !== l && cmd({ type: 'setPolicy', policy: pid, level: l })}
                  className={`border-l border-line-2 px-0.5 py-1 text-[11px] first:border-l-0 ${l === lvl ? 'bg-gold/85 text-[#1a1408]' : 'bg-panel-2 text-ink-2 hover:bg-panel-3'}`}
                  title={t(`policyLevel.${l}`)}
                >
                  {t(`policyLevel.${l}`)}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] leading-snug text-ink-2">
              {pid === 'tax' && <div>{t('policy.taxRate', { pct: Math.round(TAX_RATES[lvl] * 100) })}</div>}
              {def.cost[lvl] > 0 && (
                <div>
                  {t('policy.cost', { pct: Math.round(def.cost[lvl] * 100) })} ≈ {formatMoney(grossTax * def.cost[lvl], lang)}
                  {t('common.perMonth')}
                </div>
              )}
              {Object.keys(def.mods[lvl] ?? {}).length > 0 && <div className="text-muted">{modText(def.mods[lvl] as Record<string, number>)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
