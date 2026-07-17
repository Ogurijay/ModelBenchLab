import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });

try {
  await page.goto(process.env.MANHATTAN_QA_URL ?? 'http://127.0.0.1:3036/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__BENCH__?.ready === true);
  await page.evaluate(() => {
    window.__BENCH__.setTime(9.5);
    window.__BENCH__.setWeather('clear', 0);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(root, 'docs/qa/desktop-clear-preview.jpg'), type: 'jpeg', quality: 15 });
  await page.evaluate(() => {
    window.__BENCH__.setTime(16);
    window.__BENCH__.setWeather('storm', 0);
    window.__BENCH__.forceLightning();
  });
  await page.waitForTimeout(70);
  await page.screenshot({ path: resolve(root, 'docs/qa/desktop-storm-preview.jpg'), type: 'jpeg', quality: 15 });
} finally {
  await browser.close();
}
