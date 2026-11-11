#!/usr/bin/env node
/**
 * flag-icons (MIT lisanslı) SVG bayraklarını public/flags klasörüne kopyalar.
 * npm install / dev / build öncesinde otomatik çalışır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/flag-icons/flags/4x3');
const dest = path.join(root, 'public/flags');
if (!fs.existsSync(src)) {
  console.warn('[bayraklar] flag-icons bulunamadı; bayraklar kopyalanmadı');
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith('.svg')) continue;
  const target = path.join(dest, f);
  if (fs.existsSync(target) && fs.statSync(target).size === fs.statSync(path.join(src, f)).size) continue;
  fs.copyFileSync(path.join(src, f), target);
  n++;
}
fs.copyFileSync(path.join(root, 'node_modules/flag-icons/LICENSE'), path.join(dest, 'LICENSE-flag-icons.txt'));
console.log(`[bayraklar] ${n} bayrak kopyalandı`);
