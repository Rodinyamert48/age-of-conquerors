/**
 * Oyun durumunun ve statik dünya verisinin tipleri.
 * GameState tamamen JSON ile serileştirilebilir olmalıdır (kayıt sistemi bunu kullanır).
 */

export type Tag = string;
export type Day = number; // takvim günü (calendar.ts: epoch'tan bu yana gün)

export type Terrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'desert' | 'tundra' | 'jungle' | 'marsh';

export type ResourceId = 'food' | 'iron' | 'coal' | 'timber';
export const RESOURCE_IDS: ResourceId[] = ['food', 'iron', 'coal', 'timber'];

export type UnitType = 'infantry' | 'light' | 'cavalry' | 'artillery' | 'siege' | 'armor' | 'air' | 'navy';
export const LAND_UNIT_TYPES: UnitType[] = ['infantry', 'light', 'cavalry', 'artillery', 'siege', 'armor', 'air'];

export type BuildingId = 'agriculture' | 'industry' | 'trade' | 'port' | 'road' | 'university' | 'military' | 'fort';
export const BUILDING_IDS: BuildingId[] = ['agriculture', 'industry', 'trade', 'port', 'road', 'university', 'military', 'fort'];

export type PolicyId = 'tax' | 'military' | 'infrastructure' | 'education' | 'security' | 'welfare' | 'development';
export const POLICY_IDS: PolicyId[] = ['tax', 'military', 'infrastructure', 'education', 'security', 'welfare', 'development'];

export type GovernmentType =
  | 'republic'
  | 'constitutional_monarchy'
  | 'absolute_monarchy'
  | 'one_party'
  | 'theocracy'
  | 'military_junta'
  | 'fascist'
  | 'tribal';

export type TimeStep = 'day' | 'week' | 'month';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type MapMode = 'political' | 'economic' | 'diplomatic' | 'military' | 'stability' | 'supply' | 'terrain';

// ---------------------------------------------------------------------------
// Statik dünya (public/data/world.json)
// ---------------------------------------------------------------------------
export interface WorldCity {
  name: string;
  nameEn: string;
  x: number;
  y: number;
  pop: number;
  capital: boolean;
  hist: Record<string, number>;
}

export interface WorldProvince {
  id: string;
  name: string;
  nameEn: string;
  a3: string;
  x: number;
  y: number;
  lon: number;
  lat: number;
  area: number;
  pop: number;
  urban: number;
  terrain: Terrain;
  coastal: boolean;
  /** kaynak potansiyelleri: [yiyecek, demir, kömür, kereste] 0..3 */
  res: [number, number, number, number];
  city: WorldCity | null;
  adj: number[];
  cross: number[];
  sea: number[];
}

export interface WorldSeaNode {
  x: number;
  y: number;
  lon: number;
  lat: number;
  adj: number[];
}

export interface WorldStrait {
  a: number;
  b: number;
  name: string;
  control: number;
}

export interface WorldData {
  version: number;
  source: string;
  width: number;
  height: number;
  provinces: WorldProvince[];
  sea: WorldSeaNode[];
  straits: WorldStrait[];
}

export interface GeoData {
  version: number;
  width: number;
  height: number;
  scale: number;
  arcs: number[][];
  arcSides: [number, number][];
  provinces: number[][][][];
  rivers: { r: number; d: number[] }[];
  lakes: number[][];
}

// ---------------------------------------------------------------------------
// Dinamik durum
// ---------------------------------------------------------------------------
export interface Modifiers {
  taxEfficiency: number;
  tradeIncome: number;
  productionIncome: number;
  popGrowth: number;
  foodOutput: number;
  resourceOutput: number;
  buildCost: number;
  buildTime: number;
  moveSpeed: number;
  supply: number;
  attrition: number;
  recruitTime: number;
  recruitCost: number;
  upkeep: number;
  manpower: number;
  infantryPower: number;
  lightPower: number;
  cavalryPower: number;
  artilleryPower: number;
  siegePower: number;
  armorPower: number;
  airPower: number;
  navalPower: number;
  fortDefense: number;
  siegeSpeed: number;
  morale: number;
  moraleRecovery: number;
  stability: number;
  unrest: number;
  relationGain: number;
  acceptance: number;
  researchSpeed: number;
  warExhaustion: number;
  development: number;
}

