'use client';
import { useMemo, useState } from 'react';
import { Search, Swords, Shield, Handshake, Ship, Ban, Coins } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Button, Flag, SectionTitle, Segmented, VirtualList, useConfirm } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { allianceOf, findTreaty } from '@/game/ctx';
import { atWar, relation, REBEL_TAG, strategicStrength } from '@/game/query';
import type { Tag } from '@/game/types';

type Sort = 'relation' | 'name' | 'power';

export default function DiplomacyTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const name = useCountryName();
  const ask = useConfirm((s) => s.ask);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('relation');

  const rows = useMemo(() => {
    if (!state || !ctx) return [];
    const me = state.player;
    const list = Object.values(state.countries).filter((c) => c.alive && c.tag !== me && c.tag !== REBEL_TAG && !c.rebelMovement);
    const query = q.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US');
    const filtered = query ? list.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(query) || c.nameEn.toLowerCase().includes(query)) : list;
    const data = filtered.map((c) => ({
      tag: c.tag,
      flag: c.flag,
      rel: relation(state, me, c.tag),
      power: strategicStrength(ctx, c.tag),
      war: atWar(ctx, me, c.tag),
      ally: !!allianceOf(ctx, me)?.members.includes(c.tag),
      def: !!findTreaty(ctx, 'defensive', me, c.tag),
      nap: !!findTreaty(ctx, 'nap', me, c.tag),
      trade: !!findTreaty(ctx, 'trade', me, c.tag),
      access: !!findTreaty(ctx, 'access', c.tag, me),
    }));
    if (sort === 'relation') data.sort((a, b) => b.rel - a.rel);
    else if (sort === 'power') data.sort((a, b) => b.power - a.power);
    else data.sort((a, b) => name(a.tag).localeCompare(name(b.tag), lang));
    return data;
  }, [state, ctx, q, sort, lang, name]);

  if (!state || !ctx) return null;
  const me = state.player;
  const al = allianceOf(ctx, me);
  const inbox = state.proposals.length + state.peaceOffers.length;

  return (
    <div className="flex h-full flex-col text-sm">
      {inbox > 0 && (
        <button type="button" onClick={() => ui.openRight({ kind: 'inbox' })} className="mb-2 rounded border border-gold-2/60 bg-gold/10 px-2 py-1.5 text-left text-xs text-gold-soft">
          {t('diplo.proposals')}: {inbox}
        </button>
      )}
      {al && (
        <>
          <SectionTitle>{t('diplo.yourAlliance')}</SectionTitle>
          <div className="text-ink">
            {al.name} <span className="text-xs text-muted">({name(al.leader)})</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {al.members.map((m) => (
              <button type="button" key={m} onClick={() => ui.openRight({ kind: 'country', tag: m })} title={name(m)}>
                <Flag code={state.countries[m]?.flag ?? 'x-unknown'} className="h-4" title={name(m)} />
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="danger"
            className="mt-2"
            onClick={async () => {
              const ok = await ask({ title: t('diplo.leaveAlliance'), body: t('action.leaveAlliance'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel'), danger: true });
              if (ok) cmd({ type: 'diplomacy', action: 'leaveAlliance', target: al.leader === me ? (al.members.find((x) => x !== me) ?? me) : al.leader }, t('diplo.done'));
            }}
          >
            {t('diplo.leaveAlliance')}
          </Button>
        </>
      )}
      <SectionTitle>{t('diplo.relations')}</SectionTitle>
      <div className="mb-1.5 flex items-center gap-2 rounded border border-line-2 bg-bg-2 px-2">
        <Search size={13} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="w-full bg-transparent py-1 text-sm outline-none" />
      </div>
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'relation', label: t('diplo.sortRelation') },
          { value: 'name', label: t('diplo.sortName') },
          { value: 'power', label: t('diplo.sortPower') },
        ]}
      />
      <VirtualList
        className="mt-2 min-h-[240px] flex-1"
        items={rows}
        rowHeight={30}
        render={(r) => (
          <button
            type="button"
            onClick={() => ui.openRight({ kind: 'country', tag: r.tag as Tag })}
            className="flex h-[28px] w-full items-center gap-2 rounded px-1.5 text-left hover:bg-white/5"
          >
            <Flag code={r.flag} className="h-3.5" />
            <span className="min-w-0 flex-1 truncate text-ink-2">{name(r.tag)}</span>
            <span className="flex items-center gap-0.5 text-muted">
              {r.war && <Swords size={12} className="text-danger" />}
              {r.ally && <Shield size={12} className="text-info" />}
              {r.def && <Shield size={12} className="text-[#8cc0e6]" />}
              {r.nap && <Ban size={12} className="text-[#7fc4bd]" />}
              {r.trade && <Coins size={12} className="text-good" />}
              {r.access && <Ship size={12} />}
              {!r.war && !r.ally && !r.def && !r.nap && !r.trade && !r.access && <Handshake size={12} className="opacity-0" />}
            </span>
            <span className={`w-9 text-right tabular text-xs ${r.rel > 20 ? 'text-good' : r.rel < -20 ? 'text-danger' : 'text-muted'}`}>{Math.round(r.rel)}</span>
          </button>
        )}
      />
    </div>
  );
}
