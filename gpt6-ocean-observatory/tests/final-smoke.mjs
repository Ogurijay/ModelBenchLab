import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const report = { date: new Date().toISOString(), checks: [], errors: [] };
try {
  for (const path of ['', 'dist/']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(`http://localhost:3000/gpt6-ocean-observatory/${path}?paused=1&time=12&seed=71`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__oceanObservatory);
    const snapshot = await page.evaluate(() => window.__oceanObservatory.snapshot());
    assert.equal(snapshot.time, 12); assert.equal(snapshot.seed, 71); assert.equal(snapshot.paused, true); assert.equal(snapshot.shaderErrors, 0);
    await page.getByRole('button', { name: '纯净观海 H' }).focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('h');
      assert.equal(await page.locator('#restore-ui').isVisible(), i % 2 === 0);
    }
    await page.getByRole('button', { name: '平静海面', exact: true }).click();
    const fields = await page.evaluate(() => {
      const parameters = window.__oceanObservatory.snapshot().parameters;
      return ['wind', 'height', 'direction', 'sun'].map(key => ({ key, value: Number(document.getElementById(key).value), expected: parameters[key], valid: document.getElementById(key).validity.valid }));
    });
    fields.forEach(field => { assert.equal(field.value, field.expected); assert.equal(field.valid, true); });
    await page.getByRole('button', { name: '重置所有参数' }).click();
    await page.waitForTimeout(400);
    if (!path) await page.screenshot({ path: artifacts + 'desktop-final.png' });
    report.checks.push(`${path || 'source'}: fixed seed/time, repeated H, preset input validity, reset, no console errors`);
    if (path) report.production = await page.evaluate(() => window.__oceanObservatory.snapshot());
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(artifacts + 'final-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
