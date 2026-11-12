/**
 * Bakanlar: her ülkede yedi bakanlık vardır. Oyun başında ve her 5 yılda bir yeni bakanlar atanır.
 * Her bakanın bir özelliği vardır: bir olumlu (+) ve bir olumsuz (−) etki. Adaylar ülke, bakanlık ve
 * atama turundan türetilir (RNG tüketmez), böylece aynı ülkede aynı adaylar görünür.
 */
import type { Ctx } from './ctx';
import type { Day, Modifiers, Tag } from './types';
import { hashString, seededValue } from './rng';
import { REBEL_TAG } from './query';

export type MinisterRole = 'interior' | 'foreign' | 'defense' | 'education' | 'staff' | 'health' | 'finance';
export const MINISTER_ROLES: MinisterRole[] = ['interior', 'foreign', 'defense', 'education', 'staff', 'health', 'finance'];

export interface MinisterTrait {
  id: string;
  name: { tr: string; en: string };
  plus: Partial<Modifiers>;
  minus: Partial<Modifiers>;
}

export interface Minister {
  name: string;
  trait: string;
}

export const MINISTER_TERM_YEARS = 5;

const T = (id: string, tr: string, en: string, plus: Partial<Modifiers>, minus: Partial<Modifiers>): MinisterTrait => ({ id, name: { tr, en }, plus, minus });

export const MINISTER_TRAITS: Record<MinisterRole, MinisterTrait[]> = {
  interior: [
    T('iron_fist', 'Demir Yumruk', 'Iron Fist', { unrest: -5 }, { stability: -2, popGrowth: -0.001 }),
    T('reformer', 'Reformcu', 'Reformer', { stability: 3 }, { taxEfficiency: -0.04 }),
    T('bureaucrat', 'Bürokrat', 'Bureaucrat', { taxEfficiency: 0.05 }, { unrest: 3 }),
    T('populist', 'Popülist', 'Populist', { stability: 2, popGrowth: 0.001 }, { taxEfficiency: -0.03 }),
  ],
  foreign: [
    T('diplomat', 'Usta Diplomat', 'Master Diplomat', { acceptance: 6, relationGain: 0.15 }, { tradeIncome: -0.03 }),
    T('hawk', 'Şahin', 'Hawk', { morale: 0.03, warExhaustion: -0.1 }, { acceptance: -5 }),
    T('trader', 'Ticaret Elçisi', 'Trade Envoy', { tradeIncome: 0.08 }, { relationGain: -0.1 }),
    T('idealist', 'İdealist', 'Idealist', { relationGain: 0.2 }, { acceptance: -3 }),
  ],
  defense: [
    T('modernizer', 'Modernleştirici', 'Modernizer', { infantryPower: 0.08 }, { upkeep: 0.06 }),
    T('frugal', 'Tutumlu', 'Frugal', { upkeep: -0.1 }, { infantryPower: -0.04 }),
    T('recruiter', 'Asker Toplayıcı', 'Recruiter', { manpower: 0.15, recruitTime: -0.15 }, { morale: -0.03 }),
    T('fortress', 'Kale Ustası', 'Fortress Master', { fortDefense: 0.2, supply: 0.1 }, { moveSpeed: -0.05 }),
  ],
  education: [
    T('scholar', 'Bilge', 'Scholar', { researchSpeed: 0.2 }, { buildCost: 0.05 }),
    T('pragmatist', 'Pragmatist', 'Pragmatist', { researchSpeed: 0.1, development: 0.003 }, { stability: -1 }),
    T('traditionalist', 'Gelenekçi', 'Traditionalist', { stability: 3 }, { researchSpeed: -0.1 }),
    T('technocrat', 'Teknokrat', 'Technocrat', { development: 0.005 }, { unrest: 2 }),
  ],
  staff: [
    T('strategist', 'Strateji Dehası', 'Strategic Genius', { infantryPower: 0.1, siegePower: 0.1 }, { recruitCost: 0.1 }),
    T('logistician', 'Lojistik Uzmanı', 'Logistician', { supply: 0.2, attrition: -0.15 }, { infantryPower: -0.03 }),
    T('inspirer', 'İlham Verici', 'Inspirer', { morale: 0.08, moraleRecovery: 0.15 }, { upkeep: 0.05 }),
    T('siegemaster', 'Kuşatma Ustası', 'Siege Master', { siegeSpeed: 0.25, siegePower: 0.15 }, { moveSpeed: -0.08 }),
  ],
  health: [
    T('doctor', 'Halk Doktoru', 'People’s Doctor', { popGrowth: 0.002, manpower: 0.05 }, { taxEfficiency: -0.03 }),
    T('epidemiologist', 'Salgın Uzmanı', 'Epidemiologist', { stability: 2, warExhaustion: -0.1 }, { researchSpeed: -0.05 }),
    T('privatizer', 'Özelleştirmeci', 'Privatizer', { taxEfficiency: 0.04 }, { unrest: 3, popGrowth: -0.001 }),
    T('welfare', 'Sosyal Devletçi', 'Welfare Advocate', { unrest: -4, popGrowth: 0.001 }, { taxEfficiency: -0.05 }),
  ],
  finance: [
    T('saver', 'Tasarrufçu', 'Saver', { taxEfficiency: 0.08 }, { development: -0.002 }),
    T('spender', 'Yatırımcı', 'Investor', { development: 0.005, buildCost: -0.1 }, { taxEfficiency: -0.03 }),
    T('banker', 'Bankacı', 'Banker', { tradeIncome: 0.1, productionIncome: 0.05 }, { stability: -2 }),
    T('austerity', 'Kemer Sıkıcı', 'Austerity Hawk', { upkeep: -0.08, taxEfficiency: 0.04 }, { stability: -3, unrest: 3 }),
  ],
};

