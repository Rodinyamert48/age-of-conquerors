'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Swords } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Flag, SectionTitle, Stat, useConfirm, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { countrySummary } from '@/game/selectors';
import { evaluateProposal, improveCost } from '@/game/diplomacy';
import { allianceOf, findTreaty, warsOf } from '@/game/ctx';
import { atWar, isFriendly, overlordOf, relation, REBEL_TAG, vassalsOf } from '@/game/query';
import { canDeclareWar } from '@/game/war';
import type { DiploActionType, Tag } from '@/game/types';
import { formatCompact, formatDate, formatInt, formatMoney } from '@/lib/format';
import { BAL } from '@/game/balance';
import { warTitle } from '../text';

const BILATERAL: DiploActionType[] = ['nap', 'alliance', 'defensive', 'trade', 'access', 'normalize', 'vassalize'];

export default function CountryPanel({ tag }: { tag: Tag }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const name = useCountryName();
  const ask = useConfirm((s) => s.ask);
  const push = useToasts((s) => s.push);
  const [open, setOpen] = useState<DiploActionType | null>(null);
  const sum = useMemo(() => (ctx ? countrySummary(ctx, tag) : null), [ctx, tag]);
  if (!state || !ctx || !sum) return null;
  const c = state.countries[tag];
  if (!c) return null;
  const me = state.player;
  const isMe = tag === me;
  const rel = relation(state, me, tag);
  const treaties = state.treaties.filter((x) => (x.a === me && x.b === tag) || (x.b === me && x.a === tag));
  const war = atWar(ctx, me, tag);
  const wars = warsOf(ctx, tag);

  const runBilateral = async (type: DiploActionType) => {
    const r = await cmd({ type: 'diplomacy', action: type, target: tag });
    if (!r.ok) return;
    const d = r.data as { accepted?: boolean };
    if (d.accepted === true) push(t('diplo.accepted', { country: name(tag) }), 'good');
    else if (d.accepted === false) push(t('diplo.declined', { country: name(tag) }), 'bad');
    else push(t('diplo.sent'), 'info');
  };

  const declare = async () => {
    const chk = canDeclareWar(ctx, me, tag);
    if (!chk.ok) {
      push(t(chk.error ?? 'err.unknown'), 'bad');
      return;
    }
    // Karşı tarafa katılacaklar
    const joiners = new Set<Tag>();
    const al = allianceOf(ctx, tag);
    if (al) al.members.forEach((m) => joiners.add(m));
    state.treaties.forEach((x) => {
      if (x.type !== 'defensive') return;
      if (x.a === tag) joiners.add(x.b);
      if (x.b === tag) joiners.add(x.a);
    });
    vassalsOf(ctx, tag).forEach((v) => joiners.add(v));
    const ov = overlordOf(ctx, tag);
    if (ov) joiners.add(ov);
    joiners.delete(tag);
    joiners.delete(me);
    const enemies = [...joiners].filter((j) => !isFriendly(ctx, j, me) && state.countries[j]?.alive);
    const body = (
      <div className="space-y-2">
        <p>{t('war.declareBody', { country: name(tag) })}</p>
        {chk.breaks.length > 0 && <p className="text-warn">{t('war.breaks', { list: chk.breaks.map((b) => t(`treaty.${b.type}`)).join(', ') })}</p>}
        <p className={chk.justified ? 'text-good' : 'text-danger'}>{chk.justified ? t('war.justified') : t('war.unjustified')}</p>
        {enemies.length > 0 && <p className="text-danger">{t('war.defenderAllies', { list: enemies.map(name).join(', ') })}</p>}
      </div>
    );
    const ok = await ask({ title: t('war.declareTitle', { country: name(tag) }), body, confirmLabel: t('war.declare'), cancelLabel: t('common.cancel'), danger: true });
    if (ok) {
      const r = await cmd({ type: 'declareWar', target: tag });
      if (r.ok) push(t('war.started'), 'bad');
    }
  };

  return (
    <div className="text-sm">
      <div className="flex items-center gap-3">
        <Flag code={c.flag} className="h-11" />
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl text-ink">{lang === 'en' ? c.nameEn : c.name}</h2>
          <div className="text-xs text-muted">{t(`gov.${c.government}`)}</div>
          {isMe && <span className="mt-0.5 inline-block rounded bg-gold/20 px-1.5 text-[10px] uppercase tracking-wider text-gold">{t('common.you')}</span>}
        </div>
      </div>
      {!c.alive && <p className="mt-2 text-xs text-muted">{t('country.notAlive')}</p>}
      {c.rebelMovement && <p className="mt-2 text-xs text-warn">{t('country.rebelMovement')}</p>}
      {c.capital >= 0 && (
        <Button
          size="sm"
          className="mt-2"
          onClick={() => {
            ui.focusOn(ctx.w.x[c.capital], ctx.w.y[c.capital], 0.9);
          }}
        >
          <MapPin size={13} /> {t('country.focusCapital')}
        </Button>
      )}

      <SectionTitle>{t('country.overview')}</SectionTitle>
      <Stat label={t('country.capital')} value={sum.capitalName} />
      <Stat label={t('country.population')} value={formatCompact(sum.pop, lang)} />
      <Stat label={t('country.provinces')} value={sum.provinces} />
      <Stat label={t('country.gdp')} value={formatMoney(sum.output, lang)} />
      <Stat label={t('country.army')} value={state.rules.fogOfWar && !isMe ? '?' : `${formatInt(sum.soldiers, lang)}`} />
      <Stat label={t('country.navy')} value={state.rules.fogOfWar && !isMe ? '?' : `${formatInt(sum.ships, lang)}`} />
      <Stat label={t('country.stability')} value={Math.round(c.stability)} />
      <Stat label={t('country.reputation')} value={Math.round(c.reputation)} />
      {sum.alliance && <Stat label={t('country.alliance')} value={sum.alliance} />}
      {sum.overlord && <Stat label={t('country.overlord')} value={name(sum.overlord)} />}
      {sum.vassals.length > 0 && <Stat label={t('country.vassals')} value={sum.vassals.map(name).join(', ')} />}
      {wars.length > 0 && (
        <div className="mt-1">
          {wars.map((w) => (
            <button type="button" key={w.id} onClick={() => ui.openRight({ kind: 'war', id: w.id })} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-danger hover:bg-white/5">
              <Swords size={12} /> {warTitle(w, t)}
            </button>
          ))}
        </div>
      )}

      {!isMe && c.alive && !c.rebelMovement && (
        <>
          <SectionTitle right={<span className={`tabular text-xs ${rel > 20 ? 'text-good' : rel < -20 ? 'text-danger' : 'text-ink-2'}`}>{Math.round(rel)}</span>}>{t('country.relation')}</SectionTitle>
          <Bar value={rel + 100} max={200} color={rel > 20 ? 'bg-good' : rel < -20 ? 'bg-danger' : 'bg-muted'} />
          {treaties.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {treaties.map((x) => (
                <span key={x.id} className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-2" title={x.end ? t('treaty.until', { date: formatDate(x.end, lang) }) : undefined}>
                  {t(`treaty.${x.type}`)}
                </span>
              ))}
              {allianceOf(ctx, me)?.members.includes(tag) && <span className="rounded bg-info/20 px-1.5 py-0.5 text-[11px] text-info">{t('treaty.alliance')}</span>}
            </div>
          )}
          {war && <div className="mt-1.5 rounded bg-danger/15 px-2 py-1 text-xs text-[#f3c2bc]">{t('country.atWar')}</div>}

          <SectionTitle>{t('diplo.actions')}</SectionTitle>
          <div className="flex flex-col gap-1">
            {/* Tek taraflı */}
            {!war && (
              <ActionRow
                label={t('action.improve')}
                desc={`${t('action.improve.desc')} · ${formatMoney(improveCost(ctx, me), lang)}`}
                onClick={() => cmd({ type: 'diplomacy', action: 'improve', target: tag }, t('diplo.done'))}
              />
            )}
            {!war && <ActionRow label={t('action.worsen')} desc={t('action.worsen.desc')} onClick={() => cmd({ type: 'diplomacy', action: 'worsen', target: tag }, t('diplo.done'))} />}
            {/* İki taraflı */}
            {!war &&
              BILATERAL.filter((a) => a !== 'normalize' || rel < -30).map((a) => {
                const ev = evaluateProposal(ctx, me, tag, a);
                const exists =
                  (a === 'nap' && findTreaty(ctx, 'nap', me, tag)) ||
                  (a === 'defensive' && findTreaty(ctx, 'defensive', me, tag)) ||
                  (a === 'trade' && findTreaty(ctx, 'trade', me, tag)) ||
                  (a === 'access' && findTreaty(ctx, 'access', tag, me)) ||
                  (a === 'alliance' && allianceOf(ctx, me)?.members.includes(tag)) ||
                  (a === 'vassalize' && findTreaty(ctx, 'vassal', me, tag));
                if (exists) return null;
                return (
                  <div key={a} className="rounded border border-line bg-panel-2">
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <button type="button" onClick={() => setOpen(open === a ? null : a)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
                        {open === a ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="truncate text-ink">{t(`action.${a}`)}</span>
                      </button>
                      <span className={`text-[11px] tabular ${ev.accept ? 'text-good' : 'text-danger'}`}>{ev.accept ? '✓' : '✗'} {Math.round(ev.score)}</span>
                      <Button size="sm" onClick={() => runBilateral(a)}>
                        {t('common.apply')}
                      </Button>
                    </div>
                    {open === a && (
                      <div className="border-t border-line px-2 py-1.5 text-[11px]">
                        <p className="mb-1 text-muted">{t(`action.${a}.desc`, { years: BAL.napYears })}</p>
                        <div className="text-ink-2">{ev.accept ? t('diplo.likely', { score: Math.round(ev.score) }) : t('diplo.unlikely', { score: Math.round(ev.score) })}</div>
                        {ev.reasons.map((r) => (
                          <div key={r.key} className="flex justify-between">
                            <span className="text-muted">{t(r.key)}</span>
                            <span className={r.value >= 0 ? 'text-good' : 'text-danger'}>
                              {r.value > 0 ? '+' : ''}
                              {r.value <= -1000 ? '✗' : r.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {c.recognizedBy && !c.recognizedBy.includes(me) && wars.some((w) => w.goal.type === 'independence' && w.attackers.includes(tag)) && (
              <ActionRow label={t('action.recognize')} desc={t('action.recognize.desc')} onClick={() => cmd({ type: 'diplomacy', action: 'recognize', target: tag }, t('diplo.done'))} />
            )}
            {findTreaty(ctx, 'vassal', me, tag) && (
              <>
                <ActionRow label={t('action.annexVassal')} desc={t('action.annexVassal.desc')} onClick={() => cmd({ type: 'diplomacy', action: 'annexVassal', target: tag }, t('diplo.done'))} />
                <ActionRow label={t('action.releaseVassal')} desc={t('action.releaseVassal.desc')} onClick={() => cmd({ type: 'diplomacy', action: 'releaseVassal', target: tag }, t('diplo.done'))} />
              </>
            )}
            {treaties.some((x) => ['nap', 'defensive', 'trade', 'access'].includes(x.type)) && (
              <ActionRow
                label={t('action.breakTreaty')}
                desc={t('action.breakTreaty.desc')}
                danger
                onClick={async () => {
                  const ok = await ask({ title: t('action.breakTreaty'), body: t('action.breakTreaty.desc'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel'), danger: true });
                  if (ok) cmd({ type: 'diplomacy', action: 'breakTreaty', target: tag }, t('diplo.done'));
                }}
              />
            )}
            {!war && tag !== REBEL_TAG && (
              <Button variant="danger" className="mt-1" onClick={declare}>
                <Swords size={14} /> {t('action.declareWar')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActionRow({ label, desc, onClick, danger }: { label: string; desc: string; onClick: () => void; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-line bg-panel-2 px-2 py-1.5">
      <div className="min-w-0">
        <div className={danger ? 'text-danger' : 'text-ink'}>{label}</div>
        <div className="text-[11px] leading-snug text-muted">{desc}</div>
      </div>
      <Button size="sm" variant={danger ? 'danger' : 'secondary'} onClick={onClick}>
        →
      </Button>
    </div>
  );
}
