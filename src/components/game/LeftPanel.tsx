'use client';
import { Landmark, Shield, Handshake, Coins, FlaskConical, Scale, Swords, X } from 'lucide-react';
import { useUI, type LeftTab } from '@/store/ui';
import { useT } from '@/i18n';
import CountryTab from './tabs/CountryTab';
import ArmiesTab from './tabs/ArmiesTab';
import DiplomacyTab from './tabs/DiplomacyTab';
import EconomyTab from './tabs/EconomyTab';
import ResearchTab from './tabs/ResearchTab';
import PoliciesTab from './tabs/PoliciesTab';
import WarsTab from './tabs/WarsTab';

const TABS: { id: LeftTab; icon: typeof Landmark }[] = [
  { id: 'country', icon: Landmark },
  { id: 'armies', icon: Shield },
  { id: 'diplomacy', icon: Handshake },
  { id: 'economy', icon: Coins },
  { id: 'research', icon: FlaskConical },
  { id: 'policies', icon: Scale },
  { id: 'wars', icon: Swords },
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
            title={t(`tab.${tb.id}`)}
            aria-label={t(`tab.${tb.id}`)}
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
            <h2 className="font-display text-base tracking-wide text-gold-soft">{t(`tab.${tab}`)}</h2>
            <button type="button" onClick={close} className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {tab === 'country' && <CountryTab />}
            {tab === 'armies' && <ArmiesTab />}
            {tab === 'diplomacy' && <DiplomacyTab />}
            {tab === 'economy' && <EconomyTab />}
            {tab === 'research' && <ResearchTab />}
            {tab === 'policies' && <PoliciesTab />}
            {tab === 'wars' && <WarsTab />}
          </div>
        </aside>
      )}
    </>
  );
}
