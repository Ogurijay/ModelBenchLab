import { chromium } from 'playwright';
import { resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:3035/';
const screenshotPath = resolve(process.argv[3] || 'docs/preview.png');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => window.__bench?.ready === true, null, { timeout: 15_000 });
  const result = await page.evaluate(() => ({
    title: document.title,
    canvas: document.querySelectorAll('#app canvas').length,
    state: window.__bench.getState(),
    teleportTest: window.__bench.teleportTest(),
    portalTest: window.__bench.portalTest(),
    afterFrames: window.__bench.stepFrame(8),
  }));
  await page.screenshot({ path: screenshotPath, fullPage: true });

  if (result.canvas !== 1) errors.push(`canvas count: ${result.canvas}`);
  if (!result.title.includes('折跃实验场')) errors.push(`unexpected title: ${result.title}`);
  if (result.teleportTest.passed !== result.teleportTest.total) {
    errors.push(`teleport self-test: ${result.teleportTest.passed}/${result.teleportTest.total}`);
  }
  if (result.portalTest.passed !== 10 || result.portalTest.total !== 10) errors.push(`portal compliance: ${result.portalTest.passed}/${result.portalTest.total}`);
  if (result.state.fixedDt !== 1 / 120) errors.push(`fixedDt: ${result.state.fixedDt}`);

  if (errors.length) {
    console.error(JSON.stringify({ url, screenshotPath, errors, result }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      url,
      screenshotPath,
      title: result.title,
      teleportTest: `${result.teleportTest.passed}/${result.teleportTest.total}`,
      portalTest: `${result.portalTest.passed}/${result.portalTest.total}`,
      fixedDt: result.state.fixedDt,
      renderState: result.state,
    }, null, 2));
  }
} finally {
  await browser.close();
}
