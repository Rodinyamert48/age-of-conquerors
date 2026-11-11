'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Lock, Search } from 'lucide-react';
import { SCENARIOS, getScenario } from '@/game/scenarios';
import type { Ctx } from '@/game/ctx';
import { createGame } from '@/game/engine';
import type { Difficulty, Tag, TimeStep, VictoryRules } from '@/game/types';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';
import { useT, useLang, loc } from '@/i18n';
import MapCanvas, { type MapClick } from '@/components/map/MapCanvas';
import { Button, Flag, Segmented, Stat, Toggle, useToasts } from '@/components/ui';
import { countrySummary } from '@/game/selectors';
import { formatCompact, formatDate, formatInt, formatMoney } from '@/lib/format';
import { parseDate } from '@/game/calendar';
import { REBEL_TAG } from '@/game/query';
import type { Selection } from '@/components/map/renderer';

const VICTORY_DEFAULTS: Record<VictoryRules['mode'], number> = {
  sandbox: 0,
  domination: 60,
  provinces: 300,
  economic: 30,
  alliance: 50,
  scenario: 0,
};

function NewGameInner() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const settings = useSettings();
  const pushToast = useToasts((s) => s.push);
  const world = useGame((s) => s.world);
  const geo = useGame((s) => s.geo);
  const status = useGame((s) => s.status);
  const loadingText = useGame((s) => s.loadingText);
  const [step, setStep] = useState(0);
  const [scenarioId, setScenarioId] = useState<string>(params.get('scenario') ?? 'modern');
  const [preview, setPreview] = useState<Ctx | null>(null);
  const [selected, setSelected] = useState<Tag | null>(null);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.defaultDifficulty);
  const [timeStep, setTimeStep] = useState<TimeStep>(settings.defaultTimeStep);
  const [victoryMode, setVictoryMode] = useState<VictoryRules['mode']>('sandbox');
  const [victoryTarget, setVictoryTarget] = useState(0);
  const [rebellions, setRebellions] = useState(true);
  const [historical, setHistorical] = useState(true);
  const [capitalLoss, setCapitalLoss] = useState<'relocate' | 'capitulate'>('relocate');
  const [continueAfterDefeat, setContinueAfterDefeat] = useState(true);
  const [aggression, setAggression] = useState(1);
  const [fog, setFog] = useState(false);
  const [seed, setSeed] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    useGame
      .getState()
      .init()
      .catch(() => {});
  }, []);

  const scenario = getScenario(scenarioId);

  // Önizleme durumu (senaryonun gerçek başlangıç verisi)
  useEffect(() => {
    if (step < 1 || !world || !scenario?.available) return;
    if (preview && preview.s.meta.scenarioId === scenarioId) return;
    const id = setTimeout(() => {
      try {
        const ctx = createGame(world, {
          scenarioId,
          player: scenario.featured[0],
          difficulty: 'normal',
          timeStep: 'day',
          victory: { mode: 'sandbox', target: 0 },
          seed: 1,
        });
        setPreview(ctx);
      } catch (e) {
        pushToast(e instanceof Error ? e.message : String(e), 'bad');
      }
    }, 30);
    return () => clearTimeout(id);
  }, [step, world, scenarioId, scenario, preview, pushToast]);

  const countries = useMemo(() => {
    if (!preview) return [];
    return Object.values(preview.s.countries)
      .filter((c) => c.alive && c.tag !== REBEL_TAG)
      .sort((a, b) => (lang === 'en' ? a.nameEn : a.name).localeCompare(lang === 'en' ? b.nameEn : b.name, lang === 'tr' ? 'tr' : 'en'));
  }, [preview, lang]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US');
    if (!q) return countries;
    return countries.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(q) || c.nameEn.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q));
  }, [countries, query, lang]);

  const summary = useMemo(() => (preview && selected ? countrySummary(preview, selected) : null), [preview, selected]);
  const selection: Selection = useMemo(() => ({ province: null, country: selected, armies: [], battle: null }), [selected]);

  const onMapClick = (c: MapClick) => {
    if (!preview || c.province < 0) return;
    const owner = preview.s.provinces[c.province].owner;
    if (owner !== REBEL_TAG && preview.s.countries[owner]?.alive) setSelected(owner);
  };

  const start = async () => {
    if (!selected || !scenario) return;
    setStarting(true);
    try {
      const seedNum = seed.trim() ? Math.abs(parseInt(seed.trim(), 10) || hashSeed(seed.trim())) : undefined;
      await useGame.getState().newGame({
        scenarioId,
        player: selected,
        difficulty,
        timeStep,
        victory: { mode: victoryMode, target: victoryTarget },
        seed: seedNum,
        rules: { rebellions, historicalEvents: historical, capitalLoss, continueAfterDefeat, aiAggression: aggression, fogOfWar: fog },
      });
      router.push('/play');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad');
      setStarting(false);
    }
  };

  const steps = [t('newGame.step1'), t('newGame.step2'), t('newGame.step3')];

  return (
    <main className="flex h-full flex-col bg-bg">
      {/* Başlık ve adımlar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ChevronLeft size={16} /> {t('menu.backToMenu')}
        </Link>
        <h1 className="font-display text-xl tracking-wide text-ink">{t('newGame.title')}</h1>
        <ol className="ml-auto flex items-center gap-1 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <button
                type="button"
                disabled={i > step || (i === 2 && !selected)}
                onClick={() => setStep(i)}
                className={`rounded-full border px-2.5 py-0.5 ${i === step ? 'border-gold bg-gold/20 text-gold-soft' : i < step ? 'border-line-2 text-ink-2 hover:border-gold-2' : 'border-line text-faint'}`}
              >
                {i + 1}. {s}
              </button>
              {i < steps.length - 1 && <span className="text-faint">—</span>}
            </li>
          ))}
        </ol>
      </header>

      {status !== 'ready' && (
        <div className="flex flex-1 items-center justify-center text-muted">{status === 'error' ? t('common.error') : t(loadingText || 'common.loading')}</div>
      )}

      {status === 'ready' && step === 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <h2 className="mb-3 text-sm uppercase tracking-[0.2em] text-muted">{t('newGame.chooseScenario')}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SCENARIOS.map((sc) => (
              <button
                type="button"
                key={sc.id}
                disabled={!sc.available}
                onClick={() => setScenarioId(sc.id)}
                className={`relative rounded border p-4 text-left transition-colors ${
                  !sc.available ? 'cursor-not-allowed border-line bg-panel/40 opacity-60' : sc.id === scenarioId ? 'border-gold bg-gold/10' : 'border-line-2 bg-panel hover:border-gold-2'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-3xl text-gold-soft">{sc.year}</span>
                  {!sc.available && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Lock size={12} /> {t('newGame.unavailable')}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-display text-lg text-ink">{loc(sc.name, lang)}</div>
                <p className="mt-1 text-sm leading-snug text-ink-2">{loc(sc.description, lang)}</p>
                {!sc.available && sc.status && <p className="mt-2 text-xs leading-snug text-muted">{loc(sc.status, lang)}</p>}
                {sc.available && <p className="mt-2 text-xs text-muted">{t('newGame.startDate')}: {formatDate(parseDate(sc.startDate), lang)}</p>}
              </button>
            ))}
          </div>
          {scenario?.available && (
            <div className="mt-4 rounded border border-line bg-panel/60 p-3 text-xs leading-relaxed text-muted">
              <span className="text-ink-2">{t('newGame.sources')}:</span> {loc(scenario.sources, lang)}
              <br />
              <span className="text-ink-2">{t('newGame.scenarioGoal')}:</span> {loc(scenario.victory, lang)}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="lg" disabled={!scenario?.available} onClick={() => setStep(1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {status === 'ready' && step === 1 && world && geo && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-[300px] flex-1">
            {preview ? (
              <MapCanvas world={world} geo={geo} state={preview.s} ctx={preview} mode="political" viewer={selected ?? ''} selection={selection} onClick={onMapClick} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted">{t('loading.scenario')}</div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 rounded bg-panel/85 px-3 py-1.5 text-sm text-ink-2">{t('newGame.chooseCountry')}</div>
          </div>
          <aside className="flex w-full flex-col border-l border-line bg-panel md:w-[360px]">
            <div className="border-b border-line p-3">
              {summary && preview && selected ? (
                <CountryCard ctx={preview} tag={selected} />
              ) : (
                <div className="py-6 text-center text-sm text-muted">{t('newGame.noCountry')}</div>
              )}
              <Button variant="primary" className="mt-3 w-full" disabled={!selected} onClick={() => setStep(2)}>
                {t('common.next')}
              </Button>
            </div>
            <div className="p-3 pb-1">
              <div className="flex items-center gap-2 rounded border border-line-2 bg-bg-2 px-2">
                <Search size={14} className="text-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('newGame.searchCountry')} className="w-full bg-transparent py-1.5 text-sm outline-none" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {!query && scenario && preview && (
                <>
                  <div className="mb-1 mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">{t('newGame.featured')}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {scenario.featured
                      .filter((f) => preview.s.countries[f]?.alive)
                      .map((f) => (
                        <CountryButton key={f} ctx={preview} tag={f} active={selected === f} onClick={() => setSelected(f)} />
                      ))}
                  </div>
                  <div className="mb-1 mt-3 text-[11px] uppercase tracking-[0.18em] text-muted">{t('newGame.allCountries')}</div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                {filtered.map((c) => (
                  <CountryButton key={c.tag} ctx={preview!} tag={c.tag} active={selected === c.tag} onClick={() => setSelected(c.tag)} />
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {status === 'ready' && step === 2 && selected && preview && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 font-display text-lg text-gold-soft">{t('newGame.difficulty')}</h3>
                <Segmented
                  value={difficulty}
                  onChange={setDifficulty}
                  options={(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => ({ value: d, label: t(`difficulty.${d}`) }))}
                />
                <p className="mt-1.5 text-sm text-muted">{t(`difficulty.${difficulty}.desc`)}</p>
              </section>
              <section>
                <h3 className="mb-2 font-display text-lg text-gold-soft">{t('newGame.timeStep')}</h3>
                <Segmented value={timeStep} onChange={setTimeStep} options={(['day', 'week', 'month'] as TimeStep[]).map((d) => ({ value: d, label: t(`timeStep.${d}`) }))} />
                <p className="mt-1.5 text-sm text-muted">{t('timeStep.desc')}</p>
              </section>
              <section>
                <h3 className="mb-2 font-display text-lg text-gold-soft">{t('newGame.victory')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(['sandbox', 'domination', 'provinces', 'economic', 'alliance', 'scenario'] as VictoryRules['mode'][]).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => {
                        setVictoryMode(m);
                        setVictoryTarget(VICTORY_DEFAULTS[m]);
                      }}
                      className={`rounded border px-3 py-1.5 text-sm ${victoryMode === m ? 'border-gold bg-gold/15 text-gold-soft' : 'border-line-2 bg-panel-2 text-ink-2 hover:border-gold-2'}`}
                    >
                      {t(`victory.${m}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-sm text-muted">{victoryMode === 'scenario' && scenario ? loc(scenario.victory, lang) : t(`victory.${victoryMode}.desc`)}</p>
                {['domination', 'provinces', 'economic', 'alliance'].includes(victoryMode) && (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-muted">{t('newGame.victoryTarget')}</span>
                    <input
                      type="number"
                      min={1}
                      max={victoryMode === 'provinces' ? world?.P : 100}
                      value={victoryTarget}
                      onChange={(e) => setVictoryTarget(Math.max(1, Number(e.target.value) || 1))}
                      className="w-24 rounded border border-line-2 bg-bg-2 px-2 py-1"
                    />
                    <span className="text-muted">{victoryMode === 'provinces' ? '' : '%'}</span>
                  </label>
                )}
              </section>
              <section>
                <h3 className="mb-2 font-display text-lg text-gold-soft">{t('newGame.rules')}</h3>
                <div className="space-y-2.5 text-sm">
                  <RuleRow label={t('newGame.rebellions')}>
                    <Toggle checked={rebellions} onChange={setRebellions} label={t('newGame.rebellions')} />
                  </RuleRow>
                  <RuleRow label={t('newGame.historicalEvents')}>
                    <Toggle checked={historical} onChange={setHistorical} label={t('newGame.historicalEvents')} />
                  </RuleRow>
                  <RuleRow label={t('newGame.continueAfterDefeat')}>
                    <Toggle checked={continueAfterDefeat} onChange={setContinueAfterDefeat} label={t('newGame.continueAfterDefeat')} />
                  </RuleRow>
                  <RuleRow label={t('newGame.fogOfWar')}>
                    <Toggle checked={fog} onChange={setFog} label={t('newGame.fogOfWar')} />
                  </RuleRow>
                  <RuleRow label={t('newGame.capitalLoss')}>
                    <Segmented
                      value={capitalLoss}
                      onChange={setCapitalLoss}
                      options={[
                        { value: 'relocate', label: t('newGame.capitalRelocate') },
                        { value: 'capitulate', label: t('newGame.capitalCapitulate') },
                      ]}
                    />
                  </RuleRow>
                  <RuleRow label={`${t('newGame.aiAggression')}: ${Math.round(aggression * 100)}%`}>
                    <input type="range" min={0} max={2} step={0.1} value={aggression} onChange={(e) => setAggression(Number(e.target.value))} className="w-40" />
                  </RuleRow>
                  <RuleRow label={t('newGame.seed')}>
                    <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="—" className="w-40 rounded border border-line-2 bg-bg-2 px-2 py-1" />
                  </RuleRow>
                  <p className="text-xs text-muted">{t('newGame.seedHint')}</p>
                </div>
              </section>
            </div>
            <aside className="h-fit rounded border border-line bg-panel p-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted">{t('newGame.selected')}</div>
              <CountryCard ctx={preview} tag={selected} compact />
              <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
                {scenario && (
                  <>
                    {loc(scenario.name, lang)} · {formatDate(parseDate(scenario.startDate), lang)}
                  </>
                )}
              </div>
              <Button variant="primary" size="lg" className="mt-3 w-full" disabled={starting} onClick={start}>
                {starting ? t('loading.game') : t('newGame.startGame')}
              </Button>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  );
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function CountryButton({ ctx, tag, active, onClick }: { ctx: Ctx; tag: Tag; active: boolean; onClick: () => void }) {
  const lang = useLang();
  const c = ctx.s.countries[tag];
  if (!c) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-2 py-1 text-left text-sm ${active ? 'bg-gold/15 text-gold-soft' : 'text-ink-2 hover:bg-white/5'}`}
    >
      <Flag code={c.flag} className="h-3.5" />
      <span className="truncate">{lang === 'en' ? c.nameEn : c.name}</span>
    </button>
  );
}

function CountryCard({ ctx, tag, compact }: { ctx: Ctx; tag: Tag; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const c = ctx.s.countries[tag];
  const sum = useMemo(() => countrySummary(ctx, tag), [ctx, tag]);
  if (!c) return null;
  return (
    <div className="anim-in">
      <div className="flex items-center gap-3">
        <Flag code={c.flag} className="h-10" title={c.name} />
        <div className="min-w-0">
          <div className="truncate font-display text-xl text-ink">{lang === 'en' ? c.nameEn : c.name}</div>
          <div className="text-xs text-muted">{t(`gov.${c.government}`)}</div>
        </div>
      </div>
      <div className="mt-2">
        <Stat label={t('newGame.capital')} value={sum.capitalName} />
        <Stat label={t('newGame.population')} value={formatCompact(sum.pop, lang)} />
        <Stat label={t('newGame.economy')} value={formatMoney(sum.output, lang)} />
        <Stat label={t('newGame.income')} value={formatMoney(c.budget.income, lang)} />
        <Stat label={t('newGame.army')} value={`${formatInt(sum.soldiers, lang)} ${t('unit.soldiers')}`} />
        <Stat label={t('newGame.navy')} value={`${formatInt(sum.ships, lang)} ${t('unit.ships')}`} />
        <Stat label={t('newGame.provinces')} value={sum.provinces} />
        {sum.alliance && <Stat label={t('newGame.alliance')} value={sum.alliance} />}
      </div>
      {!compact && sum.neighbors.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted">{t('newGame.neighbors')}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {sum.neighbors.slice(0, 14).map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                <Flag code={ctx.s.countries[n]?.flag ?? 'x-unknown'} className="h-2.5" />
                {lang === 'en' ? ctx.s.countries[n]?.nameEn : ctx.s.countries[n]?.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewGamePage() {
  return (
    <Suspense fallback={null}>
      <NewGameInner />
    </Suspense>
  );
}
