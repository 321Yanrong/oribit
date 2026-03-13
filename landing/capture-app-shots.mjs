import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, 'screenshots', 'app');
await fs.mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 14 Pro
  deviceScaleFactor: 3,
});
const page = await context.newPage();

// 1. Load app and enter demo mode
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await sleep(1500);

// Click the demo button
await page.getByText('暂不登录，先看看演示').click();
await sleep(3000);

// Inject CSS: force map canvas / amap container to stay dark so no white flash
await page.addStyleTag({ content: `
  #amap-container,
  .amap-container,
  .amap-maps,
  [class*="amap"],
  .amap-layer,
  canvas {
    background: #0d0d0d !important;
    background-color: #0d0d0d !important;
  }
` });
await sleep(500);

// 2. MAP page (default)
await page.screenshot({ path: path.join(outDir, 'map.png'), type: 'png', fullPage: false });
console.log('✅ map.png');

// 3. MEMORY page
await page.evaluate(() => {
  window.__ZUSTAND_NAV__ = true;
  const store = window.__zustand_nav_store__;
  if (store) store.getState().setCurrentPage('memory');
});
// Click memory nav item via text/aria
await page.locator('nav').getByText('记忆').click();
await sleep(1500);
await page.screenshot({ path: path.join(outDir, 'memory.png'), type: 'png', fullPage: false });
console.log('✅ memory.png');

// 4. LEDGER page
await page.locator('nav').getByText('账单').click();
await sleep(1500);
await page.screenshot({ path: path.join(outDir, 'ledger.png'), type: 'png', fullPage: false });
console.log('✅ ledger.png');

// 5. GAMES page
await page.locator('nav').getByText('游戏').click();
await sleep(1500);
await page.screenshot({ path: path.join(outDir, 'games.png'), type: 'png', fullPage: false });
console.log('✅ games.png');

// 6. PROFILE page
await page.locator('nav').getByText('我的').click();
await sleep(1500);
await page.screenshot({ path: path.join(outDir, 'profile.png'), type: 'png', fullPage: false });
console.log('✅ profile.png');

await browser.close();
console.log('\nAll app screenshots saved to', outDir);
