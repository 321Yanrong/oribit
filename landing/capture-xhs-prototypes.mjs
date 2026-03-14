import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

const outputDir = path.resolve('landing/screenshots');
const fileUrl = `file://${path.resolve('landing/xiaohongshu-ui-prototypes.html')}`;

const frames = [
  { id: 'frame-cover', name: 'xhs-cover.png' },
  { id: 'frame-journey', name: 'xhs-journey.png' },
  { id: 'frame-memory', name: 'xhs-memory-privacy.png' },
  { id: 'frame-album-book', name: 'xhs-album-book.png' },
  { id: 'frame-mindshare', name: 'xhs-mindshare.png' },
];

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

await page.goto(fileUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

for (const frame of frames) {
  const locator = page.locator(`#${frame.id}`);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await locator.screenshot({
    path: path.join(outputDir, frame.name),
  });
  console.log(`Saved ${frame.name}`);
}

await browser.close();
console.log('Done.');
