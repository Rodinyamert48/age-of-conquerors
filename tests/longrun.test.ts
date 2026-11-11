import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { provincesOf } from '@/game/ctx';

describe('uzun koşu', () => {
  it('modern senaryo 5 yıl', () => {
    const ctx = newModernGame({ seed: 7 });
    const s = ctx.s;
    const report = (label: string) => {
      const tur = s.countries.TUR;
      const usa = s.countries.USA;
      console.log(label, 'gün', s.day, 'TUR hazine', Math.round(tur.treasury), 'gelir', Math.round(tur.budget.income), 'gider', Math.round(tur.budget.expenses), 'ist', tur.stability.toFixed(0), '| USA', Math.round(usa.budget.income), Math.round(usa.budget.expenses), Math.round(usa.treasury));
      const alive = Object.values(s.countries).filter((c) => c.alive);
      const debt = alive.filter((c) => c.treasury < 0).length;
      console.log('   yaşayan', alive.length, 'borçlu', debt, 'savaş', Object.keys(s.wars).length, Object.values(s.wars).map((w) => `${w.name}[${w.goal.type}] ${w.score.toFixed(0)}`).join('; '));
      console.log('   ordu', Object.keys(s.armies).length, 'muharebe', Object.keys(s.battles).length, 'rapor', s.battleReports.length, 'antlaşma', s.treaties.length);
    };
    report('başlangıç');
    let total = 0;
    for (let y = 1; y <= 5; y++) {
      const t = performance.now();
      for (let i = 0; i < 365; i++) advanceTurn(ctx);
      total += performance.now() - t;
      report(`yıl ${y} (${Math.round((performance.now() - t) / 365)} ms/tur)`);
    }
    const sizes = Object.values(s.countries).filter((c) => c.alive).map((c) => [c.tag, provincesOf(ctx, c.tag).length] as const).sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log('en büyük', sizes.map(([t, n]) => `${t}:${n}`).join(' '));
    const elim = Object.values(s.countries).filter((c) => !c.alive && c.tag !== 'REB').map((c) => c.tag);
    console.log('yok olan', elim.join(','));
    console.log('toplam süre s', (total / 1000).toFixed(1));
    expect(s.turn).toBe(365 * 5);
  });
});
