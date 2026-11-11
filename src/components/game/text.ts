import type { GameNotification, War } from '@/game/types';
import type { TFunc } from '@/i18n';
import { loc } from '@/i18n';
import type { Lang } from '@/lib/format';
import { formatInt } from '@/lib/format';
import { TECH_BY_ID } from '@/game/defs/techs';
import { getEventDef } from '@/game/data/events';

/** Bildirim parametrelerini yerelleştir (birlik/yapı/teknoloji/olay kimlikleri) */
export function notificationText(n: GameNotification, t: TFunc, lang: Lang): string {
  const p: Record<string, string | number> = { ...n.params };
  if (typeof p.unit === 'string') p.unit = t(`unit.${p.unit}`);
  if (typeof p.building === 'string') p.building = t(`building.${p.building}`);
  if (typeof p.tech === 'string') p.tech = TECH_BY_ID[p.tech]?.name[lang] ?? p.tech;
  if (typeof p.type === 'string') {
    const k1 = `treaty.${p.type}`;
    const k2 = `action.${p.type}`;
    const a = t(k1);
    p.type = a !== k1 ? a : t(k2);
  }
  if (typeof p.event === 'string') {
    const def = getEventDef(p.event);
    p.event = def ? loc(def.title, lang) : p.event;
  }
  for (const k of ['amount', 'wl', 'll']) if (typeof p[k] === 'number') p[k] = formatInt(p[k] as number, lang);
  return t(n.key, p);
}

export function warTitle(w: War, t: TFunc): string {
  if (w.goal.type === 'independence') return t('war.independence', { name: w.name });
  if (w.goal.type === 'rebellion') return `${t('war.rebellion')}: ${w.name.split('–')[1] ?? w.name}`;
  return t('war.name', { name: w.name });
}