export interface TempModifier {
  id: string;
  /** i18n anahtarı veya serbest metin */
  label: string;
  until: Day;
  mods: Partial<Modifiers>;
}

export interface Budget {
  // aylık değerler (para birimi)
  tax: number;
  trade: number;
  production: number;
  exports: number;
  tributeIn: number;
  reparationsIn: number;
  armyUpkeep: number;
  navyUpkeep: number;
  fortUpkeep: number;
  construction: number;
  recruitment: number;
  diplomacy: number;
  war: number;
  policies: number;
  imports: number;
  interest: number;
  tributeOut: number;
  reparationsOut: number;
  income: number;
  expenses: number;
  balance: number;
}

export interface ResourceLedger {
  stock: Record<ResourceId, number>;
  production: Record<ResourceId, number>;
  consumption: Record<ResourceId, number>;
  /** son ayın ithalat/ihracat miktarı */
  imported: Record<ResourceId, number>;
  exported: Record<ResourceId, number>;
  shortage: Record<ResourceId, boolean>;
}

export interface AIState {
  aggression: number; // 0..1
  caution: number; // 0..1
  diplomacy: number; // 0..1 (ittifak/anlaşma eğilimi)
  nextThink: Day;
  nextDiplo: Day;
  rival: Tag | null;
  warTarget: Tag | null;
  lastWarDecl: Day;
  focus: 'balanced' | 'economy' | 'military';
  /** Aynı hedefi tekrar tekrar reddedilen teklifler için bekleme */
  cooldowns: Record<string, Day>;
}

export interface Country {
  tag: Tag;
  name: string;
  nameEn: string;
  /** Bayrak kimliği: ISO alpha-2 (flag-icons) veya özel bayrak anahtarı */
  flag: string;
  color: [number, number, number];
  government: GovernmentType;
  alive: boolean;
  /** Oyuncunun ya da yapay zekânın yönetimi */
  isPlayer: boolean;
  capital: number;
  treasury: number;
  manpower: number;
  stability: number;
  warExhaustion: number;
  reputation: number;
  policies: Record<PolicyId, number>;
  /** Araştırılmış teknolojiler */
  techs: string[];
  research: { current: string | null; progress: number };
  /** Toprak talepleri (bölge indeksleri) */
  claims: number[];
  resources: ResourceLedger;
  budget: Budget;
  /** Ay içinde biriken tek seferlik harcamalar (bütçe kalemlerine yansır) */
  monthSpend: { construction: number; recruitment: number; diplomacy: number };
  tempMods: TempModifier[];
  ai: AIState;
  /** Ülkenin başlangıçtaki/yeniden doğuştaki çekirdek bölgesi sayısı (bağımsızlık için) */
  bankruptUntil: Day;
  /** İstatistikler */
  stats: { battlesWon: number; battlesLost: number; casualties: number; kills: number; provincesConquered: number };
  /** Bağımsızlığını tanıyan ülkeler (isyanla kurulan devletler için) */
  recognizedBy: Tag[];
  /** Senaryo verisi: ilk GSYH/kişi başı gelir ölçeği */
  wealth: number;
  /** Bu ülke isyan hareketi olarak var (henüz toprağı yok) */
  rebelMovement: boolean;
}

export interface ConstructionJob {
  building: BuildingId;
  level: number;
  daysLeft: number;
  totalDays: number;
}

export interface RecruitJob {
  unit: UnitType;
  amount: number;
  daysLeft: number;
  totalDays: number;
  owner: Tag;
}

export interface SiegeState {
  by: Tag;
  progress: number; // 0..1
  days: number;
}

export interface ProvinceState {
  owner: Tag;
  controller: Tag;
  cores: Tag[];
  pop: number;
  /** yıllık ekonomik üretim (para birimi) */
  output: number;
  buildings: number[]; // BUILDING_IDS sırasında seviyeler
  construction: ConstructionJob | null;
  recruits: RecruitJob[];
  unrest: number;
  siege: SiegeState | null;
  /** son el değiştirme günü */
  changedDay: Day;
}

