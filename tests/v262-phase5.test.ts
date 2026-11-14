import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { getMods, invalidateDiplomacy, provincesOf } from '@/game/ctx';
import { bondRate, debtOf, financeTick, marketTick, rankPowers } from '@/game/finance';
import { IDEOLOGIES } from '@/game/defs/ideologies';
import { MEGA_PROJECTS } from '@/game/defs/projects';
import { UNIONS } from '@/game/defs/unions';
import { canFormUnion, cultureOf, religionOf } from '@/game/society';
import { transferProvince, declareWar } from '@/game/war';
import { generalMods, generalsAfterBattle } from '@/game/generals';
import { toSim } from '@/game/combat';
import { tally, vetoPowers } from '@/game/un';
import { evaluateProposal } from '@/game/diplomacy';
import { relation } from '@/game/query';
import { deserialize } from '@/game/save';

const rich = (ctx: ReturnType<typeof newModernGame>, tag = ctx.s.player) => (ctx.s.countries[tag].treasury = 1e13);

describe('26.2 Faz 5 — nötr başlangıç', () => {
  it('ilişkiler 0, ittifak ve pakt yok; ticaret anlaşmaları kalır', () => {
    const ctx = newModernGame({ rules: { neutralStart: true } });
    expect(Object.keys(ctx.s.alliances)).toHaveLength(0);
    expect(ctx.s.treaties.some((t) => t.type === 'defensive' || t.type === 'nap')).toBe(false);
    expect(relation(ctx.s, 'TUR', 'GRC')).toBe(0);
    expect(relation(ctx.s, 'USA', 'RUS')).toBe(0);
  });

  it('nötr dünyada on yıl oynanır; ittifaklar oyun içinde kurulur', () => {
    const ctx = newModernGame({ timeStep: 'month', rules: { neutralStart: true } });
    for (let i = 0; i < 120; i++) advanceTurn(ctx);
    expect(Object.keys(ctx.s.alliances).length + ctx.s.treaties.filter((t) => t.type === 'defensive').length).toBeGreaterThan(0);
    expect(Object.values(ctx.s.countries).filter((c) => c.alive).length).toBeGreaterThan(120);
  });
});

