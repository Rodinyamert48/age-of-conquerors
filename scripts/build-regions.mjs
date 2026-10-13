/**
 * Her oyun bölgesinin kapsadığı Natural Earth admin-1 birimlerini çıkarır.
 *
 * Tarihî senaryolar sınırları bu adlarla tanımlar (ör. "POL/Lublin Voivodeship" → Rus İmparatorluğu).
 * Bölge birleştirme/bölme sonrası bir oyun bölgesi birden çok idari birim içerebilir; çıktı
 * dizisinin ilk elemanı bölge merkezini içeren birimdir, diğerleri etiket noktası bölgeye düşen birimlerdir.
 *
 * Kullanım: node scripts/build-regions.mjs [--data-dir <Natural Earth GeoJSON klasörü>]
 * Girdi:  public/data/world.json, public/data/world-geo.json, ne_10m_admin_1_states_provinces.geojson
 * Çıktı:  src/data/generated/province-regions.json  (bölge sırasıyla [ad, ...] dizileri)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argDir = process.argv.indexOf('--data-dir');
const DATA_DIR = argDir > 0 ? path.resolve(process.argv[argDir + 1]) : path.join(ROOT, '.cache', 'naturalearth');
const ADMIN1 = path.join(DATA_DIR, 'ne_10m_admin_1_states_provinces.geojson');
if (!fs.existsSync(ADMIN1)) {
  console.error(`Bulunamadı: ${ADMIN1}\nÖnce "npm run build:map" çalıştırın ya da --data-dir verin.`);
  process.exit(1);
}

const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world-geo.json'), 'utf8'));
const ne = JSON.parse(fs.readFileSync(ADMIN1, 'utf8'));

// build-map.mjs ile aynı Miller izdüşümü
const W = 16384;
const LON0 = -169;
const LAT_N = 84;
const LAT_S = -58;
const S = W / (2 * Math.PI);
const DEG = Math.PI / 180;
const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * DEG));
const Y_TOP = millerY(LAT_N);
const project = (lon, lat) => {
  const la = Math.max(LAT_S, Math.min(LAT_N, lat));
  return [(lon - LON0) * DEG * S, (Y_TOP - millerY(la)) * S];
};

// Oyun bölgesi halkaları (harita koordinatı)
const arcs = geo.arcs.map((d) => {
  const out = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < d.length; i += 2) {
    x += d[i];
    y += d[i + 1];
    out.push([x / geo.scale, y / geo.scale]);
  }
  return out;
});
const provRings = geo.provinces.map((polys) => polys.flatMap((poly) => poly.map((ring) => ring.flatMap((ai) => (ai < 0 ? [...arcs[~ai]].reverse() : arcs[ai])))));

function inRings(rings, x, y) {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

// Admin-1 birimleri (boylam/enlem halkaları + sınır kutusu)
const units = ne.features.map((f) => {
  const pr = f.properties;
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const rings = polys.flat();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { a3: pr.adm0_a3, name: String(pr.name_en || pr.name || pr.name_local || '').trim(), lon: pr.longitude, lat: pr.latitude, rings, bbox: [x0, y0, x1, y1] };
});
const byA3 = new Map();
for (const u of units) {
  if (!byA3.has(u.a3)) byA3.set(u.a3, []);
  byA3.get(u.a3).push(u);
}

const P = world.provinces.length;
const out = Array.from({ length: P }, () => []);
const provsByA3 = new Map();
world.provinces.forEach((p, i) => {
  if (!provsByA3.has(p.a3)) provsByA3.set(p.a3, []);
  provsByA3.get(p.a3).push(i);
});

// 1) Bölge merkezini içeren birim
for (let i = 0; i < P; i++) {
  const p = world.provinces[i];
  const cands = byA3.get(p.a3) ?? [];
  let hit = cands.find((u) => p.lon >= u.bbox[0] && p.lon <= u.bbox[2] && p.lat >= u.bbox[1] && p.lat <= u.bbox[3] && inRings(u.rings, p.lon, p.lat));
  if (!hit && cands.length) {
    // Merkez kıyı/ada kayması nedeniyle dışarıda kaldıysa en yakın etiket noktası
    let best = null;
    let bd = Infinity;
    for (const u of cands) {
      const d = (u.lon - p.lon) ** 2 + (u.lat - p.lat) ** 2;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    hit = best;
  }
  if (hit?.name) out[i].push(hit.name);
}

// 2) Etiket noktası bölgeye düşen diğer birimler (birleştirilmiş bölgeler)
for (const u of units) {
  if (!u.name || !Number.isFinite(u.lon)) continue;
  const [x, y] = project(u.lon, u.lat);
  const provs = provsByA3.get(u.a3) ?? [];
  const p = provs.find((i) => inRings(provRings[i], x, y));
  if (p !== undefined && !out[p].includes(u.name)) out[p].push(u.name);
}

const missing = out.filter((a) => !a.length).length;
const target = path.join(ROOT, 'src/data/generated/province-regions.json');
fs.writeFileSync(target, JSON.stringify(out));
console.log(`bölge ${P}, idari birim atanmamış ${missing}, dosya ${(fs.statSync(target).size / 1024).toFixed(0)} KB`);