export const MINISTER_ROLE_NAMES: Record<MinisterRole, { tr: string; en: string }> = {
  interior: { tr: 'İçişleri Bakanı', en: 'Interior Minister' },
  foreign: { tr: 'Dışişleri Bakanı', en: 'Foreign Minister' },
  defense: { tr: 'Savunma Bakanı', en: 'Defence Minister' },
  education: { tr: 'Eğitim Bakanı', en: 'Education Minister' },
  staff: { tr: 'Genelkurmay Başkanı', en: 'Chief of the General Staff' },
  health: { tr: 'Sağlık Bakanı', en: 'Health Minister' },
  finance: { tr: 'Maliye Bakanı', en: 'Finance Minister' },
};

const FIRST = ['Ahmet', 'Mehmet', 'Ali', 'Murat', 'Kemal', 'Selim', 'Hasan', 'Emre', 'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Leyla', 'Nadia', 'Omar', 'Karim', 'Viktor', 'Ivan', 'Dmitri', 'Elena', 'Anna', 'Maria', 'John', 'Michael', 'David', 'Thomas', 'Sarah', 'Emma', 'Hans', 'Klaus', 'Pierre', 'Jean', 'Marco', 'Luca', 'Carlos', 'Diego', 'Hiroshi', 'Kenji', 'Wei', 'Chen', 'Raj', 'Arjun', 'Priya', 'Kofi', 'Amara', 'Tariq', 'Yusuf', 'Sofia'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Aydın', 'Arslan', 'Koç', 'Öztürk', 'Aksoy', 'Hassan', 'Rahman', 'Khalil', 'Petrov', 'Ivanov', 'Sokolov', 'Novak', 'Müller', 'Schmidt', 'Weber', 'Dubois', 'Moreau', 'Rossi', 'Bianchi', 'García', 'Fernández', 'Silva', 'Santos', 'Smith', 'Johnson', 'Brown', 'Taylor', 'Tanaka', 'Sato', 'Wang', 'Li', 'Zhang', 'Kim', 'Park', 'Sharma', 'Patel', 'Singh', 'Mensah', 'Okafor', 'Nasser', 'Haddad', 'Kowalski', 'Andersson'];

export function traitOf(role: MinisterRole, id: string): MinisterTrait | undefined {
  return MINISTER_TRAITS[role].find((x) => x.id === id);
}

/** Bir bakanlık için üç aday (ülke + bakanlık + atama turuna göre sabit) */
export function ministerCandidates(tag: Tag, role: MinisterRole, round: number): Minister[] {
  const traits = MINISTER_TRAITS[role];
  const seed = hashString(`${tag}|${role}|${round}`);
  // Özellik sırasını karıştır, ilk üçünü al
  const idx = traits.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(seededValue(seed + i * 7919) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 3).map((ti, k) => ({
    name: `${FIRST[Math.floor(seededValue(seed + 101 + k * 31) * FIRST.length)]} ${LAST[Math.floor(seededValue(seed + 211 + k * 53) * LAST.length)]}`,
    trait: traits[ti].id,
  }));
}

/** Atama zamanı geldi mi (hiç atama yoksa ya da 5 yıllık dönem dolduysa) */
export function ministersDue(ctx: Ctx, tag: Tag): boolean {
  const c = ctx.s.countries[tag];
  if (!c || !c.alive || tag === REBEL_TAG || c.rebelMovement) return false;
  return !c.ministers || (c.ministerNext ?? 0) <= ctx.s.day;
}

export function appointMinisters(ctx: Ctx, tag: Tag, picks: Partial<Record<MinisterRole, number>>): void {
  const c = ctx.s.countries[tag];
  if (!c) return;
  const round = (c.ministerRound ?? 0) + 1;
  const ministers = {} as NonNullable<typeof c.ministers>;
  for (const role of MINISTER_ROLES) {
    const cands = ministerCandidates(tag, role, round);
    ministers[role] = cands[Math.max(0, Math.min(2, picks[role] ?? 0))];
  }
  c.ministers = ministers;
  c.ministerRound = round;
  c.ministerNext = ctx.s.day + Math.round(MINISTER_TERM_YEARS * 365.25);
}

/** Her tur: yapay zekâ ülkelerine atama yapar; oyuncu geç kalırsa 60 gün sonra otomatik atanır */
export function ministerTick(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!ministersDue(ctx, c.tag)) continue;
    if (!c.isPlayer) {
      const h = hashString(`${c.tag}|pick|${(c.ministerRound ?? 0) + 1}`);
      const picks: Partial<Record<MinisterRole, number>> = {};
      MINISTER_ROLES.forEach((r, i) => (picks[r] = Math.floor(seededValue(h + i * 17) * 3)));
      appointMinisters(ctx, c.tag, picks);
    } else if (c.ministers && s.day - (c.ministerNext ?? 0) > 60) {
      appointMinisters(ctx, c.tag, {});
    }
  }
}

/** Atanmış bakanların toplam etkisi */
export function ministerMods(c: { ministers?: Partial<Record<MinisterRole, Minister>> }): Partial<Modifiers>[] {
  const out: Partial<Modifiers>[] = [];
  if (!c.ministers) return out;
  for (const role of MINISTER_ROLES) {
    const m = c.ministers[role];
    const tr = m ? traitOf(role, m.trait) : undefined;
    if (tr) out.push(tr.plus, tr.minus);
  }
  return out;
}

export function ministerKey(c: { ministers?: Partial<Record<MinisterRole, Minister>> }): string {
  return c.ministers ? MINISTER_ROLES.map((r) => c.ministers![r]?.trait ?? '-').join(',') : '';
}

export type { Day };
