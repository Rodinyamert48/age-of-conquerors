'use client';
import { useState } from 'react';
import { Pause, Play, StepForward, ChevronsRight, ChevronsLeft, Menu, Swords, Coins, Users, Scale, Bell, CalendarClock, Flame } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Flag } from '@/components/ui';
import { formatCompact, formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { useReadCtx, techName } from './hooks';
import { stabilityTarget } from '@/game/stability';
import { warsOf } from '@/game/ctx';
import { maxManpower } from '@/game/population';

export default function TopBar() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const playing = useGame((s) => s.playing);
  const speed = useGame((s) => s.speed);
  const upcoming = useGame((s) => s.upcoming);
  const turnMs = useGame((s) => s.turnMs);
  const ctx = useReadCtx();
  const ui = useUI();
  const [tip, setTip] = useState<'budget' | 'stability' | 'upcoming' | null>(null);
  if (!state || !ctx) return null;
  const c = state.countries[state.player];
  const b = c.budget;
  const wars = warsOf(ctx, state.player);
  const inbox = state.pendingEvents.length + state.proposals.length + state.peaceOffers.length;
  const stab = stabilityTarget(ctx, c);
  const mpMax = maxManpower(ctx, state.player);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 text-sm shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
      <button type="button" onClick={() => ui.setLeftTab('country')} className="flex min-w-0 items-center gap-2 rounded px-1.5 py-1 hover:bg-white/5" title={c.name}>
        <Flag code={c.flag} className="h-6" />
        <span className="hidden max-w-[160px] truncate font-display text-base text-ink lg:inline">{lang === 'en' ? c.nameEn : c.name}</span>
      </button>
      <div className="mx-1 h-7 w-px bg-line" />
      {/* Kaynaklar */}
      <div className="relative" onMouseEnter={() => setTip('budget')} onMouseLeave={() => setTip(null)}>
        <button type="button" onClick={() => ui.setLeftTab('economy')} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5">
          <Coins size={15} className="text-gold" />
          <span className={`tabular ${c.treasury < 0 ? 'text-danger' : 'text-ink'}`}>{formatMoney(c.treasury, lang)}</span>
          <span className={`tabular text-xs ${b.balance >= 0 ? 'text-good' : 'text-danger'}`}>{formatSignedMoney(b.balance, lang)}</span>
        </button>
        {tip === 'budget' && (
          <Tip>
            <div className="mb-1 font-display text-gold-soft">{t('budget.title')}</div>
            <Row k={t('top.income')} v={formatMoney(b.income, lang)} tone="good" />
            <Row k={t('budget.tax')} v={formatMoney(b.tax, lang)} />
            <Row k={t('budget.trade')} v={formatMoney(b.trade, lang)} />
            <Row k={t('budget.production')} v={formatMoney(b.production, lang)} />
            <Row k={t('top.expenses')} v={formatMoney(b.expenses, lang)} tone="bad" />
            <Row k={t('budget.armyUpkeep')} v={formatMoney(b.armyUpkeep + b.navyUpkeep, lang)} />
            <Row k={t('budget.policies')} v={formatMoney(b.policies, lang)} />
            {c.treasury < 0 && <Row k={t('budget.debt')} v={formatMoney(-c.treasury, lang)} tone="bad" />}
            {c.bankruptUntil > state.day && <div className="mt-1 text-danger">{t('budget.bankrupt')}</div>}
          </Tip>
        )}
      </div>
      <div className="flex items-center gap-1.5 rounded px-1.5 py-1" title={`${t('top.manpower')}: ${formatCompact(c.manpower, lang)} / ${formatCompact(mpMax, lang)}`}>
        <Users size={15} className="text-info" />
        <span className="tabular">{formatCompact(c.manpower, lang)}</span>
      </div>
      <div className="relative" onMouseEnter={() => setTip('stability')} onMouseLeave={() => setTip(null)}>
        <button type="button" onClick={() => ui.setLeftTab('country')} className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5">
          <Scale size={15} className={c.stability >= 50 ? 'text-good' : c.stability >= 30 ? 'text-warn' : 'text-danger'} />
          <span className="tabular">{Math.round(c.stability)}</span>
        </button>
        {tip === 'stability' && (
          <Tip>
            <div className="mb-1 font-display text-gold-soft">
              {t('country.stabilityBreakdown')}: {Math.round(stab.target)}
            </div>
            {stab.parts.map((p) => (
              <Row key={p.key} k={t(p.key)} v={`${p.value > 0 ? '+' : ''}${p.value}`} tone={p.value >= 0 ? 'good' : 'bad'} />
            ))}
          </Tip>
        )}
      </div>
      {c.warExhaustion > 1 && (
        <div className="hidden items-center gap-1 px-1.5 text-xs text-warn sm:flex" title={t('top.warExhaustion')}>
          <Flame size={14} /> <span className="tabular">{Math.round(c.warExhaustion)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => ui.setLeftTab('wars')}
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5 ${wars.length ? 'text-danger' : 'text-muted'}`}
        title={t('top.wars')}
      >
        <Swords size={15} />
        <span className="tabular">{wars.length}</span>
      </button>
      <button
        type="button"
        onClick={() => ui.openRight({ kind: 'inbox' })}
        className={`relative flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5 ${inbox ? 'text-gold' : 'text-muted'}`}
        title={t('event.inbox')}
      >
        <Bell size={15} />
        {inbox > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-danger px-1 text-[10px] leading-4 text-white">{inbox}</span>}
      </button>

      <div className="ml-auto flex items-center gap-1">
        {/* Yaklaşan olaylar */}
        <div className="relative hidden md:block" onMouseEnter={() => setTip('upcoming')} onMouseLeave={() => setTip(null)}>
          <span className="flex items-center gap-1 px-1.5 py-1 text-muted">
            <CalendarClock size={15} />
          </span>
          {tip === 'upcoming' && (
            <Tip right>
              <div className="mb-1 font-display text-gold-soft">{t('top.upcoming')}</div>
              {upcoming.length === 0 && <div className="text-muted">{t('top.noUpcoming')}</div>}
              {upcoming.map((u, i) => (
                <div key={i} className="flex justify-between gap-3 py-0.5">
                  <span className="text-ink-2">{t(u.key, localizeParams(u.params, t, lang))}</span>
                  {u.days > 0 && <span className="shrink-0 text-muted">{t('upcoming.inDays', { n: u.days })}</span>}
                </div>
              ))}
              <div className="mt-1 text-[10px] text-faint">{t('top.turnTime', { ms: turnMs.toFixed(0) })}</div>
            </Tip>
          )}
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="font-display text-[15px] tabular text-ink">{formatDate(state.day, lang)}</span>
          {!playing && <span className="text-[9px] tracking-[0.25em] text-gold/80">{t('top.paused')}</span>}
        </div>
        <div className="ml-1 flex items-center overflow-hidden rounded border border-line-2">
          <IconBtn title={playing ? t('top.pause') : t('top.play')} onClick={() => useGame.getState().togglePlay()} active={playing}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </IconBtn>
          <IconBtn title={t('top.step')} onClick={() => useGame.getState().step()} disabled={playing}>
            <StepForward size={15} />
          </IconBtn>
          <IconBtn title={t('top.speedDown')} onClick={() => useGame.getState().setSpeed(speed - 1)}>
            <ChevronsLeft size={15} />
          </IconBtn>
          <div className="flex items-center gap-0.5 px-1.5" title={t('top.speed', { n: speed })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                aria-label={t('top.speed', { n })}
                onClick={() => useGame.getState().setSpeed(n)}
                className={`h-3 w-1.5 rounded-sm ${n <= speed ? 'bg-gold' : 'bg-line-2'}`}
              />
            ))}
          </div>
          <IconBtn title={t('top.speedUp')} onClick={() => useGame.getState().setSpeed(speed + 1)}>
            <ChevronsRight size={15} />
          </IconBtn>
        </div>
        <IconBtn title={t('top.menu')} onClick={() => ui.setPauseMenu(true)} bordered>
          <Menu size={16} />
        </IconBtn>
      </div>
    </header>
  );
}

function localizeParams(p: Record<string, string | number>, t: (k: string) => string, lang: 'tr' | 'en') {
  const out = { ...p };
  if (typeof out.unit === 'string') out.unit = t(`unit.${out.unit}`);
  if (typeof out.building === 'string') out.building = t(`building.${out.building}`);
  if (typeof out.tech === 'string') out.tech = techName(out.tech, lang);
  return out;
}

function IconBtn({ children, title, onClick, disabled, active, bordered }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean; bordered?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-30 ${active ? 'bg-gold/20 text-gold' : 'text-ink-2 hover:bg-white/5 hover:text-ink'} ${bordered ? 'ml-1 rounded border border-line-2' : ''}`}
    >
      {children}
    </button>
  );
}

function Tip({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <div className={`anim-in absolute top-full z-50 mt-1 w-72 rounded border border-line-2 bg-panel-2 p-2.5 text-xs shadow-xl ${right ? 'right-0' : 'left-0'}`}>{children}</div>;
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-muted">{k}</span>
      <span className={`tabular ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-danger' : 'text-ink'}`}>{v}</span>
    </div>
  );
}
