/**
 * Oyun motoru: yeni oyun kurulumu ve tur ilerletme.
 *
 * Tur sırası (her tur `rules.timeStep` kadar gün):
 *   1. Ordu hareketleri          6. İnşaat, asker toplama, araştırma
 *   2. Muharebe ve kuşatmalar    7. Yapay zekâ kararları
 *   3. Ekonomi ve bütçe          8. Olaylar, istikrar, isyanlar ve bildirimler
 *   4. Nüfus, insan gücü, ikmal  9. Zafer/yenilgi koşulları
 *   5. Diplomatik süreler        10. Tarih ve tur sayacı
 */
import type { Country, Difficulty, GameRules, GameState, PolicyId, Tag, TimeStep, VictoryRules } from './types';
import { POLICY_IDS, RESOURCE_IDS } from './types';
import type { World } from './world';
import { makeCtx, invalidateAll, invalidateDiplomacy, provincesOf, type Ctx } from './ctx';
import { getScenario } from './scenarios';
import { parseDate, stepDays, monthsCrossed, dateFromDay } from './calendar';
import { POLICY_DEFS } from './defs/policies';
import { TECHS } from './defs/techs';
import { computeAllBudgets, economyTick, emptyBudget, emptyResources, provinceResourceOutput } from './economy';
import { maxManpower, populationTick } from './population';
import { createArmy, constructionTick, researchTick } from './construction';
import { movementTick, supplyTick } from './movement';
import { battleTick, detectBattles, engageAt } from './combat';
import { siegeTick } from './siege';
import { checkEliminations, treatyTick, warTick } from './war';
import { relationTick, baselineRelation } from './diplomacy';
import { stabilityTick, rebellionTick } from './stability';
import { eventsTick } from './events';
import { victoryTick } from './victory';
import { aiTick } from './ai';
import { REBEL_TAG, armySoldiers, atWar, hostileArmies, setRelation, relation } from './query';
import { armiesAt } from './ctx';
import { notify } from './notify';
import { BAL } from './balance';
import { fortLevel } from './query';

export const SAVE_VERSION = 1;

export interface NewGameOptions {
  scenarioId: string;
  player: Tag;
  difficulty: Difficulty;
  timeStep: TimeStep;
  victory: VictoryRules;
  seed?: number;
  rules?: Partial<GameRules>;
}

export function defaultRules(diff: Difficulty = 'normal'): GameRules {
  return {
    difficulty: diff,
    timeStep: 'day',
    victory: { mode: 'sandbox', target: 0 },
    capitalLoss: 'relocate',
    continueAfterDefeat: true,
    rebellions: true,
    historicalEvents: true,
    aiAggression: 1,
    fogOfWar: false,
  };
}

function newCountry(tag: Tag, name: string, nameEn: string, flag: string, color: [number, number, number]): Country {
  const policies = {} as Record<PolicyId, number>;
  for (const id of POLICY_IDS) policies[id] = POLICY_DEFS[id].default;
  return {
    tag,
    name,
    nameEn,
    flag,
    color,
    government: 'republic',
    alive: true,
    isPlayer: false,
    capital: -1,
    treasury: 0,
    manpower: 0,
    stability: 60,
    warExhaustion: 0,
    reputation: 0,
    policies,
    techs: [],
    research: { current: null, progress: 0 },
    claims: [],
    resources: emptyResources(),
    budget: emptyBudget(),
    monthSpend: { construction: 0, recruitment: 0, diplomacy: 0 },
    tempMods: [],
    ai: {
      aggression: 0.2,
      caution: 0.5,
      diplomacy: 0.5,
      nextThink: 0,
      nextDiplo: 0,
      rival: null,
      warTarget: null,
      lastWarDecl: -1e9,
      focus: 'balanced',
      cooldowns: {},
    },
    bankruptUntil: -1e9,
    stats: { battlesWon: 0, battlesLost: 0, casualties: 0, kills: 0, provincesConquered: 0 },
    recognizedBy: [],
    wealth: 0,
    rebelMovement: false,
  };
}

