'use client';
import { useState } from 'react';
import { useGame } from '@/store/game';
import { useLang, useT } from '@/i18n';
import { Button, Modal } from '@/components/ui';
import { useCommand, useReadCtx } from './hooks';
import { MINISTER_ROLES, MINISTER_ROLE_NAMES, ministerCandidates, ministersDue, traitOf, type MinisterRole } from '@/game/ministers';
import type { Modifiers } from '@/game/types';

/** Etki listesini "Vergi verimi +%5 · Huzursuzluk −4" biçiminde yazar */
export function modsText(mods: Partial<Modifiers>, t: (k: string) => string): string {
  return Object.entries(mods)
    .map(([k, v]) => {
      const n = v ?? 0;
      const pts = ['stability', 'unrest', 'acceptance'].includes(k);
      const val = pts ? `${n > 0 ? '+' : '−'}${Math.abs(n)}` : `${n > 0 ? '+' : '−'}%${Math.round(Math.abs(n) * 1000) / 10}`;
      return `${t(`mod.${k}`)} ${val}`;
    })
    .join(' · ');
}

/** Oyun başında ve her 5 yılda bir: yedi bakanlığa aday seçimi */
export default function MinisterDialog() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  const [picks, setPicks] = useState<Partial<Record<MinisterRole, number>>>({});
  if (!state || !ctx || !ministersDue(ctx, state.player) || state.gameOver) return null;
  const c = state.countries[state.player];
  const round = (c.ministerRound ?? 0) + 1;
  const l = lang === 'en' ? 'en' : 'tr';
  return (
    <Modal
      open
      wide
      onClose={() => {}}
      title={`${t('minister.title')} · ${round === 1 ? t('minister.firstTerm') : t('minister.newTerm')}`}
      footer={
        <>
          <Button
            onClick={() => {
              const r: Partial<Record<MinisterRole, number>> = {};
              MINISTER_ROLES.forEach((role, i) => (r[role] = (i * 7 + round * 3 + state.day) % 3));
              setPicks(r);
            }}
          >
            {t('minister.random')}
          </Button>
          <Button variant="primary" onClick={() => cmd({ type: 'appointMinisters', picks }).then(() => setPicks({}))}>
            {t('minister.confirm')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">{t('minister.hint')}</p>
      <div className="space-y-3">
        {MINISTER_ROLES.map((role) => {
          const cands = ministerCandidates(c.tag, role, round);
          const sel = picks[role] ?? 0;
          return (
            <div key={role}>
              <div className="mb-1 font-display text-[13px] uppercase tracking-[0.12em] text-gold-soft">{MINISTER_ROLE_NAMES[role][l]}</div>
              <div className="grid gap-1.5 md:grid-cols-3">
                {cands.map((m, i) => {
                  const tr = traitOf(role, m.trait)!;
                  const on = sel === i;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setPicks({ ...picks, [role]: i })}
                      className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${on ? 'border-gold bg-gold/15' : 'border-line-2 bg-panel-2 hover:border-gold-2'}`}
                    >
                      <div className="text-sm text-ink">{m.name}</div>
                      <div className="text-gold-soft">{tr.name[l]}</div>
                      <div className="mt-0.5 text-good">▲ {modsText(tr.plus, t)}</div>
                      <div className="text-danger">▼ {modsText(tr.minus, t)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
