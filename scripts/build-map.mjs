#!/usr/bin/env node
/**
 * Age of Conquerors — dünya haritası veri derleyicisi.
 *
 * Kaynak: Natural Earth v5.1.2 (kamu malı, https://www.naturalearthdata.com/about/terms-of-use/).
 * Admin-1 (eyalet/il) sınırları oyun bölgelerine dönüştürülür:
 *   - Nüfus yoğunluğuna göre hedef bölge büyüklüğü belirlenir.
 *   - Çok küçük birimler aynı ülke içindeki komşularıyla birleştirilir.
 *   - Çok büyük birimler şehir tohumlu Voronoi hücreleriyle bölünür.
 *   - Topoloji (ortak sınırlar), kara komşulukları, boğaz geçişleri ve deniz rota ağı hesaplanır.
 *
 * Çıktılar:
 *   public/data/world-geo.json   — çizim geometrisi (yaylar, nehirler, göller)
 *   public/data/world.json       — oyun mantığı için statik bölge/deniz verisi
 *   src/data/generated/ne-countries.json — ülke meta verisi (nüfus, GSYH, adlar)
 *
 * Kullanım: node scripts/build-map.mjs [--data-dir DIZIN]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';
import { feature, merge, neighbors } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import polygonClipping from 'polygon-clipping';
import { Delaunay } from 'd3-delaunay';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DATA_DIR = path.resolve(argValue('--data-dir') ?? path.join(ROOT, '.cache/naturalearth'));
const NE_TAG = 'v5.1.2';
const NE_FILES = [
  'ne_10m_admin_1_states_provinces',
  'ne_10m_admin_0_countries',
  'ne_10m_populated_places',
  'ne_10m_geography_regions_polys',
  'ne_50m_rivers_lake_centerlines',
  'ne_50m_lakes',
];

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const W = 16384; // dünya genişliği (harita birimi)
const LON0 = -169; // haritanın sol kenarı (Bering Boğazı)
const LAT_N = 84;
const LAT_S = -58;
const R_EARTH = 6371.0088;
const S = W / (2 * Math.PI);
const KM_PER_UNIT_EQ = (2 * Math.PI * R_EARTH) / W;
const DEG = Math.PI / 180;
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * DEG));
const Y_TOP = millerY(LAT_N);
const H = Math.ceil((Y_TOP - millerY(LAT_S)) * S);
const OUT_SCALE = 4; // çıktı tamsayı ızgarası: 1 harita birimi = 4 adım

// Bölge büyüklüğü ayarları (km²)
const TARGET_K = 240000;
const TARGET_MIN = 9000;
const TARGET_MAX = 420000;
const MERGE_BELOW = 0.5;
const SPLIT_ABOVE = 1.8;
const MAX_PARTS = 9;
const ISLAND_MERGE_KM = 160;

// Haritaya alınmayan, nüfussuz ya da uzak küçük alanlar
const DROP_A3 = new Set([
  'ATA', 'PGA', 'CSI', 'ATC', 'HMD', 'ATF', 'SGS', 'IOT', 'CLP', 'UMI', 'IOA', 'PCN', 'NFK', 'NIU', 'SHN', 'MSR',
]);
// Komşu bölgeye katılan küçük özel alanlar (üs bölgeleri, kiralık alanlar, buzul)
const ABSORB_A3 = new Set(['KAS', 'KAB', 'USG', 'ESB', 'WSB', 'VAT']);

// Boğaz / kanal bağlantıları (lon, lat). control: geçişi denetleyen bölgenin içindeki nokta.
const STRAITS = [
  { name: 'İstanbul Boğazı', pts: [[29.2, 41.45], [28.95, 40.85]], control: [29.0, 41.1] },
  { name: 'Marmara', pts: [[28.95, 40.85], [27.6, 40.65]] },
  { name: 'Çanakkale Boğazı', pts: [[27.6, 40.65], [25.9, 39.95]], control: [26.4, 40.15] },
  { name: 'Kerç Boğazı', pts: [[36.4, 44.95], [36.75, 45.6]] },
  { name: 'Danimarka Boğazları', pts: [[8.5, 58.1], [10.9, 57.95], [11.3, 56.9], [12.75, 55.75], [13.9, 55.0]], control: [12.55, 55.68] },
  { name: 'Hudson Boğazı', pts: [[-82.0, 61.5], [-77.3, 62.85], [-72.0, 62.3], [-67.5, 61.6], [-63.0, 60.8]] },
  { name: 'Finlandiya Körfezi', pts: [[20.5, 59.0], [23.5, 59.7], [26.5, 60.0], [29.3, 60.0]] },
  { name: 'Trieste Körfezi', pts: [[13.4, 45.2], [13.6, 45.62]] },
  { name: 'Akabe Körfezi', pts: [[34.4, 27.6], [34.8, 28.6], [34.95, 29.45]] },
  { name: 'Salish Denizi', pts: [[-125.0, 48.45], [-123.6, 48.25], [-122.75, 48.3], [-122.5, 47.7]] },
  { name: 'Kutch Körfezi', pts: [[68.6, 22.6], [69.8, 22.7]] },
  { name: 'Hambat Körfezi', pts: [[71.2, 20.6], [72.4, 21.5]] },
  { name: 'Delaware Körfezi', pts: [[-74.6, 38.7], [-75.2, 39.2], [-75.45, 39.75]] },
  { name: 'Yangçe Ağzı', pts: [[122.6, 31.2], [121.3, 31.6], [119.6, 32.2]] },
  { name: 'Hangzhou Körfezi', pts: [[122.6, 30.6], [121.2, 30.4]] },
  { name: 'Cebelitarık Boğazı', pts: [[-6.6, 35.95], [-4.4, 36.15]] },
  { name: 'Süveyş Kanalı', pts: [[32.45, 31.55], [32.55, 29.75], [33.9, 27.6]], control: [32.3, 30.6] },
  { name: 'Babülmendep', pts: [[42.8, 13.6], [43.7, 12.35]] },
  { name: 'Hürmüz Boğazı', pts: [[55.6, 26.4], [57.2, 25.8]] },
  { name: 'Panama Kanalı', pts: [[-79.9, 9.6], [-79.5, 8.6]], control: [-79.7, 9.1] },
  { name: 'Malakka Boğazı', pts: [[97.8, 5.8], [100.6, 2.9], [104.3, 1.15]] },
  { name: 'Kiel Kanalı', pts: [[8.6, 54.05], [10.4, 54.55]], control: [9.6, 54.3] },
  { name: 'Manş Denizi', pts: [[-1.5, 50.3], [1.6, 51.05], [2.6, 51.6]] },
  { name: 'Sunda Boğazı', pts: [[105.0, -6.6], [106.2, -5.6]] },
  { name: 'Messina Boğazı', pts: [[15.55, 38.0], [15.75, 38.4]] },
];

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
const log = (...a) => console.log(`[harita ${(performance.now() / 1000).toFixed(1)}s]`, ...a);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function project(lon, lat) {
  const la = Math.max(LAT_S, Math.min(LAT_N, lat));
  return [(lon - LON0) * DEG * S, (Y_TOP - millerY(la)) * S];
}

function unproject(x, y) {
  const lon = (x / S) / DEG + LON0;
  const my = Y_TOP - y / S;
  const lat = (2.5 * Math.atan(Math.exp(0.8 * my)) - 0.625 * Math.PI) / DEG;
  return [lon > 180 ? lon - 360 : lon, lat];
}

function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

function distKmXY(a, b) {
  const [l1, p1] = unproject(a[0], a[1]);
  const [l2, p2] = unproject(b[0], b[1]);
  return haversineKm(l1, p1, l2, p2);
}

/** Polygon listesi (MultiPolygon koordinatları) */
function geomPolygons(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function ringAreaKm2(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = unproject(ring[i][0], ring[i][1]);
    const [l2, p2] = unproject(ring[i + 1][0], ring[i + 1][1]);
    let dl = l2 - l1;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    a += dl * DEG * (Math.sin(p1 * DEG) + Math.sin(p2 * DEG)) / 2;
  }
  return Math.abs(a) * R_EARTH * R_EARTH;
}

function polygonsAreaKm2(polys) {
  let a = 0;
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      a += (i === 0 ? 1 : -1) * ringAreaKm2(ring);
    });
  }
  return Math.max(0, a);
}

