import { describe, it, expect } from 'vitest';
import { daltonize } from '@/components/map/modes';

describe('26.2 Faz 4 — erişilebilirlik', () => {
  it('renk körlüğü paleti kırmızı ile yeşili mavi ekseninde ayırır', () => {
    const red = daltonize([200, 40, 40]);
    const green = daltonize([40, 200, 40]);
    // Düzeltmeden sonra mavi kanalı ikisini belirgin biçimde ayırır
    expect(Math.abs(red[2] - green[2])).toBeGreaterThan(60);
    // Gri tonlar değişmez
    expect(daltonize([120, 120, 120])).toEqual([120, 120, 120]);
  });
});
