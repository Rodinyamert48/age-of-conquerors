'use client';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Button, Flag, SectionTitle } from '@/components/ui';
import { useReadCtx, useCountryName } from '../hooks';
import { warsOf } from '@/game/ctx';
import { scoreFor } from '@/game/war';
import { warSide } from '@/game/query';
import { warTitle } from '../text';
import { formatDate, formatInt } from '@/lib/format';
import { monthsCrossed } from '@/game/calendar';

export function ScoreBar({ score }: { score: number }) {
  const pct = (score + 100) / 2;
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-danger/50">
      <div className="absolute inset-y-0 left-0 bg-good/80" style={{ width: `${pct}%` }} />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
    </div>
  );
}

export default function WarsTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ui = useUI();
  const name = useCountryName();
  if (!state || !ctx) return null;
  const me = state.player;
  const wars = warsOf(ctx, me);
  const reports = [...state.battleReports].reverse().slice(0, 25);

  return (
    <div className="text-sm">
      {wars.length === 0 && <p className="text-xs text-muted">{t('war.none')}</p>}
      {wars.map((w) => {
        const my = scoreFor(w, me);
        const side = warSide(w, me)!;
        const enemyLeader = side === 'attackers' ? w.defenderLeader : w.attackerLeader;
        return (
          <div key={w.id} className="mb-2 rounded border border-line-2 bg-panel-2 p-2">
            <button type="button" onClick={() => ui.openRight({ kind: 'war', id: w.id })} className="w-full text-left">
              <div className="font-display text-[15px] text-ink">{warTitle(w, t)}</div>
              <div className="mt-1 flex items-center gap-1">
                {w.attackers.slice(0, 6).map((a) => (
                  <Flag key={a} code={state.countries[a]?.flag ?? 'x-rebels'} className="h-3" title={name(a)} />
                ))}
                <span className="px-1 text-xs text-muted">vs</span>
                {w.defenders.slice(0, 6).map((a) => (
                  <Flag key={a} code={state.countries[a]?.flag ?? 'x-rebels'} className="h-3" title={name(a)} />
                ))}
              </div>
            </button>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-muted">{t('war.score')}</span>
              <span className={`tabular ${my >= 0 ? 'text-good' : 'text-danger'}`}>{Math.round(my)}</span>
            </div>
            <ScoreBar score={my} />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{t('common.months', { n: monthsCrossed(w.startDay, state.day) })}</span>
              <span>
                {t('war.losses')}: {formatInt(side === 'attackers' ? w.losses.attackers : w.losses.defenders, lang)} / {formatInt(side === 'attackers' ? w.losses.defenders : w.losses.attackers, lang)}
              </span>
            </div>
            {w.goal.type !== 'rebellion' && (
              <Button size="sm" className="mt-1.5 w-full" onClick={() => ui.openPeace(w.id, enemyLeader)}>
                {t('war.negotiate')}
              </Button>
            )}
          </div>
        );
      })}
      <SectionTitle>{t('battle.reports')}</SectionTitle>
      {reports.length === 0 && <p className="text-xs text-muted">—</p>}
      {reports.map((r) => {
        const mine = r.attacker.tag === me || r.defender.tag === me;
        const won = (r.winner === 'attacker' ? r.attacker.tag : r.defender.tag) === me;
        const place = r.location < ctx.w.P ? (lang === 'en' ? ctx.w.data.provinces[r.location].nameEn : ctx.w.data.provinces[r.location].name) : t('battle.naval');
        return (
          <button
            type="button"
            key={r.id}
            onClick={() => ui.openRight({ kind: 'report', id: r.id })}
            className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-xs hover:bg-white/5"
          >
            <span className="flex min-w-0 items-center gap-1">
              <Flag code={state.countries[r.attacker.tag]?.flag ?? 'x-rebels'} className="h-2.5" />
              <Flag code={state.countries[r.defender.tag]?.flag ?? 'x-rebels'} className="h-2.5" />
              <span className="truncate text-ink-2">{place}</span>
            </span>
            <span className={mine ? (won ? 'text-good' : 'text-danger') : 'text-muted'}>{mine ? (won ? t('battle.won') : t('battle.lost')) : formatDate(r.endDay, lang)}</span>
          </button>
        );
      })}
    </div>
  );
}
