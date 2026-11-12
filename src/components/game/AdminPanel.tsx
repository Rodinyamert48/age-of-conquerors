'use client';
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useLang } from '@/i18n';
import { Button, Flag } from '@/components/ui';
import { useCommand, useReadCtx } from './hooks';
import { armiesAt } from '@/game/ctx';
import { UNIT_ORDER } from '@/game/defs/units';
import type { Tag, UnitType } from '@/game/types';
import type { AdminOp } from '@/game/commands';
import { REBEL_TAG } from '@/game/query';

const TXT = {
  tr: {
    title: 'Yönetici menüsü', hint: 'Kapatmak için " / é tuşu ya da ✕. Haritadan bölge seçmeye devam edebilirsiniz.',
    country: 'Ülke', stats: 'Ülke istatistikleri', treasury: 'Hazine (milyon)', manpower: 'İnsan gücü', stability: 'İstikrar', war: 'Savaş yorgunluğu', rep: 'İtibar',
    set: 'Ayarla', add: 'Ekle', max: '100 yap', zero: 'Sıfırla', tech: 'Teknoloji', nextTech: 'Sonraki teknolojiyi aç', allTech: 'Tüm teknolojiler', noTech: 'Hepsini sıfırla', finish: 'Araştırmayı bitir',
    province: 'Seçili eyalet', none: 'Haritadan bir eyalet seçin.', owner: 'Sahibi', makeOwner: 'Sahibi yap', eco: 'Ekonomi +%50', pop: 'Nüfus +%50', build: 'Tüm binalar maks.', unrest: 'Huzursuzluğu sıfırla', cores: 'Çekirdek yap',
    armies: 'Eyaletteki ordular', noArmies: 'Orduda yok.', del: 'Sil', delAll: 'Tüm orduları sil', spawn: 'Asker oluştur', spawnFor: 'Sahibi', unit: 'Birlik', amount: 'Miktar', create: 'Oluştur', changeOwner: 'Ordunun sahibini değiştir',
  },
  en: {
    title: 'Admin menu', hint: 'Close with the " / é key or ✕. You can keep selecting provinces on the map.',
    country: 'Country', stats: 'Country stats', treasury: 'Treasury (millions)', manpower: 'Manpower', stability: 'Stability', war: 'War exhaustion', rep: 'Reputation',
    set: 'Set', add: 'Add', max: 'Set to 100', zero: 'Zero', tech: 'Technology', nextTech: 'Unlock next tech', allTech: 'All technologies', noTech: 'Reset all', finish: 'Finish research',
    province: 'Selected province', none: 'Select a province on the map.', owner: 'Owner', makeOwner: 'Make owner', eco: 'Economy +50%', pop: 'Population +50%', build: 'Max all buildings', unrest: 'Clear unrest', cores: 'Make core',
    armies: 'Armies here', noArmies: 'None.', del: 'Delete', delAll: 'Delete all armies', spawn: 'Spawn troops', spawnFor: 'Owner', unit: 'Unit', amount: 'Amount', create: 'Create', changeOwner: 'Change army owner',
  },
};

const field = 'min-w-0 rounded border border-line-2 bg-bg-2 px-1.5 py-1 text-xs text-ink';

