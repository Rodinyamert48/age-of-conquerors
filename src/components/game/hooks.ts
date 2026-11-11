'use client';
import { useMemo } from 'react';
import { useGame, readCtx } from '@/store/game';
import type { Ctx } from '@/game/ctx';
import type { Command } from '@/game/commands';
import type { CommandResult, Tag } from '@/game/types';
import { useToasts } from '@/components/ui';
import { useT, useLang } from '@/i18n';
import { playSound } from '@/lib/audio';
import { TECH_BY_ID } from '@/game/defs/techs';

/** En son anlık görüntü üzerinde salt okunur bağlam */
export function useReadCtx(): Ctx | null {
  const state = useGame((s) => s.state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readCtx(), [state]);
}

/** Komut gönder; hata varsa anlaşılır bir tost göster */
export function useCommand() {
  const t = useT();
  const push = useToasts((s) => s.push);
  return async (cmd: Command, okMsg?: string): Promise<CommandResult> => {
    const r = await useGame.getState().command(cmd);
    if (!r.ok) push(t(r.error ?? 'err.unknown', r.errorParams), 'bad');
    else if (okMsg) {
      push(okMsg, 'good');
      playSound('success');
    }
    return r;
  };
}

export function useCountryName() {
  const lang = useLang();
  const state = useGame((s) => s.state);
  return (tag: Tag) => {
    const c = state?.countries[tag];
    if (!c) return tag === 'REB' ? (lang === 'en' ? 'Rebels' : 'İsyancılar') : tag;
    return lang === 'en' ? c.nameEn : c.name;
  };
}

export function techName(id: string, lang: 'tr' | 'en'): string {
  return TECH_BY_ID[id]?.name[lang] ?? id;
}
