/**
 * 下载高德静态地图 + 后期处理成深色风格
 * 中心：上海外滩附近，zoom 13，390×844（iPhone 14 Pro 比例），scale=2
 */
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'screenshots', 'app');

const AMAP_KEY = '2c322381589d30cd71d9275748b8b02c';

// Markers: demo pin positions (Shanghai + HK)
const markers = [
  'size:mid;color:0x00FFB3;label:A;121.4901,31.2397',  // 外滩
  'size:mid;color:0x00FFB3;label:B;121.4431,31.2235',  // 静安
  'size:small;color:0x00D9FF;label:C;114.1694,22.3064', // HK (省级会显示)
].join('|');

const url =
  `https://restapi.amap.com/v3/staticmap` +
  `?key=${AMAP_KEY}` +
  `&location=121.4737,31.2304` +
  `&zoom=13` +
  `&size=390*844` +
  `&scale=2` +
  `&markers=${encodeURIComponent(markers)}`;

const downloadBuffer = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });

console.log('Downloading AMap static map...');
const raw = await downloadBuffer(url);

// Check if response is actually an image (AMap returns JSON on key error)
if (raw[0] === 0x7b) { // '{' = JSON error response
  console.error('AMap API error:', raw.toString());
  process.exit(1);
}

const rawPath = path.join(outDir, 'map-amap-raw.png');
await fs.writeFile(rawPath, raw);
console.log('Raw map saved:', rawPath);

// Post-process to dark style:
// 1. Desaturate + darken heavily to get a moody base
// 2. Tint blue-black to match app's #0d0d0d atmosphere
// 3. Boost back just a little brightness so roads are still visible
const darkMap = await sharp(raw)
  .modulate({ brightness: 0.30, saturation: 0.18, hue: 200 }) // desaturate + cool hue
  .tint({ r: 13, g: 17, b: 28 })  // deep navy-black tint
  .modulate({ brightness: 1.6 })  // bring roads back slightly
  .png()
  .toBuffer();

// Overlay glowing pin dots using composite
const w = 390 * 2;  // scale=2
const h = 844 * 2;

// Build a simple SVG overlay with glowing mint-green circles at pin positions
// Map pin pixel positions (approximate for zoom=13 center 121.4737,31.2304)
const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow2">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Pin 1: 外滩 (right of center) -->
  <circle cx="${w * 0.62}" cy="${h * 0.38}" r="14" fill="#00FFB3" filter="url(#glow)" opacity="0.9"/>
  <circle cx="${w * 0.62}" cy="${h * 0.38}" r="6" fill="#fff"/>
  <!-- Pin 2: 静安 (left of center) -->
  <circle cx="${w * 0.39}" cy="${h * 0.54}" r="12" fill="#00FFB3" filter="url(#glow)" opacity="0.85"/>
  <circle cx="${w * 0.39}" cy="${h * 0.54}" r="5" fill="#fff"/>
  <!-- Friend avatar circle hint -->
  <circle cx="${w * 0.62}" cy="${h * 0.26}" r="20" fill="none" stroke="#00FFB3" stroke-width="3" opacity="0.6"/>
  <circle cx="${w * 0.39}" cy="${h * 0.42}" r="18" fill="none" stroke="#00D9FF" stroke-width="3" opacity="0.6"/>
</svg>`;

const finalMap = await sharp(darkMap)
  .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
  .png()
  .toFile(path.join(outDir, 'map.png'));

console.log('✅ Dark map saved to landing/screenshots/app/map.png');
