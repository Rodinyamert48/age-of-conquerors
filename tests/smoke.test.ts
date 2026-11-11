import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { provincesOf } from '@/game/ctx';

describe('duman testi', () => {
  it('modern senaryo bir yıl çalışır', () => {
    const t0 = performance.now();
    const ctx = newModernGame();
    const t1 = performance.now();
    const s = ctx.s;
    const tur = s.countries.TUR;
    console.log('kurulum ms', Math.round(t1 - t0), 'ülke', Object.keys(s.countries).length, 'ordu', Object.keys(s.armies).length);
    console.log('TUR bütçe', JSON.stringify(tur.budget, (k, v) => (typeof v === 'number' ? Math.round(v) : v)));
    console.log('TUR hazine', Math.round(tur.treasury), 'insan gücü', Math.round(tur.manpower), 'istikrar', tur.stability, 'bölge', provincesOf(ctx, 'TUR').length);
    console.log('USA bütçe', Math.round(s.countries.USA.budget.income), Math.round(s.countries.USA.budget.expenses), 'ref', s.meta.refGdpPc, 'avg', Math.round(s.meta.avgProvinceOutput), 'foodK', s.meta.foodK, 'resK', s.meta.resourceK);
    const times: number[] = [];
    for (let i = 0; i < 366; i++) {
      const a = performance.now();
      advanceTurn(ctx);
      times.push(performance.now() - a);
    }
    times.sort((a, b) => a - b);
    console.log('tur ms medyan', times[183].toFixed(1), 'p95', times[347].toFixed(1), 'max', times[365].toFixed(1));
    console.log('tarih', s.day, 'savaşlar', Object.values(s.wars).map((w) => w.name + ':' + w.goal.type).join(', '));
    console.log('TUR hazine', Math.round(tur.treasury), 'istikrar', tur.stability.toFixed(1), 'bütçe', Math.round(tur.budget.balance));
    const alive = Object.values(s.countries).filter((c) => c.alive).length;
    console.log('yaşayan ülke', alive, 'ordu', Object.keys(s.armies).length, 'antlaşma', s.treaties.length, 'bildirim', s.notifications.length);
    const neg = Object.values(s.countries).filter((c) => c.alive && c.treasury < 0).map((c) => c.tag);
    console.log('borçlu', neg.length, neg.slice(0, 20).join(','));
    expect(s.turn).toBe(366);
  });
});
