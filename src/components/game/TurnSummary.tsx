'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { formatInt } from '@/lib/format';

/** Tur sonu savaş özeti: kazanılan/kaybedilen bölgeler, muharebeler ve kayıplar tek kartta */
export default function TurnSummary() {
  const t = useT();
  const lang = useLang();
  const sum = useGame((s) => s.turnSummary);
  useEffect(() => {
    if (!sum) return;
    const id = setTimeout(() => useGame.setState({ turnSummary: null }), 9000);
    return () => clearTimeout(id);
  }, [sum]);
  if (!sum) return null;
  const rows: [string, number, 'good' | 'bad'][] = [
    [t('summary.gained'), sum.gained, 'good'],
    [t('summary.lost'), sum.lost, 'bad'],
    [t('summary.battlesWon'), sum.battlesWon, 'good'],
    [t('summary.battlesLost'), sum.battlesLost, 'bad'],
    [t('summary.kills'), sum.kills, 'good'],
    [t('summary.casualties'), sum.casualties, 'bad'],
  ];
  return (
    <div className="absolute left-1/2 top-2 z-20 w-64 -translate-x-1/2 rounded border border-gold-2 bg-panel/95 px-3 py-2 text-xs shadow-xl" data-testid="turn-summary">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-sm text-gold-soft">{t('summary.title')}</span>
        <button type="button" onClick={() => useGame.setState({ turnSummary: null })} aria-label={t('common.close')} className="text-muted hover:text-ink">
          <X size={14} />
        </button>
      </div>
      {rows
        .filter((r) => r[1] > 0)
        .map(([label, v, tone]) => (
          <div key={label} className="flex justify-between py-0.5">
            <span className="text-muted">{label}</span>
            <span className={`tabular ${tone === 'good' ? 'text-good' : 'text-danger'}`}>{formatInt(v, lang)}</span>
          </div>
        ))}
    </div>
  );
}
