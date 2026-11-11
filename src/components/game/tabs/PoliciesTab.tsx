'use client';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { SectionTitle } from '@/components/ui';
import { useCommand, useReadCtx } from '../hooks';
import { POLICY_DEFS, TAX_RATES } from '@/game/defs/policies';
import { POLICY_IDS, type PolicyId } from '@/game/types';
import { formatMoney } from '@/lib/format';

/** Tek politika: açıklama, 5 kademe ve seçili kademenin etkileri */
export function PolicyRow({ pid, compact = false }: { pid: PolicyId; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const cmd = useCommand();
  if (!state) return null;
  const c = state.countries[state.player];
  const def = POLICY_DEFS[pid];
  const lvl = c.policies[pid];
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
    <div className="mb-3">
      {compact ? <div className="text-[13px] text-ink">{t(`policy.${pid}`)}</div> : <SectionTitle>{t(`policy.${pid}`)}</SectionTitle>}
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
}

export default function PoliciesTab({ exclude = [] }: { exclude?: PolicyId[] }) {
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  if (!state || !ctx) return null;
  return (
    <div className="text-sm">
      {POLICY_IDS.filter((p) => !exclude.includes(p)).map((pid) => (
        <PolicyRow key={pid} pid={pid} />
      ))}
    </div>
  );
}
