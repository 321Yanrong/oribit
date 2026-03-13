import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.join(__dirname, 'orbit-website-prototypes.html');
const outputDir = path.join(__dirname, 'screenshots');

const frames = [
  { id: 'frame-hero', file: '01-hero.png' },
  { id: 'frame-features', file: '02-features.png' },
  { id: 'frame-how', file: '03-how-it-works.png' },
  { id: 'frame-friend-system', file: '04-friend-system.png' },
  { id: 'frame-footer', file: '05-footer.png' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });

await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);

for (const frame of frames) {
  const locator = page.locator(`#${frame.id}`);
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const outPath = path.join(outputDir, frame.file);
  await locator.screenshot({ path: outPath, type: 'png' });
  console.log(`Saved: ${outPath}`);
}

await browser.close();
console.log('Done.');