function ringAreaPlanar(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

function polygonsBBox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

function pointInPolygons(x, y, polys) {
  let inside = false;
  for (const poly of polys)
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  return inside;
}

/** Alan ağırlıklı merkez; içeride değilse içeriden en yakın örnek nokta. */
function labelPoint(polys, rng) {
  let best = null;
  let bestA = -1;
  for (const poly of polys) {
    const a = Math.abs(ringAreaPlanar(poly[0]));
    if (a > bestA) {
      bestA = a;
      best = poly;
    }
  }
  if (!best) return null;
  const ring = best[0];
  let cx = 0, cy = 0, A = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cy += (ring[i][1] + ring[i + 1][1]) * f;
    A += f;
  }
  if (Math.abs(A) > 1e-9) {
    cx /= 3 * A;
    cy /= 3 * A;
    if (pointInPolygons(cx, cy, [best])) {
      // Kenara çok yakınsa iç noktaları da dene
      return [cx, cy];
    }
  }
  const [x0, y0, x1, y1] = polygonsBBox([best]);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  let pick = null, pd = Infinity;
  for (let k = 0; k < 400; k++) {
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    if (pointInPolygons(x, y, [best])) {
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < pd) {
        pd = d;
        pick = [x, y];
      }
    }
  }
  return pick ?? ring[0].slice();
}

function samplePoints(polys, count, rng) {
  const [x0, y0, x1, y1] = polygonsBBox(polys);
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries < count * 60) {
    tries++;
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    if (pointInPolygons(x, y, polys)) pts.push([x, y]);
  }
  return pts;
}

