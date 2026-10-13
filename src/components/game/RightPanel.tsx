'use client';
import { X } from 'lucide-react';
import { useUI } from '@/store/ui';
import { useT } from '@/i18n';
import ProvincePanel from './right/ProvincePanel';
import CountryPanel from './right/CountryPanel';
import ArmyPanel from './right/ArmyPanel';
import BattlePanel from './right/BattlePanel';
import WarPanel from './right/WarPanel';
import InboxPanel from './right/InboxPanel';

export default function RightPanel() {
  const t = useT();
  const right = useUI((s) => s.right);
  if (!right) return null;
  const close = () => {
    const ui = useUI.getState();
    if (right.kind === 'army') ui.selectArmies([]);
    ui.openRight(null);
  };
  return (
    <aside className="anim-in absolute bottom-0 right-0 top-0 z-20 flex w-[min(360px,100vw)] flex-col border-l border-line bg-panel/[0.97] shadow-2xl lg:relative">
      <div className="flex justify-end px-2 pt-1.5">
        <button type="button" onClick={close} className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {right.kind === 'province' && <ProvincePanel id={right.id} />}
        {right.kind === 'country' && <CountryPanel tag={right.tag} />}
        {right.kind === 'army' && <ArmyPanel />}
        {(right.kind === 'battle' || right.kind === 'report') && <BattlePanel id={right.id} />}
        {right.kind === 'war' && <WarPanel id={right.id} />}
        {right.kind === 'inbox' && <InboxPanel />}
      </div>
    </aside>
  );
}
