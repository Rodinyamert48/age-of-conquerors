'use client';
/**
 * Oyun ekranının arayüz durumu (seçimler, açık paneller, harita katmanı).
 * Oyun durumu değildir; kaydedilmez.
 */
import { create } from 'zustand';
import type { MapMode, Tag } from '@/game/types';
import type { FocusRequest, MapHover } from '@/components/map/MapCanvas';
import { useSettings } from './settings';

export type LeftTab = 'country' | 'armies' | 'diplomacy' | 'economy' | 'research' | 'policies' | 'wars';

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
  mapMode: MapMode;
  focus: FocusRequest | null;
  hover: MapHover | null;
  peace: { warId: string; target: Tag } | null;
  pauseMenu: boolean;
  logOpen: boolean;
  setLeftTab: (t: LeftTab | null) => void;
  toggleLeftTab: (t: LeftTab) => void;
  openRight: (v: RightView | null) => void;
  selectArmies: (ids: string[]) => void;
  toggleArmy: (id: string) => void;
  setMoveMode: (v: boolean) => void;
  setMapMode: (m: MapMode) => void;
  focusOn: (x: number, y: number, scale?: number) => void;
  setHover: (h: MapHover | null) => void;
  openPeace: (warId: string, target: Tag) => void;
  closePeace: () => void;
  setPauseMenu: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  clearSelection: () => void;
  reset: () => void;
}

let nonce = 1;

export const useUI = create<UIStore>()((set, get) => ({
  leftTab: null,
  right: null,
  selectedArmies: [],
  moveMode: false,
  mapMode: 'political',
  focus: null,
  hover: null,
  peace: null,
  pauseMenu: false,
  logOpen: false,
  setLeftTab: (t) => set({ leftTab: t }),
  toggleLeftTab: (t) => set({ leftTab: get().leftTab === t ? null : t }),
  openRight: (v) => set({ right: v }),
  selectArmies: (ids) => set({ selectedArmies: ids, right: ids.length ? { kind: 'army' } : get().right?.kind === 'army' ? null : get().right, moveMode: false }),
  toggleArmy: (id) => {
    const cur = get().selectedArmies;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ selectedArmies: next, right: next.length ? { kind: 'army' } : null });
  },
  setMoveMode: (v) => set({ moveMode: v }),
  setMapMode: (m) => set({ mapMode: m }),
  focusOn: (x, y, scale) => set({ focus: { x, y, scale, nonce: nonce++ } }),
  setHover: (h) => set({ hover: h }),
  openPeace: (warId, target) => set({ peace: { warId, target } }),
  closePeace: () => set({ peace: null }),
  setPauseMenu: (v) => set({ pauseMenu: v }),
  setLogOpen: (v) => set({ logOpen: v }),
  clearSelection: () => set({ selectedArmies: [], right: null, moveMode: false }),
  reset: () =>
    set({
      leftTab: null,
      right: null,
      selectedArmies: [],
      moveMode: false,
      mapMode: useSettings.getState().defaultMapMode,
      focus: null,
      hover: null,
      peace: null,
      pauseMenu: false,
    }),
}));
