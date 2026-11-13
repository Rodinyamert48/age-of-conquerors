import type { GameState } from './types';

/** Çevrimiçi: durumu bir insan oyuncunun gözünden süz (kendi olayları, teklifleri ve bildirimleri) */
export function viewFor(state: GameState, tag: string): GameState {
  return {
    ...state,
    player: tag,
    pendingEvents: state.pendingEvents.filter((p) => p.country === tag),
    proposals: state.proposals.filter((p) => p.to === tag),
    peaceOffers: state.peaceOffers.filter((o) => o.to === tag),
    notifications: state.notifications.filter((n) => !n.priv || !n.tags || n.tags.includes(tag)).map((n) => (n.tags ? { ...n, player: n.tags.includes(tag) } : n)),
  };
}

