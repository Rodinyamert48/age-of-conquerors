'use client';
import { useState } from 'react';
import { Anchor, Move, Pencil, Scissors, Shield, Square, Trash2, Combine } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Collapsible, Flag, SectionTitle, Stat, useConfirm } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { armySize } from '@/game/query';
import { armyBaseSpeed, pathTurns } from '@/game/movement';
import { unitUpkeep } from '@/game/economy';
import { UNIT_ORDER } from '@/game/defs/units';
import type { ArmyUnits, UnitType } from '@/game/types';
import { formatInt, formatMoney, formatPercent } from '@/lib/format';

export default function ArmyPanel() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const name = useCountryName();
  const ask = useConfirm((s) => s.ask);
  const [splitOpen, setSplitOpen] = useState(false);
  const [split, setSplit] = useState<Partial<ArmyUnits>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!state || !ctx) return null;
  const ids = ui.selectedArmies.filter((id) => state.armies[id]);
  if (!ids.length) return <p className="text-sm text-muted">{t('army.noArmies')}</p>;
  const a = state.armies[ids[0]];
  const me = state.player;
  const mine = a.owner === me;
  const hidden = !mine && state.rules.fogOfWar;
  const place = (node: number) => (node < ctx.w.P ? (lang === 'en' ? ctx.w.data.provinces[node].nameEn : ctx.w.data.provinces[node].name) : t('place.seaNode'));
  let upkeep = 0;
  if (mine) for (const u of UNIT_ORDER) upkeep += a.units[u] * unitUpkeep(ctx, me, u);
  const siege = a.location < ctx.w.P ? state.provinces[a.location].siege : null;

  // Aynı bölgedeki, savaşta olmayan kendi orduları (aynı türden: kara ya da donanma)
  const mergeable = Object.values(state.armies)
    .filter((x) => x.owner === a.owner && x.location === a.location && x.isNavy === a.isNavy && !x.battle)
    .map((x) => x.id);
  let status: string = t('army.idle');
  if (a.battle) status = t('army.inBattle');
  else if (a.path.length) status = t('army.moving', { target: place(a.path[a.path.length - 1]), days: pathTurns(ctx, a) });
  else if (siege && siege.by === a.owner) status = t('army.sieging', { progress: Math.round(siege.progress * 100) });
  else if (a.location >= ctx.w.P) status = t('army.atSea');

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        {a.isNavy ? <Anchor size={18} className="text-info" /> : <Shield size={18} className="text-gold" />}
        {renaming !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cmd({ type: 'renameArmy', army: a.id, name: renaming });
              setRenaming(null);
            }}
            className="flex flex-1 gap-1"
          >
            <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-1.5 py-0.5" />
            <Button size="sm" type="submit">
              {t('common.ok')}
            </Button>
          </form>
        ) : (
          <h2 className="min-w-0 flex-1 truncate font-display text-xl text-ink">{a.name}</h2>
        )}
        {mine && renaming === null && (
          <button type="button" onClick={() => setRenaming(a.name)} className="text-muted hover:text-ink" aria-label={t('army.rename')}>
            <Pencil size={14} />
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Flag code={state.countries[a.owner]?.flag ?? 'x-rebels'} className="h-3" />
        {name(a.owner)} · {place(a.location)}
      </div>
      <div className="mt-1 text-xs text-gold-soft">{status}</div>
      {mine && !a.isNavy && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span className="text-muted">{t('general.commander')}:</span>
          <select
            value={state.countries[me].generals?.find((g) => g.army === a.id)?.id ?? ''}
            onChange={(e) => {
              const prev = state.countries[me].generals?.find((g) => g.army === a.id);
              if (e.target.value) cmd({ type: 'assignGeneral', general: e.target.value, army: a.id });
              else if (prev) cmd({ type: 'assignGeneral', general: prev.id, army: null });
            }}
            className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-1 py-0.5"
            aria-label={t('general.commander')}
          >
            <option value="">{t('general.none')}</option>
            {(state.countries[me].generals ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({t('general.level', { n: g.level })})
              </option>
            ))}
          </select>
        </div>
      )}
      {mine && state.undo?.[me]?.turn === state.turn && (
        <Button size="sm" className="mt-1.5" onClick={() => cmd({ type: 'undoMove' }, t('undo.done'))}>
          ↶ {t('undo.button')}
        </Button>
      )}
      {a.battle && (
        <Button size="sm" variant="danger" className="mt-1.5" onClick={() => ui.openRight({ kind: 'battle', id: a.battle! })}>
          {t('battle.title')}
        </Button>
      )}

      {hidden ? (
        <p className="mt-3 text-xs text-muted">{t('army.hidden')}</p>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">{a.isNavy ? t('army.ships') : t('army.strength')}</div>
              <div className="font-display text-2xl leading-tight text-ink tabular">{formatInt(armySize(a), lang)}</div>
            </div>
            <div className="w-1/2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">{t('army.morale')}</span>
                <span className="tabular">{formatPercent(a.morale, lang)}</span>
              </div>
              <Bar value={a.morale} max={1.2} color={a.morale > 0.6 ? 'bg-good' : a.morale > 0.3 ? 'bg-warn' : 'bg-danger'} />
            </div>
          </div>
          {!a.isNavy && a.supply < 0.9 && <div className="mt-1 text-xs text-warn">{t('army.attritionWarning')}</div>}
          <Collapsible title={t('army.composition')}>
            {UNIT_ORDER.filter((u) => a.units[u] > 0).map((u) => (
              <Stat key={u} label={t(`unit.${u}`)} value={formatInt(a.units[u], lang)} />
            ))}
            <div className="mt-2 space-y-1.5 text-xs">
              <div>
                <div className="flex justify-between">
                  <span className="text-muted">{t('army.experience')}</span>
                  <span className="tabular">{formatPercent(a.experience, lang)}</span>
                </div>
                <Bar value={a.experience} color="bg-info" />
              </div>
              {!a.isNavy && (
                <div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('army.supply')}</span>
                    <span className="tabular">{formatPercent(a.supply, lang)}</span>
                  </div>
                  <Bar value={a.supply} color={a.supply > 0.9 ? 'bg-good' : 'bg-warn'} />
                </div>
              )}
            </div>
            <Stat label={t('army.speed')} value={t('army.speedValue', { n: Math.round(armyBaseSpeed(ctx, a)) })} />
            {mine && <Stat label={t('army.upkeep')} value={formatMoney(upkeep, lang)} />}
          </Collapsible>
        </>
      )}

      {mine && (
        <>
          <SectionTitle>{t('army.actions')}</SectionTitle>
          {!a.isNavy && (
            <div className="mb-2 rounded border border-line bg-panel-2 px-2 py-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted">{t('army.sendAmount')}</span>
                <span className="tabular text-ink">
                  {formatInt(Math.round((armySize(a) * ui.sendPct) / 100), lang)} / {formatInt(armySize(a), lang)}
                </span>
              </div>
              <input type="range" min={5} max={100} step={5} value={ui.sendPct} onChange={(e) => ui.setSendPct(Number(e.target.value))} className="mt-1 w-full accent-[#d2ae5c]" aria-label={t('army.sendAmount')} />
              <div className="mt-1 grid grid-cols-4 gap-1">
                {[25, 50, 75, 100].map((p) => (
                  <button type="button" key={p} onClick={() => ui.setSendPct(p)} className={`rounded border px-1 py-0.5 text-[11px] ${ui.sendPct === p ? 'border-gold bg-gold/20 text-gold-soft' : 'border-line-2 text-ink-2 hover:border-gold-2'}`}>
                    %{p}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant={ui.moveMode ? 'primary' : 'secondary'} disabled={!!a.battle} onClick={() => ui.setMoveMode(!ui.moveMode)}>
              <Move size={13} /> {t('army.move')}
            </Button>
            <Button size="sm" disabled={!a.path.length} onClick={() => ids.forEach((id) => cmd({ type: 'stopArmy', army: id }))}>
              <Square size={13} /> {t('army.stop')}
            </Button>
            <Button
              size="sm"
              disabled={!!a.battle || armySize(a) < 2}
              onClick={() => {
                const half: Partial<ArmyUnits> = {};
                for (const u of UNIT_ORDER) if (a.units[u]) half[u] = a.isNavy ? Math.floor(a.units[u] / 2) : Math.floor(a.units[u] / 2000) * 1000 || Math.floor(a.units[u] / 2);
                cmd({ type: 'splitArmy', army: a.id, units: half });
              }}
            >
              <Scissors size={13} /> {t('army.splitHalf')}
            </Button>
            <Button size="sm" disabled={!!a.battle} onClick={() => setSplitOpen(!splitOpen)}>
              <Scissors size={13} /> {t('army.splitCustom')}
            </Button>
            {/* Aynı bölgedeki kendi ordularını tek orduda birleştir (Age of History 2 gibi) */}
            <Button
              size="sm"
              disabled={!!a.battle || mergeable.length < 2}
              onClick={() => cmd({ type: 'mergeArmies', armies: mergeable }).then((r) => r.ok && ui.selectArmies([(r.data as { army: string }).army]))}
              title={t('army.mergeHint')}
            >
              <Combine size={13} /> {t('army.mergeHere', { n: mergeable.length })}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!!a.battle}
              onClick={async () => {
                const ok = await ask({ title: t('army.disband'), body: t('army.disbandConfirm', { army: a.name }), confirmLabel: t('army.disband'), cancelLabel: t('common.cancel'), danger: true });
                if (ok) {
                  await cmd({ type: 'disbandArmy', army: a.id });
                  ui.selectArmies([]);
                }
              }}
            >
              <Trash2 size={13} /> {t('army.disband')}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{ui.moveMode ? t('army.moveMode') : t('army.moveHint')}</p>
          {splitOpen && (
            <div className="mt-2 rounded border border-line bg-panel-2 p-2 text-xs">
              {UNIT_ORDER.filter((u) => a.units[u] > 0).map((u) => {
                const step = u === 'navy' ? 1 : 1000;
                const v = split[u] ?? 0;
                return (
                  <label key={u} className="mb-1 block">
                    <div className="flex justify-between">
                      <span>{t(`unit.${u}`)}</span>
                      <span className="tabular text-muted">
                        {formatInt(v, lang)} / {formatInt(a.units[u], lang)}
                      </span>
                    </div>
                    <input type="range" min={0} max={a.units[u]} step={step} value={v} onChange={(e) => setSplit({ ...split, [u as UnitType]: Number(e.target.value) })} className="w-full" />
                  </label>
                );
              })}
              <Button
                size="sm"
                variant="primary"
                className="mt-1 w-full"
                onClick={async () => {
                  const r = await cmd({ type: 'splitArmy', army: a.id, units: split });
                  if (r.ok) {
                    setSplit({});
                    setSplitOpen(false);
                  }
                }}
              >
                {t('army.splitApply')}
              </Button>
            </div>
          )}
          {ids.length > 1 && (
            <div className="mt-2 text-xs text-muted">
              {t('army.selectedCount', { n: ids.length })}: {ids.map((id) => state.armies[id].name).join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
