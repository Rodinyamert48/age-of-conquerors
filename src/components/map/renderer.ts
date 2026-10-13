/**
 * Canvas tabanlı harita çizicisi. React'ten bağımsızdır; MapCanvas bileşeni tarafından yönetilir.
 * Pahalı yollar (renk grupları, ülke sınırları, etiketler) yalnızca ilgili veri değiştiğinde yeniden kurulur.
 */
import type { GameState, Tag } from '@/game/types';
import type { Ctx } from '@/game/ctx';
import type { World } from '@/game/world';
import { countryBorders, outline, type MapGeometry } from './geometry';
import { rgbStr, type ProvinceColoring, type RGB } from './modes';
import { armySize, atWar, isFriendly, REBEL_TAG } from '@/game/query';
import { armyBaseSpeed, edgeDays } from '@/game/movement';
import { formatCompact } from '@/lib/format';
import type { Lang } from '@/lib/format';

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Selection {
  province: number | null;
  country: Tag | null;
  armies: string[];
  battle: string | null;
}

export interface RenderOptions {
  quality: 'low' | 'medium' | 'high';
  animations: boolean;
  lang: Lang;
  showSeaNodes: boolean;
  /** imleç altındaki hedefe önizleme rotası */
  previewPath: number[] | null;
  previewArmy: string | null;
  fog: boolean;
}

export interface MarkerHit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'army' | 'battle';
}

interface CountryLabel {
  tag: Tag;
  name: string;
  x: number;
  y: number;
  size: number;
  angle: number;
}

const OCEAN = '#13253b';
const OCEAN_DEEP = '#0e1c2e';

export class MapRenderer {
  /** Son görünüm (ekranlar arası korunur) */
  static lastView: View | null = null;
  canvas: HTMLCanvasElement;
  g: MapGeometry;
  world: World;
  dpr = 1;
  cssW = 0;
  cssH = 0;
  view: View = { x: 0, y: 0, scale: 0.1 };
  markerHits: MarkerHit[] = [];

  private fillGroups: { color: string; path: Path2D }[] = [];
  private stripeGroups: { color: RGB; path: Path2D }[] = [];
  private coloringRef: ProvinceColoring | null = null;
  private borderPath: Path2D | null = null;
  private borderKey = '';
  private labels: CountryLabel[] = [];
  private labelKey = '';
  private selOutline: Path2D | null = null;
  private selKey = '';
  private patterns = new Map<string, CanvasPattern>();