export function createGame(world: World, opts: NewGameOptions): Ctx {
  const info = getScenario(opts.scenarioId);
  if (!info || !info.available || !info.build) throw new Error(`Senaryo kullanılamıyor: ${opts.scenarioId}`);
  const setup = info.build(world);
  const P = world.P;
  if (setup.owner.length !== P) throw new Error('Senaryo bölge sayısı dünya verisiyle uyuşmuyor');
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const rules: GameRules = {
    ...defaultRules(opts.difficulty),
    ...opts.rules,
    difficulty: opts.difficulty,
    timeStep: opts.timeStep,
    victory: opts.victory,
  };
  let totalOut = 0;
  let totalPop = 0;
  for (let p = 0; p < P; p++) {
    totalOut += setup.output[p];
    totalPop += setup.pop[p];
  }
  const day = parseDate(info.startDate);
  const s: GameState = {
    saveVersion: SAVE_VERSION,
    meta: {
      scenarioId: info.id,
      scenarioName: info.name.tr,
      startDay: day,
      seed,
      createdAt: Date.now(),
      refGdpPc: totalOut / Math.max(1, totalPop),
      avgProvinceOutput: totalOut / P,
      popScale: setup.popScale,
      foodK: 1,
      resourceK: 1,
      era: setup.era,
      worldVersion: world.data.version,
      playerStartProvinces: 0,
    },
    rules,
    player: opts.player,
    day,
    turn: 0,
    rng: seed,
    nextId: 1,
    countries: {},
    provinces: [],
    armies: {},
    battles: {},
    battleReports: [],
    wars: {},
    treaties: [],
    alliances: {},
    relations: {},
    proposals: [],
    peaceOffers: [],
    pendingEvents: [],
    firedEvents: {},
    notifications: [],
    nextNotificationId: 1,
    versions: { owners: 1, armies: 1 },
    gameOver: null,
    history: [],
  };
  for (let p = 0; p < P; p++) {
    const owner = setup.owner[p];
    const colonial = !!setup.colonial?.[p];
    const cores = [...(colonial ? [] : [owner]), ...(setup.extraCores?.[p] ?? [])].filter((t, i, arr) => arr.indexOf(t) === i);
    s.provinces.push({
      owner,
      controller: owner,
      cores,
      pop: setup.pop[p],
      output: setup.output[p],
      buildings: setup.buildings[p].slice(),
      construction: null,
      recruits: [],
      unrest: 0,
      siege: null,
      // Sömürgeler başlangıçtan itibaren çekirdek entegrasyon süresini bekler
      changedDay: colonial ? day : day - 365 * 50,
    });
  }
  // Ülkeler
  for (const def of setup.countries) {
    const c = newCountry(def.tag, def.name, def.nameEn, def.flag, def.color);
    c.government = def.government;
    c.techs = TECHS.filter((t) => t.year <= def.techYear).map((t) => t.id).concat(def.extraTechs ?? []);
    for (const [k, v] of Object.entries(def.policies ?? {})) c.policies[k as PolicyId] = v as number;
    c.capital = setup.capitals[def.tag] ?? -1;
    c.alive = !def.inactive;
    c.claims = def.claims?.slice() ?? [];
    c.ai.aggression = def.aggression ?? 0.2;
    c.ai.focus = def.focus ?? 'balanced';
    c.ai.nextThink = day + (def.tag.charCodeAt(0) + def.tag.charCodeAt(1)) % 7;
    c.ai.nextDiplo = day + 10 + ((def.tag.charCodeAt(1) * 3 + def.tag.charCodeAt(2)) % 30);
    s.countries[def.tag] = c;
  }
  s.countries[REBEL_TAG] = newCountry(REBEL_TAG, 'İsyancılar', 'Rebels', 'x-rebels', [60, 60, 60]);
  if (!s.countries[opts.player]?.alive) throw new Error(`Oyuncu ülkesi bulunamadı: ${opts.player}`);
  s.countries[opts.player].isPlayer = true;

  const ctx = makeCtx(world, s);
  // Servet ve ölçekler
  // Kişi başı servet çekirdek bölgelerden hesaplanır (sömürge nüfusu ortalamayı düşürmez)
  const outBy = new Map<Tag, number>();
  const popBy = new Map<Tag, number>();
  s.provinces.forEach((ps) => {
    if (!ps.cores.includes(ps.owner)) return;
    outBy.set(ps.owner, (outBy.get(ps.owner) ?? 0) + ps.output);
    popBy.set(ps.owner, (popBy.get(ps.owner) ?? 0) + ps.pop);
  });
  for (const c of Object.values(s.countries)) c.wealth = (outBy.get(c.tag) ?? 0) / Math.max(1, popBy.get(c.tag) ?? 1) || s.meta.refGdpPc;

  // Ordular
  for (const def of setup.countries) {
    for (const a of def.armies ?? []) createArmy(ctx, def.tag, a.province, a.units, { morale: 1, experience: 0.15, name: a.name });
  }
  // İttifaklar ve anlaşmalar
  for (const al of setup.alliances) {
    const id = `a${s.nextId++}`;
    s.alliances[id] = { id, name: al.name, leader: al.leader, members: al.members.slice(), founded: day - 365 };
  }
  for (const t of setup.treaties) {
    if (!s.countries[t.a] || !s.countries[t.b] || t.a === t.b) continue;
    s.treaties.push({ id: `t${s.nextId++}`, type: t.type, a: t.a, b: t.b, start: day - 365, end: t.years ? day + Math.round(t.years * 365.25) : null });
  }
  for (const wdef of setup.wars) {
    const id = `w${s.nextId++}`;
    s.wars[id] = {
      id,
      name: wdef.name ?? `${s.countries[wdef.attackers[0]]?.name}–${s.countries[wdef.defenders[0]]?.name}`,
      attackers: wdef.attackers.slice(),
      defenders: wdef.defenders.slice(),
      attackerLeader: wdef.attackers[0],
      defenderLeader: wdef.defenders[0],
      startDay: day,
      goal: wdef.goal,
      score: 0,
      battleScore: 0,
      losses: { attackers: 0, defenders: 0 },
    };
  }
  invalidateDiplomacy(ctx);
  // İlişkiler: temel değer + senaryo ayarı
  const alive = Object.values(s.countries).filter((c) => c.alive && c.tag !== REBEL_TAG);
  const extra = new Map<string, number>();
  for (const [a, b, v] of setup.relations) extra.set(a < b ? `${a}|${b}` : `${b}|${a}`, v);
  const pairKeys = new Set<string>(extra.keys());
  for (const t of s.treaties) pairKeys.add(t.a < t.b ? `${t.a}|${t.b}` : `${t.b}|${t.a}`);
  for (const c of alive) for (const n of neighborTags(ctx, c.tag)) pairKeys.add(c.tag < n ? `${c.tag}|${n}` : `${n}|${c.tag}`);
  for (const al of Object.values(s.alliances)) for (const a of al.members) for (const b of al.members) if (a < b) pairKeys.add(`${a}|${b}`);
  for (const k of pairKeys) {
    const [a, b] = k.split('|');
    if (!s.countries[a]?.alive || !s.countries[b]?.alive) continue;
    const base = baselineRelation(ctx, a, b);
    const ov = extra.get(k);
    setRelation(s, a, b, ov !== undefined ? ov : base);
  }

  // Kaynak katsayıları: dünya üretimi tüketimi biraz aşacak şekilde dengelenir
  calibrateResources(ctx);
  computeAllBudgets(ctx);
  for (const def of setup.countries) {
    const c = s.countries[def.tag];
    if (!c.alive) continue;
    c.treasury = Math.max(0, c.budget.income) * (def.treasuryMonths ?? 3);
    c.manpower = maxManpower(ctx, c.tag) * 0.7;
    for (const k of RESOURCE_IDS) c.resources.stock[k] = c.resources.consumption[k] * 6;
  }
  computeAllBudgets(ctx);
  s.meta.playerStartProvinces = provincesOf(ctx, opts.player).length;
  recordHistory(ctx);
  notify(ctx, 'system', 'notif.gameStarted', { country: s.countries[opts.player].name }, { involves: [opts.player], severity: 'info' });
  return ctx;
}

