'use client';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Button, Flag, SectionTitle, Stat, useToasts } from '@/components/ui';
import { useCommand, useReadCtx, useCountryName } from '../hooks';
import { sideValues, scoreFor } from '@/game/war';
import { warSide } from '@/game/query';
import { allianceOf } from '@/game/ctx';
import { warTitle } from '../text';
import { ScoreBar } from '../tabs/WarsTab';
import { formatDate, formatInt, formatPercent } from '@/lib/format';
import { monthsCrossed } from '@/game/calendar';

export default function WarPanel({ id }: { id: string }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const name = useCountryName();
  const cmd = useCommand();
  if (!state || !ctx) return null;
  const w = state.wars[id];
  if (!w) return <p className="text-sm text-muted">{t('war.none')}</p>;
  const me = state.player;
  const side = warSide(w, me);
  const att = sideValues(ctx, w, 'attackers');
  const def = sideValues(ctx, w, 'defenders');
  const my = side ? scoreFor(w, me) : w.score;
  const iLead = w.attackerLeader === me || w.defenderLeader === me;
  const al = allianceOf(ctx, me);
  const callable = side && iLead && al ? al.members.filter((m) => m !== me && !w.attackers.includes(m) && !w.defenders.includes(m)) : [];
  const enemyLeader = side === 'attackers' ? w.defenderLeader : w.attackerLeader;

  const list = (tags: string[], leader: string) => (
    <div className="flex flex-col gap-0.5">
      {tags.map((tg) => (
        <button type="button" key={tg} onClick={() => tg !== 'REB' && ui.openRight({ kind: 'country', tag: tg })} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5">
          <Flag code={state.countries[tg]?.flag ?? 'x-rebels'} className="h-3" />
          <span className="truncate">{name(tg)}</span>
          {tg === leader && <span className="text-[10px] text-gold">({t('war.leader')})</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="text-sm">
      <h2 className="font-display text-xl text-ink">{warTitle(w, t)}</h2>
      <div className="text-xs text-muted">
        {formatDate(w.startDay, lang)} · {t('common.months', { n: monthsCrossed(w.startDay, state.day) })} · {t(`war.goal.${w.goal.type}`)}
      </div>
      <SectionTitle right={<span className={`tabular text-xs ${my >= 0 ? 'text-good' : 'text-danger'}`}>{Math.round(my)}</span>}>{t('war.score')}</SectionTitle>
      <ScoreBar score={my} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.15em] text-muted">{t('war.attackers')}</div>
          {list(w.attackers, w.attackerLeader)}
          <Stat label={t('war.occupied')} value={formatPercent(att.total ? att.occupied / att.total : 0, lang)} />
          <Stat label={t('war.losses')} value={formatInt(w.losses.attackers, lang)} />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.15em] text-muted">{t('war.defenders')}</div>
          {list(w.defenders, w.defenderLeader)}
          <Stat label={t('war.occupied')} value={formatPercent(def.total ? def.occupied / def.total : 0, lang)} />
          <Stat label={t('war.losses')} value={formatInt(w.losses.defenders, lang)} />
        </div>
      </div>
      {side && w.goal.type !== 'rebellion' && (
        <Button variant="primary" className="mt-3 w-full" onClick={() => ui.openPeace(w.id, enemyLeader)}>
          {t('war.negotiate')}
        </Button>
      )}
      {callable.length > 0 && (
        <>
          <SectionTitle>{t('war.callAllies')}</SectionTitle>
          {callable.map((m) => (
            <div key={m} className="flex items-center justify-between py-0.5 text-xs">
              <span className="flex items-center gap-1">
                <Flag code={state.countries[m]?.flag ?? 'x-unknown'} className="h-3" />
                {name(m)}
              </span>
              <Button size="sm" onClick={() => cmd({ type: 'callToArms', war: w.id, ally: m }).then((r) => r.ok && toastJoin(r.data as { joined: boolean }, name(m), t))}>
                {t('action.callToArms')}
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function toastJoin(d: { joined: boolean }, country: string, t: (k: string, p?: Record<string, string | number>) => string) {
  useToasts.getState().push(d.joined ? t('diplo.accepted', { country }) : t('diplo.declined', { country }), d.joined ? 'good' : 'bad');
}