  constructor(canvas: HTMLCanvasElement, g: MapGeometry, world: World) {
    this.canvas = canvas;
    this.g = g;
    this.world = world;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  minScale() {
    return Math.min(this.cssW / (this.g.width * 1.05), this.cssH / (this.g.height * 1.05));
  }

  clampView() {
    const v = this.view;
    v.scale = Math.max(this.minScale(), Math.min(14, v.scale));
    const visW = this.cssW / v.scale;
    const visH = this.cssH / v.scale;
    const W = this.g.width;
    const H = this.g.height;
    if (visW >= W) v.x = (W - visW) / 2;
    else v.x = Math.max(-visW * 0.3, Math.min(W - visW * 0.7, v.x));
    if (visH >= H) v.y = (H - visH) / 2;
    else v.y = Math.max(-visH * 0.3, Math.min(H - visH * 0.7, v.y));
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.view.x + sx / this.view.scale, this.view.y + sy / this.view.scale];
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.view.x) * this.view.scale, (y - this.view.y) * this.view.scale];
  }

  fitWorld() {
    this.view.scale = this.minScale();
    this.view.x = 0;
    this.view.y = 0;
    this.clampView();
  }

  centerOn(x: number, y: number, scale?: number) {
    if (scale) this.view.scale = scale;
    this.view.x = x - this.cssW / 2 / this.view.scale;
    this.view.y = y - this.cssH / 2 / this.view.scale;
    this.clampView();
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.view.scale *= factor;
    this.clampView();
    this.view.x = wx - sx / this.view.scale;
    this.view.y = wy - sy / this.view.scale;
    this.clampView();
  }

  // -------------------------------------------------------------------------
  private setColoring(c: ProvinceColoring) {
    if (this.coloringRef === c) return;
    this.coloringRef = c;
    const groups = new Map<string, Path2D>();
    c.fill.forEach((rgb, p) => {
      const key = rgbStr(rgb);
      let path = groups.get(key);
      if (!path) groups.set(key, (path = new Path2D()));
      path.addPath(this.g.provincePaths[p]);
    });
    this.fillGroups = [...groups.entries()].map(([color, path]) => ({ color, path }));
    const sg = new Map<string, { color: RGB; path: Path2D }>();
    c.stripe.forEach((rgb, p) => {
      if (!rgb) return;
      const key = rgbStr(rgb);
      let e = sg.get(key);
      if (!e) sg.set(key, (e = { color: rgb, path: new Path2D() }));
      e.path.addPath(this.g.provincePaths[p]);
    });
    this.stripeGroups = [...sg.values()];
  }

  private ensureBorders(s: GameState) {
    const key = `${s.versions.owners}`;
    if (this.borderKey === key && this.borderPath) return;
    this.borderKey = key;
    this.borderPath = countryBorders(this.g, (p) => s.provinces[p].owner);
  }

  private ensureLabels(s: GameState, lang: Lang) {
    const key = `${s.versions.owners}|${lang}`;
    if (this.labelKey === key) return;
    this.labelKey = key;
    const w = this.world;
    const byOwner = new Map<Tag, number[]>();
    s.provinces.forEach((ps, i) => {
      if (ps.owner === REBEL_TAG) return;
      let arr = byOwner.get(ps.owner);
      if (!arr) byOwner.set(ps.owner, (arr = []));
      arr.push(i);
    });
    const labels: CountryLabel[] = [];
    for (const [tag, provs] of byOwner) {
      const c = s.countries[tag];
      if (!c) continue;
      // En büyük bitişik küme
      const set = new Set(provs);
      const seen = new Set<number>();
      let best: number[] = [];
      let bestArea = -1;
      for (const p0 of provs) {
        if (seen.has(p0)) continue;
        const comp: number[] = [];
        const stack = [p0];
        seen.add(p0);
        let area = 0;
        while (stack.length) {
          const u = stack.pop()!;
          comp.push(u);
          area += w.data.provinces[u].area;
          for (const v of w.data.provinces[u].adj) if (set.has(v) && !seen.has(v)) {
            seen.add(v);
            stack.push(v);
          }
        }
        if (area > bestArea) {
          bestArea = area;
          best = comp;
        }
      }
      let sx = 0, sy = 0, sa = 0;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of best) {
        const a = Math.sqrt(w.data.provinces[p].area);
        sx += w.x[p] * a;
        sy += w.y[p] * a;
        sa += a;
        x0 = Math.min(x0, this.g.bbox[p * 4]);
        x1 = Math.max(x1, this.g.bbox[p * 4 + 2]);
        y0 = Math.min(y0, this.g.bbox[p * 4 + 1]);
        y1 = Math.max(y1, this.g.bbox[p * 4 + 3]);
      }
      if (sa <= 0) continue;
      const name = (lang === 'en' ? c.nameEn : c.name).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US');
      const bw = x1 - x0;
      const bh = y1 - y0;
      const size = Math.max(4, Math.min(90, Math.min((bw * 0.85) / (name.length * 0.62), bh * 0.5)));
      const angle = bw > bh * 1.8 ? 0 : 0;
      labels.push({ tag, name, x: sx / sa, y: sy / sa, size, angle });
    }
    labels.sort((a, b) => b.size - a.size);
    this.labels = labels;
  }

  private pattern(ctx: CanvasRenderingContext2D, color: RGB): CanvasPattern | null {
    const key = rgbStr(color);
    let p = this.patterns.get(key);
    if (!p) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const x = c.getContext('2d')!;
      x.strokeStyle = rgbStr(color, 0.95);
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(-2, 12);
      x.lineTo(12, -2);
      x.moveTo(-2, 2);
      x.lineTo(2, -2);
      x.moveTo(8, 12);
      x.lineTo(12, 8);
      x.stroke();
      p = ctx.createPattern(c, 'repeat') ?? undefined;
      if (!p) return null;
      this.patterns.set(key, p);
    }
    return p;
  }

  // -------------------------------------------------------------------------
  draw(rctx: Ctx, coloring: ProvinceColoring, sel: Selection, hover: number, opts: RenderOptions, time: number) {
    const s = rctx.s;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.setColoring(coloring);
    this.ensureBorders(s);
    this.ensureLabels(s, opts.lang);
    const { dpr } = this;
    const v = this.view;
    const k = v.scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OCEAN_DEEP;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, -v.x * k, -v.y * k);
    // Deniz alanı
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, this.g.width, this.g.height);
    this.drawGraticule(ctx, v.scale);
    // Bölge dolguları
    for (const fg of this.fillGroups) {
      ctx.fillStyle = fg.color;
      ctx.fill(fg.path, 'evenodd');
    }
    // İşgal çizgileri (ekranda sabit boyutlu)
    if (this.stripeGroups.length) {
      const m = new DOMMatrix().scaleSelf(1 / v.scale, 1 / v.scale);
      for (const sg of this.stripeGroups) {
        const pat = this.pattern(ctx, sg.color);
        if (!pat) continue;
        pat.setTransform(m);
        ctx.fillStyle = pat;
        ctx.fill(sg.path, 'evenodd');
      }
    }
    // Göller
    ctx.fillStyle = OCEAN;
    ctx.fill(this.g.lakes, 'evenodd');
    // Fareyle üzerine gelinen bölge
    if (hover >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill(this.g.provincePaths[hover], 'evenodd');
    }
    if (sel.province !== null) {
      ctx.fillStyle = 'rgba(255,240,200,0.12)';
      ctx.fill(this.g.provincePaths[sel.province], 'evenodd');
    }
    const px = 1 / v.scale; // 1 css pikseli harita biriminde
    // Nehirler
    if (opts.quality !== 'low') {
      ctx.strokeStyle = 'rgba(96,150,210,0.55)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const layers = opts.quality === 'high' ? 3 : 2;
      for (let i = 0; i < layers; i++) {
        if (i === 1 && v.scale < 0.25) break;
        if (i === 2 && v.scale < 0.6) break;
        ctx.lineWidth = px * (i === 0 ? 1.2 : 0.8);
        ctx.stroke(this.g.rivers[i]);
      }
    }
    // Bölge sınırları
    if (opts.quality !== 'low' && v.scale > 0.2) {
      const a = Math.min(0.35, (v.scale - 0.2) * 0.5);
      ctx.strokeStyle = `rgba(20,24,30,${a})`;
      ctx.lineWidth = px * 0.6;
      ctx.stroke(this.g.provinceBorders);
    }
    // Kıyı ve ülke sınırları
    ctx.strokeStyle = 'rgba(10,14,20,0.75)';
    ctx.lineWidth = px * 0.9;
    ctx.stroke(this.g.coast);
    if (this.borderPath) {
      ctx.strokeStyle = 'rgba(12,14,18,0.9)';
      ctx.lineWidth = px * 1.3;
      ctx.stroke(this.borderPath);
    }
    // Seçili ülke vurgusu
    if (sel.country) {
      const key = `${sel.country}|${s.versions.owners}`;
      if (key !== this.selKey) {
        this.selKey = key;
        const tag = sel.country;
        const cands: number[] = [];
        s.provinces.forEach((ps, i) => {
          if (ps.owner === tag) cands.push(i);
        });
        this.selOutline = outline(this.g, (p) => s.provinces[p].owner === tag, cands);
      }
      if (this.selOutline) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = px * 4.5;
        ctx.stroke(this.selOutline);
        ctx.strokeStyle = '#e2bf62';
        ctx.lineWidth = px * 2.2;
        ctx.stroke(this.selOutline);
      }
    }
    if (sel.province !== null) {
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = px * 1.8;
      ctx.stroke(this.g.provincePaths[sel.province]);
    }
    // Ekran uzayı katmanları
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLabels(ctx, s, opts);
    this.drawSieges(ctx, rctx);
    if (opts.showSeaNodes) this.drawSeaNodes(ctx);
    this.drawPaths(ctx, rctx, sel, opts);
    this.markerHits = [];
    this.drawArmies(ctx, rctx, sel, opts, time);
    this.drawBattles(ctx, rctx, sel, opts, time);
    MapRenderer.lastView = { ...this.view };
  }

  private drawGraticule(ctx: CanvasRenderingContext2D, scale: number) {
    if (scale < 0.08) return;
    ctx.strokeStyle = 'rgba(160,190,220,0.05)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    const step = this.g.width / 24;
    for (let x = 0; x <= this.g.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.g.height);
    }
    for (let y = 0; y <= this.g.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.g.width, y);
    }
    ctx.stroke();
  }

  private visible(x: number, y: number, margin = 40): boolean {
    const [sx, sy] = this.worldToScreen(x, y);
    return sx > -margin && sy > -margin && sx < this.cssW + margin && sy < this.cssH + margin;
  }

  private drawLabels(ctx: CanvasRenderingContext2D, s: GameState, opts: RenderOptions) {
    const v = this.view;
    const w = this.world;
    // Ülke adları
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed: [number, number, number, number][] = [];
    const overlaps = (r: [number, number, number, number]) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    for (const l of this.labels) {
      const size = l.size * v.scale;
      if (size < 8 || size > 140) continue;
      if (!this.visible(l.x, l.y, 200)) continue;
      const alpha = size > 70 ? Math.max(0, 1 - (size - 70) / 70) : 1;
      if (alpha <= 0.02) continue;
      const fs = Math.min(42, size);
      ctx.font = `600 ${fs}px Georgia, 'Times New Roman', serif`;
      const [sx, sy] = this.worldToScreen(l.x, l.y);
      const tw = ctx.measureText(l.name).width + fs * 0.2 * l.name.length;
      const rect: [number, number, number, number] = [sx - tw / 2, sy - fs / 2, sx + tw / 2, sy + fs / 2];
      if (overlaps(rect)) continue;
      placed.push(rect);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(fs * 0.2)}px`;
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(12,16,24,0.55)';
      ctx.strokeText(l.name, sx, sy);
      ctx.fillStyle = 'rgba(244,236,216,0.92)';
      ctx.fillText(l.name, sx, sy);
      ctx.restore();
    }
    // Bölge adları ve şehirler
    if (v.scale >= 0.9) {
      ctx.font = `500 11px system-ui, sans-serif`;
      for (let p = 0; p < w.P; p++) {
        const wp = w.data.provinces[p];
        if (!this.visible(wp.x, wp.y, 20)) continue;
        const bw = (this.g.bbox[p * 4 + 2] - this.g.bbox[p * 4]) * v.scale;
        const name = opts.lang === 'en' ? wp.nameEn : wp.name;
        const tw = ctx.measureText(name).width;
        if (bw < tw * 0.9 && v.scale < 3) continue;
        const [sx, sy] = this.worldToScreen(wp.x, wp.y);
        const rect: [number, number, number, number] = [sx - tw / 2, sy + 4, sx + tw / 2, sy + 16];
        if (overlaps(rect)) continue;
        placed.push(rect);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,14,20,0.6)';
        ctx.strokeText(name, sx, sy + 10);
        ctx.fillStyle = 'rgba(236,232,220,0.9)';
        ctx.fillText(name, sx, sy + 10);
      }
    }
    // Başkentler
    if (v.scale >= 0.25) {
      for (const c of Object.values(s.countries)) {
        if (!c.alive || c.capital < 0) continue;
        const city = w.data.provinces[c.capital]?.city;
        const x = city?.x ?? w.x[c.capital];
        const y = city?.y ?? w.y[c.capital];
        if (!this.visible(x, y)) continue;
        const [sx, sy] = this.worldToScreen(x, y);
        drawStar(ctx, sx, sy, v.scale > 1 ? 6 : 4.5);
        if (v.scale >= 1.4 && city) {
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(10,14,20,0.7)';
          const nm = opts.lang === 'en' ? city.nameEn : city.name;
          ctx.strokeText(nm, sx + 8, sy);
          ctx.fillStyle = '#f1d98a';
          ctx.fillText(nm, sx + 8, sy);
          ctx.textAlign = 'center';
        }
      }
    }
    if (v.scale >= 2.2) {
      ctx.fillStyle = 'rgba(240,236,224,0.85)';
      for (let p = 0; p < w.P; p++) {
        const city = w.data.provinces[p].city;
        if (!city || city.capital) continue;
        if (!this.visible(city.x, city.y)) continue;
        const [sx, sy] = this.worldToScreen(city.x, city.y);
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawSeaNodes(ctx: CanvasRenderingContext2D) {
    const w = this.world;
    ctx.fillStyle = 'rgba(180,210,240,0.35)';
    for (let i = w.P; i < w.N; i++) {
      if (!this.visible(w.x[i], w.y[i], 5)) continue;
      const [sx, sy] = this.worldToScreen(w.x[i], w.y[i]);
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private nodeScreen(node: number): [number, number] {
    return this.worldToScreen(this.world.x[node], this.world.y[node]);
  }

  /** Hareket halindeki ordunun ara konumu */
  armyPosition(rctx: Ctx, a: GameState['armies'][string]): [number, number] {
    const w = this.world;
    let x = w.x[a.location];
    let y = w.y[a.location];
    if (a.path.length && a.progress > 0) {
      const next = a.path[0];
      let e = -1;
      for (let i = w.edgeStart[a.location]; i < w.edgeStart[a.location + 1]; i++) if (w.edgeTo[i] === next) e = i;
      if (e >= 0) {
        const total = edgeDays(rctx, a, e, armyBaseSpeed(rctx, a));
        const f = Math.max(0, Math.min(1, a.progress / Math.max(1e-6, total)));
        let nx = w.x[next];
        if (Math.abs(nx - x) > this.g.width / 2) nx += nx > x ? -this.g.width : this.g.width;
        x = x + (nx - x) * f;
        y = y + (w.y[next] - y) * f;
      }
    }
    return [x, y];
  }

  private drawPolyline(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i === 0 || Math.abs(x - pts[i - 1][0]) > this.cssW * 0.6) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawPaths(ctx: CanvasRenderingContext2D, rctx: Ctx, sel: Selection, opts: RenderOptions) {
    const s = rctx.s;
    const selected = new Set(sel.armies);
    for (const a of Object.values(s.armies)) {
      if (!a.path.length) continue;
      const mine = a.owner === s.player;
      if (!mine && !selected.has(a.id)) continue;
      const [ax, ay] = this.armyPosition(rctx, a);
      const pts: [number, number][] = [this.worldToScreen(ax, ay), ...a.path.map((n) => this.nodeScreen(n))];
      ctx.lineWidth = selected.has(a.id) ? 2.5 : 1.5;
      ctx.strokeStyle = selected.has(a.id) ? 'rgba(244,214,120,0.95)' : 'rgba(244,214,120,0.5)';
      ctx.setLineDash([6, 5]);
      this.drawPolyline(ctx, pts);
      ctx.setLineDash([]);
      const [ex, ey] = pts[pts.length - 1];
      const [px2, py2] = pts.length > 1 ? pts[pts.length - 2] : pts[0];
      drawArrowHead(ctx, px2, py2, ex, ey, selected.has(a.id) ? '#f4d678' : 'rgba(244,214,120,0.6)');
    }
    if (opts.previewPath && opts.previewArmy) {
      const a = s.armies[opts.previewArmy];
      if (a) {
        const [ax, ay] = this.armyPosition(rctx, a);
        const pts: [number, number][] = [this.worldToScreen(ax, ay), ...opts.previewPath.map((n) => this.nodeScreen(n))];
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([3, 4]);
        this.drawPolyline(ctx, pts);
        ctx.setLineDash([]);
      }
    }
  }

  private drawArmies(ctx: CanvasRenderingContext2D, rctx: Ctx, sel: Selection, opts: RenderOptions, time: number) {
    const s = rctx.s;
    const player = s.player;
    const stacks = new Map<string, number>();
    const selected = new Set(sel.armies);
    const list = Object.values(s.armies).sort((a, b) => (a.owner === player ? 1 : 0) - (b.owner === player ? 1 : 0));
    for (const a of list) {
      const [wx, wy] = this.armyPosition(rctx, a);
      if (!this.visible(wx, wy, 30)) continue;
      // Uzak bakışta yalnızca büyük ya da oyuncuyla ilgili orduları göster
      const relevant = a.owner === player || atWar(rctx, player, a.owner) || selected.has(a.id);
      if (this.view.scale < 0.18 && !relevant) continue;
      const [sx, sy0] = this.worldToScreen(wx, wy);
      let sy = sy0;
      const key = `${Math.round(sx / 6)}|${Math.round(sy / 6)}`;
      const n = stacks.get(key) ?? 0;
      stacks.set(key, n + 1);
      sy -= 12 + n * 17;
      const owner = s.countries[a.owner];
      const color: RGB = a.owner === REBEL_TAG ? [50, 50, 50] : ((owner?.color ?? [120, 120, 120]) as RGB);
      const hidden = opts.fog && a.owner !== player && !isFriendly(rctx, player, a.owner);
      const label = hidden ? '?' : a.isNavy ? `${formatCompact(a.units.navy, opts.lang, 0)}⚓` : formatCompact(armySize(a), opts.lang, 0);
      ctx.font = '700 10px system-ui, sans-serif';
      const tw = Math.max(26, ctx.measureText(label).width + 12);
      const h = 15;
      const x = sx - tw / 2;
      const y = sy - h / 2;
      let border = 'rgba(16,18,24,0.9)';
      if (a.owner === player) border = '#e2bf62';
      else if (atWar(rctx, player, a.owner)) border = '#e05a4f';
      else if (isFriendly(rctx, player, a.owner)) border = '#7fb2e8';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 1.5, y + 2, tw, h);
      ctx.fillStyle = rgbStr(color);
      roundRect(ctx, x, y, tw, h, a.isNavy ? 7 : 2);
      ctx.fill();
      ctx.lineWidth = selected.has(a.id) ? 2.5 : 1.4;
      ctx.strokeStyle = selected.has(a.id) ? '#fff6dc' : border;
      ctx.stroke();
      if (a.battle && opts.animations) {
        const pulse = 0.5 + 0.5 * Math.sin(time / 180);
        ctx.strokeStyle = `rgba(240,90,70,${0.4 + pulse * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 2, y - 2, tw + 4, h + 4);
      }
      const lum = color[0] * 0.3 + color[1] * 0.59 + color[2] * 0.11;
      ctx.fillStyle = lum > 150 ? '#14161b' : '#f4efe2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, sy + 0.5);
      // Moral çubuğu
      if (!hidden) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y + h, tw, 2.5);
        ctx.fillStyle = a.morale > 0.6 ? '#7ccf7a' : a.morale > 0.3 ? '#e2bf62' : '#e05a4f';
        ctx.fillRect(x, y + h, tw * Math.max(0, Math.min(1, a.morale)), 2.5);
      }
      this.markerHits.push({ id: a.id, x, y, w: tw, h: h + 3, kind: 'army' });
    }
  }

  private drawBattles(ctx: CanvasRenderingContext2D, rctx: Ctx, sel: Selection, opts: RenderOptions, time: number) {
    const s = rctx.s;
    for (const b of Object.values(s.battles)) {
      const node = b.location;
      const [sx0, sy0] = this.nodeScreen(node);
      if (sx0 < -30 || sy0 < -30 || sx0 > this.cssW + 30 || sy0 > this.cssH + 30) continue;
      const sx = sx0 + 18;
      const sy = sy0 + 8;
      const pulse = opts.animations ? 0.5 + 0.5 * Math.sin(time / 220) : 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 10 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = sel.battle === b.id ? 'rgba(240,90,70,0.95)' : 'rgba(170,40,34,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fbe3c4';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Çapraz kılıçlar
      ctx.strokeStyle = '#fff4e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy - 5);
      ctx.lineTo(sx + 5, sy + 5);
      ctx.moveTo(sx + 5, sy - 5);
      ctx.lineTo(sx - 5, sy + 5);
      ctx.stroke();
      this.markerHits.push({ id: b.id, x: sx - 12, y: sy - 12, w: 24, h: 24, kind: 'battle' });
    }
  }

  private drawSieges(ctx: CanvasRenderingContext2D, rctx: Ctx) {
    const s = rctx.s;
    const w = this.world;
    for (let p = 0; p < w.P; p++) {
      const sg = s.provinces[p].siege;
      if (!sg) continue;
      if (!this.visible(w.x[p], w.y[p])) continue;
      const [sx0, sy0] = this.nodeScreen(p);
      const sx = sx0 - 20;
      const sy = sy0 + 10;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,20,24,0.75)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sg.progress);
      ctx.strokeStyle = '#f0a54a';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Kale simgesi
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(sx - 3.5, sy - 2, 7, 5);
      ctx.fillRect(sx - 3.5, sy - 4, 1.5, 2);
      ctx.fillRect(sx - 0.75, sy - 4, 1.5, 2);
      ctx.fillRect(sx + 2, sy - 4, 1.5, 2);
    }
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#f2d27a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,10,0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 9 * Math.cos(ang - 0.45), y1 - 9 * Math.sin(ang - 0.45));
  ctx.lineTo(x1 - 9 * Math.cos(ang + 0.45), y1 - 9 * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