export interface ArmyUnits {
  infantry: number;
  light: number;
  cavalry: number;
  artillery: number;
  siege: number;
  armor: number;
  air: number;
  navy: number;
}

export interface Army {
  id: string;
  owner: Tag;
  name: string;
  /** düğüm: 0..P-1 bölge, P.. deniz düğümü */
  location: number;
  units: ArmyUnits;
  morale: number; // 0..1
  experience: number; // 0..1
  /** kalan rota (ilk eleman bir sonraki düğüm) */
  path: number[];
  progress: number; // km
  battle: string | null;
  isNavy: boolean;
  /** isyancı ordusu: hangi ülkeye karşı */
  rebelAgainst: Tag | null;
  /** AI hedef bilgisi */
  aiTarget: number | null;
  createdDay: Day;
  /** Son ikmal durumu (0..1) */
  supply: number;
}

export interface BattleSideSnapshot {
  tag: Tag;
  armies: string[];
  start: number;
  strength: number;
  morale: number;
  units: ArmyUnits;
  losses: number;
}

export interface Battle {
  id: string;
  location: number;
  naval: boolean;
  startDay: Day;
  days: number;
  attacker: BattleSideSnapshot;
  defender: BattleSideSnapshot;
  terrain: Terrain | 'sea';
  fort: number;
  log: { day: Day; attLoss: number; defLoss: number; attMorale: number; defMorale: number }[];
}

export interface BattleReport {
  id: string;
  location: number;
  naval: boolean;
  startDay: Day;
  endDay: Day;
  attacker: BattleSideSnapshot;
  defender: BattleSideSnapshot;
  winner: 'attacker' | 'defender';
  terrain: Terrain | 'sea';
  fort: number;
}

export type WarGoal =
  | { type: 'conquest' }
  | { type: 'claim'; provinces: number[] }
  | { type: 'independence'; nation: Tag }
  | { type: 'rebellion' }
  | { type: 'scenario'; id: string };

export interface War {
  id: string;
  name: string;
  attackers: Tag[];
  defenders: Tag[];
  attackerLeader: Tag;
  defenderLeader: Tag;
  startDay: Day;
  goal: WarGoal;
  /** savaş skoru: + saldıran lehine (-100..100) */
  score: number;
  battleScore: number;
  /** Muharebe kayıpları (taraf başına) */
  losses: { attackers: number; defenders: number };
}

export type TreatyType =
  | 'nap'
  | 'defensive'
  | 'trade'
  | 'access'
  | 'vassal'
  | 'truce'
  | 'reparations';

export interface Treaty {
  id: string;
  type: TreatyType;
  /** vassal: a=efendi b=bağlı; access: a=izin veren b=alan; reparations: a=ödeyen b=alan */
  a: Tag;
  b: Tag;
  start: Day;
  end: Day | null;
  amount?: number;
}

export interface Alliance {
  id: string;
  name: string;
  leader: Tag;
  members: Tag[];
  founded: Day;
}

export type DiploActionType =
  | 'improve'
  | 'worsen'
  | 'nap'
  | 'alliance'
  | 'defensive'
  | 'trade'
  | 'access'
  | 'normalize'
  | 'vassalize'
  | 'recognize'
  | 'claim'
  | 'cedeProvince'
  | 'requestProvince'
  | 'annexVassal'
  | 'releaseVassal'
  | 'breakTreaty'
  | 'leaveAlliance'
  | 'callToArms';

export interface DiploProposal {
  id: string;
  from: Tag;
  to: Tag;
  type: DiploActionType;
  province?: number;
  warId?: string;
  day: Day;
  expires: Day;
}

export type PeaceTerm =
  | { type: 'province'; province: number }
  | { type: 'reparations'; amount: number; months: number }
  | { type: 'release'; nation: Tag }
  | { type: 'vassalize' }
  | { type: 'annex' };

export interface PeaceOffer {
  id: string;
  warId: string;
  from: Tag;
  to: Tag;
  /** Talepleri alan taraf: 'from' (teklif eden kazanır) veya 'to' */
  beneficiary: Tag;
  terms: PeaceTerm[];
  day: Day;
  expires: Day;
}

