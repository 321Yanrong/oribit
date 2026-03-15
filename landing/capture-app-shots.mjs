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

// 1. Load app in auto-demo mode (query param triggers handleDemo in App)
const preferUrl = process.env.APP_URL || 'http://localhost:5173/?demo=1';
const candidates = Array.from(new Set([
  preferUrl,
  'http://127.0.0.1:5174/?demo=1',
  'http://localhost:5174/?demo=1',
]));

let loaded = false;
for (const url of candidates) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    loaded = true;
    break;
  } catch (e) {
    console.warn('Goto failed, try next:', url, e?.message || e);
  }
}

if (!loaded) {
  throw new Error('无法打开应用，请确认开发服务器已启动');
}

await page.evaluate(async () => {
  localStorage.clear();
  sessionStorage.clear();
  const dbs = await indexedDB.databases();
  dbs.forEach((db) => db.name && indexedDB.deleteDatabase(db.name));
});
await page.reload({ waitUntil: 'networkidle' });
await sleep(4500); // 覆盖闪屏、登录检查与演示数据注入

// 确认演示模式横幅已出现
await page.getByText('演示模式', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });

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

// 3b. MEMORY detail (打开回忆相册)
const firstMemory = page.getByText('今天在外滩和朋友拍了好多照片', { exact: false }).first();
await firstMemory.waitFor({ state: 'visible', timeout: 8000 });
await firstMemory.click();
await sleep(1800);
await page.screenshot({ path: path.join(outDir, 'memory-open.png'), type: 'png', fullPage: false });
console.log('✅ memory-open.png');

// 3c. MEMORY story playback (回忆相册串联播放界面)
await page.locator('button:has-text("回忆相册")').click();
const storyCard = page.getByText('memory story', { exact: false }).first();
await storyCard.waitFor({ state: 'visible', timeout: 8000 });
await storyCard.click();
await page.getByText('音乐：', { exact: false }).waitFor({ state: 'visible', timeout: 8000 });
await sleep(1200);
await page.screenshot({ path: path.join(outDir, 'memory-story.png'), type: 'png', fullPage: false });
console.log('✅ memory-story.png');
// 关闭播放抽屉，若失败则刷新页面兜底
try {
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 10);
  await page.getByText('音乐：', { exact: false }).waitFor({ state: 'hidden', timeout: 3000 });
} catch (e) {
  console.warn('Close drawer via reload fallback');
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
}

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
