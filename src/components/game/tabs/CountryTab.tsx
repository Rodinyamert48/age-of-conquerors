'use client';
import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Flag, SectionTitle, Stat } from '@/components/ui';
import { useReadCtx, useCountryName } from '../hooks';
import { countrySummary } from '@/game/selectors';
import { stabilityTarget } from '@/game/stability';
import { formatCompact, formatDate, formatInt, formatMoney } from '@/lib/format';
import { victoryProgress } from '@/game/victory';
import { TECHS } from '@/game/defs/techs';

export default function CountryTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const name = useCountryName();
  const ui = useUI();
  const sum = useMemo(() => (ctx && state ? countrySummary(ctx, state.player) : null), [ctx, state]);
  if (!state || !ctx || !sum) return null;
  const c = state.countries[state.player];
  const stab = stabilityTarget(ctx, c);
  const vp = victoryProgress(ctx);
  const treaties = state.treaties.filter((x) => x.a === c.tag || x.b === c.tag);
  const hist = state.history;
  const maxT = Math.max(1, ...hist.map((h) => Math.abs(h.treasury)));

  return (
    <div className="text-sm">
      <div className="flex items-center gap-3">
        <Flag code={c.flag} className="h-10" />
        <div className="min-w-0">
          <div className="truncate font-display text-xl">{lang === 'en' ? c.nameEn : c.name}</div>
          <div className="text-xs text-muted">{t(`gov.${c.government}`)}</div>
        </div>
      </div>
      <Button
        size="sm"
        className="mt-2"
        onClick={() => {
          if (c.capital >= 0) {
            ui.focusOn(ctx.w.x[c.capital], ctx.w.y[c.capital], 1.2);
            ui.openRight({ kind: 'province', id: c.capital });
          }
        }}
      >
        <MapPin size={13} /> {t('country.focusCapital')}
      </Button>

      <SectionTitle>{t('country.overview')}</SectionTitle>
      <Stat label={t('country.capital')} value={sum.capitalName} />
      <Stat label={t('country.population')} value={formatCompact(sum.pop, lang)} />
      <Stat label={t('country.provinces')} value={sum.provinces} />
      <Stat label={t('country.gdp')} value={formatMoney(sum.output, lang)} />
      <Stat label={t('country.army')} value={`${formatInt(sum.soldiers, lang)} ${t('unit.soldiers')}`} />
      <Stat label={t('country.navy')} value={`${formatInt(sum.ships, lang)} ${t('unit.ships')}`} />
      <Stat label={t('country.techLevel')} value={`${c.techs.length} / ${TECHS.length}`} />
      <Stat label={t('country.reputation')} value={Math.round(c.reputation)} tone={c.reputation < -10 ? 'bad' : c.reputation > 10 ? 'good' : undefined} />
      <Stat label={t('country.warExhaustion')} value={Math.round(c.warExhaustion)} tone={c.warExhaustion > 30 ? 'bad' : undefined} />
      {sum.alliance && <Stat label={t('country.alliance')} value={`${sum.alliance}${sum.allianceLeader ? ` (${name(sum.allianceLeader)})` : ''}`} />}
      {sum.overlord && <Stat label={t('country.overlord')} value={name(sum.overlord)} />}
      {sum.vassals.length > 0 && <Stat label={t('country.vassals')} value={sum.vassals.map(name).join(', ')} />}

      {state.rules.victory.mode !== 'sandbox' && (
        <>
          <SectionTitle>{t('victory.progress')}</SectionTitle>
          <div className="text-xs text-muted">{t(`victory.${vp.mode}`)}</div>
          <Bar value={vp.progress} className="mt-1" />
          <div className="mt-0.5 text-right text-xs tabular text-ink-2">
            {vp.current} / {vp.target}
          </div>
        </>
      )}

      <SectionTitle right={<span className="tabular text-xs text-ink-2">{Math.round(c.stability)} → {Math.round(stab.target)}</span>}>{t('country.stabilityBreakdown')}</SectionTitle>
      <Bar value={c.stability} max={100} color={c.stability >= 50 ? 'bg-good' : c.stability >= 30 ? 'bg-warn' : 'bg-danger'} />
      <div className="mt-1">
        {stab.parts.map((p) => (
          <Stat key={p.key} label={t(p.key)} value={`${p.value > 0 ? '+' : ''}${p.value}`} tone={p.value >= 0 ? 'good' : 'bad'} />
        ))}
      </div>

      {c.tempMods.length > 0 && (
        <>
          <SectionTitle>{t('country.modifiers')}</SectionTitle>
          {c.tempMods.map((m) => (
            <div key={m.id} className="mb-1 rounded bg-panel-2 px-2 py-1 text-xs">
              <div className="flex justify-between">
                <span className="text-ink">{m.label.startsWith('mod.') ? t(m.label) : m.label}</span>
                <span className="text-muted">{formatDate(m.until, lang)}</span>
              </div>
              <div className="text-muted">
                {Object.entries(m.mods)
                  .map(([k, v]) => `${t(`mod.${k}`)} ${(v as number) > 0 ? '+' : ''}${Math.abs(v as number) < 1 ? Math.round((v as number) * 1000) / 10 + '%' : v}`)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </>
      )}

      <SectionTitle>{t('country.treaties')}</SectionTitle>
      {treaties.length === 0 && <div className="text-xs text-muted">{t('common.none')}</div>}
      <div className="flex flex-wrap gap-1">
        {treaties.slice(0, 60).map((tr) => {
          const other = tr.a === c.tag ? tr.b : tr.a;
          return (
            <button
              type="button"
              key={tr.id}
              onClick={() => ui.openRight({ kind: 'country', tag: other })}
              className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-panel-3"
              title={tr.end ? t('treaty.until', { date: formatDate(tr.end, lang) }) : undefined}
            >
              <Flag code={state.countries[other]?.flag ?? 'x-unknown'} className="h-2.5" />
              {t(`treaty.${tr.type}`)} · {name(other)}
            </button>
          );
        })}
      </div>

      <SectionTitle>{t('country.stats')}</SectionTitle>
      <Stat label={t('country.battlesWon')} value={c.stats.battlesWon} />
      <Stat label={t('country.battlesLost')} value={c.stats.battlesLost} />
      <Stat label={t('country.casualties')} value={formatInt(c.stats.casualties, lang)} />
      <Stat label={t('country.conquered')} value={c.stats.provincesConquered} />

      {hist.length > 1 && (
        <>
          <SectionTitle>{t('country.history')}</SectionTitle>
          <svg viewBox={`0 0 ${hist.length} 40`} preserveAspectRatio="none" className="h-16 w-full rounded bg-bg-2">
            <line x1={0} x2={hist.length} y1={20} y2={20} stroke="#27344b" strokeWidth={0.3} />
            <polyline
              fill="none"
              stroke="#d2ae5c"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              points={hist.map((h, i) => `${i},${20 - (h.treasury / maxT) * 18}`).join(' ')}
            />
          </svg>
        </>
      )}
    </div>
  );
}
