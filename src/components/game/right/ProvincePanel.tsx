'use client';
import { useMemo, useState } from 'react';
import { Anchor, Hammer, Shield, Swords, X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Flag, SectionTitle, Stat, useConfirm, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { BUILDING_IDS, type BuildingId, type UnitType } from '@/game/types';
import { BUILDING_DEFS } from '@/game/defs/buildings';
import { buildingAvailability, maxRecruitAmount, recruitAvailability, unitAvailable } from '@/game/construction';
import { UNIT_DEFS, UNIT_ORDER } from '@/game/defs/units';
import { TERRAIN_DEFS } from '@/game/defs/terrain';
import { provinceMonthlyIncome } from '@/game/selectors';
import { supplyLimit } from '@/game/movement';
import { armiesAt } from '@/game/ctx';
import { armySize, fortLevel, REBEL_TAG } from '@/game/query';
import { assaultChance } from '@/game/siege';
import { formatCompact, formatInt, formatMoney, formatPercent } from '@/lib/format';
import { provinceOutput } from '@/game/economy';

export default function ProvincePanel({ id }: { id: number }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const name = useCountryName();
  const ask = useConfirm((s) => s.ask);
  const [unit, setUnit] = useState<UnitType>('infantry');
  const [amount, setAmount] = useState(10000);
  const [cedeTo, setCedeTo] = useState('');
  if (!state || !ctx || id < 0 || id >= ctx.w.P) return null;
  const wp = ctx.w.data.provinces[id];
  const ps = state.provinces[id];
  const me = state.player;
  const owner = state.countries[ps.owner];
  const mine = ps.owner === me;
  const controlled = ps.controller === me;
  const terr = ctx.w.terrain[id];
  const armies = armiesAt(ctx, id);
  const fort = fortLevel(ctx, id);
  const income = provinceMonthlyIncome(ctx, id);
  const supply = supplyLimit(ctx, id, me);
  const assault = ps.siege?.by === me ? assaultChance(ctx, id) : null;

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{t('province.title')}</div>
          <h2 className="truncate font-display text-xl text-ink">{lang === 'en' ? wp.nameEn : wp.name}</h2>
        </div>
        {ps.owner !== REBEL_TAG && owner && (
          <button type="button" onClick={() => ui.openRight({ kind: 'country', tag: ps.owner })} className="flex shrink-0 items-center gap-1.5 rounded border border-line-2 px-2 py-1 hover:border-gold-2">
            <Flag code={owner.flag} className="h-4" />
            <span className="max-w-[110px] truncate text-xs text-ink-2">{name(ps.owner)}</span>
          </button>
        )}
      </div>
      {ps.controller !== ps.owner ? (
        <div className="mt-1 flex items-center gap-1.5 rounded bg-danger/15 px-2 py-1 text-xs text-[#f3c2bc]">
          <Flag code={state.countries[ps.controller]?.flag ?? 'x-rebels'} className="h-3" />
          {t('province.occupied', { country: name(ps.controller) })}
        </div>
      ) : null}
      {ps.siege && (
        <div className="mt-2 rounded border border-warn/40 bg-warn/10 p-2 text-xs">
          <div className="text-warn">{t('province.siege', { country: name(ps.siege.by), progress: Math.round(ps.siege.progress * 100) })}</div>
          <Bar value={ps.siege.progress} color="bg-warn" className="mt-1" />
          {assault && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-muted">{t('province.assaultInfo', { chance: Math.round(assault.chance * 100), casualties: formatInt(assault.casualties, lang) })}</span>
              <Button size="sm" variant="danger" onClick={() => cmd({ type: 'assault', province: id })}>
                <Swords size={13} /> {t('province.assault')}
              </Button>
            </div>
          )}
        </div>
      )}

      <SectionTitle>{t('common.details')}</SectionTitle>
      {wp.city && <Stat label={t('province.city')} value={`${lang === 'en' ? wp.city.nameEn : wp.city.name}${wp.city.capital ? ' ★' : ''}`} />}
      <Stat label={t('province.population')} value={formatCompact(ps.pop, lang)} />
      <Stat label={t('province.output')} value={formatMoney(provinceOutput(ctx, id), lang)} />
      {mine && <Stat label={t('province.income')} value={formatMoney(income, lang)} tone="good" />}
      <Stat label={t('province.terrain')} value={t(`terrain.${terr}`)} />
      <Stat label={t('province.defense')} value={`+${formatPercent(TERRAIN_DEFS[terr].defense + fort * 0.15, lang)}`} />
      <Stat label={t('province.fort')} value={fort} />
      <Stat label={t('province.supply')} value={`${formatCompact(supply, lang)} ${t('unit.soldiers')}`} />
      <Stat label={wp.coastal ? t('province.coastal') : t('province.landlocked')} value={wp.coastal ? <Anchor size={13} className="inline text-info" /> : '—'} />
      <div className="mt-1">
        <div className="flex justify-between text-[13px]">
          <span className="text-muted">{t('province.unrest')}</span>
          <span className="tabular">{Math.round(ps.unrest)}</span>
        </div>
        <Bar value={ps.unrest} max={100} color={ps.unrest > 60 ? 'bg-danger' : ps.unrest > 30 ? 'bg-warn' : 'bg-good'} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted">{t('province.cores')}:</span>
        {ps.cores.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5">
            <Flag code={state.countries[c]?.flag ?? 'x-unknown'} className="h-2.5" />
            {name(c)}
          </span>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-muted">
        {t('province.resources')}: {t('resource.food')} {wp.res[0]} · {t('resource.iron')} {wp.res[1]} · {t('resource.coal')} {wp.res[2]} · {t('resource.timber')} {wp.res[3]}
      </div>

      <SectionTitle>{t('province.armies')}</SectionTitle>
      {armies.length === 0 && <p className="text-xs text-muted">{t('province.noArmies')}</p>}
      {armies.map((a) => (
        <button
          type="button"
          key={a.id}
          onClick={() => ui.selectArmies([a.id])}
          className="mb-1 flex w-full items-center justify-between rounded border border-line bg-panel-2 px-2 py-1 text-left text-xs hover:border-line-2"
        >
          <span className="flex items-center gap-1.5">
            <Flag code={state.countries[a.owner]?.flag ?? 'x-rebels'} className="h-3" />
            {a.isNavy ? <Anchor size={12} /> : <Shield size={12} />} {a.name}
          </span>
          <span className="tabular text-ink-2">{state.rules.fogOfWar && a.owner !== me ? '?' : formatInt(armySize(a), lang)}</span>
        </button>
      ))}
      {!mine && <p className="mt-1 text-[11px] text-muted">{t('province.selectArmyHint')}</p>}

      {mine && controlled && <Buildings id={id} />}
      {mine && controlled && (
        <>
          <SectionTitle>{t('province.recruitment')}</SectionTitle>
          <Recruit id={id} unit={unit} setUnit={setUnit} amount={amount} setAmount={setAmount} />
          {ps.recruits.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted">{t('province.recruitQueue')}</div>
              {ps.recruits.map((r, i) => (
                <div key={i} className="mt-1 rounded bg-panel-2 px-2 py-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span>
                      {formatInt(r.amount, lang)} {t(`unit.${r.unit}`)}
                    </span>
                    <button type="button" className="text-muted hover:text-danger" onClick={() => cmd({ type: 'cancelRecruit', province: id, index: i })} aria-label={t('province.cancel')}>
                      <X size={13} />
                    </button>
                  </div>
                  <Bar value={r.totalDays - r.daysLeft} max={r.totalDays} className="mt-1" />
                  <div className="mt-0.5 text-right text-muted">{t('common.days', { n: Math.ceil(r.daysLeft) })}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Toprak işlemleri */}
      {!mine && ps.owner !== REBEL_TAG && owner?.alive && (
        <>
          <SectionTitle>{t('country.actions')}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              disabled={state.countries[me].claims.includes(id)}
              onClick={() => cmd({ type: 'diplomacy', action: 'claim', target: ps.owner, province: id }, t('diplo.done'))}
              title={t('action.claim.desc')}
            >
              {t('province.makeClaim')}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const r = await cmd({ type: 'diplomacy', action: 'requestProvince', target: ps.owner, province: id });
                const d = r.data as { accepted?: boolean } | undefined;
                if (r.ok) pushToast(d?.accepted ? t('diplo.accepted', { country: name(ps.owner) }) : d?.accepted === false ? t('diplo.declined', { country: name(ps.owner) }) : t('diplo.sent'), d?.accepted ? 'good' : 'info');
              }}
              title={t('action.requestProvince.desc')}
            >
              {t('province.requestProvince')}
            </Button>
          </div>
        </>
      )}
      {mine && controlled && state.countries[me].capital !== id && (
        <>
          <SectionTitle>{t('action.cedeProvince')}</SectionTitle>
          <div className="flex gap-1.5">
            <CedeSelect value={cedeTo} onChange={setCedeTo} />
            <Button
              size="sm"
              variant="danger"
              disabled={!cedeTo}
              onClick={async () => {
                const ok = await ask({
                  title: t('action.cedeProvince'),
                  body: `${lang === 'en' ? wp.nameEn : wp.name} → ${name(cedeTo)}`,
                  confirmLabel: t('common.confirm'),
                  cancelLabel: t('common.cancel'),
                  danger: true,
                });
                if (ok) cmd({ type: 'diplomacy', action: 'cedeProvince', target: cedeTo, province: id }, t('diplo.done'));
              }}
            >
              {t('common.apply')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function pushToast(text: string, tone: 'good' | 'bad' | 'info') {
  useToasts.getState().push(text, tone);
}

function CedeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const state = useGame((s) => s.state);
  const name = useCountryName();
  const t = useT();
  const opts = useMemo(
    () =>
      state
        ? Object.values(state.countries)
            .filter((c) => c.alive && c.tag !== state.player && c.tag !== REBEL_TAG && !c.rebelMovement)
            .sort((a, b) => name(a.tag).localeCompare(name(b.tag)))
        : [],
    [state, name],
  );
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-1.5 py-1 text-xs">
      <option value="">{t('common.select')}…</option>
      {opts.map((c) => (
        <option key={c.tag} value={c.tag}>
          {name(c.tag)}
        </option>
      ))}
    </select>
  );
}

function Buildings({ id }: { id: number }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state)!;
  const ctx = useReadCtx()!;
  const cmd = useCommand();
  const ps = state.provinces[id];
  const me = state.player;
  return (
    <>
      <SectionTitle>{t('province.buildings')}</SectionTitle>
      {ps.construction && (
        <div className="mb-2 rounded border border-gold-2/50 bg-gold/10 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gold-soft">{t('province.building', { building: t(`building.${ps.construction.building}`), level: ps.construction.level, days: Math.ceil(ps.construction.daysLeft) })}</span>
            <button type="button" onClick={() => cmd({ type: 'cancelBuild', province: id })} className="text-muted hover:text-danger" aria-label={t('province.cancel')}>
              <X size={13} />
            </button>
          </div>
          <Bar value={ps.construction.totalDays - ps.construction.daysLeft} max={ps.construction.totalDays} className="mt-1" />
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {BUILDING_IDS.map((b, idx) => {
          const lvl = ps.buildings[idx];
          const def = BUILDING_DEFS[b as BuildingId];
          const av = buildingAvailability(ctx, me, id, b);
          const max = lvl >= def.maxLevel;
          return (
            <li key={b} className="rounded border border-line bg-panel-2 px-2 py-1.5" title={t(`building.${b}.desc`)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">{t(`building.${b}`)}</span>
                <span className="flex gap-0.5">
                  {Array.from({ length: def.maxLevel }, (_, i) => (
                    <span key={i} className={`h-2 w-3 rounded-sm ${i < lvl ? 'bg-gold' : 'bg-line-2'}`} />
                  ))}
                </span>
              </div>
              {!max && (
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className={av.ok ? 'text-muted' : 'text-faint'}>
                    {av.ok || av.reason === 'err.noMoney'
                      ? `${formatMoney(av.cost, lang)} · ${t('common.days', { n: av.days })}`
                      : t(av.reason ?? 'err.unknown', av.reasonParams)}
                  </span>
                  <Button size="sm" disabled={!av.ok} onClick={() => cmd({ type: 'build', province: id, building: b })}>
                    <Hammer size={12} /> {t('province.levelShort', { n: av.level })}
                  </Button>
                </div>
              )}
              {max && <div className="mt-0.5 text-[11px] text-muted">{t('province.maxLevel')}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Recruit({ id, unit, setUnit, amount, setAmount }: { id: number; unit: UnitType; setUnit: (u: UnitType) => void; amount: number; setAmount: (n: number) => void }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state)!;
  const ctx = useReadCtx()!;
  const cmd = useCommand();
  const me = state.player;
  const units = UNIT_ORDER.filter((u) => unitAvailable(ctx, me, u));
  const cur = units.includes(unit) ? unit : units[0];
  const def = UNIT_DEFS[cur];
  const step = def.step;
  const max = maxRecruitAmount(ctx, id, cur);
  const amt = Math.max(step, Math.min(max, amount));
  const av = recruitAvailability(ctx, me, id, cur, amt);
  return (
    <div>
      <div className="grid grid-cols-4 gap-1">
        {units.map((u) => (
          <button
            type="button"
            key={u}
            onClick={() => {
              setUnit(u);
              setAmount(u === 'navy' ? 1 : 10000);
            }}
            title={t(`unit.${u}.desc`)}
            className={`rounded border px-1 py-1 text-[11px] ${u === cur ? 'border-gold bg-gold/15 text-gold-soft' : 'border-line-2 bg-panel-2 text-ink-2 hover:border-gold-2'}`}
          >
            {t(`unit.${u}`)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">{t(`unit.${cur}.desc`)}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-xs text-muted">{t('province.amount')}</span>
        <button type="button" className="rounded border border-line-2 px-2 text-sm" onClick={() => setAmount(Math.max(step, amt - step * (cur === 'navy' ? 1 : 5)))}>
          −
        </button>
        <input
          type="number"
          value={amt}
          min={step}
          max={max}
          step={step}
          onChange={(e) => setAmount(Math.round((Number(e.target.value) || step) / step) * step)}
          className="w-24 rounded border border-line-2 bg-bg-2 px-1.5 py-0.5 text-right text-sm tabular"
        />
        <button type="button" className="rounded border border-line-2 px-2 text-sm" onClick={() => setAmount(Math.min(max, amt + step * (cur === 'navy' ? 1 : 5)))}>
          +
        </button>
        <span className="text-[11px] text-faint">/ {formatInt(max, lang)}</span>
      </div>
      <div className={`mt-1 text-[11px] ${av.ok ? 'text-ink-2' : 'text-danger'}`}>
        {av.ok || av.reason === 'err.noMoney'
          ? t('province.recruitInfo', { cost: formatMoney(av.cost, lang), manpower: formatInt(amt * def.manpower, lang), days: av.days })
          : t(av.reason ?? 'err.unknown', av.reasonParams)}
      </div>
      <Button variant="primary" size="sm" className="mt-1.5 w-full" disabled={!av.ok} onClick={() => cmd({ type: 'recruit', province: id, unit: cur, amount: amt })}>
        {t('province.recruitBtn')}
      </Button>
    </div>
  );
}