/** Izgara tabanlı uzamsal indeks (bbox'lar için) */
class GridIndex {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cy) {
    return cx * 100003 + cy;
  }
  insert(bbox, value) {
    const c = this.cell;
    for (let cx = Math.floor(bbox[0] / c); cx <= Math.floor(bbox[2] / c); cx++)
      for (let cy = Math.floor(bbox[1] / c); cy <= Math.floor(bbox[3] / c); cy++) {
        const k = this.key(cx, cy);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(value);
      }
  }
  query(x, y) {
    return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))) ?? [];
  }
  queryBox(bbox) {
    const c = this.cell;
    const out = new Set();
    for (let cx = Math.floor(bbox[0] / c); cx <= Math.floor(bbox[2] / c); cx++)
      for (let cy = Math.floor(bbox[1] / c); cy <= Math.floor(bbox[3] / c); cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (arr) for (const v of arr) out.add(v);
      }
    return out;
  }
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const f of NE_FILES) {
    const dest = path.join(DATA_DIR, `${f}.geojson`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${f}.geojson`;
    log('indiriliyor', url);
    const r = spawnSync('curl', ['-sSfL', '-o', dest, url], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`İndirme başarısız: ${url}`);
  }
}

const PROVINCE_SUFFIXES = [
  ' Özerk Bölgesi', ' Özerk Okrugu', ' Özerk Oblastı', ' Oblastı', ' oblastı', ' Krayı', ' krayı', ' Eyaleti', ' eyaleti',
  ' Cumhuriyeti', ' İli', ' ili', ' Vilayeti', ' vilayeti', ' Valiliği', ' Departmanı', ' departmanı', ' Prefektörlüğü',
  ' Voblastı', ' voblastı', ' Bölgesi', ' bölgesi', ' Kantonu', ' kantonu', ' Voyvodalığı', ' voyvodalığı', ' Province', ' Region',
];
function cleanName(n) {
  if (!n) return n;
  let s = String(n).trim();
  for (const suf of PROVINCE_SUFFIXES) {
    if (s.endsWith(suf) && s.length > suf.length + 2) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------
ensureData();
const rng = mulberry32(1444);

// --- Ülkeler (admin-0)
const a0 = readJSON(path.join(DATA_DIR, 'ne_10m_admin_0_countries.geojson'));
const countryMeta = new Map();
for (const f of a0.features) {
  const p = f.properties;
  countryMeta.set(p.ADM0_A3, {
    a3: p.ADM0_A3,
    sov: p.SOV_A3,
    type: p.TYPE,
    name: p.NAME,
    nameLong: p.NAME_LONG,
    nameTr: p.NAME_TR || p.NAME,
    iso2: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : null,
    pop: Math.max(0, Math.round(p.POP_EST)),
    popYear: p.POP_YEAR,
    gdpMd: Math.max(0, p.GDP_MD),
    gdpYear: p.GDP_YEAR,
    incomeGroup: p.INCOME_GRP,
    economy: p.ECONOMY,
    continent: p.CONTINENT,
    subregion: p.SUBREGION,
    mapcolor: p.MAPCOLOR13,
    labelLon: p.LABEL_X,
    labelLat: p.LABEL_Y,
  });
}

// --- Admin-1 → izdüşümlü özellikler
const a1 = readJSON(path.join(DATA_DIR, 'ne_10m_admin_1_states_provinces.geojson'));
let feats = [];
for (const f of a1.features) {
  const p = f.properties;
  if (DROP_A3.has(p.adm0_a3)) continue;
  const unnamed = !p.name && !p.name_en && !p.name_tr;
  const polys = [];
  for (const poly of geomPolygons(f.geometry)) {
    const outer = poly[0];
    let mean = 0;
    for (const c of outer) mean += c[0];
    mean /= outer.length;
    const shift = mean < LON0 ? 360 : 0;
    const maxLat = Math.max(...outer.map((c) => c[1]));
    if (maxLat < LAT_S) continue;
    polys.push(poly.map((ring) => ring.map(([lon, lat]) => project(lon + shift, lat))));
  }
  if (!polys.length) continue;
  feats.push({
    code: p.adm1_code,
    a3: p.adm0_a3,
    name: cleanName(p.name_tr || p.name || p.name_en || p.admin),
    nameEn: p.name_en || p.name || p.admin,
    unnamed,
    region: p.region || p.gn_region || null,
    geometry: { type: 'MultiPolygon', coordinates: polys },
  });
}
log('admin-1 birimleri', feats.length);

// --- Topoloji T0 (tam koordinat) + sadeleştirme
const fcIn = {
  type: 'FeatureCollection',
  features: feats.map((f, i) => ({ type: 'Feature', id: i, properties: {}, geometry: f.geometry })),
};
let T0 = topology({ p: fcIn });
log('T0 yay sayısı', T0.arcs.length);
T0 = presimplify(T0);
const SIMPLIFY_MIN_WEIGHT = 0.04; // birim² (görsel ölçekte ~0.15 birim sapma)
T0 = simplify(T0, SIMPLIFY_MIN_WEIGHT);
{
  let pts = 0;
  for (const a of T0.arcs) pts += a.length;
  log('sadeleştirilmiş nokta sayısı', pts);
}
const geomsT0 = T0.objects.p.geometries;

function cleanPolys(polys) {
  const out = [];
  for (const poly of polys) {
    const rings = poly.filter((r) => r.length >= 4 && Math.abs(ringAreaPlanar(r)) > 1e-6);
    if (rings.length && poly[0] === rings[0]) out.push(rings);
  }
  return out;
}

for (let i = 0; i < feats.length; i++) {
  const g = feature(T0, geomsT0[i]).geometry;
  feats[i].polys = cleanPolys(geomPolygons(g));
}
// Sadeleştirmede tamamen kaybolan küçük adaları orijinal halleriyle koru
for (const f of feats) {
  if (!f.polys.length) f.polys = cleanPolys(f.geometry.coordinates);
  delete f.geometry;
}
let nbrsT0 = neighbors(geomsT0);

// --- Absorbe edilecek özel alanlar: en çok sınır paylaşan komşuya kat
const absorbInto = new Map();
feats.forEach((f, i) => {
  if (!ABSORB_A3.has(f.a3) && !f.unnamed) return;
  const nb = nbrsT0[i].filter((j) => !ABSORB_A3.has(feats[j].a3) && !feats[j].unnamed);
  if (!nb.length) {
    f.drop = true;
    return;
  }
  // En büyük komşu
  let best = nb[0];
  for (const j of nb) if (polygonsAreaKm2(feats[j].polys) > polygonsAreaKm2(feats[best].polys)) best = j;
  absorbInto.set(i, best);
});
log('absorbe edilen özel alan', absorbInto.size);

// --- Alan, arazi, nüfus tahmini (özellik düzeyi)
for (const f of feats) {
  f.area = polygonsAreaKm2(f.polys);
  f.bbox = polygonsBBox(f.polys);
}
const featIndex = new GridIndex(64);
feats.forEach((f, i) => featIndex.insert(f.bbox, i));

function featureAt(x, y) {
  for (const i of featIndex.query(x, y)) {
    const f = feats[i];
    if (f.drop) continue;
    if (x < f.bbox[0] || x > f.bbox[2] || y < f.bbox[1] || y > f.bbox[3]) continue;
    if (pointInPolygons(x, y, f.polys)) return i;
  }
  return -1;
}

// Coğrafi bölgeler → arazi
const geo = readJSON(path.join(DATA_DIR, 'ne_10m_geography_regions_polys.geojson'));
const TERRAIN_CLASS = {
  'Range/mtn': 'mountains',
  Desert: 'desert',
  Tundra: 'tundra',
  Wetlands: 'marsh',
  Delta: 'marsh',
  Plateau: 'hills',
  Foothills: 'hills',
};
const TERRAIN_PRIORITY = { mountains: 5, desert: 4, tundra: 3, marsh: 2, hills: 1 };
const geoRegions = [];
for (const f of geo.features) {
  const t = TERRAIN_CLASS[f.properties.FEATURECLA];
  if (!t) continue;
  const polys = geomPolygons(f.geometry).map((poly) =>
    poly.map((ring) => {
      let mean = 0;
      for (const c of ring) mean += c[0];
      mean /= ring.length;
      const shift = mean < LON0 ? 360 : 0;
      return ring.map(([lon, lat]) => project(lon + shift, lat));
    }),
  );
  geoRegions.push({ t, polys, bbox: polygonsBBox(polys) });
}
const geoIndex = new GridIndex(128);
geoRegions.forEach((g, i) => geoIndex.insert(g.bbox, i));

function climateTerrain(lon, lat) {
  const alat = Math.abs(lat);
  if (lat >= 67 || lat <= -50) return 'tundra';
  if (lat >= 55 && (lon > 20 || lon < -50)) return 'forest';
  if (lat >= 60) return 'forest';
  if (alat < 12) {
    if (lon > -82 && lon < -34 && lat > -16 && lat < 10) return 'jungle';
    if (lon > 8 && lon < 32 && lat > -9 && lat < 7) return 'jungle';
    if (lon > 94 && lon < 156 && lat > -11 && lat < 20) return 'jungle';
    if (lon > -93 && lon < -76 && lat > 6 && lat < 18) return 'jungle';
    if (lon > -14 && lon < 9 && lat > 4 && lat < 9) return 'jungle';
  }
  if (lat >= 12 && lat < 20 && lon > 94 && lon < 110) return 'jungle';
  return 'plains';
}

function terrainAt(x, y) {
  let best = null;
  for (const gi of geoIndex.query(x, y)) {
    const g = geoRegions[gi];
    if (x < g.bbox[0] || x > g.bbox[2] || y < g.bbox[1] || y > g.bbox[3]) continue;
    if (best && TERRAIN_PRIORITY[best] >= TERRAIN_PRIORITY[g.t]) continue;
    if (pointInPolygons(x, y, g.polys)) best = g.t;
  }
  if (best) return best;
  const [lon, lat] = unproject(x, y);
  return climateTerrain(lon, lat);
}

const HABITABILITY = { plains: 1, hills: 0.75, forest: 0.45, jungle: 0.4, marsh: 0.45, mountains: 0.3, desert: 0.05, tundra: 0.025 };

function terrainProfile(polys, area) {
  const n = Math.max(12, Math.min(48, Math.round(Math.sqrt(area) / 6)));
  const pts = samplePoints(polys, n, rng);
  const counts = {};
  for (const [x, y] of pts) {
    const t = terrainAt(x, y);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  if (!pts.length) {
    const lp = labelPoint(polys, rng);
    const t = lp ? terrainAt(lp[0], lp[1]) : 'plains';
    counts[t] = 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let habit = 0;
  for (const [t, c] of Object.entries(counts)) habit += (HABITABILITY[t] * c) / total;
  let main = 'plains';
  let mc = -1;
  for (const [t, c] of Object.entries(counts)) if (c > mc) [main, mc] = [t, c];
  if ((counts.mountains ?? 0) / total >= 0.35) main = 'mountains';
  return { counts, habit, main };
}

for (const f of feats) {
  if (f.drop) continue;
  f.terrain = terrainProfile(f.polys, f.area);
}
log('arazi profilleri hazır');

// Şehirler
const ppl = readJSON(path.join(DATA_DIR, 'ne_10m_populated_places.geojson'));
let places = ppl.features
  .map((f) => {
    const p = f.properties;
    const lon = p.LONGITUDE;
    const [x, y] = project(lon < LON0 ? lon + 360 : lon, p.LATITUDE);
    return {
      name: p.NAME_EN || p.NAME,
      nameTr: p.NAME_TR || p.NAME_EN || p.NAME,
      a3: p.ADM0_A3,
      cap: p.ADM0CAP === 1 || p.FEATURECLA === 'Admin-0 capital',
      x,
      y,
      lon: p.LONGITUDE,
      lat: p.LATITUDE,
      pop: Math.max(p.POP_MAX || 0, p.POP_MIN || 0),
      hist: {
        1950: p.POP1950 || 0,
        1975: p.POP1975 || 0,
        2000: p.POP2000 || 0,
        2020: p.POP2020 || 0,
      },
    };
  })
  .filter((p) => p.lat > LAT_S && p.lat < LAT_N)
  .sort((a, b) => b.pop - a.pop);

// Aynı metropol alanının tekrar sayılmasını önle (30 km içindeki küçük yerleşimler kentsel nüfusa eklenmez)
const placeGrid = new GridIndex(32);
for (const pl of places) {
  const near = placeGrid.queryBox([pl.x - 12, pl.y - 12, pl.x + 12, pl.y + 12]);
  pl.dup = false;
  for (const q of near) if (distKmXY([pl.x, pl.y], [q.x, q.y]) < 30) pl.dup = true;
  if (!pl.dup) placeGrid.insert([pl.x, pl.y, pl.x, pl.y], pl);
}
let unplaced = 0;
for (const pl of places) {
  let fi = featureAt(pl.x, pl.y);
  if (fi < 0) {
    // kıyı şehirleri sadeleştirme nedeniyle denize düşebilir → en yakın bölge
    let best = -1, bd = Infinity;
    for (const i of featIndex.queryBox([pl.x - 8, pl.y - 8, pl.x + 8, pl.y + 8])) {
      const f = feats[i];
      if (f.drop) continue;
      for (const poly of f.polys)
        for (const [x, y] of poly[0]) {
          const d = (x - pl.x) ** 2 + (y - pl.y) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
    }
    if (best >= 0 && bd < 64) fi = best;
  }
  if (fi >= 0 && absorbInto.has(fi)) fi = absorbInto.get(fi);
  pl.feat = fi;
  if (fi < 0) unplaced++;
}
log('şehir', places.length, 'yerleşemeyen', unplaced);

// Ülke nüfusunu özelliklere dağıt
function distributePopulation(units, getPlaces) {
  // units: {a3, area, habit} dizisi; getPlaces(i) → o birimdeki şehirler
  const byCountry = new Map();
  units.forEach((u, i) => {
    if (!byCountry.has(u.a3)) byCountry.set(u.a3, []);
    byCountry.get(u.a3).push(i);
  });
  for (const [a3, idxs] of byCountry) {
    const meta = countryMeta.get(a3);
    let total = meta?.pop ?? 0;
    for (const i of idxs) {
      units[i].urban = 0;
      for (const pl of getPlaces(i)) if (!pl.dup && pl.a3 === a3) units[i].urban += pl.pop;
    }
    let urbanSum = idxs.reduce((s, i) => s + units[i].urban, 0);
    if (total <= 0) total = urbanSum + idxs.reduce((s, i) => s + units[i].area, 0) * 2;
    const urbanCap = 0.8 * total;
    if (urbanSum > urbanCap) {
      const k = urbanCap / urbanSum;
      for (const i of idxs) units[i].urban *= k;
      urbanSum = urbanCap;
    }
    const rural = total - urbanSum;
    const hwSum = idxs.reduce((s, i) => s + units[i].area * units[i].habit, 0) || 1;
    for (const i of idxs) {
      units[i].pop = units[i].urban + (rural * units[i].area * units[i].habit) / hwSum;
    }
  }
}

const featPlaces = new Map();
for (const pl of places) {
  if (pl.feat < 0) continue;
  if (!featPlaces.has(pl.feat)) featPlaces.set(pl.feat, []);
  featPlaces.get(pl.feat).push(pl);
}
// Absorbe edilenlerin alanını da hedefe ekle (nüfus hesabında)
{
  const units = [];
  const map = [];
  feats.forEach((f, i) => {
    if (f.drop || absorbInto.has(i)) return;
    map.push(i);
    units.push({ a3: f.a3, area: f.area, habit: f.terrain.habit });
  });
  distributePopulation(units, (k) => featPlaces.get(map[k]) ?? []);
  units.forEach((u, k) => {
    feats[map[k]].pop = u.pop;
    feats[map[k]].urban = u.urban;
  });
}

function targetArea(pop, area) {
  const d = Math.max(0.05, pop / Math.max(area, 1));
  return Math.max(TARGET_MIN, Math.min(TARGET_MAX, TARGET_K / Math.sqrt(d)));
}

// ---------------------------------------------------------------------------
// Birleştirme
// ---------------------------------------------------------------------------
const groups = [];
const groupOf = new Array(feats.length).fill(-1);
feats.forEach((f, i) => {
  if (f.drop || absorbInto.has(i)) return;
  groupOf[i] = groups.length;
  groups.push({
    id: groups.length,
    members: [i],
    a3: f.a3,
    area: f.area,
    pop: f.pop,
    regions: new Set([f.region]),
    bbox: f.bbox.slice(),
    alive: true,
  });
});
// Absorbe edilenler hedef grubuna üye olarak eklenir
for (const [i, j] of absorbInto) {
  const g = groups[groupOf[j]];
  g.members.push(i);
  g.area += feats[i].area;
  groupOf[i] = g.id;
}
for (const g of groups) {
  g.nb = new Set();
  for (const m of g.members)
    for (const j of nbrsT0[m]) {
      const gj = groupOf[j];
      if (gj >= 0 && gj !== g.id) g.nb.add(gj);
    }
}
const groupN = (g) => g.area / targetArea(g.pop, g.area);

function bboxGapKm(a, b) {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  const lat = unproject(0, (a[1] + a[3] + b[1] + b[3]) / 4)[1];
  return Math.hypot(dx * KM_PER_UNIT_EQ * Math.cos(lat * DEG), dy * KM_PER_UNIT_EQ * Math.cos(0.8 * lat * DEG));
}

{
  let merges = 0;
  const stuck = new Set();
  for (;;) {
    let g = null;
    let gn = MERGE_BELOW;
    for (const c of groups) {
      if (!c.alive || stuck.has(c.id)) continue;
      const n = groupN(c);
      if (n < gn) {
        gn = n;
        g = c;
      }
    }
    if (!g) break;
    let cands = [...g.nb].map((id) => groups[id]).filter((h) => h.alive && h.a3 === g.a3);
    let island = false;
    if (!cands.length) {
      island = true;
      cands = groups.filter(
        (h) => h.alive && h.id !== g.id && h.a3 === g.a3 && bboxGapKm(g.bbox, h.bbox) < ISLAND_MERGE_KM,
      );
    }
    if (!cands.length) {
      stuck.add(g.id);
      continue;
    }
    let best = null, bs = Infinity;
    for (const h of cands) {
      const sameRegion = [...h.regions].some((r) => g.regions.has(r));
      let score = groupN(h) + (sameRegion ? 0 : 0.75);
      if (island) score += bboxGapKm(g.bbox, h.bbox) / 100;
      if (score < bs) {
        bs = score;
        best = h;
      }
    }
    // birleştir: g → best
    const h = best;
    h.members.push(...g.members);
    h.area += g.area;
    h.pop += g.pop;
    for (const r of g.regions) h.regions.add(r);
    h.bbox = [Math.min(h.bbox[0], g.bbox[0]), Math.min(h.bbox[1], g.bbox[1]), Math.max(h.bbox[2], g.bbox[2]), Math.max(h.bbox[3], g.bbox[3])];
    for (const id of g.nb) {
      if (id === h.id) continue;
      h.nb.add(id);
      groups[id].nb.delete(g.id);
      groups[id].nb.add(h.id);
    }
    h.nb.delete(g.id);
    h.nb.delete(h.id);
    g.alive = false;
    stuck.delete(h.id);
    for (const m of g.members) groupOf[m] = h.id;
    merges++;
  }
  log('birleştirme', merges, 'kalan grup', groups.filter((g) => g.alive).length);
}

// Küçük, şehirsiz ve kara komşusu olmayan adacıkları at (ülkenin tek bölgesi değilse)
{
  const perCountry = new Map();
  for (const g of groups) if (g.alive) perCountry.set(g.a3, (perCountry.get(g.a3) ?? 0) + 1);
  let dropped = 0;
  for (const g of groups) {
    if (!g.alive || g.area >= 150 || g.nb.size > 0) continue;
    if ((perCountry.get(g.a3) ?? 0) <= 1) continue;
    const hasCity = g.members.some((m) => (featPlaces.get(m) ?? []).length > 0);
    if (hasCity) continue;
    g.alive = false;
    perCountry.set(g.a3, perCountry.get(g.a3) - 1);
    dropped++;
  }
  log('atılan küçük adacık', dropped);
}

// ---------------------------------------------------------------------------
// Grup geometrileri ve bölme
// ---------------------------------------------------------------------------
const provinces = []; // {code, a3, name, nameEn, polys, members, splitOf}
const aliveGroups = groups.filter((g) => g.alive);
let splitCount = 0, splitFail = 0;

function groupPolys(g) {
  if (g.members.length === 1) return feats[g.members[0]].polys;
  const geom = merge(T0, g.members.map((m) => geomsT0[m]));
  return cleanPolys(geomPolygons(geom));
}

function kmeansSeeds(polys, k, cityPts, seed) {
  const r = mulberry32(seed);
  const samples = samplePoints(polys, Math.max(200, k * 80), r);
  if (samples.length < k * 3) return null;
  const centers = [];
  // En büyük, birbirinden uzak şehirleri başlangıç merkezleri olarak kullan
  const [x0, y0, x1, y1] = polygonsBBox(polys);
  const minSep = Math.sqrt(((x1 - x0) * (y1 - y0)) / k) * 0.6;
  for (const c of cityPts) {
    if (centers.length >= k) break;
    if (centers.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) > minSep)) centers.push([c[0], c[1]]);
  }
  while (centers.length < k) {
    // en uzak örnek nokta (k-means++ benzeri, deterministik)
    let best = null, bd = -1;
    for (const s of samples) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2);
      if (centers.length === 0) d = r();
      if (d > bd) {
        bd = d;
        best = s;
      }
    }
    centers.push(best.slice());
  }
  for (let it = 0; it < 20; it++) {
    const sx = new Array(k).fill(0), sy = new Array(k).fill(0), sn = new Array(k).fill(0);
    for (const s of samples) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (s[0] - centers[c][0]) ** 2 + (s[1] - centers[c][1]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      sx[bi] += s[0];
      sy[bi] += s[1];
      sn[bi]++;
    }
    for (let c = 0; c < k; c++) if (sn[c]) centers[c] = [sx[c] / sn[c], sy[c] / sn[c]];
  }
  return centers;
}

for (const g of aliveGroups) {
  const polys = groupPolys(g);
  if (!polys.length) continue;
  const n = groupN(g);
  const lead = g.members.reduce((a, b) => (feats[b].pop > feats[a].pop ? b : a), g.members[0]);
  const base = {
    code: feats[lead].code,
    a3: g.a3,
    name: feats[lead].name,
    nameEn: feats[lead].nameEn,
    merged: g.members.length > 1,
    members: g.members,
  };
  if (n > SPLIT_ABOVE && g.members.length <= 2) {
    const k = Math.min(MAX_PARTS, Math.round(n));
    const gPlaces = g.members.flatMap((m) => featPlaces.get(m) ?? []).filter((p) => !p.dup);
    const cityPts = gPlaces.map((p) => [p.x, p.y]);
    const centers = kmeansSeeds(polys, k, cityPts, hashString(base.code));
    let parts = null;
    if (centers) {
      try {
        const [x0, y0, x1, y1] = polygonsBBox(polys);
        const vor = Delaunay.from(centers).voronoi([x0 - 10, y0 - 10, x1 + 10, y1 + 10]);
        parts = [];
        for (let c = 0; c < centers.length; c++) {
          const cell = vor.cellPolygon(c);
          if (!cell) continue;
          const res = polygonClipping.intersection(polys, [cell]);
          const cp = cleanPolys(res);
          if (cp.length) parts.push(cp);
        }
      } catch {
        parts = null;
        splitFail++;
      }
    }
    if (parts && parts.length > 1) {
      splitCount++;
      parts.forEach((pp, pi) => {
        provinces.push({ ...base, code: `${base.code}-${pi + 1}`, polys: pp, splitOf: base.name, splitOfEn: base.nameEn });
      });
      continue;
    }
  }
  provinces.push({ ...base, polys });
}
log('bölünen', splitCount, 'bölünemeyen', splitFail, 'toplam bölge', provinces.length);

// ---------------------------------------------------------------------------
// T-kavşak onarımı: bir halkadaki köşe noktası komşu halkanın kenarı üzerindeyse ekle
// ---------------------------------------------------------------------------
{
  const segIndex = new GridIndex(8);
  const allRings = [];
  provinces.forEach((p, pi) =>
    p.polys.forEach((poly) =>
      poly.forEach((ring) => {
        allRings.push({ pi, ring });
      }),
    ),
  );
  const vertexKey = (x, y) => `${x},${y}`;
  const vertexSet = new Set();
  allRings.forEach((r, ri) => {
    for (let i = 0; i < r.ring.length - 1; i++) {
      const a = r.ring[i], b = r.ring[i + 1];
      segIndex.insert([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], ri * 1e6 + i);
      vertexSet.add(vertexKey(a[0], a[1]));
    }
  });
  // Yeni (bölmeden gelen) köşeler: yalnızca bölünmüş bölgelerin halkalarında olanlar
  const inserts = new Map(); // ri → Map(segIdx → [pt])
  let fixes = 0;
  const EPS = 1e-7;
  allRings.forEach((r) => {
    const p = provinces[r.pi];
    if (!p.splitOf) return;
    for (const v of r.ring) {
      const cands = segIndex.queryBox([v[0] - EPS, v[1] - EPS, v[0] + EPS, v[1] + EPS]);
      for (const code of cands) {
        const ri = Math.floor(code / 1e6), si = code % 1e6;
        if (allRings[ri] === r) continue;
        const ring = allRings[ri].ring;
        const a = ring[si], b = ring[si + 1];
        if ((a[0] === v[0] && a[1] === v[1]) || (b[0] === v[0] && b[1] === v[1])) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / len2;
        if (t <= 0 || t >= 1) continue;
        const px = a[0] + t * dx, py = a[1] + t * dy;
        if (Math.hypot(px - v[0], py - v[1]) > 1e-6) continue;
        let m = inserts.get(ri);
        if (!m) inserts.set(ri, (m = new Map()));
        let arr = m.get(si);
        if (!arr) m.set(si, (arr = []));
        if (!arr.some((q) => q[0] === v[0] && q[1] === v[1])) {
          arr.push(v);
          fixes++;
        }
      }
    }
  });
  for (const [ri, m] of inserts) {
    const ring = allRings[ri].ring;
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      out.push(ring[i]);
      const arr = m.get(i);
      if (arr && i < ring.length - 1) {
        const a = ring[i];
        arr.sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
        out.push(...arr);
      }
    }
    ring.length = 0;
    ring.push(...out);
  }
  log('T-kavşak onarımı', fixes);
}

// ---------------------------------------------------------------------------
// Son topoloji (nicemlenmiş)
// ---------------------------------------------------------------------------
// Bölgeleri ülke ve kod sırasına göre sırala (kararlı kimlikler)
provinces.sort((a, b) => (a.a3 === b.a3 ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.a3 < b.a3 ? -1 : 1));

const fcFinal = {
  type: 'FeatureCollection',
  features: provinces.map((p, i) => ({
    type: 'Feature',
    id: i,
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: p.polys },
  })),
};
// Nicemleme: tüm harita [0,W]x[0,H] → tamsayı ızgara (OUT_SCALE adım/birim)
const QX = W * OUT_SCALE;
let T1 = topology({ p: fcFinal }, QX);
log('T1 yay', T1.arcs.length);
const geomsT1 = T1.objects.p.geometries;
const nbrs = neighbors(geomsT1).map((a) => [...a]);

// Yay kullanımları → kıyı yayları ve bölge kenarları
const arcSides = T1.arcs.map(() => [-1, -1]);
geomsT1.forEach((g, pi) => {
  const visit = (arcs) => {
    for (const a of arcs) {
      const idx = a < 0 ? ~a : a;
      const side = arcSides[idx];
      if (side[0] === -1) side[0] = pi;
      else if (side[0] !== pi && side[1] === -1) side[1] = pi;
    }
  };
  if (g.type === 'Polygon') g.arcs.forEach(visit);
  else if (g.type === 'MultiPolygon') g.arcs.forEach((poly) => poly.forEach(visit));
});

// Çözülmüş (mutlak) yay koordinatları — harita birimi
const tf = T1.transform;
const absArcs = T1.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
  });
});

function provincePolysFromTopo(pi) {
  return cleanPolys(geomPolygons(feature(T1, geomsT1[pi]).geometry));
}

// ---------------------------------------------------------------------------
// Su maskesi (raster) — deniz düğümleri ve görüş hattı kontrolleri için
// ---------------------------------------------------------------------------
const MASK_RES = 2;
const MW = Math.ceil(W / MASK_RES);
const MH = Math.ceil(H / MASK_RES);
const landMask = new Uint8Array(MW * MH);
const finalPolys = provinces.map((_, i) => provincePolysFromTopo(i));
for (const polys of finalPolys) {
  const [bx0, by0, bx1, by1] = polygonsBBox(polys);
  const edges = [];
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 0; i < ring.length - 1; i++) edges.push([ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]]);
  const r0 = Math.max(0, Math.floor(by0 / MASK_RES));
  const r1 = Math.min(MH - 1, Math.ceil(by1 / MASK_RES));
  for (let row = r0; row <= r1; row++) {
    const y = (row + 0.5) * MASK_RES;
    const xs = [];
    for (const [ax, ay, bx, by] of edges) if (ay > y !== by > y) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / MASK_RES - 0.5));
      const c1 = Math.min(MW - 1, Math.floor(xs[k + 1] / MASK_RES - 0.5));
      for (let c = c0; c <= c1; c++) landMask[row * MW + c] = 1;
    }
    void bx0;
    void bx1;
  }
}
const isWater = (x, y) => {
  const xw = ((x % W) + W) % W;
  const c = Math.floor(xw / MASK_RES), r = Math.floor(y / MASK_RES);
  if (c < 0 || r < 0 || c >= MW || r >= MH) return true;
  return landMask[r * MW + c] === 0;
};
function waterLine(a, b, skipStart = 0, skipEnd = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(2, Math.ceil(len / 1.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (t * len < skipStart || (1 - t) * len < skipEnd) continue;
    if (!isWater(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))) return false;
  }
  return true;
}
log('su maskesi', MW, 'x', MH);

// ---------------------------------------------------------------------------
// Bölge öznitelikleri
// ---------------------------------------------------------------------------
const provPlaces = provinces.map(() => []);
{
  const pIndex = new GridIndex(64);
  finalPolys.forEach((polys, i) => pIndex.insert(polygonsBBox(polys), i));
  const pBBox = finalPolys.map((p) => polygonsBBox(p));
  for (const pl of places) {
    let hit = -1;
    for (const i of pIndex.query(pl.x, pl.y)) {
      const b = pBBox[i];
      if (pl.x < b[0] || pl.x > b[2] || pl.y < b[1] || pl.y > b[3]) continue;
      if (pointInPolygons(pl.x, pl.y, finalPolys[i])) {
        hit = i;
        break;
      }
    }
    if (hit < 0) {
      // en yakın bölge sınırı (sadeleştirme kayması)
      let bd = Infinity;
      for (const i of pIndex.queryBox([pl.x - 10, pl.y - 10, pl.x + 10, pl.y + 10])) {
        for (const poly of finalPolys[i])
          for (const [x, y] of poly[0]) {
            const d = (x - pl.x) ** 2 + (y - pl.y) ** 2;
            if (d < bd) {
              bd = d;
              hit = i;
            }
          }
      }
      if (bd > 100) hit = -1;
    }
    if (hit >= 0) provPlaces[hit].push(pl);
  }
}

const provAttr = provinces.map((p, i) => {
  const polys = finalPolys[i];
  const area = polygonsAreaKm2(polys);
  const terrain = terrainProfile(polys, area);
  const lp = labelPoint(polys, rng) ?? [0, 0];
  return { area, terrain, label: lp };
});
{
  const units = provinces.map((p, i) => ({ a3: p.a3, area: provAttr[i].area, habit: provAttr[i].terrain.habit }));
  distributePopulation(units, (i) => provPlaces[i]);
  units.forEach((u, i) => {
    provAttr[i].pop = Math.round(u.pop);
    provAttr[i].urban = Math.round(u.urban);
  });
}

// Adlandırma
const DIRS = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];
const DIRS_EN = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
{
  // bölünmüş parçalar: en büyük şehir adı; yoksa yön eki
  const splitGroups = new Map();
  provinces.forEach((p, i) => {
    if (p.splitOf) {
      const k = p.code.replace(/-\d+$/, '');
      if (!splitGroups.has(k)) splitGroups.set(k, []);
      splitGroups.get(k).push(i);
    }
  });
  const usedNames = new Map(); // a3 → Set
  const claim = (a3, n) => {
    if (!usedNames.has(a3)) usedNames.set(a3, new Set());
    const s = usedNames.get(a3);
    if (s.has(n)) return false;
    s.add(n);
    return true;
  };
  // Önce bölünmemiş bölgeler adlarını alır
  provinces.forEach((p, i) => {
    if (p.splitOf) return;
    if (p.merged) {
      const city = provPlaces[i].filter((c) => c.a3 === p.a3).sort((a, b) => b.pop - a.pop)[0];
      if (city && city.pop > 40000 && claim(p.a3, city.nameTr)) {
        p.name = city.nameTr;
        p.nameEn = city.name;
        return;
      }
    }
    claim(p.a3, p.name);
  });
  for (const idxs of splitGroups.values()) {
    const cx = idxs.reduce((s, i) => s + provAttr[i].label[0], 0) / idxs.length;
    const cy = idxs.reduce((s, i) => s + provAttr[i].label[1], 0) / idxs.length;
    for (const i of idxs) {
      const p = provinces[i];
      const city = provPlaces[i].filter((c) => c.a3 === p.a3).sort((a, b) => b.pop - a.pop)[0];
      if (city && city.pop > 15000 && claim(p.a3, city.nameTr)) {
        p.name = city.nameTr;
        p.nameEn = city.name;
        continue;
      }
      const ang = Math.atan2(-(provAttr[i].label[1] - cy), provAttr[i].label[0] - cx);
      const oct = (Math.round(((Math.PI / 2 - ang) / (2 * Math.PI)) * 8) + 8) % 8;
      let nm = `${p.splitOf} (${DIRS[oct]})`;
      let ne = `${p.splitOfEn} (${DIRS_EN[oct]})`;
      let k = 2;
      while (!claim(p.a3, nm)) {
        nm = `${p.splitOf} (${DIRS[oct]} ${k})`;
        ne = `${p.splitOfEn} (${DIRS_EN[oct]} ${k})`;
        k++;
      }
      p.name = nm;
      p.nameEn = ne;
    }
  }
  // Kalan çakışmalar
  const seen = new Map();
  provinces.forEach((p) => {
    const key = `${p.a3}|${p.name}`;
    const c = (seen.get(key) ?? 0) + 1;
    seen.set(key, c);
    if (c > 1) {
      p.name = `${p.name} ${c}`;
      p.nameEn = `${p.nameEn} ${c}`;
    }
  });
}

// Kıyı yayları → kıyı köşeleri
const coastVerts = provinces.map(() => []);
arcSides.forEach(([l, r], ai) => {
  if (l >= 0 && r === -1) {
    const pts = absArcs[ai];
    const step = Math.max(1, Math.floor(pts.length / 12));
    for (let k = 0; k < pts.length; k += step) coastVerts[l].push(pts[k]);
    coastVerts[l].push(pts[pts.length - 1]);
  }
});
// Gerçek kıyı mı (deniz maskesine bitişik)? Bazı yaylar veri kenarında olabilir.
const isCoastal = coastVerts.map((vs) =>
  vs.some(([x, y]) => {
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]])
      if (isWater(x + dx, y + dy)) return true;
    return false;
  }),
);

// Komşusuz ve kıyısız bölgeler (topolojisi kopmuş olabilir): en yakın bölgelere bağla
{
  const bb = finalPolys.map((p) => polygonsBBox(p));
  nbrs.forEach((nb, i) => {
    if (nb.length || isCoastal[i]) return;
    const cands = [];
    for (let j = 0; j < bb.length; j++) if (j !== i && bboxGapKm(bb[i], bb[j]) < 12) cands.push(j);
    for (const j of cands) {
      if (!nbrs[i].includes(j)) nbrs[i].push(j);
      if (!nbrs[j].includes(i)) nbrs[j].push(i);
    }
    log('  komşu yedeği', provinces[i].a3, provinces[i].name, '→', cands.map((j) => provinces[j].name).join(', '));
  });
}

// ---------------------------------------------------------------------------
// Deniz düğümleri
// ---------------------------------------------------------------------------
const seaNodes = [];
const seaIndex = new GridIndex(48);
function addSeaNode(x, y, kind) {
  const [lon, lat] = unproject(x, y);
  const id = seaNodes.length;
  seaNodes.push({ x, y, lon, lat, kind, adj: new Set() });
  seaIndex.insert([x, y, x, y], id);
  return id;
}
function nearestSea(x, y, radius) {
  let best = -1, bd = radius * radius;
  for (const id of seaIndex.queryBox([x - radius, y - radius, x + radius, y + radius])) {
    const n = seaNodes[id];
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}
function landDistOk(x, y, r) {
  // düğüm karaya çok yakın olmasın
  for (let a = 0; a < 8; a++) {
    const ax = x + r * Math.cos((a * Math.PI) / 4), ay = y + r * Math.sin((a * Math.PI) / 4);
    if (!isWater(ax, ay)) return false;
  }
  return true;
}
// Açık deniz: ~4° aralıklı; kıyı suları: ~1.6° aralıklı
const COARSE = 4.0, FINE = 1.6;
for (let lat = LAT_S + 1; lat < LAT_N - 1; lat += COARSE) {
  const dLon = COARSE / Math.max(0.3, Math.cos(lat * DEG));
  for (let lon = LON0 + dLon / 2; lon < LON0 + 360; lon += dLon) {
    const [x, y] = project(lon, lat);
    if (isWater(x, y) && landDistOk(x, y, 6)) addSeaNode(x, y, 'open');
  }
}
const coarseCount = seaNodes.length;
const coastIndex = new GridIndex(32);
coastVerts.forEach((vs, pi) => {
  if (!isCoastal[pi]) return;
  for (const v of vs) coastIndex.insert([v[0], v[1], v[0], v[1]], v);
});
for (let lat = LAT_S + 0.8; lat < LAT_N - 0.5; lat += FINE) {
  const dLon = FINE / Math.max(0.3, Math.cos(lat * DEG));
  for (let lon = LON0 + dLon / 3; lon < LON0 + 360; lon += dLon) {
    const [x, y] = project(lon, lat);
    if (!isWater(x, y) || !landDistOk(x, y, 2.5)) continue;
    // kıyıya yakın (≈ 350 km) mı?
    const R = 350 / KM_PER_UNIT_EQ / Math.max(0.35, Math.cos(lat * DEG));
    if (!coastIndex.queryBox([x - R, y - R, x + R, y + R]).size) continue;
    // yakında kaba düğüm varsa ekleme
    const near = nearestSea(x, y, (FINE * 0.9 * DEG * S) / Math.max(0.3, Math.cos(lat * DEG)));
    if (near >= 0) continue;
    addSeaNode(x, y, 'coastal');
  }
}
log('deniz düğümleri', seaNodes.length, '(açık', coarseCount, ')');

// Boğaz/kanal düğümleri
const straitLinks = [];
for (const st of STRAITS) {
  const ids = st.pts.map(([lon, lat]) => {
    const [x, y] = project(lon, lat);
    const near = nearestSea(x, y, 3);
    return near >= 0 ? near : addSeaNode(x, y, 'strait');
  });
  for (let i = 0; i + 1 < ids.length; i++) {
    straitLinks.push({ a: ids[i], b: ids[i + 1], name: st.name, control: st.control ?? null });
  }
}

// Deniz düğümlerini bağla (harita kenarında doğu-batı sarmalı dahil)
{
  const maxLinkKm = (a, b) => {
    if (a.kind === 'open' && b.kind === 'open') return COARSE * 111 * 1.75;
    if (a.kind === 'open' || b.kind === 'open') return COARSE * 111 * 1.4;
    return FINE * 111 * 2.1;
  };
  for (let i = 0; i < seaNodes.length; i++) {
    const a = seaNodes[i];
    const R = (COARSE * 1.9 * DEG * S) / Math.max(0.3, Math.cos(a.lat * DEG));
    for (const shift of [0, W, -W]) {
      const ax = a.x + shift;
      for (const j of seaIndex.queryBox([ax - R, a.y - R, ax + R, a.y + R])) {
        if (j <= i) continue;
        const b = seaNodes[j];
        const km = haversineKm(a.lon, a.lat, b.lon, b.lat);
        if (km > maxLinkKm(a, b)) continue;
        if (!waterLine([ax, a.y], [b.x, b.y])) continue;
        a.adj.add(j);
        b.adj.add(i);
      }
    }
  }
  for (const l of straitLinks) {
    seaNodes[l.a].adj.add(l.b);
    seaNodes[l.b].adj.add(l.a);
  }
  // Küçük bileşenleri en yakın görüş hattına sahip düğüm çiftiyle ana ağa bağla
  const components = () => {
    const comp = new Int32Array(seaNodes.length).fill(-1);
    const sizes = [];
    for (let i = 0; i < seaNodes.length; i++) {
      if (comp[i] >= 0) continue;
      const c = sizes.length;
      let size = 0;
      const st = [i];
      comp[i] = c;
      while (st.length) {
        const u = st.pop();
        size++;
        for (const v of seaNodes[u].adj)
          if (comp[v] < 0) {
            comp[v] = c;
            st.push(v);
          }
      }
      sizes.push(size);
    }
    return { comp, sizes };
  };
  for (let pass = 0; pass < 6; pass++) {
    const { comp, sizes } = components();
    const main = sizes.indexOf(Math.max(...sizes));
    let added = 0;
    for (let c = 0; c < sizes.length; c++) {
      if (c === main) continue;
      let best = null, bd = 900;
      for (let i = 0; i < seaNodes.length; i++) {
        if (comp[i] !== c) continue;
        const a = seaNodes[i];
        const R = 900 / KM_PER_UNIT_EQ / Math.max(0.3, Math.cos(a.lat * DEG));
        for (const shift of [0, W, -W]) {
          const ax = a.x + shift;
          for (const j of seaIndex.queryBox([ax - R, a.y - R, ax + R, a.y + R])) {
            if (comp[j] === c) continue;
            const b = seaNodes[j];
            const km = haversineKm(a.lon, a.lat, b.lon, b.lat);
            if (km >= bd) continue;
            if (!waterLine([ax, a.y], [b.x, b.y])) continue;
            bd = km;
            best = [i, j];
          }
        }
      }
      if (best) {
        seaNodes[best[0]].adj.add(best[1]);
        seaNodes[best[1]].adj.add(best[0]);
        added++;
      }
    }
    if (!added) break;
  }
}

// Kıyı bölgeleri → deniz düğümleri
const provSea = provinces.map(() => []);
coastVerts.forEach((vs, pi) => {
  if (!isCoastal[pi]) return;
  const cands = new Map();
  for (const v of vs) {
    const [, lat] = unproject(v[0], v[1]);
    const R = 480 / KM_PER_UNIT_EQ / Math.max(0.35, Math.cos(lat * DEG));
    for (const id of seaIndex.queryBox([v[0] - R, v[1] - R, v[0] + R, v[1] + R])) {
      const n = seaNodes[id];
      const d = Math.hypot(n.x - v[0], n.y - v[1]);
      if (d > R) continue;
      if (!waterLine(v, [n.x, n.y], 5, 0)) continue;
      if (!cands.has(id) || cands.get(id) > d) cands.set(id, d);
    }
  }
  const sorted = [...cands.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3);
  provSea[pi] = sorted.map(([id]) => id);
});

// Deniz bileşenleri (teşhis)
{
  const comp = new Int32Array(seaNodes.length).fill(-1);
  const sizes = [];
  for (let i = 0; i < seaNodes.length; i++) {
    if (comp[i] >= 0) continue;
    const c = sizes.length;
    let size = 0;
    const st = [i];
    comp[i] = c;
    while (st.length) {
      const u = st.pop();
      size++;
      for (const v of seaNodes[u].adj)
        if (comp[v] < 0) {
          comp[v] = c;
          st.push(v);
        }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const small = sizes.map((s, c) => [c, s]).filter(([c]) => c !== main);
  log('deniz bileşenleri', sizes.length, 'ana', sizes[main], 'küçük', small.length);
  for (const [c, s] of small.filter(([, s]) => s >= 2)) {
    const n = seaNodes[comp.indexOf(c)];
    log('  küçük deniz bileşeni', s, 'düğüm @', n.lon.toFixed(1), n.lat.toFixed(1));
  }
  // Ana bileşene bağlı olmayan ve hiçbir kıyıya bağlanmayan tekil düğümleri kaldırma işini çıktıda yapacağız
  seaNodes.forEach((n, i) => (n.comp = comp[i]));
  seaNodes.mainComp = main;
}
let noSea = 0;
provSea.forEach((s, i) => {
  if (isCoastal[i] && !s.length) noSea++;
});
log('denize bağlanamayan kıyı bölgesi', noSea);

// ---------------------------------------------------------------------------
// Boğaz geçişleri (kara birlikleri için kısa deniz geçişleri)
// ---------------------------------------------------------------------------
const CROSS_KM = 40;
const crossLinks = provinces.map(() => new Set());
{
  const idx = new GridIndex(16);
  coastVerts.forEach((vs, pi) => {
    if (!isCoastal[pi]) return;
    for (const v of vs) idx.insert([v[0], v[1], v[0], v[1]], [pi, v]);
  });
  const nbSets = nbrs.map((a) => new Set(a));
  coastVerts.forEach((vs, pi) => {
    if (!isCoastal[pi]) return;
    for (const v of vs) {
      const [, lat] = unproject(v[0], v[1]);
      const R = CROSS_KM / KM_PER_UNIT_EQ / Math.max(0.35, Math.cos(lat * DEG));
      for (const [pj, w] of idx.queryBox([v[0] - R, v[1] - R, v[0] + R, v[1] + R])) {
        if (pj === pi || nbSets[pi].has(pj) || crossLinks[pi].has(pj)) continue;
        if (distKmXY(v, w) > CROSS_KM) continue;
        crossLinks[pi].add(pj);
        crossLinks[pj].add(pi);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Kaynak potansiyelleri (arazi + deterministik dağılım)
// ---------------------------------------------------------------------------
function resources(code, terrain) {
  const r = mulberry32(hashString(code) ^ 0x9e3779b9);
  const c = terrain.counts;
  const tot = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  const frac = (t) => (c[t] ?? 0) / tot;
  const fert = frac('plains') * 1 + frac('hills') * 0.7 + frac('marsh') * 0.5 + frac('forest') * 0.4 + frac('jungle') * 0.4 + frac('mountains') * 0.2;
  const food = Math.round(Math.min(3, fert * 3 + r() * 0.8 - 0.2) * 10) / 10;
  const rough = frac('mountains') + frac('hills') * 0.6 + frac('desert') * 0.2 + frac('tundra') * 0.2;
  const iron = r() < 0.25 + rough * 0.6 ? Math.round((1 + r() * 2) * 10) / 10 : 0;
  const coal = r() < 0.2 + rough * 0.45 + frac('plains') * 0.1 ? Math.round((1 + r() * 2) * 10) / 10 : 0;
  const woods = frac('forest') + frac('jungle') * 0.9 + frac('hills') * 0.3 + frac('marsh') * 0.2;
  const timber = Math.round(Math.min(3, woods * 3 + r() * 0.6) * 10) / 10;
  return [Math.max(0, food), iron, coal, timber];
}

// ---------------------------------------------------------------------------
// Nehirler ve göller
// ---------------------------------------------------------------------------
function dpSimplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length > 3 && first[0] === last[0] && first[1] === last[1]) {
    // kapalı halka: en uzak noktadan ikiye böl
    let fi = 1, fd = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = (pts[i][0] - first[0]) ** 2 + (pts[i][1] - first[1]) ** 2;
      if (d > fd) {
        fd = d;
        fi = i;
      }
    }
    const a = dpSimplify(pts.slice(0, fi + 1), tol);
    const b = dpSimplify(pts.slice(fi), tol);
    return a.concat(b.slice(1));
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let md = 0, mi = -1;
    const [ax, ay] = pts[s], [bx, by] = pts[e];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > tol && mi > 0) {
      keep[mi] = 1;
      stack.push([s, mi], [mi, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const q = (v) => Math.round(v * OUT_SCALE);
function encodeLine(pts) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of pts) {
    const qx = q(x), qy = q(y);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return out;
}
const rivers = [];
{
  const rv = readJSON(path.join(DATA_DIR, 'ne_50m_rivers_lake_centerlines.geojson'));
  for (const f of rv.features) {
    const p = f.properties;
    if ((p.scalerank ?? 9) > 6) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const line of lines) {
      const pts = line.map(([lon, lat]) => project(lon < LON0 ? lon + 360 : lon, lat));
      const s = dpSimplify(pts, 0.6);
      if (s.length >= 2) rivers.push({ r: p.scalerank, d: encodeLine(s) });
    }
  }
}
const lakes = [];
{
  const lk = readJSON(path.join(DATA_DIR, 'ne_50m_lakes.geojson'));
  for (const f of lk.features) {
    for (const poly of geomPolygons(f.geometry)) {
      const ring = poly[0].map(([lon, lat]) => project(lon < LON0 ? lon + 360 : lon, lat));
      const s = dpSimplify(ring, 0.5);
      if (s.length >= 4 && Math.abs(ringAreaPlanar(s)) > 4) lakes.push(encodeLine(s));
    }
  }
}
log('nehir', rivers.length, 'göl', lakes.length);

// ---------------------------------------------------------------------------
// Çıktılar
// ---------------------------------------------------------------------------
const round1 = (v) => Math.round(v * 10) / 10;
// Nicemlenmiş yaylar: topojson delta kodlaması zaten var, OUT_SCALE ızgarasına dönüştür
const sx = tf.scale[0] * OUT_SCALE, sy = tf.scale[1] * OUT_SCALE;
const outArcs = absArcs.map((pts) => encodeLine(pts));
void sx;
void sy;

const provGeo = geomsT1.map((g) => {
  if (g.type === 'Polygon') return [g.arcs];
  if (g.type === 'MultiPolygon') return g.arcs;
  return [];
});

const usedSea = seaNodes.map((n) => n.comp === seaNodes.mainComp || n.adj.size > 0);
// Kıyıya bağlı küçük bileşenleri (ör. Hazar) koru; tamamen yalnız ve kıyısız düğümleri at
const seaUsedByCoast = new Set(provSea.flat());
const keepSea = seaNodes.map((n, i) => usedSea[i] || seaUsedByCoast.has(i));
const seaRemap = new Int32Array(seaNodes.length).fill(-1);
let si = 0;
keepSea.forEach((k, i) => {
  if (k) seaRemap[i] = si++;
});

function controlProvince(ll) {
  if (!ll) return -1;
  const [x, y] = project(ll[0], ll[1]);
  for (let i = 0; i < finalPolys.length; i++) {
    const b = polygonsBBox(finalPolys[i]);
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (pointInPolygons(x, y, finalPolys[i])) return i;
  }
  return -1;
}

const world = {
  version: 1,
  source: `Natural Earth ${NE_TAG} (public domain)`,
  width: W,
  height: H,
  lon0: LON0,
  latN: LAT_N,
  latS: LAT_S,
  provinces: provinces.map((p, i) => {
    const a = provAttr[i];
    const [lon, lat] = unproject(a.label[0], a.label[1]);
    const city = provPlaces[i].filter((c) => c.a3 === p.a3 || provPlaces[i].length === 1).sort((x, y) => y.pop - x.pop)[0] ?? null;
    const capital = provPlaces[i].find((c) => c.cap && c.a3 === p.a3);
    const main = capital ?? city;
    return {
      id: p.code,
      name: p.name,
      nameEn: p.nameEn,
      a3: p.a3,
      x: round1(a.label[0]),
      y: round1(a.label[1]),
      lon: round1(lon),
      lat: round1(lat),
      area: Math.round(a.area),
      pop: a.pop,
      urban: a.urban,
      terrain: a.terrain.main,
      coastal: isCoastal[i],
      res: resources(p.code, a.terrain),
      city: main
        ? {
            name: main.nameTr,
            nameEn: main.name,
            x: round1(main.x),
            y: round1(main.y),
            pop: Math.round(main.pop),
            capital: !!main.cap,
            hist: main.hist,
          }
        : null,
      adj: [...nbrs[i]].sort((a, b) => a - b),
      cross: [...crossLinks[i]].sort((a, b) => a - b),
      sea: provSea[i].map((s) => seaRemap[s]).filter((s) => s >= 0),
    };
  }),
  sea: seaNodes
    .map((n, i) => ({ n, i }))
    .filter(({ i }) => keepSea[i])
    .map(({ n }) => ({
      x: round1(n.x),
      y: round1(n.y),
      lon: round1(n.lon),
      lat: round1(n.lat),
      adj: [...n.adj].map((j) => seaRemap[j]).filter((j) => j >= 0).sort((a, b) => a - b),
    })),
  straits: straitLinks
    .filter((l) => seaRemap[l.a] >= 0 && seaRemap[l.b] >= 0)
    .map((l) => ({ a: seaRemap[l.a], b: seaRemap[l.b], name: l.name, control: controlProvince(l.control) })),
};

const geoOut = {
  version: 1,
  width: W,
  height: H,
  scale: OUT_SCALE,
  arcs: outArcs,
  arcSides,
  provinces: provGeo,
  rivers,
  lakes,
};

const countriesOut = {};
for (const [a3, m] of countryMeta) {
  if (DROP_A3.has(a3) || a3 === 'ATA') continue;
  countriesOut[a3] = m;
}

fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src/data/generated'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/data/world.json'), JSON.stringify(world));
fs.writeFileSync(path.join(ROOT, 'public/data/world-geo.json'), JSON.stringify(geoOut));
fs.writeFileSync(path.join(ROOT, 'src/data/generated/ne-countries.json'), JSON.stringify(countriesOut, null, 0));

// Özet
{
  const byA3 = new Map();
  for (const p of world.provinces) byA3.set(p.a3, (byA3.get(p.a3) ?? 0) + 1);
  const top = [...byA3.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  log('bölge sayısı', world.provinces.length, 'deniz düğümü', world.sea.length);
  log('ülke başına bölge (ilk 40):', top.map(([a, n]) => `${a}:${n}`).join(' '));
  const sz = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + ' KB';
  log('dosyalar:', 'world.json', sz('public/data/world.json'), 'world-geo.json', sz('public/data/world-geo.json'));
  const iso = world.provinces.filter((p) => !p.adj.length && !p.cross.length && !p.sea.length);
  log('tamamen yalıtılmış bölge', iso.length, iso.slice(0, 20).map((p) => `${p.a3}/${p.name}`).join(', '));
}
