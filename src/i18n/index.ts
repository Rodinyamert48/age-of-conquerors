'use client';
/**
 * Merkezî dil sistemi. Arayüz metinleri yalnızca bu sözlüklerden okunur.
 * Yeni bir dil eklemek için `tr.ts` ile aynı anahtarlara sahip bir sözlük ekleyip DICTS'e kaydetmek yeterlidir.
 */
import { useCallback } from 'react';
import { tr } from './tr';
import { en } from './en';
import { useSettings } from '@/store/settings';
import type { Lang } from '@/lib/format';

export type Dict = Record<string, string>;
export const DICTS: Record<Lang, Dict> = { tr, en };

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const d = DICTS[lang] ?? tr;
  let s = d[key] ?? tr[key];
  if (s === undefined) return key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  }
  return s;
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

export function useT(): TFunc {
  const lang = useSettings((s) => s.language);
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
