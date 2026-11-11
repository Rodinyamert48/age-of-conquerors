'use client';
import { Check, Lock } from 'lucide-react';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { Bar, Button, Collapsible, SectionTitle, Toggle } from '@/components/ui';
import { useCommand, useReadCtx } from '../hooks';
import { TECHS, TECH_BRANCHES, TECH_BY_ID, type TechDef } from '@/game/defs/techs';
import { canResearch, researchPoints, techCost } from '@/game/construction';
import { formatNumber } from '@/lib/format';
import { yearOf } from '@/game/calendar';
import type { Ctx } from '@/game/ctx';

/**
 * Araştırma: varsayılan olarak otomatik. Oyuncu isterse yalnızca şu an seçilebilen teknolojiler
 * arasından seçer; tüm teknoloji ağacı katlanır bölümde durur.
 */
export default function ResearchTab() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const cmd = useCommand();
  if (!state || !ctx) return null;
  const c = state.countries[state.player];
  const rp = researchPoints(ctx, c.tag);
  const cur = c.research.current;
  const curCost = cur ? techCost(ctx, cur) : 0;
  const auto = c.autoResearch !== false;
  const available = TECHS.filter((x) => !c.techs.includes(x.id) && x.id !== cur && canResearch(ctx, c.tag, x.id).ok).sort((a, b) => a.year - b.year);

  return (
    <div className="text-sm">
      <div className="rounded border border-line bg-panel-2 p-2.5">
        <div className="text-xs text-muted">{t('research.current')}</div>
        {cur ? (
          <>
            <div className="mt-0.5 font-display text-base text-gold-soft">{TECH_BY_ID[cur].name[lang]}</div>
            <Bar value={c.research.progress} max={curCost} className="mt-1.5" />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span className="tabular">{t('research.progress', { progress: formatNumber(c.research.progress, lang, 0), cost: formatNumber(curCost, lang, 0) })}</span>
              <span>{t('research.eta', { months: Math.max(0, Math.ceil((curCost - c.research.progress) / Math.max(0.01, rp))) })}</span>
            </div>
          </>
        ) : (
          <div className="mt-0.5 text-ink-2">{t('research.none')}</div>
        )}
        <div className="mt-2 border-t border-line pt-2">
          <label className="flex items-center justify-between gap-2 text-[13px] text-ink">
            {t('research.auto')}
            <Toggle checked={auto} onChange={(v) => cmd({ type: 'setAutoResearch', value: v })} label={t('research.auto')} />
          </label>
          <div className="mt-0.5 text-[11px] text-muted">{t('research.autoHint')}</div>
        </div>
      </div>

      <SectionTitle right={<span className="text-xs text-muted">{t('research.points', { rp: formatNumber(rp, lang, 1) })}</span>}>{t('research.available')}</SectionTitle>
      {available.length === 0 && <div className="text-xs text-muted">{t('common.none')}</div>}
      <ul className="flex flex-col gap-1">
        {available.slice(0, 12).map((tech) => (
          <TechItem key={tech.id} tech={tech} ctx={ctx} />
        ))}
      </ul>
      <div className="mt-1 text-[11px] text-muted">{t('research.switchNote')}</div>

      <Collapsible title={t('research.fullTree')} right={<span className="tabular text-xs">{c.techs.length} / {TECHS.length}</span>}>
        {TECH_BRANCHES.map((br) => (
          <div key={br}>
            <SectionTitle>{t(`branch.${br}`)}</SectionTitle>
            <ul className="flex flex-col gap-1">
              {TECHS.filter((x) => x.branch === br)
                .sort((a, b) => a.year - b.year)
                .map((tech) => (
                  <TechItem key={tech.id} tech={tech} ctx={ctx} />
                ))}
            </ul>
          </div>
        ))}
      </Collapsible>
    </div>
  );
}

function TechItem({ tech, ctx }: { tech: TechDef; ctx: Ctx }) {
  const t = useT();
  const lang = useLang();
  const cmd = useCommand();
  const s = ctx.s;
  const c = s.countries[s.player];
  const cur = c.research.current;
  const year = yearOf(s.day);
  const done = c.techs.includes(tech.id);
  const chk = canResearch(ctx, c.tag, tech.id);
  const active = cur === tech.id;
  const ahead = tech.year > year ? Math.round((techCost(ctx, tech.id) / tech.cost - 1) * 100) : 0;
  const unlocks = [...(tech.unlockUnits ?? []).map((u) => t(`unit.${u}`)), ...(tech.unlockBuildings ?? []).map((b) => `${t(`building.${b.id}`)} ${b.level}`)];
  const modText = Object.entries(tech.mods as Record<string, number | undefined>)
    .map(([k, v]) => `${t(`mod.${k}`)} ${(v ?? 0) > 0 ? '+' : ''}${Math.abs(v ?? 0) < 1 ? `${Math.round((v ?? 0) * 1000) / 10}%` : v}`)
    .join(' · ');
  return (
    <li className={`rounded border px-2 py-1.5 ${active ? 'border-gold bg-gold/10' : done ? 'border-line/60 bg-panel-2/50 opacity-70' : chk.ok ? 'border-line-2 bg-panel-2' : 'border-line/50 opacity-55'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-ink">
          {done ? <Check size={13} className="text-good" /> : !chk.ok ? <Lock size={12} className="text-faint" /> : null}
          {tech.name[lang]}
        </span>
        <span className="text-[11px] text-muted">{tech.year}</span>
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{modText}</div>
      {unlocks.length > 0 && <div className="text-[11px] text-info">{t('research.unlocks', { list: unlocks.join(', ') })}</div>}
      {!done && chk.ok && !active && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {formatNumber(techCost(ctx, tech.id), lang, 0)} RP{ahead > 0 ? ` · ${t('research.ahead', { pct: ahead })}` : ''}
          </span>
          <Button size="sm" onClick={() => cmd({ type: 'setResearch', tech: tech.id })}>
            {t('research.start')}
          </Button>
        </div>
      )}
      {!done && !chk.ok && chk.reason && <div className="text-[11px] text-faint">{t(chk.reason)}</div>}
    </li>
  );
}