describe('26.2 Faz 5 — maliye', () => {
  it('tahvil hazineyi doldurur, faiz işler; faiz itibara ve istikrara bağlıdır', () => {
    const ctx = newModernGame();
    const c = ctx.s.countries.TUR;
    const t0 = c.treasury;
    const r0 = bondRate(ctx, 'TUR');
    expect(runCommand(ctx, { type: 'issueBond', amount: 0.5 }).ok).toBe(true);
    expect(c.treasury).toBeGreaterThan(t0);
    expect(debtOf(ctx, 'TUR')).toBeGreaterThan(0);
    c.stability = 10;
    c.reputation = -50;
    expect(bondRate(ctx, 'TUR')).toBeGreaterThan(r0);
    const t1 = c.treasury;
    financeTick(ctx, false);
    expect(c.treasury).toBeLessThan(t1 + Math.abs(c.oilNet ?? 0) + 1e-6);
    // borç sınırı
    for (let i = 0; i < 6; i++) runCommand(ctx, { type: 'issueBond', amount: 1 });
    expect(runCommand(ctx, { type: 'issueBond', amount: 1 }).error).toBe('finance.debtLimit');
  });

  it('başka ülkeye kredi: faiz geliri ve diplomatik nüfuz sağlar', () => {
    const ctx = newModernGame({ player: 'USA', rules: { neutralStart: true } });
    rich(ctx);
    const before = evaluateProposal(ctx, 'USA', 'GRC', 'nap').score;
    expect(runCommand(ctx, { type: 'lend', target: 'GRC', amount: 0.01 }).ok).toBe(true);
    const after = evaluateProposal(ctx, 'USA', 'GRC', 'nap');
    expect(after.reasons.some((r) => r.key === 'reason.creditor')).toBe(true);
    expect(after.score).toBeGreaterThan(before);
    const loan = ctx.s.loans!.find((l) => l.from === 'USA')!;
    expect(runCommand(ctx, { type: 'callLoan', id: loan.id }).ok).toBe(true);
  });

  it('para basmak hazineyi doldurur ama enflasyon üretimi düşürür ve zamanla söner', () => {
    const ctx = newModernGame();
    const c = ctx.s.countries.TUR;
    const p0 = getMods(ctx, 'TUR').productionIncome;
    const t0 = c.treasury;
    expect(runCommand(ctx, { type: 'printMoney', amount: 0.5 }).ok).toBe(true);
    expect(c.treasury).toBeGreaterThan(t0);
    expect(getMods(ctx, 'TUR').productionIncome).toBeLessThan(p0);
    const inf = c.inflation!;
    for (let i = 0; i < 12; i++) financeTick(ctx, false);
    expect(c.inflation!).toBeLessThan(inf);
  });

  it('borsa yatırımı değişir ve geri çekilebilir', () => {
    const ctx = newModernGame();
    rich(ctx);
    expect(runCommand(ctx, { type: 'invest', amount: 0.5 }).ok).toBe(true);
    const v0 = ctx.s.countries.TUR.stocks!;
    for (let i = 0; i < 6; i++) financeTick(ctx, false);
    expect(ctx.s.countries.TUR.stocks).not.toBe(v0);
    expect(runCommand(ctx, { type: 'divest' }).ok).toBe(true);
    expect(ctx.s.countries.TUR.stocks).toBe(0);
  });

  it('petrol üreticisi üretimi kısınca fiyat yükselir; üretici kazanır, ithalatçı öder', () => {
    const ctx = newModernGame({ player: 'SAU' });
    for (let i = 0; i < 12; i++) marketTick(ctx);
    const p0 = ctx.s.market!.prices.oil;
    expect(ctx.s.countries.SAU.oilNet!).toBeGreaterThan(0);
    expect(ctx.s.countries.JPN.oilNet!).toBeLessThan(0);
    expect(runCommand(ctx, { type: 'oilPolicy', policy: 'cut' }).ok).toBe(true);
    ctx.s.countries.RUS.oilPolicy = 'cut';
    ctx.s.countries.USA.oilPolicy = 'cut';
    for (let i = 0; i < 12; i++) marketTick(ctx);
    expect(ctx.s.market!.prices.oil).toBeGreaterThan(p0 * 1.2);
    const tur = newModernGame();
    expect(runCommand(tur, { type: 'oilPolicy', policy: 'cut' }).error).toBe('market.noOil');
  });

  it('mega proje yıllar sonra kalıcı etki verir; aynı anda tek proje', () => {
    const ctx = newModernGame();
    rich(ctx);
    const r0 = getMods(ctx, 'TUR').researchSpeed;
    expect(runCommand(ctx, { type: 'startProject', id: 'space' }).ok).toBe(true);
    expect(runCommand(ctx, { type: 'startProject', id: 'dam' }).error).toBe('project.busy');
    expect(getMods(ctx, 'TUR').researchSpeed).toBe(r0);
    ctx.s.day += Math.round(MEGA_PROJECTS.space.years * 365.25) + 1;
    expect(getMods(ctx, 'TUR').researchSpeed).toBeCloseTo(r0 + 0.15, 5);
  });
});

describe('26.2 Faz 5 — ideoloji, büyük güçler, BM', () => {
  it('19 ideoloji vardır; değişim etkiyi değiştirir ve bekleme süresi koyar', () => {
    expect(IDEOLOGIES).toHaveLength(19);
    const ctx = newModernGame();
    expect(ctx.s.countries.TUR.ideology).toBeTruthy();
    const m0 = getMods(ctx, 'TUR').researchSpeed;
    expect(runCommand(ctx, { type: 'setIdeology', id: 'technocracy' }).ok).toBe(true);
    expect(getMods(ctx, 'TUR').researchSpeed).toBeGreaterThan(m0);
    expect(runCommand(ctx, { type: 'setIdeology', id: 'kemalism' }).error).toBe('err.cooldown');
  });

  it('ilk 8 büyük güç sıralanır ve ayrıcalık kazanır', () => {
    const ctx = newModernGame();
    const gp = rankPowers(ctx);
    expect(gp).toHaveLength(8);
    expect(gp).toContain('USA');
    expect(gp).toContain('CHN');
    expect(ctx.s.greatPowers).toEqual(gp);
    expect(getMods(ctx, 'USA').acceptance - getMods(ctx, 'LUX').acceptance).toBeGreaterThan(0);
  });

  it('BM: büyük güç dostuna karşı kararı veto eder; satın alınan oy sonucu değiştirir', () => {
    const ctx = newModernGame({ player: 'TUR' });
    const veto = vetoPowers(ctx);
    expect(veto).toHaveLength(5);
    // ABD'nin müttefikine yaptırım: NATO üyeleri hayır der, ABD veto eder
    const r = { id: 'x', kind: 'sanction' as const, proposer: 'IRN', target: 'GBR', day: 0, expires: 30, bought: 0 };
    const t = tally(ctx, r);
    expect(t.vetoBy).toBeTruthy();
    expect(t.passed).toBe(false);
    const neutral = newModernGame({ player: 'TUR', rules: { neutralStart: true } });
    const base = tally(neutral, { ...r, proposer: 'TUR', target: 'GRC' });
    const bought = tally(neutral, { ...r, proposer: 'TUR', target: 'GRC', bought: 10 });
    expect(bought.yes.length).toBeGreaterThan(base.yes.length);
    neutral.s.countries.TUR.treasury = 1e12;
    const res = runCommand(neutral, { type: 'unPropose', kind: 'condemn', target: 'GRC', buy: 15 });
    expect(res.ok).toBe(true);
    expect((res.data as { passed: boolean }).passed).toBe(true);
    expect(neutral.s.countries.GRC.reputation).toBeLessThan(0);
    expect(runCommand(neutral, { type: 'unPropose', kind: 'condemn', target: 'GRC' }).error).toBe('err.cooldown');
  });
});

