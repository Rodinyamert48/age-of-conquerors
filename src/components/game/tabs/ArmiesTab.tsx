'use client';
import { useMemo } from 'react';
import { Anchor, Shield, Swords } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Button, SectionTitle } from '@/components/ui';
import { useCommand, useReadCtx } from '../hooks';
import { armiesOf } from '@/game/ctx';
import { armySize } from '@/game/query';
import { formatInt } from '@/lib/format';
import { pathDays } from '@/game/movement';
import type { Army } from '@/game/types';

export default function ArmiesTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const armies = useMemo(() => (ctx && state ? [...armiesOf(ctx, state.player)].sort((a, b) => Number(a.isNavy) - Number(b.isNavy) || armySize(b) - armySize(a)) : []), [ctx, state]);
  if (!state || !ctx) return null;
  const soldiers = armies.filter((a) => !a.isNavy).reduce((n, a) => n + armySize(a), 0);
  const ships = armies.filter((a) => a.isNavy).reduce((n, a) => n + a.units.navy, 0);
  const selected = ui.selectedArmies.filter((id) => state.armies[id]);
  const canMerge = selected.length >= 2 && selected.every((id) => state.armies[id].location === state.armies[selected[0]].location && state.armies[id].isNavy === state.armies[selected[0]].isNavy);

  const place = (node: number) => (node < ctx.w.P ? (lang === 'en' ? ctx.w.data.provinces[node].nameEn : ctx.w.data.provinces[node].name) : t('place.seaNode'));

  const statusOf = (a: Army) => {
    if (a.battle) return <span className="text-danger">{t('army.inBattle')}</span>;
    if (a.path.length) {
      const target = a.path[a.path.length - 1];
      return <span className="text-gold-soft">{t('army.moving', { target: place(target), days: Math.ceil(pathDays(ctx, a)) })}</span>;
    }
    if (a.location < ctx.w.P) {
      const sg = state.provinces[a.location].siege;
      if (sg && sg.by === state.player) return <span className="text-warn">{t('army.sieging', { progress: Math.round(sg.progress * 100) })}</span>;
    } else return <span className="text-info">{t('army.atSea')}</span>;
    return <span className="text-muted">{t('army.idle')}</span>;
  };

  return (
    <div className="text-sm">
      <div className="rounded bg-panel-2 px-2 py-1.5 text-xs text-ink-2">{t('army.total', { soldiers: formatInt(soldiers, lang), ships: formatInt(ships, lang) })}</div>
      <p className="mt-1.5 text-xs text-muted">{t('army.selectMultiple')}</p>
      {selected.length > 1 && (
        <div className="mt-2 flex items-center justify-between rounded border border-gold-2/50 bg-gold/10 px-2 py-1.5 text-xs">
          <span>{t('army.selectedCount', { n: selected.length })}</span>
          <Button size="sm" disabled={!canMerge} onClick={() => cmd({ type: 'mergeArmies', armies: selected }).then((r) => r.ok && ui.selectArmies([(r.data as { army: string }).army]))}>
            {t('army.merge')}
          </Button>
        </div>
      )}
      <SectionTitle>{t('army.list')}</SectionTitle>
      {armies.length === 0 && <p className="text-xs text-muted">{t('army.noArmies')}</p>}
      <ul className="flex flex-col gap-1">
        {armies.map((a) => {
          const sel = selected.includes(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={(e) => {
                  if (e.shiftKey) ui.toggleArmy(a.id);
                  else {
                    ui.selectArmies([a.id]);
                    ui.focusOn(ctx.w.x[a.location], ctx.w.y[a.location]);
                  }
                }}
                className={`w-full rounded border px-2 py-1.5 text-left ${sel ? 'border-gold bg-gold/10' : 'border-line bg-panel-2 hover:border-line-2'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {a.isNavy ? <Anchor size={13} className="text-info" /> : a.battle ? <Swords size={13} className="text-danger" /> : <Shield size={13} className="text-gold" />}
                    <span className="truncate text-ink">{a.name}</span>
                  </span>
                  <span className="tabular text-xs text-ink-2">{a.isNavy ? `${formatInt(a.units.navy, lang)} ${t('unit.ships')}` : formatInt(armySize(a), lang)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-muted">{place(a.location)}</span>
                  <span className="truncate">{statusOf(a)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-black/40">
                  <div className={`h-full ${a.morale > 0.6 ? 'bg-good' : a.morale > 0.3 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${Math.min(100, a.morale * 100)}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