function neighborTags(ctx: Ctx, tag: Tag): Tag[] {
  const out = new Set<Tag>();
  for (const p of provincesOf(ctx, tag)) for (const j of ctx.w.data.provinces[p].adj) if (ctx.s.provinces[j].owner !== tag) out.add(ctx.s.provinces[j].owner);
  return [...out];
}

function calibrateResources(ctx: Ctx): void {
  const s = ctx.s;
  s.meta.foodK = 1;
  s.meta.resourceK = 1;
  const prod = { food: 0, iron: 0, coal: 0, timber: 0 };
  for (let p = 0; p < ctx.w.P; p++) {
    const r = provinceResourceOutput(ctx, p);
    for (const k of RESOURCE_IDS) prod[k] += r[k];
  }
  let popTotal = 0;
  let ind = 0;
  let other = 0;
  for (const ps of s.provinces) {
    popTotal += ps.pop;
    ind += ps.buildings[1];
    other += ps.buildings.reduce((a, b) => a + b, 0) - ps.buildings[1];
  }
  let soldiers = 0;
  for (const a of Object.values(s.armies)) soldiers += armySoldiers(a);
  const foodCons = popTotal / 1e6 + soldiers / 5e5;
  s.meta.foodK = prod.food > 0 ? (foodCons * 1.06) / prod.food : 1;
  const ironCons = ind * 0.8 + 20;
  const coalCons = ind * (s.meta.era === 'medieval' ? 0.15 : s.meta.era === 'napoleonic' ? 0.4 : 0.8) + 20;
  const timberCons = other * 0.04 + 20;
  const k1 = prod.iron > 0 ? (ironCons * 1.15) / prod.iron : 1;
  const k2 = prod.coal > 0 ? (coalCons * 1.15) / prod.coal : 1;
  const k3 = prod.timber > 0 ? (timberCons * 1.3) / prod.timber : 1;
  s.meta.resourceK = Math.max(0.05, (k1 + k2 + k3) / 3);
}