describe('26.2 Faz 5 — generaller', () => {
  it('general orduya atanır, gücünü artırır, zaferle seviye atlar', () => {
    const ctx = newModernGame();
    rich(ctx);
    expect(runCommand(ctx, { type: 'hireGeneral' }).ok).toBe(true);
    const g = ctx.s.countries.TUR.generals![0];
    const army = Object.values(ctx.s.armies).find((a) => a.owner === 'TUR' && !a.isNavy)!;
    const p0 = toSim(ctx, army).mods.infantryPower;
    expect(runCommand(ctx, { type: 'assignGeneral', general: g.id, army: army.id }).ok).toBe(true);
    expect(toSim(ctx, army).mods.infantryPower).toBeGreaterThan(p0);
    expect(generalMods(g).infantryPower).toBeGreaterThan(0);
    generalsAfterBattle(ctx, [army], []);
    generalsAfterBattle(ctx, [army], []);
    expect(g.level).toBe(2);
    for (let i = 0; i < 6; i++) runCommand(ctx, { type: 'hireGeneral' });
    expect(ctx.s.countries.TUR.generals!.length).toBe(5);
  });
});

describe('26.2 Faz 5 — toplum ve kimlik', () => {
  it('kültür ve din: fethedilen farklı inançtan bölge daha uzun asimile olur, sonunda kültür değişir', () => {
    const ctx = newModernGame();
    const p = provincesOf(ctx, 'GRC').find((x) => x !== ctx.s.countries.GRC.capital)!;
    expect(cultureOf(ctx, p)).toBe('GRC');
    expect(religionOf('TUR')).not.toBe(religionOf('GRC'));
    transferProvince(ctx, p, 'TUR');
    rich(ctx);
    expect(runCommand(ctx, { type: 'assimilate', province: p }).ok).toBe(true);
    expect(ctx.s.provinces[p].assimilating).toBeGreaterThan(5 * 365);
    expect(ctx.s.ownerLog!.some((e) => e[1] === p && e[2] === 'TUR')).toBe(true);
  });

  it('birlik kurma: Turan toprakları ele geçince yeni ülke ilan edilir', () => {
    const ctx = newModernGame();
    expect(canFormUnion(ctx, 'TUR', 'turan').error).toBe('union.needMore');
    const turan = UNIONS.find((u) => u.id === 'turan')!;
    for (const m of turan.members) if (m !== 'TUR') for (const p of [...provincesOf(ctx, m)]) transferProvince(ctx, p, 'TUR');
    expect(runCommand(ctx, { type: 'formUnion', id: 'turan' }).ok).toBe(true);
    expect(ctx.s.countries.TUR.name).toBe('Turan');
    expect(runCommand(ctx, { type: 'formUnion', id: 'turan' }).error).toBe('union.alreadyFormed');
  });

  it('başkent taşınır, bölge ve ülke yeniden adlandırılır, bayrak ve renk değişir', () => {
    const ctx = newModernGame();
    rich(ctx);
    const c = ctx.s.countries.TUR;
    const p = provincesOf(ctx, 'TUR').find((x) => x !== c.capital)!;
    expect(runCommand(ctx, { type: 'moveCapital', province: p }).ok).toBe(true);
    expect(c.capital).toBe(p);
    expect(runCommand(ctx, { type: 'moveCapital', province: provincesOf(ctx, 'TUR')[0] }).ok).toBe(false);
    expect(runCommand(ctx, { type: 'renameProvince', province: p, name: 'Yeni Başkent' }).ok).toBe(true);
    expect(ctx.s.provinceNames![p]).toBe('Yeni Başkent');
    const v0 = ctx.s.versions.owners;
    expect(runCommand(ctx, { type: 'customizeCountry', name: 'Anadolu Cumhuriyeti', flag: 'az', color: [10, 20, 300] }).ok).toBe(true);
    expect(c.name).toBe('Anadolu Cumhuriyeti');
    expect(c.flag).toBe('az');
    expect(c.color).toEqual([10, 20, 255]);
    expect(ctx.s.versions.owners).toBeGreaterThan(v0);
    expect(runCommand(ctx, { type: 'customizeCountry', flag: '../x' }).ok).toBe(false);
  });
});

