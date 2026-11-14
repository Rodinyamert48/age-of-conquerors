'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { useGame } from '@/store/game';
import { useT, useLang } from '@/i18n';
import { Button, Modal } from '@/components/ui';
import { geometryFor } from '@/components/map/MapCanvas';
import { getLod } from '@/components/map/geometry';
import { mute, rgbStr, type RGB } from '@/components/map/modes';
import { formatDate } from '@/lib/format';
import { REBEL_TAG } from '@/game/query';
import { stepDays } from '@/game/calendar';

const W = 960;

/** Zaman atlamalı tekrar: haritanın oyun başından bugüne nasıl değiştiğini oynatır; WebM video olarak indirilebilir */
export default function ReplayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const geo = useGame((s) => s.geo);
  const world = useGame((s) => s.world);
  const ref = useRef<HTMLCanvasElement>(null);
  const [run, setRun] = useState(0);
  const [record, setRecord] = useState(false);
  const [busy, setBusy] = useState(false);
  const H = geo ? Math.round((W * geo.height) / geo.width) : 480;

  useEffect(() => {
    const cv = ref.current;
    const st = useGame.getState().state;
    if (!open || !cv || !st || !geo || !world) return;
    const g = cv.getContext('2d');
    if (!g) return;
    const geom = geometryFor(geo);
    const lod = getLod(geom, 3);
    const k = W / geo.width;
    const owners = (st.ownerStart ?? st.provinces.map((p) => p.owner)).slice();
    const log = st.ownerLog ?? [];
    const colorOf = (tag: string): string => rgbStr(tag === REBEL_TAG ? [60, 60, 60] : mute((st.countries[tag]?.color ?? [120, 120, 120]) as RGB));
    const paint = (p: number) => {
      g.setTransform(k, 0, 0, k, 0, 0);
      g.fillStyle = colorOf(owners[p]);
      g.fill(lod.provincePaths[p], 'evenodd');
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.6 / k;
      g.stroke(lod.provincePaths[p]);
    };
    const label = (turn: number) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(6,6,6,0.85)';
      g.fillRect(0, H - 34, 330, 34);
      g.fillStyle = '#ecd68a';
      g.font = '600 18px "Playfair Display", Georgia, serif';
      g.textBaseline = 'middle';
      // Tur → yaklaşık tarih (tur uzunluğu oyun içinde değişmiş olabilir; son ayara göre gösterilir)
      let day = st.meta.startDay;
      for (let i = 0; i < turn; i++) day += stepDays(day, st.rules.timeStep);
      g.fillText(`${formatDate(Math.min(day, st.day), lang)} · AGE of CONQUERORS`, 12, H - 17);
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1623';
    g.fillRect(0, 0, W, H);
    for (let p = 0; p < world.P; p++) paint(p);
    label(0);
    if (run === 0) return;
    // Oynatma: yaklaşık 12 saniyede tüm oyun
    let rec: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    if (record && typeof MediaRecorder !== 'undefined' && cv.captureStream) {
      try {
        rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
          a.download = `age-of-conquerors-${st.player}-replay.webm`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        };
        rec.start();
      } catch {
        rec = null;
      }
    }
    const total = Math.max(1, st.turn);
    const frames = 360;
    let frame = 0;
    let idx = 0;
    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      frame++;
      const turn = Math.round((frame / frames) * total);
      while (idx < log.length && log[idx][0] <= turn) {
        const [, p, owner] = log[idx++];
        owners[p] = owner;
        paint(p);
      }
      label(turn);
      if (frame < frames) raf = requestAnimationFrame(tick);
      else {
        setTimeout(() => {
          rec?.stop();
          setBusy(false);
          setRecord(false);
        }, 600);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (rec && rec.state !== 'inactive') rec.stop();
    };
  }, [open, run, record, geo, world, lang, H]);

  if (!state || !geo) return null;
  const start = (rec: boolean) => {
    setRecord(rec);
    setBusy(true);
    setRun((n) => n + 1);
  };
  return (
    <Modal open={open} onClose={onClose} title={t('replay.title')} wide>
      <canvas ref={ref} width={W} height={H} className="w-full rounded border border-line" data-testid="replay-canvas" />
      <p className="mt-1 text-[11px] text-muted">{t('replay.hint', { n: state.ownerLog?.length ?? 0 })}</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button disabled={busy} onClick={() => start(false)}>
          <Play size={14} /> {t('replay.play')}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => start(true)}>
          <Download size={14} /> {t('replay.download')}
        </Button>
      </div>
    </Modal>
  );
}
