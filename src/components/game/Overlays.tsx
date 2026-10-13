'use client';
/**
 * Oyun ekranı katmanları: oyun menüsü, oyun sonu, bildirim günlüğü, harita katmanı çubuğu ve
 * fareyle üzerine gelme bilgi kutusu.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Download, FolderOpen, Home, Play, Save, Settings as SettingsIcon, Trophy, Skull } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { useT, useLang } from '@/i18n';
import { Button, Flag, Modal, Segmented, Toggle, useConfirm, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from './hooks';
import { notificationText } from './text';
import { exportSaveFile } from '@/lib/saves';
import { formatCompact, formatDate, formatMoney } from '@/lib/format';
import { MAP_MODES, ECON_RAMP, STAB_RAMP, SUPPLY_RAMP, REL_RAMP, DIPLO_COLORS, TERRAIN_COLORS, rgbStr, type RGB } from '@/components/map/modes';
import type { GameNotification, MapMode, TimeStep } from '@/game/types';
import { findPath } from '@/game/movement';
import { provinceOutput } from '@/game/economy';
import { REBEL_TAG } from '@/game/query';
import { TERRAIN_ORDER } from '@/game/defs/terrain';

// ---------------------------------------------------------------------------
export function PauseMenu() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const open = useUI((s) => s.pauseMenu);
  const setOpen = useUI((s) => s.setPauseMenu);
  const state = useGame((s) => s.state);
  const lastSaved = useGame((s) => s.lastSaved);
  const cmd = useCommand();
  const ask = useConfirm((s) => s.ask);
  const push = useToasts((s) => s.push);
  const [saveName, setSaveName] = useState('');
  if (!state) return null;
  const c = state.countries[state.player];
  const defaultName = `${c.name} — ${formatDate(state.day, lang)}`;
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('pause.title')}>
      <div className="flex flex-col gap-2 text-sm">
        <Button variant="primary" onClick={() => setOpen(false)}>
          <Play size={14} /> {t('menu.resumeGame')}
        </Button>
        <div className="rounded border border-line bg-panel-2 p-2.5">
          <div className="mb-1 text-xs text-muted">{t('pause.saveName')}</div>
          <div className="flex gap-1.5">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={defaultName} className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-2 py-1" />
            <Button
              onClick={async () => {
                try {
                  await useGame.getState().save('manual', saveName.trim() || defaultName);
                  push(t('pause.saved'), 'good');
                  setSaveName('');
                } catch (e) {
                  push(e instanceof Error ? e.message : String(e), 'bad');
                }
              }}
            >
              <Save size={14} /> {t('common.save')}
            </Button>
          </div>
          {lastSaved && <div className="mt-1 text-[11px] text-faint">{t('pause.autosaved', { time: new Date(lastSaved).toLocaleTimeString(lang) })}</div>}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            onClick={async () => {
              await useGame.getState().save('quick', 'Hızlı kayıt');
              push(t('pause.quickSaved'), 'good');
            }}
          >
            <Save size={14} /> {t('key.quickSave')}
          </Button>
          <Button onClick={() => exportSaveFile(state, `aoc-${state.player}-${state.day}.json`)}>
            <Download size={14} /> {t('pause.export')}
          </Button>
          <Button
            onClick={() => {
              useGame.getState().pause();
              setOpen(false);
              router.push('/saves');
            }}
          >
            <FolderOpen size={14} /> {t('pause.load')}
          </Button>
          <Button
            onClick={() => {
              useGame.getState().pause();
              setOpen(false);
              router.push('/settings');
            }}
          >
            <SettingsIcon size={14} /> {t('pause.settings')}
          </Button>
        </div>
        <div className="flex items-center justify-between rounded border border-line bg-panel-2 px-2.5 py-2">
          <span className="text-xs text-muted">{t('pause.timeStep')}</span>
          <Segmented value={state.rules.timeStep} onChange={(v: TimeStep) => cmd({ type: 'setTimeStep', step: v })} options={(['day', 'week', 'month'] as TimeStep[]).map((x) => ({ value: x, label: t(`timeStep.${x}`) }))} />
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await ask({ title: t('pause.exit'), body: t('pause.exitConfirm'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel'), danger: true });
            if (!ok) return;
            useGame.getState().pause();
            setOpen(false);
            router.push('/');
          }}
        >
          <Home size={14} /> {t('pause.exit')}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function GameOverDialog() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const cmd = useCommand();
  const name = useCountryName();
  const [choose, setChoose] = useState(false);
  const alive = useMemo(
    () => (state ? Object.values(state.countries).filter((c) => c.alive && c.tag !== REBEL_TAG && !c.rebelMovement).sort((a, b) => name(a.tag).localeCompare(name(b.tag), lang)) : []),
    [state, name, lang],
  );
  if (!state?.gameOver || state.gameOver.acknowledged) return null;
  const go = state.gameOver;
  const victory = go.result === 'victory';
  return (
    <Modal open onClose={() => {}} title={victory ? t('gameover.victory') : t('gameover.defeat')}>
      <div className="flex flex-col items-center gap-3 py-2 text-center text-sm">
        {victory ? <Trophy size={44} className="text-gold" /> : <Skull size={44} className="text-danger" />}
        <p className="text-ink-2">{victory ? t('gameover.victoryBody', { country: name(state.player) }) : t('gameover.defeatBody')}</p>
        <p className="text-xs text-muted">{t(go.reason)}</p>
        <p className="text-xs text-muted">{formatDate(go.day, lang)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {victory && (
            <Button variant="primary" onClick={() => cmd({ type: 'acknowledgeGameOver' })}>
              {t('gameover.continue')}
            </Button>
          )}
          {!victory && state.rules.continueAfterDefeat && (
            <Button variant="primary" onClick={() => setChoose(true)}>
              {t('gameover.chooseCountry')}
            </Button>
          )}
          <Button onClick={() => router.push('/')}>{t('gameover.toMenu')}</Button>
        </div>
        {choose && (
          <div className="max-h-64 w-full overflow-y-auto rounded border border-line bg-panel-2 p-1 text-left">
            {alive.map((c) => (
              <button
                type="button"
                key={c.tag}
                onClick={() => cmd({ type: 'switchCountry', tag: c.tag })}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/5"
              >
                <Flag code={c.flag} className="h-3.5" />
                {name(c.tag)}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function NotificationLog() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const prefs = useSettings((s) => s.notifications);
  const open = useUI((s) => s.logOpen);
  const setOpen = useUI((s) => s.setLogOpen);
  const ui = useUI();
  const ctx = useReadCtx();
  const [mineOnly, setMineOnly] = useState(false);
  const items = useMemo(() => {
    if (!state) return [] as GameNotification[];
    return state.notifications.filter((n) => prefs[n.kind] !== false && (!mineOnly || n.player)).slice().reverse();
  }, [state, prefs, mineOnly]);
  if (!state || !ctx) return null;
  const latest = items[0];
  const focus = (n: GameNotification) => {
    const f = n.focus;
    if (!f) return;
    if (f.battle && (state.battles[f.battle] || state.battleReports.some((r) => r.id === f.battle))) ui.openRight({ kind: state.battles[f.battle] ? 'battle' : 'report', id: f.battle });
    else if (f.war && state.wars[f.war]) ui.openRight({ kind: 'war', id: f.war });
    else if (f.province !== undefined) ui.openRight({ kind: 'province', id: f.province });
    else if (f.army && state.armies[f.army]) ui.selectArmies([f.army]);
    else if (f.country) ui.openRight({ kind: 'country', tag: f.country });
    const node = f.province ?? (f.army && state.armies[f.army] ? state.armies[f.army].location : undefined) ?? (f.battle && state.battles[f.battle] ? state.battles[f.battle].location : undefined);
    if (node !== undefined) ui.focusOn(ctx.w.x[node], ctx.w.y[node]);
  };
  const tone = (n: GameNotification) => (n.severity === 'critical' ? 'text-danger' : n.severity === 'bad' ? 'text-[#e89a90]' : n.severity === 'good' ? 'text-good' : 'text-ink-2');
  return (
    <div className="relative z-20 shrink-0 border-t border-line bg-panel">
      {open && (
        <div className="anim-in max-h-56 overflow-y-auto border-b border-line px-3 py-1.5">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>{t('notif.title')}</span>
            <label className="flex items-center gap-1.5">
              {t('notif.filter')} <Toggle checked={mineOnly} onChange={setMineOnly} label={t('notif.filter')} />
            </label>
          </div>
          {items.length === 0 && <p className="text-xs text-muted">{t('notif.empty')}</p>}
          {items.slice(0, 120).map((n) => (
            <button type="button" key={n.id} onClick={() => focus(n)} className="flex w-full gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5">
              <span className="shrink-0 tabular text-faint">{formatDate(n.day, lang)}</span>
              <span className={tone(n)}>{notificationText(n, t, lang)}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen(!open)} className="flex h-7 w-full items-center gap-2 px-3 text-left text-xs hover:bg-white/5">
        {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronUp size={14} className="text-muted" />}
        {latest ? (
          <>
            <span className="tabular text-faint">{formatDate(latest.day, lang)}</span>
            <span className={`truncate ${tone(latest)}`}>{notificationText(latest, t, lang)}</span>
          </>
        ) : (
          <span className="text-muted">{t('notif.empty')}</span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Swatch({ c, label }: { c: RGB; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: rgbStr(c) }} />
      {label}
    </span>
  );
}

function Gradient({ stops, low, high }: { stops: RGB[]; low: string; high: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {low}
      <span className="inline-block h-2 w-24 rounded-sm" style={{ background: `linear-gradient(90deg, ${stops.map((s) => rgbStr(s)).join(',')})` }} />
      {high}
    </span>
  );
}

export function MapModeBar() {
  const t = useT();
  const mode = useUI((s) => s.mapMode);
  const setMode = useUI((s) => s.setMapMode);
  const legend: Record<MapMode, React.ReactNode> = {
    political: null,
    economic: <Gradient stops={ECON_RAMP} low={t('legend.low')} high={t('legend.high')} />,
    stability: <Gradient stops={STAB_RAMP} low={t('legend.low')} high={t('legend.high')} />,
    supply: (
      <>
        <Gradient stops={SUPPLY_RAMP} low={t('legend.low')} high={t('legend.high')} /> <Swatch c={[58, 60, 66]} label={t('legend.noAccess')} />
      </>
    ),
    diplomatic: (
      <>
        <Swatch c={DIPLO_COLORS.self} label={t('legend.self')} />
        <Swatch c={DIPLO_COLORS.alliance} label={t('legend.alliance')} />
        <Swatch c={DIPLO_COLORS.defensive} label={t('legend.defensive')} />
        <Swatch c={DIPLO_COLORS.vassal} label={t('legend.vassal')} />
        <Swatch c={DIPLO_COLORS.nap} label={t('legend.nap')} />
        <Swatch c={DIPLO_COLORS.war} label={t('legend.war')} />
        <Gradient stops={REL_RAMP} low="−" high="+" />
      </>
    ),
    military: (
      <>
        <Swatch c={[70, 120, 200]} label={t('legend.friendly')} />
        <Swatch c={[200, 70, 64]} label={t('legend.enemy')} />
        <Swatch c={[92, 96, 104]} label={t('legend.neutral')} />
        <Swatch c={[230, 160, 60]} label={t('legend.siege')} />
      </>
    ),
    terrain: (
      <>
        {TERRAIN_ORDER.map((tr) => (
          <Swatch key={tr} c={TERRAIN_COLORS[tr]} label={t(`terrain.${tr}`)} />
        ))}
      </>
    ),
  };
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-70px)] flex-col items-start gap-1">
      {legend[mode] && <div className="pointer-events-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded border border-line bg-panel/90 px-2 py-1 text-[11px] text-ink-2">{legend[mode]}</div>}
      <div className="pointer-events-auto flex flex-wrap overflow-hidden rounded border border-line-2 bg-panel/90">
        {MAP_MODES.map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={`border-l border-line px-2.5 py-1.5 text-xs first:border-l-0 ${mode === m ? 'bg-gold/85 text-[#1a1408]' : 'text-ink-2 hover:bg-white/5'}`}
          >
            {t(`mapMode.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function HoverTooltip() {
  const t = useT();
  const lang = useLang();
  const hover = useUI((s) => s.hover);
  const selected = useUI((s) => s.selectedArmies);
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const node = hover ? (hover.province >= 0 ? hover.province : hover.seaNode) : -1;
  const eta = useMemo(() => {
    if (!ctx || node < 0 || !selected.length) return null;
    const a = ctx.s.armies[selected[0]];
    if (!a || a.owner !== ctx.s.player) return null;
    if (!a.isNavy && node >= ctx.w.P) return null;
    const r = findPath(ctx, a, node);
    return r ? Math.ceil(r.days) : -1;
  }, [ctx, node, selected]);
  if (!hover || !state || !ctx || hover.army) return null;
  if (hover.province < 0) return null;
  const p = hover.province;
  const wp = ctx.w.data.provinces[p];
  const ps = state.provinces[p];
  const owner = state.countries[ps.owner];
  return (
    <div className="pointer-events-none absolute z-30 w-56 rounded border border-line-2 bg-panel-2/95 px-2.5 py-1.5 text-xs shadow-xl" style={{ left: Math.min(hover.x + 16, window.innerWidth - 250), top: hover.y + 14 }}>
      <div className="font-display text-sm text-ink">{lang === 'en' ? wp.nameEn : wp.name}</div>
      {owner && (
        <div className="mt-0.5 flex items-center gap-1.5 text-ink-2">
          <Flag code={owner.flag} className="h-3" />
          {lang === 'en' ? owner.nameEn : owner.name}
        </div>
      )}
      {ps.controller !== ps.owner && (
        <div className="text-[#e89a90]">
          {t('tip.controller')}: {ps.controller === REBEL_TAG ? t('war.rebellion') : lang === 'en' ? state.countries[ps.controller]?.nameEn : state.countries[ps.controller]?.name}
        </div>
      )}
      <div className="mt-1 grid grid-cols-2 gap-x-2 text-[11px] text-muted">
        <span>{t('tip.pop')}</span>
        <span className="text-right text-ink-2">{formatCompact(ps.pop, lang)}</span>
        <span>{t('tip.output')}</span>
        <span className="text-right text-ink-2">{formatMoney(provinceOutput(ctx, p), lang)}</span>
        <span>{t('tip.terrain')}</span>
        <span className="text-right text-ink-2">{t(`terrain.${ctx.w.terrain[p]}`)}</span>
        <span>{t('tip.unrest')}</span>
        <span className="text-right text-ink-2">{Math.round(ps.unrest)}</span>
      </div>
      {eta !== null && <div className={`mt-1 ${eta >= 0 ? 'text-gold-soft' : 'text-danger'}`}>{eta >= 0 ? t('tip.eta', { days: eta }) : t('tip.noPath')}</div>}
    </div>
  );
}
