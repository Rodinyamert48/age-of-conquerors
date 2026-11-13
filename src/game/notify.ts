import type { GameNotification, NotificationKind, Tag } from './types';
import type { Ctx } from './ctx';

const MAX_NOTIFICATIONS = 250;

export function notify(
  ctx: Ctx,
  kind: NotificationKind,
  key: string,
  params: Record<string, string | number>,
  opts: {
    severity?: GameNotification['severity'];
    focus?: GameNotification['focus'];
    /** ilgili ülkeler: oyuncu bunlardan biriyse oyuncuya özel sayılır */
    involves?: Tag[];
    global?: boolean;
  } = {},
): void {
  const s = ctx.s;
  const player = !!opts.involves?.includes(s.player);
  if (!player && !opts.global) return;
  // Tarihçe: oyuncuyu ilgilendiren savaş, barış ve kritik olaylar zaman çizelgesine yazılır
  if (player && (kind === 'war' || kind === 'peace' || key.startsWith('notif.election') || (opts.severity === 'critical' && kind !== 'battle'))) {
    (s.chronicle ??= []).push({ day: s.day, key, params, severity: opts.severity ?? 'info' });
    if (s.chronicle.length > 300) s.chronicle.splice(0, s.chronicle.length - 300);
  }
  s.notifications.push({
    id: s.nextNotificationId++,
    day: s.day,
    kind,
    key,
    params,
    severity: opts.severity ?? 'info',
    focus: opts.focus,
    player,
  });
  if (s.notifications.length > MAX_NOTIFICATIONS) s.notifications.splice(0, s.notifications.length - MAX_NOTIFICATIONS);
}

export function newId(ctx: Ctx, prefix: string): string {
  return `${prefix}${ctx.s.nextId++}`;
}