describe('26.2 Faz 5 — geri al ve otomatik yönetim', () => {
  it('son ordu emri geri alınır; bölünen askerler orduya döner', () => {
    const ctx = newModernGame();
    const army = Object.values(ctx.s.armies).find((a) => a.owner === 'TUR' && !a.isNavy)!;
    const size = army.units.infantry;
    const target = ctx.w.data.provinces[army.location].adj.find((j) => ctx.s.provinces[j].owner === 'TUR')!;
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target }).ok).toBe(true);
    expect(army.path.length).toBeGreaterThan(0);
    expect(runCommand(ctx, { type: 'undoMove' }).ok).toBe(true);
    expect(army.path).toHaveLength(0);
    const r = runCommand(ctx, { type: 'moveArmy', army: army.id, target, amount: Math.floor(size / 2) });
    expect(r.ok).toBe(true);
    expect(army.units.infantry).toBeLessThan(size);
    expect(runCommand(ctx, { type: 'undoMove' }).ok).toBe(true);
    expect(army.units.infantry).toBe(size);
    expect(runCommand(ctx, { type: 'undoMove' }).error).toBe('undo.nothing');
  });

  it('otomatik yönetim açıkken inşaat ve asker toplama yapay zekâya devredilir', () => {
    const ctx = newModernGame({ timeStep: 'month' });
    rich(ctx);
    expect(runCommand(ctx, { type: 'setAuto', build: true, recruit: true }).ok).toBe(true);
    for (let i = 0; i < 6; i++) advanceTurn(ctx);
    const provs = provincesOf(ctx, 'TUR');
    const busy = provs.some((p) => ctx.s.provinces[p].construction) || ctx.s.countries.TUR.monthSpend.construction > 0 || provs.some((p) => ctx.s.provinces[p].recruits.length > 0);
    const built = provs.reduce((a, p) => a + ctx.s.provinces[p].buildings.reduce((x, y) => x + y, 0), 0);
    const fresh = newModernGame();
    const base = provincesOf(fresh, 'TUR').reduce((a, p) => a + fresh.s.provinces[p].buildings.reduce((x, y) => x + y, 0), 0);
    expect(busy || built > base).toBe(true);
    void declareWar;
    void invalidateDiplomacy;
  });
});

describe('26.2 Faz 5 — Muğla ve kayıt taşıma', () => {
  it('Muğla, Aydın\'dan ayrı bir Türkiye bölgesidir', () => {
    const ctx = newModernGame();
    const names = provincesOf(ctx, 'TUR').map((p) => ctx.w.data.provinces[p].name);
    expect(names).toContain('Muğla');
    expect(names).toContain('Aydın');
    expect(names).toHaveLength(39);
    const mugla = provincesOf(ctx, 'TUR').find((p) => ctx.w.data.provinces[p].name === 'Muğla')!;
    const aydin = provincesOf(ctx, 'TUR').find((p) => ctx.w.data.provinces[p].name === 'Aydın')!;
    expect(ctx.w.data.provinces[mugla].adj).toContain(aydin);
  });

  it('26.1 kaydı yeni haritaya taşınır: bölge eklenir, indeksler kayar', () => {
    const ctx = newModernGame();
    // 26.1 biçimine geri çevir: yeni Aydın bölgesi (2423) yoktu
    const old = JSON.parse(JSON.stringify(ctx.s)) as typeof ctx.s;
    const back = (i: number) => (i > 2423 ? i - 1 : i);
    old.provinces.splice(2423, 1);
    for (const c of Object.values(old.countries)) {
      c.capital = back(c.capital);
      c.claims = c.claims.map(back);
    }
    for (const a of Object.values(old.armies)) {
      a.location = back(a.location);
      a.path = a.path.map(back);
    }
    delete old.ownerStart;
    delete old.ownerLog;
    old.saveVersion = 1;
    const capBefore = old.countries.USA.capital;
    const loaded = deserialize(JSON.parse(JSON.stringify(old)), ctx.w.P);
    expect(loaded.provinces).toHaveLength(ctx.w.P);
    expect(loaded.provinces[2423].owner).toBe('TUR');
    expect(loaded.countries.USA.capital).toBe(capBefore >= 2423 ? capBefore + 1 : capBefore);
    expect(loaded.countries.USA.capital).toBe(ctx.s.countries.USA.capital);
    for (const [id, a] of Object.entries(loaded.armies)) expect(a.location, id).toBe(ctx.s.armies[id].location);
    expect(loaded.saveVersion).toBe(2);
  });
});
