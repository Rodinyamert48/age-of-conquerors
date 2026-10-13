'use client';
import { useMemo } from 'react';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { Bar, Flag, SectionTitle, Stat } from '@/components/ui';
import { useReadCtx, useCountryName } from '../hooks';
import type { BattleReport, BattleSideSnapshot } from '@/game/types';
import { UNIT_ORDER } from '@/game/defs/units';
import { predictBattle, simContextAt, toSim } from '@/game/combat';
import { pathDays } from '@/game/movement';
import { isFriendly } from '@/game/query';
import { formatInt, formatPercent } from '@/lib/format';
import type { Ctx } from '@/game/ctx';

function Side({ side, title, naval, win }: { side: BattleSideSnapshot; title: string; naval: boolean; win?: boolean }) {
  const t = useT();
  const lang = useLang();
  const name = useCountryName();
  const state = useGame((s) => s.state)!;
  return (
    <div className={`rounded border p-2 ${win === undefined ? 'border-line bg-panel-2' : win ? 'border-good/60 bg-good/10' : 'border-danger/50 bg-danger/10'}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{title}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <Flag code={state.countries[side.tag]?.flag ?? 'x-rebels'} className="h-4" />
        <span className="truncate text-ink">{name(side.tag)}</span>
      </div>
      <Stat label={naval ? t('army.ships') : t('battle.soldiers')} value={`${formatInt(side.strength, lang)} / ${formatInt(side.start, lang)}`} />
      <Stat label={t('battle.losses')} value={formatInt(side.losses, lang)} tone="bad" />
      <div className="mt-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">{t('battle.morale')}</span>
          <span className="tabular">{formatPercent(side.morale, lang)}</span>
        </div>
        <Bar value={side.morale} max={1.2} color={side.morale > 0.5 ? 'bg-good' : side.morale > 0.25 ? 'bg-warn' : 'bg-danger'} />
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px]">
        {UNIT_ORDER.filter((u) => side.units[u] > 0).map((u) => (
          <div key={u} className="flex justify-between">
            <span className="text-muted">{t(`unit.${u}`)}</span>
            <span className="tabular text-ink-2">{formatInt(side.units[u], lang)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chart({ log }: { log: { attLoss: number; defLoss: number }[] }) {
  const max = Math.max(1, ...log.map((l) => Math.max(l.attLoss, l.defLoss)));
  return (
    <svg viewBox={`0 0 ${Math.max(1, log.length) * 6} 40`} preserveAspectRatio="none" className="h-14 w-full rounded bg-bg-2">
      {log.map((l, i) => (
        <g key={i}>
          <rect x={i * 6} y={20 - (l.attLoss / max) * 19} width={2.5} height={(l.attLoss / max) * 19} fill="#d2ae5c" />
          <rect x={i * 6 + 2.8} y={20} width={2.5} height={(l.defLoss / max) * 19} fill="#6fa6da" />
        </g>
      ))}
      <line x1={0} x2={log.length * 6} y1={20} y2={20} stroke="#34445f" strokeWidth={0.4} />
    </svg>
  );
}

function placeName(ctx: Ctx, node: number, lang: 'tr' | 'en', sea: string) {
  return node < ctx.w.P ? (lang === 'en' ? ctx.w.data.provinces[node].nameEn : ctx.w.data.provinces[node].name) : sea;
}

export default function BattlePanel({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const b = state?.battles[id];
  const prediction = useMemo(() => {
    if (!ctx || !b) return null;
    const att = b.attacker.armies.map((x) => ctx.s.armies[x]).filter(Boolean).map((a) => toSim(ctx, a));
    const def = b.defender.armies.map((x) => ctx.s.armies[x]).filter(Boolean).map((a) => toSim(ctx, a));
    if (!att.length || !def.length) return null;
    const sc = simContextAt(ctx, b.location, b.defender.tag);
    sc.fort = b.fort;
    return predictBattle(att, def, sc, (b.days + 1) * 7919);
  }, [ctx, b]);
  const reinforcements = useMemo(() => {
    if (!ctx || !b) return [];
    return Object.values(ctx.s.armies)
      .filter((a) => a.path.length && a.path[a.path.length - 1] === b.location && !a.battle && (isFriendly(ctx, a.owner, b.attacker.tag) || isFriendly(ctx, a.owner, b.defender.tag)))
      .map((a) => ({ a, days: Math.ceil(pathDays(ctx, a)) }))
      .sort((x, y) => x.days - y.days)
      .slice(0, 8);
  }, [ctx, b]);
  if (!state || !ctx) return null;
  if (!b) {
    const rep = state.battleReports.find((r) => r.id === id);
    return rep ? <ReportView report={rep} /> : <p className="text-sm text-muted">{t('battle.ended')}</p>;
  }
  return (
    <div className="text-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-danger">{t('battle.ongoing')}</div>
      <h2 className="font-display text-xl text-ink">{b.naval ? t('battle.naval') : placeName(ctx, b.location, lang, t('place.seaNode'))}</h2>
      <div className="text-xs text-muted">
        {t('battle.day', { n: b.days })} · {t('battle.terrain')}: {t(`terrain.${b.terrain}`)} · {t('battle.fort')}: {b.fort}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Side side={b.attacker} title={t('battle.attacker')} naval={b.naval} />
        <Side side={b.defender} title={t('battle.defender')} naval={b.naval} />
      </div>
      {prediction && (
        <>
          <SectionTitle>{t('battle.prediction')}</SectionTitle>
          <div className={prediction.attackerWinChance >= 0.5 ? 'text-gold-soft' : 'text-info'}>
            {prediction.attackerWinChance >= 0.5
              ? t('battle.attackerWins', { chance: Math.round(prediction.attackerWinChance * 100) })
              : t('battle.defenderWins', { chance: Math.round((1 - prediction.attackerWinChance) * 100) })}
          </div>
          <div className="text-xs text-muted">{t('battle.predictedLosses', { a: formatInt(prediction.attLoss, lang), d: formatInt(prediction.defLoss, lang) })}</div>
          <Bar value={prediction.attackerWinChance} className="mt-1" />
        </>
      )}
      <SectionTitle>{t('battle.reinforcements')}</SectionTitle>
      {reinforcements.length === 0 && <p className="text-xs text-muted">{t('battle.noReinforcements')}</p>}
      {reinforcements.map(({ a, days }) => (
        <div key={a.id} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <Flag code={state.countries[a.owner]?.flag ?? 'x-rebels'} className="h-2.5" />
            {a.name}
          </span>
          <span className="text-muted">{t('common.days', { n: days })}</span>
        </div>
      ))}
      {b.log.length > 0 && (
        <>
          <SectionTitle>{t('battle.progress')}</SectionTitle>
          <Chart log={b.log} />
        </>
      )}
    </div>
  );
}

export function ReportView({ report }: { report: BattleReport }) {
  const t = useT();
  const lang = useLang();
  const ctx = useReadCtx();
  const name = useCountryName();
  if (!ctx) return null;
  const winner = report.winner === 'attacker' ? report.attacker.tag : report.defender.tag;
  return (
    <div className="text-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{t('battle.ended')}</div>
      <h2 className="font-display text-xl text-ink">{report.naval ? t('battle.naval') : placeName(ctx, report.location, lang, t('place.seaNode'))}</h2>
      <div className="text-xs text-gold-soft">{t('battle.winner', { country: name(winner) })}</div>
      <div className="text-xs text-muted">
        {t('battle.terrain')}: {t(`terrain.${report.terrain}`)} · {t('battle.fort')}: {report.fort}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Side side={report.attacker} title={t('battle.attacker')} naval={report.naval} win={report.winner === 'attacker'} />
        <Side side={report.defender} title={t('battle.defender')} naval={report.naval} win={report.winner === 'defender'} />
      </div>
    </div>
  );
}
