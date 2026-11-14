'use client';
/**
 * Merkezî dil sistemi. Arayüz metinleri yalnızca bu sözlüklerden okunur.
 * Yeni bir dil eklemek için `tr.ts` ile aynı anahtarlara sahip bir sözlük ekleyip DICTS'e kaydetmek yeterlidir.
 */
import { useCallback } from 'react';
import { tr } from './tr';
import { en } from './en';
import { de } from './de';
import { ru } from './ru';
import { es } from './es';
import { useSettings } from '@/store/settings';
import type { Lang } from '@/lib/format';

export type Dict = Record<string, string>;
export type UiLang = Lang | 'de' | 'ru' | 'es';
export const DICTS: Record<UiLang, Dict> = { tr, en, de, ru, es };
export const UI_LANGS: { id: UiLang; label: string }[] = [
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'ru', label: 'Русский' },
  { id: 'es', label: 'Español' },
];

export function translate(lang: UiLang, key: string, params?: Record<string, string | number>): string {
  const d = DICTS[lang] ?? tr;
  // Kısmi sözlükler (de/ru/es) İngilizceye, o da yoksa Türkçeye düşer
  let s = d[key] ?? (lang !== 'tr' ? en[key] : undefined) ?? tr[key];
  if (s === undefined) return key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  }
  return s;
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

export function useT(): TFunc {
  const lang = useSettings((s) => s.uiLang ?? s.language);
  return useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
}

export function useLang(): Lang {
  return useSettings((s) => s.language);
}

/** Veri dosyalarındaki { tr, en } alanları */
export function loc(v: { tr: string; en: string } | undefined, lang: Lang): string {
  if (!v) return '';
  return v[lang] ?? v.tr;
}

export function hasKey(key: string): boolean {
  return key in tr;
}
