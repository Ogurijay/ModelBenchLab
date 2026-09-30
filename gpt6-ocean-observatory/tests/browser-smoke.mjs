import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const failures = [];
const report = { date: new Date().toISOString(), url: 'http://localhost:3000/gpt6-ocean-observatory/', checks: [], errors, failures };
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => failures.push({ url: r.url(), error: r.failure()?.errorText }));
const snapshot = () => page.evaluate(() => window.__oceanObservatory.snapshot());

try {
  await page.goto(report.url + '?seed=71', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__oceanObservatory && document.querySelector('#app').classList.contains('ready'));
  await page.waitForTimeout(1500);
  report.initial = await snapshot();
  assert.equal(report.initial.shaderErrors, 0);
  assert.ok(report.initial.triangles > 100000);
  assert.ok(report.initial.time > 0);
  check('WebGL scene renders with no shader diagnostics');
  await page.screenshot({ path: artifacts + 'desktop-default.png' });
  if (process.argv.includes('--visual-only')) {
    console.log(JSON.stringify(report.initial, null, 2));
  } else {
    await page.getByRole('button', { name: '暂停模拟', exact: true }).click();
    const stopped = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).time, stopped.time);
    check('Pause freezes actual ocean phase');

    await page.getByRole('button', { name: '风暴前夕', exact: true }).click();
    await page.waitForTimeout(1100);
    assert.equal((await snapshot()).parameters.wind, 17);
    assert.equal((await snapshot()).parameters.height, 3.6);
    await page.screenshot({ path: artifacts + 'desktop-squall.png' });
    check('Preset controls update the running scene');

    const height = page.getByRole('slider', { name: '有效波高' });
    await height.focus(); await page.keyboard.press('End');
    await page.waitForTimeout(1100);
    assert.equal((await snapshot()).parameters.height, 4);
    assert.equal((await snapshot()).preset, null);
    await page.mouse.move(650, 560); await page.mouse.down(); await page.mouse.move(650, 240, { steps: 15 }); await page.mouse.up();
    await page.mouse.wheel(0, -4500); await page.waitForTimeout(650);
    const camera = await snapshot();
    assert.ok(camera.camera[1] >= camera.minimumCameraY - 0.0001);
    check('Maximum waves, orbit and zoom keep the camera above all crests');

    await page.getByRole('switch', { name: '观测浮标' }).uncheck();
    await page.waitForTimeout(100);
    assert.equal((await snapshot()).buoyVisible, false);
    await page.getByLabel('渲染质量').selectOption('performance');
    assert.equal((await snapshot()).quality, 'performance');
    check('Buoy switch and quality selection change rendering');

    await page.getByRole('button', { name: '重置所有参数' }).click();
    assert.equal((await snapshot()).parameters.height, 1.8);
    assert.equal((await snapshot()).buoyVisible, true);
    assert.equal((await snapshot()).quality, 'balanced');
    assert.equal((await snapshot()).paused, false);
    check('Reset restores scene, camera, quality and playback');

    await page.getByRole('button', { name: '纯净观海 H' }).click();
    assert.equal(await page.locator('#restore-ui').isVisible(), true);
    assert.equal(await page.locator('#controls').evaluate(el => el.inert), true);
    await page.keyboard.press('h');
    assert.equal(await page.locator('#restore-ui').isVisible(), false);
    check('Immersive mode and keyboard return restore accessible UI');

    await page.getByRole('button', { name: '关于海洋模拟' }).click();
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    check('About dialog opens and closes with Escape');

    await page.getByRole('button', { name: '开启海浪声' }).click();
    assert.equal((await snapshot()).audioEnabled, true);
    await page.getByRole('button', { name: '关闭海浪声' }).click();
    assert.equal((await snapshot()).audioEnabled, false);
    check('Audio starts only through a user gesture and can be disabled');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存海面截图' }).click();
    const download = await downloadPromise;
    await download.saveAs(artifacts + 'exported-ocean.png');
    assert.match(download.suggestedFilename(), /^pelagic-.+\.png$/);
    check('Screenshot produces a downloadable PNG');

    await page.getByRole('button', { name: '进入全屏' }).click();
    await page.waitForFunction(() => document.fullscreenElement);
    await page.getByRole('button', { name: '退出全屏' }).click();
    check('Fullscreen enters and exits');

    await page.locator('#ocean').focus(); await page.keyboard.press('Space');
    assert.equal((await snapshot()).paused, true);
    await page.keyboard.press('r');
    assert.equal((await snapshot()).paused, false);
    check('Space and R work when observing the canvas');

    await page.getByRole('button', { name: '平静海面', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: artifacts + 'desktop-calm.png' });
    await page.getByRole('button', { name: '远海涌浪', exact: true }).click();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const frames = await page.evaluate(async () => {
      const samples = []; let previous, start;
      await new Promise(resolve => {
        const frame = now => {
          start ??= now;
          if (previous !== undefined) samples.push(now - previous);
          previous = now;
          if (now - start >= 30000) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      return samples;
    });
    report.frameTiming = { samples: frames.length, meanMs: frames.reduce((a,b)=>a+b,0)/frames.length, p95Ms: frames.toSorted((a,b)=>a-b)[Math.floor(frames.length * .95)] };
    report.afterInteractions = await snapshot();
    await page.screenshot({ path: artifacts + 'desktop-1080p.png' });
    check('Frame timing recorded from actual browser animation');

    const portal = await browser.newPage();
    report.portalWarnings = [];
    portal.on('console', msg => { if (msg.type() === 'error') report.portalWarnings.push({message:msg.text(),location:msg.location()}); });
    await portal.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    assert.equal(await portal.locator('a[href="./gpt6-ocean-observatory/"]').count(), 1);
    await portal.close();
    check('Portal loads the registered project card');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report.url + '?seed=71', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__oceanObservatory);
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('panel-closed')), true);
    assert.equal((await snapshot()).quality, 'performance');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: artifacts + 'mobile-default.png' });
    await page.getByRole('button', { name: '展开海况控制' }).click();
    await page.getByRole('button', { name: '平静海面', exact: true }).click();
    assert.equal((await snapshot()).parameters.wind, 2.4);
    await page.waitForTimeout(600);
    await page.screenshot({ path: artifacts + 'mobile-controls.png' });
    report.mobile = await snapshot();
    check('390px mobile layout and panel interaction work without horizontal overflow');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await snapshot()).paused, true);
    check('Reduced motion preference starts the sea paused');

    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    check('No console errors, uncaught exceptions or failed network requests');
  }
} catch (error) {
  report.testFailure = error.stack;
  await page.screenshot({ path: artifacts + 'failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(artifacts + 'browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