function recordHistory(ctx: Ctx): void {
  const s = ctx.s;
  const c = s.countries[s.player];
  if (!c) return;
  s.history.push({ day: s.day, treasury: c.treasury, income: c.budget.income, provinces: provincesOf(ctx, s.player).length });
  if (s.history.length > 240) s.history.shift();
}

/** Bir ordunun bir düğüme varışı: muharebe, deniz kesişmesi ve kale bölgesi kontrolü */
function onArrive(ctx: Ctx, a: import('./types').Army, node: number): boolean {
  const { w, s } = ctx;
  const here = armiesAt(ctx, node);
  const sameKind = here.filter((x) => x !== a && x.isNavy === a.isNavy);
  if (node >= w.P && !a.isNavy) {
    // Deniz nakliyesi: düşman donanması varsa ve dost donanma zayıfsa kayıp
    let hostile = 0;
    let friendly = 0;
    for (const x of here) {
      if (!x.isNavy) continue;
      if (hostileArmies(ctx, a, x)) hostile += x.units.navy;
      else if (x.owner === a.owner) friendly += x.units.navy;
    }
    if (hostile > friendly) {
      for (const k of Object.keys(a.units) as (keyof typeof a.units)[]) a.units[k] = Math.floor(a.units[k] * 0.75);
      a.morale = Math.max(0.1, a.morale - 0.3);
      notify(ctx, 'battle', 'notif.intercepted', { army: a.name }, { severity: 'bad', involves: [a.owner], focus: { army: a.id } });
    }
    return false;
  }
  if (sameKind.some((x) => hostileArmies(ctx, a, x)) || Object.values(s.battles).some((b) => b.location === node)) {
    const b = engageAt(ctx, node, a);
    if (b) return true;
  }
  if (!a.isNavy && node < w.P && a.path.length) {
    const ps = s.provinces[node];
    if (ps.controller !== a.owner && atWar(ctx, a.owner, ps.controller) && fortLevel(ctx, node) > 0) {
      a.path = [];
      return true;
    }
  }
  return false;
}

