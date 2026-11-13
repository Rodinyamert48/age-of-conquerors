'use client';
import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { Button, Modal } from '@/components/ui';
import { formatCompact, formatDate, formatMoney } from '@/lib/format';
import { provincesOf } from '@/game/ctx';
import { useReadCtx } from './hooks';
import { notificationText } from './text';
import { GAME_VERSION } from '@/lib/version';
import type { GameNotification } from '@/game/types';

const W = 1200;
const H = 675;

/** Tarihçe: ülkenin grafiği, savaş karnesi ve zaman çizelgesi. Tuvale çizilir, PNG olarak indirilebilir. */
export default function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const ctx = useReadCtx();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!open || !cv || !state || !ctx) return;
    const g = cv.getContext('2d');
    if (!g) return;
    const c = state.countries[state.player];
    const gold = '#d4af37';
    const ink = '#efe7d2';
    const muted = '#a39a82';
    g.fillStyle = '#080807';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = gold;
    g.lineWidth = 2;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.strokeStyle = 'rgba(212,175,55,0.35)';
    g.lineWidth = 1;
    g.strokeRect(22, 22, W - 44, H - 44);
    // Başlık
    g.fillStyle = `rgb(${c.color.join(',')})`;
    g.fillRect(50, 52, 10, 58);
    g.fillStyle = ink;
    g.font = '700 40px "Playfair Display", Georgia, serif';
    g.textBaseline = 'alphabetic';
    g.fillText(lang === 'en' ? c.nameEn : c.name, 74, 88);
    g.fillStyle = muted;
    g.font = '16px "Libre Baskerville", Georgia, serif';
    g.fillText(`${formatDate(state.meta.startDay, lang)} — ${formatDate(state.day, lang)} · ${t('top.turn', { n: state.turn + 1 })}`, 74, 112);
    g.textAlign = 'right';
    g.fillStyle = gold;
    g.font = '600 18px "Playfair Display", Georgia, serif';
    g.fillText('AGE of CONQUERORS', W - 50, 76);
    g.fillStyle = muted;
    g.font = '13px "Libre Baskerville", Georgia, serif';
    g.fillText(`${GAME_VERSION}`, W - 50, 98);
    g.textAlign = 'left';
    // Göstergeler
    const stats: [string, string][] = [
      [t('country.provinces'), String(provincesOf(ctx, c.tag).length)],
      [t('top.treasury'), formatMoney(c.treasury, lang)],
      [t('history.warsWon'), String(c.stats.warsWon ?? 0)],
      [t('history.warsLost'), String(c.stats.warsLost ?? 0)],
      [t('country.battlesWon'), String(c.stats.battlesWon)],
      [t('country.battlesLost'), String(c.stats.battlesLost)],
      [t('country.conquered'), String(c.stats.provincesConquered)],
      [t('country.casualties'), formatCompact(c.stats.casualties, lang)],
    ];
    stats.forEach(([label, value], i) => {
      const x = 50 + (i % 4) * 140;
      const y = 150 + Math.floor(i / 4) * 62;
      g.fillStyle = muted;
      g.font = '12px "Libre Baskerville", Georgia, serif';
      g.fillText(label.toUpperCase().slice(0, 18), x, y);
      g.fillStyle = ink;
      g.font = '600 24px "Playfair Display", Georgia, serif';
      g.fillText(value, x, y + 28);
    });
    // Grafik: bölge sayısı (altın) ve hazine (açık)
    const gx = 50;
    const gy = 290;
    const gw = 540;
    const gh = 320;
    g.strokeStyle = 'rgba(212,175,55,0.35)';
    g.strokeRect(gx, gy, gw, gh);
    const hist = state.history;
    const series = (pick: (h: (typeof hist)[number]) => number, color: string) => {
      if (hist.length < 2) return;
      const vals = hist.map(pick);
      const mn = Math.min(0, ...vals);
      const mx = Math.max(1, ...vals);
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      vals.forEach((v, i) => {
        const x = gx + 8 + (i / (vals.length - 1)) * (gw - 16);
        const y = gy + gh - 10 - ((v - mn) / (mx - mn || 1)) * (gh - 20);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    };
    series((h) => h.treasury, '#8fb8d8');
    series((h) => h.provinces, gold);
    g.font = '13px "Libre Baskerville", Georgia, serif';
    g.fillStyle = gold;
    g.fillText(`— ${t('country.provinces')}`, gx + 10, gy + 22);
    g.fillStyle = '#8fb8d8';
    g.fillText(`— ${t('top.treasury')}`, gx + 150, gy + 22);
    if (hist.length < 2) {
      g.fillStyle = muted;
      g.fillText(t('history.noData'), gx + 10, gy + gh / 2);
    }
    // Zaman çizelgesi
    const tx = 630;
    g.fillStyle = gold;
    g.font = '600 20px "Playfair Display", Georgia, serif';
    g.fillText(t('history.timeline'), tx, 160);
    const items = (state.chronicle ?? []).slice(-17);
    g.font = '13px "Libre Baskerville", Georgia, serif';
    if (!items.length) {
      g.fillStyle = muted;
      g.fillText(t('history.empty'), tx, 190);
    }
    items.forEach((it, i) => {
      const y = 190 + i * 25;
      g.fillStyle = it.severity === 'good' ? '#7fc98a' : it.severity === 'bad' || it.severity === 'critical' ? '#d1584c' : muted;
      g.fillRect(tx, y - 9, 6, 6);
      g.fillStyle = muted;
      g.fillText(formatDate(it.day, lang), tx + 14, y);
      g.fillStyle = ink;
      const text = notificationText({ ...it, id: 0, kind: 'system', player: true } as GameNotification, t, lang);
      let s = text;
      while (g.measureText(s).width > 380 && s.length > 8) s = s.slice(0, -2);
      g.fillText(s === text ? s : `${s}…`, tx + 130, y);
    });
  }, [open, state, ctx, t, lang]);

  if (!state) return null;
  return (
    <Modal open={open} onClose={onClose} title={t('history.title')} wide>
      <canvas ref={ref} width={W} height={H} className="w-full rounded border border-line" />
      <div className="mt-2 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            const cv = ref.current;
            if (!cv) return;
            const a = document.createElement('a');
            a.href = cv.toDataURL('image/png');
            a.download = `age-of-conquerors-${state.player}-${state.turn + 1}.png`;
            a.click();
          }}
        >
          <Download size={14} /> {t('history.download')}
        </Button>
      </div>
    </Modal>
  );
}
