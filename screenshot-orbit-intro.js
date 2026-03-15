// 自动打开 orbit-intro.html 并截图保存到 public/screenshots/orbit-intro.png
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1200, height: 1800 } });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/orbit-intro.html', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(1200); // 等待动画和图片加载
  const screenshotPath = path.resolve(__dirname, 'public/screenshots/orbit-intro.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();
  console.log('已保存截图:', screenshotPath);
})();