/** Tek bir tur işle. Aynı tur iki kez işlenemez: tur sayacı sonunda artar. */
export function advanceTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver && !s.gameOver.acknowledged) return;
  const dt = stepDays(s.day, s.rules.timeStep);
  const newDay = s.day + dt;
  const monthChanged = monthsCrossed(s.day, newDay) > 0;
  const startTurn = s.turn;

  // 1. Ordu hareketleri
  movementTick(ctx, dt, { onArrive });
  // 2. Muharebe ve kuşatma
  detectBattles(ctx);
  battleTick(ctx, dt);
  siegeTick(ctx, dt);
  // 3. Ekonomi
  economyTick(ctx, dt, monthChanged);
  // 4. Nüfus, insan gücü, ikmal ve yıpranma
  populationTick(ctx, dt, monthChanged);
  supplyTick(ctx, dt);
  // 5. Diplomatik süreler
  treatyTick(ctx);
  warTick(ctx, dt, monthChanged);
  s.proposals = s.proposals.filter((p) => p.expires > newDay);
  s.peaceOffers = s.peaceOffers.filter((p) => p.expires > newDay && s.wars[p.warId]);
  if (monthChanged) relationTick(ctx);
  // 6. İnşaat, asker toplama, araştırma
  constructionTick(ctx, dt);
  researchTick(ctx, dt);
  // 7. Yapay zekâ
  aiTick(ctx, newDay);
  // 8. Olaylar, istikrar, isyanlar
  if (monthChanged) {
    stabilityTick(ctx);
    rebellionTick(ctx);
  }
  eventsTick(ctx, newDay, monthChanged);
  checkEliminations(ctx);
  // 9. Zafer / yenilgi
  victoryTick(ctx);
  // 10. Tarih ve tur
  if (s.turn !== startTurn) throw new Error('Tur iki kez işlendi');
  s.day = newDay;
  s.turn = startTurn + 1;
  if (monthChanged) {
    recordHistory(ctx);
    if (dateFromDay(newDay).m === 1) computeAllBudgets(ctx);
  }
}

/** Oyuncu ülkesini değiştir (yenilgiden sonra devam) */
export function switchPlayer(ctx: Ctx, tag: Tag): boolean {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c?.alive || tag === REBEL_TAG || c.rebelMovement) return false;
  const prev = s.countries[s.player];
  if (prev) prev.isPlayer = false;
  c.isPlayer = true;
  s.player = tag;
  s.gameOver = null;
  s.meta.playerStartProvinces = provincesOf(ctx, tag).length;
  // Oyuncuya yöneltilmiş eski teklifler geçersiz
  s.proposals = [];
  s.peaceOffers = [];
  s.pendingEvents = [];
  invalidateAll(ctx);
  return true;
}

/** Tahmini sonraki tur olayları (arayüz için) */
export function upcoming(ctx: Ctx): { kind: string; key: string; params: Record<string, string | number>; days: number }[] {
  const s = ctx.s;
  const out: { kind: string; key: string; params: Record<string, string | number>; days: number }[] = [];
  const tag = s.player;
  const horizon = Math.max(7, stepDays(s.day, s.rules.timeStep));
  for (let p = 0; p < ctx.w.P; p++) {
    const ps = s.provinces[p];
    if (ps.owner !== tag) continue;
    if (ps.construction && ps.construction.daysLeft <= horizon) out.push({ kind: 'construction', key: 'upcoming.construction', params: { building: ps.construction.building, province: ctx.w.data.provinces[p].name }, days: Math.ceil(ps.construction.daysLeft) });
    for (const r of ps.recruits) if (r.daysLeft <= horizon) out.push({ kind: 'recruit', key: 'upcoming.recruit', params: { unit: r.unit, amount: r.amount, province: ctx.w.data.provinces[p].name }, days: Math.ceil(r.daysLeft) });
    if (ps.siege && ps.siege.by !== tag) out.push({ kind: 'siege', key: 'upcoming.underSiege', params: { province: ctx.w.data.provinces[p].name, progress: Math.round(ps.siege.progress * 100) }, days: 0 });
  }
  for (const a of Object.values(s.armies)) {
    if (a.owner !== tag || !a.path.length) continue;
    out.push({ kind: 'move', key: 'upcoming.arrival', params: { army: a.name, target: a.path[a.path.length - 1] < ctx.w.P ? ctx.w.data.provinces[a.path[a.path.length - 1]].name : '—' }, days: 0 });
  }
  const c = s.countries[tag];
  if (c?.research.current) out.push({ kind: 'research', key: 'upcoming.research', params: { tech: c.research.current }, days: 0 });
  return out.slice(0, 20);
}

export { BAL, relation, invalidateAll };
