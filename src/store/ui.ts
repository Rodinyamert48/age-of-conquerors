'use client';
/**
 * Oyun ekranının arayüz durumu (seçimler, açık paneller, harita katmanı).
 * Oyun durumu değildir; kaydedilmez.
 */
import { create } from 'zustand';
import type { MapMode, Tag } from '@/game/types';
import type { FocusRequest, MapHover } from '@/components/map/MapCanvas';
import { useSettings } from './settings';

export type LeftTab = 'country' | 'armies' | 'diplomacy' | 'economy' | 'research' | 'policies' | 'wars' | 'state';

export type RightView =
  | { kind: 'province'; id: number }
  | { kind: 'country'; tag: Tag }
  | { kind: 'army' }
  | { kind: 'battle'; id: string }
  | { kind: 'report'; id: string }
  | { kind: 'war'; id: string }
  | { kind: 'inbox' };

interface UIStore {
  leftTab: LeftTab | null;
  right: RightView | null;
  selectedArmies: string[];
  moveMode: boolean;
  /** hareket emrinde gönderilecek asker yüzdesi */
  sendPct: number;
  mapMode: MapMode;
  focus: FocusRequest | null;
  peace: { warId: string; target: Tag } | null;
  pauseMenu: boolean;
  adminOpen: boolean;
  logOpen: boolean;
  setLeftTab: (t: LeftTab | null) => void;
  toggleLeftTab: (t: LeftTab) => void;
  openRight: (v: RightView | null) => void;
  selectArmies: (ids: string[]) => void;
  toggleArmy: (id: string) => void;
  setMoveMode: (v: boolean) => void;
  setSendPct: (v: number) => void;
  setMapMode: (m: MapMode) => void;
  focusOn: (x: number, y: number, scale?: number) => void;
  openPeace: (warId: string, target: Tag) => void;
  closePeace: () => void;
  setPauseMenu: (v: boolean) => void;
  setAdminOpen: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  clearSelection: () => void;
  reset: () => void;
}

let nonce = 1;

/** Sade arayüzde dört sekme vardır: ekonomi ve politikalar Ülke'de, savaşlar Ordu sekmesinde */
function normalizeTab(t: LeftTab): LeftTab {
  if (t === 'economy' || t === 'policies') return 'country';
  if (t === 'wars') return 'armies';
  return t;
}

export const useUI = create<UIStore>()((set, get) => ({
  leftTab: null,
  right: null,
  selectedArmies: [],
  moveMode: false,
  sendPct: 100,
  mapMode: 'political',
  focus: null,
  peace: null,
  pauseMenu: false,
  adminOpen: false,
  logOpen: false,
  setLeftTab: (t) => set({ leftTab: t && normalizeTab(t) }),
  toggleLeftTab: (t) => {
    const n = normalizeTab(t);
    set({ leftTab: get().leftTab === n ? null : n });
  },
  openRight: (v) => set({ right: v }),
  selectArmies: (ids) => set({ selectedArmies: ids, right: ids.length ? { kind: 'army' } : get().right?.kind === 'army' ? null : get().right, moveMode: false }),
  toggleArmy: (id) => {
    const cur = get().selectedArmies;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ selectedArmies: next, right: next.length ? { kind: 'army' } : null });
  },
  setMoveMode: (v) => set({ moveMode: v }),
  setSendPct: (v) => set({ sendPct: Math.max(5, Math.min(100, Math.round(v))) }),
  setMapMode: (m) => set({ mapMode: m }),
  focusOn: (x, y, scale) => set({ focus: { x, y, scale, nonce: nonce++ } }),
  openPeace: (warId, target) => set({ peace: { warId, target } }),
  closePeace: () => set({ peace: null }),
  setPauseMenu: (v) => set({ pauseMenu: v }),
  setAdminOpen: (v) => set({ adminOpen: v }),
  setLogOpen: (v) => set({ logOpen: v }),
  clearSelection: () => set({ selectedArmies: [], right: null, moveMode: false }),
  reset: () => {
    useHover.getState().setHover(null);
    set({
      leftTab: null,
      right: null,
      selectedArmies: [],
      moveMode: false,
      mapMode: useSettings.getState().defaultMapMode,
      focus: null,
      peace: null,
      pauseMenu: false,
    });
  },
}));

/**
 * İmleç altındaki harita öğesi. Ayrı bir depoda tutulur: fare her hareket ettiğinde yalnızca
 * buna abone olan küçük bileşenler (ipucu, rota önizlemesi) yeniden çizilir.
 */
export const useHover = create<{ hover: MapHover | null; setHover: (h: MapHover | null) => void }>()((set) => ({
  hover: null,
  setHover: (h) => set({ hover: h }),
}));
