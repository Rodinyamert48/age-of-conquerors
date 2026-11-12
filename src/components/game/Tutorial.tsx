'use client';
import { useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT } from '@/i18n';
import { Button } from '@/components/ui';
import type { GameState } from '@/game/types';

interface UIState {
  rightKind: string | null;
  selectedArmies: number;
  leftTab: string | null;
}

/** Her adımın tamamlanma koşulu (oyun durumu ve arayüz durumundan) */
const STEPS: ((s: GameState, ui: UIState, startTurn: number) => boolean)[] = [
  (_s, ui) => ui.rightKind === 'province',
  (s) => s.provinces.some((p) => p.owner === s.player && !!p.construction),
  (s) => s.provinces.some((p) => p.owner === s.player && p.recruits.length > 0),
  (_s, ui) => ui.selectedArmies > 0,
  (s) => Object.values(s.armies).some((a) => a.owner === s.player && a.path.length > 0),
  (s, _ui, start) => s.turn > start,
  (_s, ui) => ui.leftTab === 'diplomacy',
  (_s, ui) => ui.leftTab === 'research',
];

export default function Tutorial() {
  const t = useT();
  const state = useGame((s) => s.state);
  const rightKind = useUI((s) => s.right?.kind ?? null);
  const selectedArmies = useUI((s) => s.selectedArmies.length);
  const leftTab = useUI((s) => s.leftTab);
  const [prog, setProg] = useState({ step: 0, startTurn: state?.turn ?? 0 });
  const [closed, setClosed] = useState(false);
  const { step, startTurn } = prog;

  // Adım tamamlanınca bir sonrakine geç (render sırasında türetilmiş durum güncellemesi)
  const done = state && step < STEPS.length ? STEPS[step](state, { rightKind, selectedArmies, leftTab }, startTurn) : false;
  if (done && state) setProg({ step: step + 1, startTurn: state.turn });

  if (!state?.rules.tutorial || closed) return null;
  const last = step >= STEPS.length;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded border border-gold-2 bg-panel/95 px-3 py-2.5 shadow-2xl">
        <GraduationCap size={22} className="mt-0.5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-sm uppercase tracking-[0.14em] text-gold-soft">
              {t('tutorial.title')} · {Math.min(step + 1, STEPS.length + 1)}/{STEPS.length + 1}
            </span>
            <button type="button" onClick={() => setClosed(true)} className="text-muted hover:text-ink" aria-label={t('tutorial.skip')} title={t('tutorial.skip')}>
              <X size={15} />
            </button>
          </div>
          <p className="mt-1 text-sm leading-snug text-ink">{t(`tutorial.step${Math.min(step, STEPS.length)}`)}</p>
          {last && (
            <Button size="sm" variant="primary" className="mt-2" onClick={() => setClosed(true)}>
              {t('tutorial.finish')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