export default function AdminPanel() {
  const open = useUI((s) => s.adminOpen);
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const right = useUI((s) => s.right);
  const selArmy = useUI((u) => u.selectedArmies[0]);
  const cmd = useCommand();
  const lang = useLang();
  const x = TXT[lang === 'en' ? 'en' : 'tr'];
  const [target, setTarget] = useState<Tag | ''>('');
  const [num, setNum] = useState<Record<string, string>>({});
  const [spawnOwner, setSpawnOwner] = useState<Tag | ''>('');
  const [unit, setUnit] = useState<UnitType>('infantry');
  const [amount, setAmount] = useState('10000');
  const [ownerPick, setOwnerPick] = useState<Tag | ''>('');

  const countries = useMemo(
    () => (state ? Object.values(state.countries).filter((c) => c.alive && c.tag !== REBEL_TAG).sort((a, b) => (lang === 'en' ? a.nameEn : a.name).localeCompare(lang === 'en' ? b.nameEn : b.name)) : []),
    [state, lang],
  );
  if (!open || !state || !ctx) return null;
  const tag = (target || state.player) as Tag;
  const sp = (spawnOwner || state.player) as Tag;
  // Seçili eyalet: açık eyalet paneli, yoksa seçili ordunun bulunduğu bölge
  const armyLoc = selArmy ? state.armies[selArmy]?.location : undefined;
  const prov = right?.kind === 'province' ? right.id : armyLoc !== undefined && armyLoc < ctx.w.P ? armyLoc : null;
  const run = (op: AdminOp) => void cmd({ type: 'admin', op });
  const nameOf = (c: { name: string; nameEn: string }) => (lang === 'en' ? c.nameEn : c.name);
  const countrySelect = (value: string, onChange: (v: Tag) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as Tag)} className={`${field} w-full`}>
      {countries.map((c) => (
        <option key={c.tag} value={c.tag}>
          {nameOf(c)}
        </option>
      ))}
    </select>
  );
  const statRow = (stat: 'treasury' | 'manpower' | 'stability' | 'warExhaustion' | 'reputation', label: string, quick?: { label: string; value: number }) => (
    <div className="mb-1 flex items-center gap-1">
      <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
      <input type="number" value={num[stat] ?? ''} onChange={(e) => setNum({ ...num, [stat]: e.target.value })} className={`${field} w-20`} />
      <Button size="sm" onClick={() => num[stat] && run({ kind: 'stat', tag, stat, value: Number(num[stat]) })}>{x.set}</Button>
      <Button size="sm" onClick={() => num[stat] && run({ kind: 'stat', tag, stat, value: Number(num[stat]), add: true })}>{x.add}</Button>
      {quick && <Button size="sm" onClick={() => run({ kind: 'stat', tag, stat, value: quick.value })}>{quick.label}</Button>}
    </div>
  );
  const ps = prov !== null ? state.provinces[prov] : null;
  const wp = prov !== null ? ctx.w.data.provinces[prov] : null;
  const here = prov !== null ? armiesAt(ctx, prov) : [];

  return (
    <div className="absolute left-2 top-2 z-40 flex max-h-[calc(100%-16px)] w-[340px] max-w-[calc(100%-16px)] flex-col rounded border border-gold-2 bg-panel/[0.97] shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="font-display text-base text-gold-soft">{x.title}</h2>
        <button type="button" onClick={() => useUI.getState().setAdminOpen(false)} className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" aria-label="Kapat">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm">
        <p className="mb-2 text-[11px] text-muted">{x.hint}</p>

        <h3 className="mb-1 font-display text-[12px] uppercase tracking-wider text-gold-soft">{x.stats}</h3>
        <div className="mb-1 flex items-center gap-1.5">
          <Flag code={state.countries[tag]?.flag ?? 'x-unknown'} className="h-3.5" />
          {countrySelect(tag, setTarget)}
        </div>
        {statRow('treasury', x.treasury)}
        {statRow('manpower', x.manpower)}
        {statRow('stability', x.stability, { label: x.max, value: 100 })}
        {statRow('warExhaustion', x.war, { label: x.zero, value: 0 })}
        {statRow('reputation', x.rep, { label: x.max, value: 100 })}

        <h3 className="mb-1 mt-3 font-display text-[12px] uppercase tracking-wider text-gold-soft">{x.tech}</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={() => run({ kind: 'techs', tag, mode: 'next' })}>{x.nextTech}</Button>
          <Button size="sm" onClick={() => run({ kind: 'techs', tag, mode: 'all' })}>{x.allTech}</Button>
          <Button size="sm" variant="danger" onClick={() => run({ kind: 'techs', tag, mode: 'none' })}>{x.noTech}</Button>
          <Button size="sm" onClick={() => run({ kind: 'research' })}>{x.finish}</Button>
        </div>

        <h3 className="mb-1 mt-3 font-display text-[12px] uppercase tracking-wider text-gold-soft">{x.province}</h3>
        {prov === null || !ps || !wp ? (
          <p className="text-xs text-muted">{x.none}</p>
        ) : (
          <>
            <div className="mb-1 text-xs text-ink">
              {nameOf({ name: wp.name, nameEn: wp.nameEn })} · {x.owner}: {nameOf(state.countries[ps.owner] ?? { name: ps.owner, nameEn: ps.owner })}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => run({ kind: 'province', province: prov, what: 'output' })}>{x.eco}</Button>
              <Button size="sm" onClick={() => run({ kind: 'province', province: prov, what: 'pop' })}>{x.pop}</Button>
              <Button size="sm" onClick={() => run({ kind: 'province', province: prov, what: 'buildings' })}>{x.build}</Button>
              <Button size="sm" onClick={() => run({ kind: 'province', province: prov, what: 'unrest' })}>{x.unrest}</Button>
              <Button size="sm" onClick={() => run({ kind: 'province', province: prov, what: 'cores' })}>{x.cores}</Button>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {countrySelect(ownerPick || state.player, setOwnerPick)}
              <Button size="sm" onClick={() => run({ kind: 'setOwner', province: prov, owner: (ownerPick || state.player) as Tag })}>{x.makeOwner}</Button>
            </div>

            <h3 className="mb-1 mt-3 font-display text-[12px] uppercase tracking-wider text-gold-soft">{x.armies}</h3>
            {here.length === 0 && <p className="text-xs text-muted">{x.noArmies}</p>}
            {here.map((a) => (
              <div key={a.id} className="mb-1 rounded border border-line bg-panel-2 px-2 py-1 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-ink">
                    {a.name} · {nameOf(state.countries[a.owner] ?? { name: a.owner, nameEn: a.owner })} · {Math.round(Object.values(a.units).reduce((n, v) => n + v, 0)).toLocaleString('tr-TR')}
                  </span>
                  <Button size="sm" variant="danger" onClick={() => run({ kind: 'clearArmies', province: prov, owner: a.owner })} title={x.del}>
                    {x.del}
                  </Button>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {countrySelect(a.owner, (v) => run({ kind: 'setArmyOwner', army: a.id, owner: v }))}
                </div>
              </div>
            ))}
            {here.length > 0 && (
              <Button size="sm" variant="danger" className="mb-1" onClick={() => run({ kind: 'clearArmies', province: prov })}>
                {x.delAll}
              </Button>
            )}

            <h3 className="mb-1 mt-3 font-display text-[12px] uppercase tracking-wider text-gold-soft">{x.spawn}</h3>
            <div className="mb-1 flex items-center gap-1">
              <span className="w-16 shrink-0 text-xs text-muted">{x.spawnFor}</span>
              {countrySelect(sp, setSpawnOwner)}
            </div>
            <div className="flex items-center gap-1">
              <select value={unit} onChange={(e) => setUnit(e.target.value as UnitType)} className={`${field} w-24`} aria-label={x.unit}>
                {UNIT_ORDER.filter((u) => u === 'infantry').map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-24`} aria-label={x.amount} />
              <Button size="sm" variant="primary" onClick={() => run({ kind: 'spawnArmy', province: prov, owner: sp, unit, amount: Number(amount) })}>
                {x.create}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
