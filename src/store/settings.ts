'use client';
/**
 * Oyun ayarları (tarayıcıda kalıcı). Kullanıcı tercihi olduğu için localStorage yeterlidir.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Difficulty, MapMode, NotificationKind, TimeStep } from '@/game/types';
import type { Lang } from '@/lib/format';

export type AutosaveFrequency = 'off' | 'monthly' | 'quarterly' | 'yearly';
export type MapQuality = 'low' | 'medium' | 'high';

export type KeyAction =
  | 'endTurn'
  | 'tabCountry'
  | 'tabArmies'
  | 'tabDiplomacy'
  | 'tabEconomy'
  | 'tabResearch'
  | 'tabPolicies'
  | 'tabWars'
  | 'cycleMapMode'
  | 'quickSave'
  | 'deselect'
  | 'centerCapital';

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  endTurn: 'Space',
  tabCountry: 'KeyC',
  tabArmies: 'KeyA',
  tabDiplomacy: 'KeyD',
  tabEconomy: 'KeyE',
  tabResearch: 'KeyR',
  tabPolicies: 'KeyP',
  tabWars: 'KeyW',
  cycleMapMode: 'KeyM',
  quickSave: 'F5',
  deselect: 'Escape',
  centerCapital: 'KeyH',
};

export interface SettingsState {
  language: Lang;
  /** arayüz dili (de/ru/es seçilince veri dili İngilizce kalır) */
  uiLang?: 'tr' | 'en' | 'de' | 'ru' | 'es';
  soundEnabled: boolean;
  soundVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  animations: boolean;
  mapQuality: MapQuality;
  defaultDifficulty: Difficulty;
  defaultSpeed: number;
  defaultTimeStep: TimeStep;
  autosave: AutosaveFrequency;
  notifications: Record<NotificationKind, boolean>;
  defaultMapMode: MapMode;
  keyboardShortcuts: boolean;
  /** erişilebilirlik: renk körlüğü paleti ve yazı boyutu */
  colorBlind: boolean;
  textSize: 'normal' | 'large' | 'xlarge';
  keys: Record<KeyAction, string>;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset' | 'setKey'>>) => void;
  setKey: (action: KeyAction, code: string) => void;
  reset: () => void;
}

const DEFAULTS: Omit<SettingsState, 'set' | 'reset' | 'setKey'> = {
  language: 'tr',
  soundEnabled: true,
  soundVolume: 0.5,
  musicEnabled: false,
  musicVolume: 0.3,
  animations: true,
  mapQuality: 'high',
  defaultDifficulty: 'normal',
  defaultSpeed: 2,
  defaultTimeStep: 'week',
  autosave: 'monthly',
  notifications: {
    war: true,
    peace: true,
    battle: true,
    province: true,
    treaty: true,
    construction: true,
    recruit: true,
    economy: true,
    rebellion: true,
    research: true,
    event: true,
    diplomacy: true,
    system: true,
  },
  defaultMapMode: 'political',
  keyboardShortcuts: true,
  colorBlind: false,
  textSize: 'normal',
  keys: DEFAULT_KEYS,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      setKey: (action, code) => set((s) => ({ keys: { ...s.keys, [action]: code } })),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'aoc-settings',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v2: tur tabanlı sistem; varsayılan tur uzunluğu bir hafta
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2) p.defaultTimeStep = 'week';
        return p as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          notifications: { ...DEFAULTS.notifications, ...(p.notifications ?? {}) },
          keys: Object.fromEntries(Object.entries({ ...DEFAULT_KEYS, ...(p.keys ?? {}) }).filter(([k]) => k in DEFAULT_KEYS)) as Record<KeyAction, string>,
        };
      },
    },
  ),
);
