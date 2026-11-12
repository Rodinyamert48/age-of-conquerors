'use client';
import { Landmark, Swords, Handshake, FlaskConical, X } from 'lucide-react';
import { useUI, type LeftTab } from '@/store/ui';
import { useT } from '@/i18n';
import { useGame } from '@/store/game';
import { Button, Collapsible } from '@/components/ui';
import { useLang } from '@/i18n';
import { useCommand, useReadCtx } from './hooks';
import { hasNuclearTech, nukeCost } from '@/game/nuclear';
import { canAfford } from '@/game/economy';
import { formatMoney } from '@/lib/format';
import CountryTab from './tabs/CountryTab';
import ArmiesTab from './tabs/ArmiesTab';
import DiplomacyTab from './tabs/DiplomacyTab';
import ResearchTab from './tabs/ResearchTab';
import WarsTab from './tabs/WarsTab';

/** Sade menü: dört sekme (AoH2 kadar basit; ayrıntılar sekmelerin içinde katlanır) */
const TABS: { id: LeftTab; icon: typeof Landmark; label: string }[] = [
  { id: 'country', icon: Landmark, label: 'tab.country' },
  { id: 'armies', icon: Swords, label: 'tab.military' },
  { id: 'diplomacy', icon: Handshake, label: 'tab.diplomacy' },
  { id: 'research', icon: FlaskConical, label: 'tab.research' },
];

export default function LeftPanel() {
  const t = useT();
  const tab = useUI((s) => s.leftTab);
  const toggle = useUI((s) => s.toggleLeftTab);
  const close = () => useUI.getState().setLeftTab(null);
  return (
    <>
      <nav className="z-20 flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-panel py-1.5" aria-label="Paneller">
        {TABS.map((tb) => (
          <button
            type="button"
            key={tb.id}
            title={t(tb.label)}
            aria-label={t(tb.label)}
            aria-pressed={tab === tb.id}
            onClick={() => toggle(tb.id)}
            className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${tab === tb.id ? 'bg-gold/20 text-gold' : 'text-muted hover:bg-white/5 hover:text-ink'}`}
          >
            <tb.icon size={18} />
          </button>
        ))}
      </nav>
      {tab && (
        <aside className="anim-in absolute bottom-0 left-11 top-0 z-20 flex w-[min(360px,calc(100vw-44px))] flex-col border-r border-line bg-panel/[0.97] shadow-2xl lg:relative lg:left-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="font-display text-base tracking-wide text-gold-soft">{t(TABS.find((x) => x.id === tab)?.label ?? `tab.${tab}`)}</h2>
            <button type="button" onClick={close} className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {tab === 'country' && <CountryTab />}
            {tab === 'armies' && <MilitaryTab />}
            {tab === 'diplomacy' && <DiplomacyTab />}
            {tab === 'research' && <ResearchTab />}
          </div>
        </aside>
      )}
    </>
  );
}

/** Ordu ve savaş: savaştayken savaşlar üstte açık, ordular altta */
function NuclearCard() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  if (!state || !ctx) return null;
  const c = state.countries[state.player];
  if (!hasNuclearTech(ctx, c.tag)) return null;
  const cost = nukeCost(ctx);
  return (
    <div className="mt-2 rounded border border-danger/40 bg-danger/10 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-[13px] uppercase tracking-[0.12em] text-[#f3c2bc]">{t('nuke.title')}</span>
        <span className="tabular text-lg text-ink">{c.nukes ?? 0}</span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{t('nuke.hint')}</p>
      <Button size="sm" variant="danger" className="mt-1.5 w-full" disabled={!canAfford(ctx, c.tag, cost)} onClick={() => cmd({ type: 'buildNuke' }, t('nuke.built'))}>
        {t('nuke.build')} · {formatMoney(cost, lang)}
      </Button>
    </div>
  );
}

function MilitaryTab() {
  const t = useT();
  const atWar = useGame((s) => (s.state ? Object.values(s.state.wars).some((w) => w.attackers.includes(s.state!.player) || w.defenders.includes(s.state!.player)) : false));
  return (
    <>
      {atWar && <WarsTab />}
      <NuclearCard />
      <ArmiesTab />
      {!atWar && (
        <Collapsible title={t('tab.wars')}>
          <WarsTab />
        </Collapsible>
      )}
    </>
  );
}