export type NotificationKind =
  | 'war'
  | 'peace'
  | 'battle'
  | 'province'
  | 'treaty'
  | 'construction'
  | 'recruit'
  | 'economy'
  | 'rebellion'
  | 'research'
  | 'event'
  | 'diplomacy'
  | 'system';

export interface GameNotification {
  id: number;
  day: Day;
  kind: NotificationKind;
  /** i18n anahtarı */
  key: string;
  params: Record<string, string | number>;
  severity: 'info' | 'good' | 'bad' | 'critical';
  /** ilgili bölge/ordu/savaş kimliği */
  focus?: { province?: number; army?: string; war?: string; battle?: string; country?: Tag };
  /** oyuncuyu ilgilendiriyor mu */
  player: boolean;
}

export interface PendingEvent {
  uid: string;
  eventId: string;
  country: Tag;
  day: Day;
  expires: Day;
  /** olaya bağlı hedef (ör. komşu ülke) */
  target?: Tag;
  province?: number;
}

export interface VictoryRules {
  mode: 'sandbox' | 'domination' | 'provinces' | 'economic' | 'alliance' | 'scenario';
  /** domination: dünya bölgelerinin yüzdesi; provinces: bölge sayısı; economic: dünya ekonomisi payı */
  target: number;
}

export interface GameRules {
  difficulty: Difficulty;
  timeStep: TimeStep;
  victory: VictoryRules;
  /** başkent düşünce ne olur */
  capitalLoss: 'relocate' | 'capitulate';
  /** son bölge kaybedilince başka ülkeyle devam etmeye izin ver */
  continueAfterDefeat: boolean;
  /** isyanlar açık mı */
  rebellions: boolean;
  /** tarihî olaylar açık mı */
  historicalEvents: boolean;
  /** yapay zekâ saldırganlık çarpanı */
  aiAggression: number;
  /** savaş sisi: yabancı ordu detaylarını gizle (yalnızca görsel) */
  fogOfWar: boolean;
}

export interface GameMeta {
  scenarioId: string;
  scenarioName: string;
  startDay: Day;
  seed: number;
  createdAt: number;
  /** dünya ortalaması kişi başı yıllık üretim (para birimi / kişi) */
  refGdpPc: number;
  /** ortalama bölge yıllık üretimi */
  avgProvinceOutput: number;
  /** dönem nüfus ölçeği (bina eşikleri için) */
  popScale: number;
  /** yiyecek üretim katsayısı (başlangıçta dengelenir) */
  foodK: number;
  resourceK: number;
  era: Era;
  worldVersion: number;
  /** oyuncunun başlangıçtaki bölge sayısı (senaryo hedefleri için) */
  playerStartProvinces: number;
}

export type Era = 'medieval' | 'napoleonic' | 'industrial' | 'interwar' | 'modern';

export interface GameState {
  saveVersion: number;
  meta: GameMeta;
  rules: GameRules;
  player: Tag;
  day: Day;
  turn: number;
  rng: number;
  nextId: number;
  countries: Record<Tag, Country>;
  provinces: ProvinceState[];
  armies: Record<string, Army>;
  battles: Record<string, Battle>;
  battleReports: BattleReport[];
  wars: Record<string, War>;
  treaties: Treaty[];
  alliances: Record<string, Alliance>;
  /** 'AAA|BBB' (alfabetik) → -100..100 */
  relations: Record<string, number>;
  proposals: DiploProposal[];
  peaceOffers: PeaceOffer[];
  pendingEvents: PendingEvent[];
  /** olay kimliği → son tetiklenme günü (ülke bazlı: 'EVT|TAG') */
  firedEvents: Record<string, Day>;
  notifications: GameNotification[];
  nextNotificationId: number;
  /** Harita yeniden çizimi için sayaçlar */
  versions: { owners: number; armies: number };
  gameOver: null | { result: 'victory' | 'defeat'; reason: string; day: Day; acknowledged: boolean };
  /** Her ülke için son ekonomik kayıtlar (grafik için) */
  history: { day: Day; treasury: number; income: number; provinces: number }[];
}

export interface CommandResult {
  ok: boolean;
  /** i18n anahtarı */
  error?: string;
  errorParams?: Record<string, string | number>;
  /** komuta özgü veri (ör. diplomatik yanıt) */
  data?: unknown;
}
