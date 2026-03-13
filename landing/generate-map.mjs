/**
 * 生成一张 SVG 合成暗色地图截图
 * 效果：黑色背景 + 灰色路网 + 蓝色黄浦江 + 薄荷绿发光打卡点 + 好友头像环
 * 尺寸：390×844 @3x = 1170×2532px（和其他截图一致）
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'screenshots', 'app', 'map.png');

const W = 1170;
const H = 2532;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="pinGlow">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="avatarGlow">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softBlur">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
    <radialGradient id="riverGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a3a5c"/>
      <stop offset="100%" stop-color="#0d1f35"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0d0d0d"/>

  <!-- Subtle grid (city blocks) -->
  ${Array.from({length: 30}, (_, i) => `<line x1="${i*42}" y1="0" x2="${i*42}" y2="${H}" stroke="#1a1a1a" stroke-width="1"/>`).join('')}
  ${Array.from({length: 65}, (_, i) => `<line x1="0" y1="${i*42}" x2="${W}" y2="${i*42}" stroke="#1a1a1a" stroke-width="1"/>`).join('')}

  <!-- ── Major roads (wider, lighter grey) ── -->
  <!-- Horizontal arterials -->
  <path d="M 0 520 Q 300 510 600 530 Q 900 550 1170 540" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 0 780 Q 250 770 585 790 Q 900 810 1170 795" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 0 1100 Q 350 1090 700 1110 Q 950 1125 1170 1115" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 0 1460 Q 400 1450 800 1470 Q 1000 1480 1170 1468" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 0 1850 Q 300 1840 600 1860 Q 900 1875 1170 1862" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 0 2200 Q 350 2190 700 2210 Q 950 2220 1170 2215" stroke="#2a2a2a" stroke-width="9" fill="none"/>

  <!-- Vertical arterials -->
  <path d="M 160 0 Q 155 650 162 1300 Q 168 1950 163 ${H}" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 420 0 Q 415 600 422 1266 Q 428 1900 421 ${H}" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 690 0 Q 684 700 691 1400 Q 697 2100 690 ${H}" stroke="#2a2a2a" stroke-width="9" fill="none"/>
  <path d="M 950 0 Q 944 600 951 1266 Q 957 1900 950 ${H}" stroke="#2a2a2a" stroke-width="9" fill="none"/>

  <!-- ── Secondary roads ── -->
  <path d="M 0 300 Q 400 295 800 305 Q 1000 310 1170 305" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 650 Q 350 642 700 655 Q 950 663 1170 658" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 960 Q 280 950 560 962 Q 850 974 1170 966" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 1250 Q 350 1242 700 1254 Q 950 1262 1170 1256" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 1640 Q 320 1632 640 1643 Q 920 1652 1170 1647" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 2050 Q 400 2042 800 2053 Q 1000 2060 1170 2055" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 0 2380 Q 300 2372 600 2383 Q 900 2392 1170 2387" stroke="#1e1e1e" stroke-width="5" fill="none"/>

  <path d="M 55 0 Q 50 800 57 1600 Q 62 2200 55 ${H}" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 285 0 Q 280 750 287 1500 Q 292 2200 285 ${H}" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 550 0 Q 545 850 552 1700 Q 557 2200 550 ${H}" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 820 0 Q 815 650 822 1300 Q 827 1950 820 ${H}" stroke="#1e1e1e" stroke-width="5" fill="none"/>
  <path d="M 1080 0 Q 1075 700 1082 1400 Q 1087 2100 1080 ${H}" stroke="#1e1e1e" stroke-width="5" fill="none"/>

  <!-- ── Huangpu River (diagonal blue ribbon) ── -->
  <path d="M 750 0 Q 820 400 790 850 Q 760 1200 800 1600 Q 840 2000 810 ${H}"
        stroke="url(#riverGrad)" stroke-width="52" fill="none" opacity="0.85"/>
  <path d="M 750 0 Q 820 400 790 850 Q 760 1200 800 1600 Q 840 2000 810 ${H}"
        stroke="#1a3a5c" stroke-width="40" fill="none" opacity="0.6"/>
  <!-- River highlight center line -->
  <path d="M 752 0 Q 822 400 792 850 Q 762 1200 802 1600 Q 842 2000 812 ${H}"
        stroke="#243f5e" stroke-width="12" fill="none" opacity="0.5"/>

  <!-- ── Diagonal ring road ── -->
  <path d="M 0 900 Q 200 400 600 200 Q 1000 50 1170 300" stroke="#232323" stroke-width="14" fill="none"/>
  <path d="M 0 1800 Q 300 1400 700 1200 Q 1000 1050 1170 1150" stroke="#232323" stroke-width="14" fill="none"/>

  <!-- ── Park / block fill areas ── -->
  <rect x="180" y="680" width="160" height="100" rx="8" fill="#141e14" opacity="0.7"/>
  <rect x="600" y="1050" width="120" height="90" rx="8" fill="#141e14" opacity="0.7"/>
  <rect x="880" y="400" width="100" height="120" rx="8" fill="#141e14" opacity="0.7"/>
  <rect x="100" y="1400" width="140" height="80" rx="8" fill="#141e14" opacity="0.7"/>
  <rect x="450" y="1750" width="160" height="110" rx="8" fill="#141e14" opacity="0.7"/>

  <!-- ── TOP UI chrome ── -->
  <!-- Status bar bg -->
  <rect x="0" y="0" width="${W}" height="130" fill="#0d0d0d"/>
  <!-- Time -->
  <text x="80" y="90" font-family="system-ui,-apple-system" font-size="52" font-weight="700" fill="white">9:41</text>
  <!-- Signal / wifi / battery icons -->
  <rect x="950" y="58" width="24" height="36" rx="4" fill="none" stroke="white" stroke-width="5"/>
  <rect x="974" y="70" width="6" height="12" rx="2" fill="white"/>
  <rect x="955" y="62" width="14" height="28" rx="2" fill="white" opacity="0.7"/>
  <circle cx="900" cy="78" r="14" fill="none" stroke="white" stroke-width="5"/>
  <circle cx="900" cy="78" r="6" fill="white"/>
  <rect x="840" y="60" width="8" height="36" rx="2" fill="white"/>
  <rect x="856" y="68" width="8" height="28" rx="2" fill="white"/>
  <rect x="872" y="74" width="8" height="22" rx="2" fill="white" opacity="0.5"/>

  <!-- Map controls top -->
  <rect x="0" y="130" width="${W}" height="110" fill="url(#topFade)" opacity="0"/>
  <!-- Friend filter pills -->
  <rect x="30" y="150" width="220" height="70" rx="35" fill="#1e1e1e" stroke="#2a2a2a" stroke-width="2"/>
  <circle cx="75" cy="185" r="26" fill="#2a2a2a" stroke="#00FFB3" stroke-width="3"/>
  <text x="110" y="192" font-family="system-ui" font-size="32" fill="white" font-weight="600">所有好友</text>

  <!-- Group by toggle -->
  <rect x="860" y="150" width="260" height="70" rx="35" fill="#1e1e1e" stroke="#2a2a2a" stroke-width="2"/>
  <text x="890" y="193" font-family="system-ui" font-size="30" fill="#00FFB3" font-weight="700">📍 地点</text>
  <text x="1010" y="193" font-family="system-ui" font-size="30" fill="#555">🌆 城市</text>

  <!-- ── PIN 1: 外滩 (right side, upper area) ── -->
  <!-- Glow halo -->
  <circle cx="820" cy="780" r="60" fill="#00FFB3" opacity="0.12" filter="url(#softBlur)"/>
  <!-- Pin body -->
  <circle cx="820" cy="780" r="36" fill="#00FFB3" filter="url(#pinGlow)" opacity="0.95"/>
  <circle cx="820" cy="780" r="24" fill="#0d0d0d"/>
  <circle cx="820" cy="780" r="10" fill="#00FFB3"/>
  <!-- Pin label -->
  <rect x="660" y="830" width="200" height="54" rx="27" fill="#1a1a1a" stroke="#00FFB3" stroke-width="2"/>
  <text x="760" y="865" font-family="system-ui" font-size="28" fill="#00FFB3" font-weight="700" text-anchor="middle">外滩</text>
  <!-- Friend avatar ring -->
  <circle cx="820" cy="680" r="44" fill="#1a1a1a" stroke="#00FFB3" stroke-width="4" filter="url(#avatarGlow)" opacity="0.9"/>
  <text x="820" y="698" font-family="system-ui" font-size="48" text-anchor="middle">🐱</text>

  <!-- ── PIN 2: 静安寺 (left-center) ── -->
  <circle cx="330" cy="1140" r="50" fill="#00FFB3" opacity="0.10" filter="url(#softBlur)"/>
  <circle cx="330" cy="1140" r="30" fill="#00D9FF" filter="url(#pinGlow)" opacity="0.9"/>
  <circle cx="330" cy="1140" r="20" fill="#0d0d0d"/>
  <circle cx="330" cy="1140" r="8" fill="#00D9FF"/>
  <rect x="185" y="1186" width="200" height="50" rx="25" fill="#1a1a1a" stroke="#00D9FF" stroke-width="2"/>
  <text x="285" y="1219" font-family="system-ui" font-size="28" fill="#00D9FF" font-weight="700" text-anchor="middle">静安寺</text>
  <circle cx="330" cy="1052" r="38" fill="#1a1a1a" stroke="#00D9FF" stroke-width="3" filter="url(#avatarGlow)" opacity="0.9"/>
  <text x="330" y="1070" font-family="system-ui" font-size="40" text-anchor="middle">🐶</text>

  <!-- ── PIN 3: 弄堂咖啡 (small) ── -->
  <circle cx="580" cy="1580" r="22" fill="#a29bfe" filter="url(#pinGlow)" opacity="0.85"/>
  <circle cx="580" cy="1580" r="14" fill="#0d0d0d"/>
  <circle cx="580" cy="1580" r="6" fill="#a29bfe"/>
  <rect x="445" y="1618" width="192" height="46" rx="23" fill="#1a1a1a" stroke="#a29bfe" stroke-width="2"/>
  <text x="541" y="1649" font-family="system-ui" font-size="26" fill="#a29bfe" font-weight="700" text-anchor="middle">弄堂咖啡</text>

  <!-- ── Floating particles ── -->
  <circle cx="200" cy="400" r="4" fill="#00FFB3" opacity="0.3"/>
  <circle cx="950" cy="1200" r="3" fill="#00D9FF" opacity="0.25"/>
  <circle cx="450" cy="2100" r="5" fill="#00FFB3" opacity="0.2"/>
  <circle cx="700" cy="300" r="3" fill="#a29bfe" opacity="0.3"/>
  <circle cx="1050" cy="1800" r="4" fill="#00FFB3" opacity="0.2"/>
  <circle cx="120" cy="2300" r="3" fill="#00D9FF" opacity="0.25"/>

  <!-- ── Bottom gradient fade (behind bottom nav) ── -->
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d0d0d" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0d0d0d" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${H - 300}" width="${W}" height="300" fill="url(#bottomFade)"/>

  <!-- ── Bottom nav chrome ── -->
  <rect x="40" y="${H - 200}" width="${W - 80}" height="150" rx="50" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="2"/>
  <!-- Nav icons (5 tabs) -->
  <!-- Map (active) -->
  <rect x="60" y="${H - 195}" width="180" height="140" rx="44" fill="#00FFB3" opacity="0.12"/>
  <text x="150" y="${H - 108}" font-family="system-ui" font-size="48" text-anchor="middle">🗺️</text>
  <text x="150" y="${H - 72}" font-family="system-ui" font-size="28" fill="#00FFB3" font-weight="700" text-anchor="middle">地图</text>
  <!-- Memory -->
  <text x="340" y="${H - 108}" font-family="system-ui" font-size="48" text-anchor="middle">🖼️</text>
  <text x="340" y="${H - 72}" font-family="system-ui" font-size="28" fill="#555" text-anchor="middle">记忆</text>
  <!-- Ledger -->
  <text x="585" y="${H - 108}" font-family="system-ui" font-size="48" text-anchor="middle">💳</text>
  <text x="585" y="${H - 72}" font-family="system-ui" font-size="28" fill="#555" text-anchor="middle">账单</text>
  <!-- Games -->
  <text x="830" y="${H - 108}" font-family="system-ui" font-size="48" text-anchor="middle">🎮</text>
  <text x="830" y="${H - 72}" font-family="system-ui" font-size="28" fill="#555" text-anchor="middle">游戏</text>
  <!-- Profile -->
  <text x="1020" y="${H - 108}" font-family="system-ui" font-size="48" text-anchor="middle">👤</text>
  <text x="1020" y="${H - 72}" font-family="system-ui" font-size="28" fill="#555" text-anchor="middle">我的</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile(outPath);

console.log(`✅ Synthetic dark map saved: ${outPath}`);
