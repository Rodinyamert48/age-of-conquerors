/**
 * Kayıt biçimi: sürümlü, doğrulanan ve gerektiğinde eski sürümlerden taşınan GameState.
 * Kayıt; bölgeler, ülkeler, ekonomi, ordular ve emirleri, savaşlar, diplomasi, inşaatlar,
 * araştırmalar, olaylar, yapay zekâ durumu, kurallar, rastgelelik durumu ve tur sayısını içerir.
 */
import type { GameState } from './types';
import { SAVE_VERSION } from './engine';

export interface SaveEnvelope {
  format: 'age-of-conquerors-save';
  version: number;
  savedAt: number;
  state: GameState;
}

export class SaveError extends Error {
  constructor(
    public readonly code: 'corrupt' | 'version' | 'world',
    message: string,
  ) {
    super(message);
  }
}

/** Sürüm göçleri: anahtar = kaynak sürüm, işlev bir sonraki sürüme taşır */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 → 1: erken geliştirme kayıtları (history alanı yoktu)
  0: (s) => ({ ...s, history: Array.isArray(s.history) ? s.history : [], saveVersion: 1 }),
  // 1 → 2 (26.2): Muğla, Aydın'dan ayrı bir bölge oldu. Yeni bölge listeye eklenir ve sonraki
  // bütün bölge/deniz düğümü indeksleri bir kayar.
  1: (s) => {
    const provinces = s.provinces as Record<string, unknown>[];
    if (!Array.isArray(provinces) || provinces.length !== MUGLA_SPLIT.oldCount) return { ...s, saveVersion: 2 };
    return { ...splitMugla(s), saveVersion: 2 };
  },
};

/** 26.1 haritasında birleşik Aydın+Muğla bölgesinin indeksi ve yeni Aydın bölgesinin eklendiği yer */
const MUGLA_SPLIT = { oldCount: 2863, at: 2423, source: 2437, share: 0.471 };

function splitMugla(raw: Record<string, unknown>): Record<string, unknown> {
  const { at, source, share } = MUGLA_SPLIT;
  const r = (i: unknown): unknown => (typeof i === 'number' && i >= at ? i + 1 : i);
  const s = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const src = s.provinces[source];
  const fresh = { ...src, pop: src.pop * share, output: src.output * share, buildings: src.buildings.slice(), cores: src.cores.slice(), construction: null, recruits: [], siege: null };
  src.pop *= 1 - share;
  src.output *= 1 - share;
  s.provinces.splice(at, 0, fresh);
  for (const c of Object.values(s.countries) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    c.capital = r(c.capital);
    if (Array.isArray(c.claims)) c.claims = c.claims.map(r);
  }
  for (const a of Object.values(s.armies) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    a.location = r(a.location);
    if (Array.isArray(a.path)) a.path = a.path.map(r);
    a.aiTarget = r(a.aiTarget);
  }
  for (const b of Object.values(s.battles ?? {}) as any[]) b.location = r(b.location); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const b of (s.battleReports ?? []) as any[]) b.location = r(b.location); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const n of (s.notifications ?? []) as any[]) if (n.focus && typeof n.focus.province === 'number') n.focus.province = r(n.focus.province); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const p of (s.proposals ?? []) as any[]) p.province = r(p.province); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const p of (s.pendingEvents ?? []) as any[]) p.province = r(p.province); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const o of (s.peaceOffers ?? []) as any[]) for (const t of o.terms ?? []) if (typeof t.province === 'number') t.province = r(t.province); // eslint-disable-line @typescript-eslint/no-explicit-any
  if (s.provinceNames) s.provinceNames = Object.fromEntries(Object.entries(s.provinceNames).map(([k, v]) => [r(Number(k)), v]));
  if (Array.isArray(s.ownerStart)) s.ownerStart.splice(at, 0, s.ownerStart[source]);
  if (Array.isArray(s.ownerLog)) for (const e of s.ownerLog) e[1] = r(e[1]);
  delete s.undo;
  if (s.versions) s.versions.owners = (s.versions.owners ?? 0) + 1;
  return s;
}

export function serializeState(state: GameState): SaveEnvelope {
  return { format: 'age-of-conquerors-save', version: SAVE_VERSION, savedAt: Date.now(), state };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Temel yapı denetimi: bozuk ya da başka bir dosyayı erkenden yakalar */
export function validateState(s: unknown, provinceCount?: number): asserts s is GameState {
  if (!isObj(s)) throw new SaveError('corrupt', 'Kayıt bir nesne değil');
  const need = ['meta', 'rules', 'player', 'day', 'turn', 'rng', 'countries', 'provinces', 'armies', 'wars', 'treaties', 'relations'];
  for (const k of need) if (!(k in s)) throw new SaveError('corrupt', `Eksik alan: ${k}`);
  if (!Array.isArray(s.provinces)) throw new SaveError('corrupt', 'Bölge listesi geçersiz');
  if (!isObj(s.countries) || !isObj(s.armies) || !isObj(s.wars)) throw new SaveError('corrupt', 'Ülke/ordu/savaş verisi geçersiz');
  if (typeof s.day !== 'number' || typeof s.turn !== 'number' || typeof s.rng !== 'number') throw new SaveError('corrupt', 'Sayısal alanlar geçersiz');
  if (provinceCount !== undefined && s.provinces.length !== provinceCount) {
    throw new SaveError('world', `Kayıt farklı bir harita sürümüne ait (${s.provinces.length} ≠ ${provinceCount} bölge)`);
  }
  const countries = s.countries as Record<string, unknown>;
  if (!isObj(countries[s.player as string])) throw new SaveError('corrupt', 'Oyuncu ülkesi kayıtta yok');
  for (const p of s.provinces as unknown[]) {
    if (!isObj(p) || typeof p.owner !== 'string' || !Array.isArray(p.buildings)) throw new SaveError('corrupt', 'Bölge kaydı bozuk');
  }
}

export function migrateState(raw: Record<string, unknown>): GameState {
  let s = raw;
  let v = typeof s.saveVersion === 'number' ? s.saveVersion : 0;
  if (v > SAVE_VERSION) throw new SaveError('version', `Kayıt daha yeni bir oyun sürümüne ait (v${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError('version', `v${v} kaydı için taşıma yolu yok`);
    s = m(s);
    v = typeof s.saveVersion === 'number' ? s.saveVersion : v + 1;
  }
  return s as unknown as GameState;
}

/** Kayıt zarfını (veya doğrudan durumu) çöz, taşı ve doğrula */
export function deserialize(input: unknown, provinceCount?: number): GameState {
  let raw: unknown = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new SaveError('corrupt', 'Kayıt dosyası okunamadı (JSON hatası)');
    }
  }
  if (isObj(raw) && raw.format === 'age-of-conquerors-save') raw = raw.state;
  if (!isObj(raw)) throw new SaveError('corrupt', 'Kayıt içeriği boş');
  const migrated = migrateState(raw);
  validateState(migrated, provinceCount);
  return migrated;
}
