'use client';
import { useMemo, useState } from 'react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Collapsible, Flag, Stat, Toggle, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { modsText } from '../MinisterDialog';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { bondRate, debtLimit, debtOf, MARKET, MARKET_GOODS, OIL_SHARE, projectCost } from '@/game/finance';
import { MEGA_PROJECTS } from '@/game/defs/projects';
import { IDEOLOGIES, IDEOLOGY_BY_ID } from '@/game/defs/ideologies';
import { UNIONS, UNION_SHARE } from '@/game/defs/unions';
import { unionProgress } from '@/game/society';
import { buyVoteCost, vetoPowers } from '@/game/un';
import { REBEL_TAG } from '@/game/query';
import type { UNResolution } from '@/game/types';

const loc = (v: { tr: string; en: string }, lang: string) => (lang === 'tr' ? v.tr : v.en);

/** Devlet sekmesi: maliye, dünya pazarı, mega projeler, ideoloji, büyük güçler, BM, birlikler, ülke kimliği */
export default function StateTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  const name = useCountryName();
  const ui = useUI();
  const push = useToasts((x) => x.push);
  const [unKind, setUnKind] = useState<UNResolution['kind']>('condemn');
  const [unTarget, setUnTarget] = useState('');
  const [unWar, setUnWar] = useState('');
  const [unBuy, setUnBuy] = useState(0);
  const [newName, setNewName] = useState('');
  const countries = useMemo(
    () => (state ? Object.values(state.countries).filter((c) => c.alive && c.tag !== REBEL_TAG && !c.rebelMovement && c.tag !== state.player).sort((a, b) => (lang === 'tr' ? a.name.localeCompare(b.name, 'tr') : a.nameEn.localeCompare(b.nameEn))) : []),
    [state, lang],
  );
  if (!state || !ctx) return null;
  const me = state.player;
  const c = state.countries[me];
  const yearly = Math.max(0.01, c.budget.income * 12);
  const loans = (state.loans ?? []).filter((l) => l.to === me || l.from === me);
  const debt = debtOf(ctx, me);
  const rate = bondRate(ctx, me);
  const prices = state.market?.prices;
  const powers = state.greatPowers ?? [];
  const un = state.un;
  const pendingVote = un?.pending && un.pending.proposer !== me ? un.pending : null;
  const activeProject = Object.entries(c.projects ?? {}).find(([, p]) => p.end > state.day);
  const ideo = c.ideology ? IDEOLOGY_BY_ID[c.ideology] : undefined;
  const hex = `#${c.color.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  const flags = Array.from(new Set(['eu', 'un', 'arab', ...Object.values(state.countries).map((x) => x.flag)])).filter((f) => /^[a-z]{2}(-[a-z]{2,4})?$|^(eu|un|arab)$/.test(f)).sort();

  return (
    <div className="text-sm">
      {/* ------------------------------------------------------------ Maliye */}
      <Collapsible title={t('state.finance')} defaultOpen right={<span className="tabular text-xs">{formatMoney(debt, lang)}</span>}>
        <Stat label={t('finance.debt')} value={`${formatMoney(debt, lang)} / ${formatMoney(debtLimit(ctx, me), lang)}`} tone={debt > yearly ? 'bad' : undefined} />
        <Stat label={t('finance.bondRate')} value={formatPercent(rate, lang, 1)} hint={t('finance.bondRateHint')} />
        <div className="mt-1 flex flex-wrap gap-1">
          {[0.25, 0.5, 1].map((k) => (
            <Button key={k} size="sm" onClick={() => cmd({ type: 'issueBond', amount: k }, t('finance.bondIssued'))}>
              {t('finance.issueBond')} {formatMoney(yearly * k, lang)}
            </Button>
          ))}
        </div>
        {loans.map((l) => (
          <div key={l.id} className="mt-1 flex items-center justify-between gap-2 rounded bg-panel-2 px-2 py-1 text-xs">
            <span className="min-w-0 truncate">
              {l.to === me ? (l.from === MARKET ? t('finance.bond') : `${t('finance.owedTo')} ${name(l.from)}`) : `${t('finance.lentTo')} ${name(l.to)}`} · {formatMoney(l.amount, lang)} · {formatPercent(l.rate, lang, 1)} · {formatDate(l.due, lang)}
            </span>
            {l.to === me ? (
              <Button size="sm" disabled={c.treasury < l.amount} onClick={() => cmd({ type: 'repayLoan', id: l.id }, t('finance.repaid'))}>
                {t('finance.repay')}
              </Button>
            ) : (
              <Button size="sm" variant="danger" onClick={() => cmd({ type: 'callLoan', id: l.id }, t('diplo.done'))} title={t('finance.callHint')}>
                {t('finance.call')}
              </Button>
            )}
          </div>
        ))}
        <p className="mt-1 text-[11px] text-muted">{t('finance.lendHint')}</p>

        <div className="mt-2 border-t border-line pt-2">
          <Stat label={t('finance.stocks')} value={formatMoney(c.stocks ?? 0, lang)} hint={t('finance.stocksHint')} />
          <div className="mt-1 flex flex-wrap gap-1">
            {[0.1, 0.25, 0.5].map((k) => (
              <Button key={k} size="sm" disabled={c.treasury < yearly * k} onClick={() => cmd({ type: 'invest', amount: k }, t('finance.invested'))}>
                {t('finance.invest')} {formatMoney(yearly * k, lang)}
              </Button>
            ))}
            <Button size="sm" disabled={!c.stocks} onClick={() => cmd({ type: 'divest' }, t('finance.divested'))}>
              {t('finance.divest')}
            </Button>
          </div>
        </div>

        <div className="mt-2 border-t border-line pt-2">
          <Stat label={t('finance.inflation')} value={formatPercent(c.inflation ?? 0, lang, 1)} tone={(c.inflation ?? 0) > 0.1 ? 'bad' : undefined} hint={t('finance.printHint')} />
          <div className="mt-1 flex flex-wrap gap-1">
            {[0.1, 0.25, 0.5].map((k) => (
              <Button key={k} size="sm" variant="danger" onClick={() => cmd({ type: 'printMoney', amount: k }, t('finance.printed'))}>
                {t('finance.print')} {formatMoney(yearly * k, lang)}
              </Button>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* ------------------------------------------------------------ Dünya pazarı */}
      <Collapsible title={t('state.market')}>
        {prices ? (
          MARKET_GOODS.map((g) => (
            <div key={g} className="mb-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted">{t(`market.${g}`)}</span>
                <span className={`tabular ${prices[g] > 1.25 ? 'text-danger' : prices[g] < 0.85 ? 'text-good' : 'text-ink-2'}`}>×{prices[g].toFixed(2)}</span>
              </div>
              <Bar value={prices[g]} max={3} color={prices[g] > 1.25 ? 'bg-danger' : 'bg-gold'} />
            </div>
          ))
        ) : (
          <p className="text-xs text-muted">{t('market.wait')}</p>
        )}
        <Stat label={t('market.oilBalance')} value={`${formatMoney(c.oilNet ?? 0, lang)}${t('common.perMonth')}`} tone={(c.oilNet ?? 0) >= 0 ? 'good' : 'bad'} />
        {OIL_SHARE[me] ? (
          <>
            <p className="mb-1 text-[11px] text-muted">{t('market.oilHint', { share: OIL_SHARE[me] })}</p>
            <div className="flex gap-1">
              {(['cut', 'normal', 'boost'] as const).map((p) => (
                <Button key={p} size="sm" variant={(c.oilPolicy ?? 'normal') === p ? 'primary' : 'secondary'} onClick={() => cmd({ type: 'oilPolicy', policy: p })}>
                  {t(`market.oil.${p}`)}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted">{t('market.noOilHint')}</p>
        )}
      </Collapsible>

      {/* ------------------------------------------------------------ Mega projeler */}
      <Collapsible title={t('state.projects')}>
        {Object.values(MEGA_PROJECTS).map((p) => {
          const st = c.projects?.[p.id];
          const done = st && st.end <= state.day;
          return (
            <div key={p.id} className={`mb-1.5 rounded border px-2 py-1.5 text-xs ${done ? 'border-good/50 bg-good/10' : 'border-line bg-panel-2'}`}>
              <div className="flex justify-between gap-2">
                <span className="text-ink">{loc(p.name, lang)}</span>
                <span className="text-muted">{done ? '✓' : t('project.years', { n: p.years })}</span>
              </div>
              <div className="text-good">▲ {modsText(p.mods, t)}</div>
              {st && !done && <Bar value={state.day - st.start} max={st.end - st.start} className="mt-1" />}
              {!st && (
                <Button size="sm" className="mt-1" disabled={!!activeProject || c.treasury < projectCost(ctx, me, p.id)} onClick={() => cmd({ type: 'startProject', id: p.id }, t('project.started'))}>
                  {t('project.start')} ({formatMoney(projectCost(ctx, me, p.id), lang)})
                </Button>
              )}
            </div>
          );
        })}
      </Collapsible>

      {/* ------------------------------------------------------------ İdeoloji */}
      <Collapsible title={t('state.ideology')} right={<span className="text-xs text-gold-soft">{ideo ? loc(ideo.name, lang) : '—'}</span>}>
        <p className="mb-1 text-[11px] text-muted">{t('ideology.hint')}</p>
        {IDEOLOGIES.map((i) => (
          <div key={i.id} className={`mb-1 flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${c.ideology === i.id ? 'border-gold bg-gold/10' : 'border-line bg-panel-2'}`}>
            <div className="min-w-0">
              <div className="text-ink">{loc(i.name, lang)}</div>
              <div className="text-[11px] leading-snug text-muted">{modsText(i.mods, t)}</div>
            </div>
            {c.ideology !== i.id && (
              <Button size="sm" onClick={() => cmd({ type: 'setIdeology', id: i.id }, t('ideology.changed'))}>
                {t('common.apply')}
              </Button>
            )}
          </div>
        ))}
      </Collapsible>

      {/* ------------------------------------------------------------ Büyük güçler */}
      <Collapsible title={t('state.powers')} right={powers.includes(me) ? <span className="text-xs text-gold">★</span> : undefined}>
        <p className="mb-1 text-[11px] text-muted">{t('powers.hint')}</p>
        {powers.map((tag, i) => (
          <button type="button" key={tag} onClick={() => ui.openRight({ kind: 'country', tag })} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5">
            <span className="w-4 tabular text-muted">{i + 1}</span>
            <Flag code={state.countries[tag]?.flag ?? 'x-unknown'} className="h-3" />
            <span className={tag === me ? 'text-gold' : 'text-ink-2'}>{name(tag)}</span>
            {i < 5 && <span className="ml-auto text-[10px] text-warn">{t('un.veto')}</span>}
          </button>
        ))}
      </Collapsible>

      {/* ------------------------------------------------------------ BM */}
      <Collapsible title={t('state.un')} right={pendingVote ? <span className="rounded bg-danger px-1 text-[10px] text-white">!</span> : undefined}>
        {pendingVote && (
          <div className="mb-2 rounded border border-gold-2 bg-gold/10 p-2 text-xs">
            <div className="text-ink">{t('un.pending', { kind: t(`un.kind.${pendingVote.kind}`), target: name(pendingVote.target), proposer: name(pendingVote.proposer) })}</div>
            <div className="mt-1 flex gap-1">
              <Button size="sm" onClick={() => cmd({ type: 'unVote', vote: 'yes' })}>{t('un.yes')}</Button>
              <Button size="sm" onClick={() => cmd({ type: 'unVote', vote: 'no' })}>{t('un.no')}</Button>
              {vetoPowers(ctx).includes(me) && (
                <Button size="sm" variant="danger" onClick={() => cmd({ type: 'unVote', vote: 'veto' })}>
                  {t('un.veto')}
                </Button>
              )}
            </div>
          </div>
        )}
        <p className="mb-1 text-[11px] text-muted">{t('un.hint')}</p>
        <div className="flex flex-col gap-1">
          <select value={unKind} onChange={(e) => setUnKind(e.target.value as UNResolution['kind'])} className="rounded border border-line-2 bg-bg-2 px-2 py-1 text-xs" aria-label={t('state.un')}>
            {(['condemn', 'sanction', 'peacekeeping'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`un.kind.${k}`)}
              </option>
            ))}
          </select>
          {unKind === 'peacekeeping' ? (
            <select value={unWar} onChange={(e) => setUnWar(e.target.value)} className="rounded border border-line-2 bg-bg-2 px-2 py-1 text-xs" aria-label={t('un.war')}>
              <option value="">{t('un.war')}</option>
              {Object.values(state.wars)
                .filter((w) => w.goal.type !== 'rebellion')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          ) : (
            <select value={unTarget} onChange={(e) => setUnTarget(e.target.value)} className="rounded border border-line-2 bg-bg-2 px-2 py-1 text-xs" aria-label={t('un.target')}>
              <option value="">{t('un.target')}</option>
              {countries.map((x) => (
                <option key={x.tag} value={x.tag}>
                  {lang === 'tr' ? x.name : x.nameEn}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center justify-between gap-2 text-xs text-muted">
            {t('un.buyVotes', { cost: formatMoney(buyVoteCost(ctx, me), lang) })}
            <input type="number" min={0} max={20} value={unBuy} onChange={(e) => setUnBuy(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className="w-16 rounded border border-line-2 bg-bg-2 px-1 py-0.5 text-right" />
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={unKind === 'peacekeeping' ? !unWar : !unTarget}
            onClick={async () => {
              const r = await cmd({ type: 'unPropose', kind: unKind, target: unTarget || me, war: unWar || undefined, buy: unBuy });
              if (!r.ok) return;
              const d = r.data as { passed?: boolean; pending?: boolean; yes?: number; no?: number; vetoBy?: string | null };
              push(d.pending ? t('un.waiting') : d.vetoBy ? `${t('un.veto')}: ${name(d.vetoBy)}` : `${d.passed ? t('un.passed') : t('un.failed')} (${d.yes}–${d.no})`, d.passed ? 'good' : 'info');
            }}
          >
            {t('un.propose')}
          </Button>
        </div>
        {un?.log.length ? (
          <div className="mt-2 border-t border-line pt-1">
            {[...un.log]
              .reverse()
              .slice(0, 8)
              .map((l, i) => (
                <div key={i} className="flex justify-between gap-2 py-0.5 text-[11px]">
                  <span className="min-w-0 truncate text-ink-2">
                    {formatDate(l.day, lang)} · {t(`un.kind.${l.kind}`)} → {name(l.target)}
                  </span>
                  <span className={l.passed ? 'text-good' : 'text-danger'}>{l.vetoBy ? `${t('un.veto')}: ${name(l.vetoBy)}` : `${l.yes}–${l.no}`}</span>
                </div>
              ))}
          </div>
        ) : null}
      </Collapsible>

      {/* ------------------------------------------------------------ Birlikler */}
      <Collapsible title={t('state.unions')}>
        <p className="mb-1 text-[11px] text-muted">{t('union.hint', { pct: Math.round(UNION_SHARE * 100) })}</p>
        {UNIONS.map((u) => {
          const pr = unionProgress(ctx, me, u);
          const formed = state.formed?.includes(u.id);
          const ratio = pr.total ? pr.owned / pr.total : 0;
          return (
            <div key={u.id} className="mb-1.5 rounded border border-line bg-panel-2 px-2 py-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-ink">{loc(u.name, lang)}</span>
                <span className="tabular text-muted">
                  {pr.owned}/{pr.total}
                </span>
              </div>
              <div className="truncate text-[11px] text-muted">{u.members.filter((m) => state.countries[m]).map(name).join(', ')}</div>
              <Bar value={ratio} max={1} className="mt-1" color={ratio >= UNION_SHARE ? 'bg-good' : 'bg-gold'} />
              {formed ? (
                <div className="mt-1 text-good">✓ {t('union.formed')}</div>
              ) : (
                ratio >= UNION_SHARE && (
                  <Button size="sm" variant="primary" className="mt-1" onClick={() => cmd({ type: 'formUnion', id: u.id }, t('union.done'))}>
                    {t('union.form')}
                  </Button>
                )
              )}
            </div>
          );
        })}
      </Collapsible>

      {/* ------------------------------------------------------------ Kimlik ve otomasyon */}
      <Collapsible title={t('state.identity')}>
        <div className="flex gap-1">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={c.name} maxLength={40} className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-2 py-1 text-xs" aria-label={t('identity.name')} />
          <Button
            size="sm"
            disabled={newName.trim().length < 2}
            onClick={async () => {
              const r = await cmd({ type: 'customizeCountry', name: newName }, t('diplo.done'));
              if (r.ok) setNewName('');
            }}
          >
            {t('identity.rename')}
          </Button>
        </div>
        <label className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
          {t('identity.flag')}
          <span className="flex items-center gap-1.5">
            <Flag code={c.flag} className="h-4" />
            <select value={c.flag} onChange={(e) => cmd({ type: 'customizeCountry', flag: e.target.value })} className="w-24 rounded border border-line-2 bg-bg-2 px-1 py-0.5">
              {flags.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
          {t('identity.color')}
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const v = e.target.value;
              cmd({ type: 'customizeCountry', color: [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)] });
            }}
            className="h-7 w-12 rounded border border-line-2 bg-bg-2"
          />
        </label>
        <p className="mt-1 text-[11px] text-muted">{t('identity.hint')}</p>
      </Collapsible>

      <Collapsible title={t('state.auto')}>
        <p className="mb-1.5 text-[11px] text-muted">{t('auto.hint')}</p>
        <label className="flex items-center justify-between gap-2 py-1 text-[13px]">
          {t('auto.build')}
          <Toggle checked={!!c.auto?.build} onChange={(v) => cmd({ type: 'setAuto', build: v })} label={t('auto.build')} />
        </label>
        <label className="flex items-center justify-between gap-2 py-1 text-[13px]">
          {t('auto.recruit')}
          <Toggle checked={!!c.auto?.recruit} onChange={(v) => cmd({ type: 'setAuto', recruit: v })} label={t('auto.recruit')} />
        </label>
      </Collapsible>
    </div>
  );
}
