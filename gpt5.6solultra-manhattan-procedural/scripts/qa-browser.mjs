import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.MANHATTAN_QA_URL ?? 'http://127.0.0.1:3036/';
const consoleErrors = [];
const pageErrors = [];
const externalRequests = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-gpu', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
page.on('request', (request) => {
  const url = new URL(request.url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) {
    externalRequests.push(request.url());
  }
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(() => window.__BENCH__?.ready === true, null, { timeout: 45_000 });
  await page.waitForTimeout(2_500);

  await page.evaluate(() => {
    window.__BENCH__.setTime(9.5);
    window.__BENCH__.setWeather('clear', 0);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(projectRoot, 'docs/qa/desktop-clear.png') });
  const clearMetrics = await page.evaluate(() => window.__BENCH__.getMetrics());

  const seedCheck = await page.evaluate(async () => {
    await window.__BENCH__.reset(1337);
    const first = window.__BENCH__.getCityHash();
    await window.__BENCH__.reset(1337);
    const repeat = window.__BENCH__.getCityHash();
    await window.__BENCH__.reset(42);
    const different = window.__BENCH__.getCityHash();
    return { first, repeat, different };
  });

  const trafficMetrics = await page.evaluate(async () => {
    await window.__BENCH__.reset(2026);
    window.__BENCH__.setTime(10);
    window.__BENCH__.step(1 / 60, 3600);
    return window.__BENCH__.getMetrics().traffic;
  });

  await page.evaluate(() => {
    window.__BENCH__.setTime(16);
    window.__BENCH__.setWeather('storm', 0);
    window.__BENCH__.forceLightning();
  });
  await page.waitForTimeout(90);
  await page.screenshot({ path: resolve(projectRoot, 'docs/qa/desktop-storm.png') });
  const stormMetrics = await page.evaluate(() => window.__BENCH__.getMetrics());

  await page.evaluate(() => {
    window.__BENCH__.setTime(18);
    window.__BENCH__.setWeather('snow', 0);
  });
  await page.waitForTimeout(350);
  const snowMetrics = await page.evaluate(() => window.__BENCH__.getMetrics());

  const checks = {
    ready: clearMetrics.ready === true,
    deterministicSameSeed: seedCheck.first === seedCheck.repeat,
    distinctDifferentSeed: seedCheck.first !== seedCheck.different,
    roadGrid: clearMetrics.plan.avenueCount >= 8 && clearMetrics.plan.streetCount >= 18,
    triangleBlocks: clearMetrics.plan.triangleBlockCount >= 3,
    buildingLots: clearMetrics.plan.buildingLotCount >= 250,
    landmarks: clearMetrics.plan.landmarkCount >= 4,
    structuredModelRoles: clearMetrics.roles['manhattan-road-grid'] >= 1 && clearMetrics.roles.landmark >= 4 && clearMetrics.roles['suspension-bridge'] >= 1,
    sculptRoles: clearMetrics.roles['sculpted-terrain'] >= 1 && clearMetrics.roles['sculpted-rock-outcrops'] >= 1 && clearMetrics.roles['sculpted-statue'] >= 1 && clearMetrics.roles['volumetric-clouds'] >= 1,
    animationRoles: clearMetrics.roles['day-night-system'] >= 1 && clearMetrics.roles.bird >= 2 && clearMetrics.roles.helicopter >= 1 && clearMetrics.roles.boat >= 2,
    weatherRole: clearMetrics.roles['weather-system'] >= 1 && clearMetrics.roles.lightning >= 1,
    trafficVolume: trafficMetrics.vehicleCount >= 120,
    trafficNoRedViolations: trafficMetrics.redViolations === 0,
    trafficNoCollisions: trafficMetrics.collisionCount === 0,
    stormReached: stormMetrics.weather.kind === 'storm' && stormMetrics.weather.lightningCount >= 1,
    snowReached: snowMetrics.weather.kind === 'snow' && snowMetrics.weather.snowCover > 0.5,
    noConsoleErrors: consoleErrors.length === 0 && pageErrors.length === 0,
    noExternalRequests: externalRequests.length === 0,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    url: baseUrl,
    viewport: '1920x1080@1x',
    checks,
    passed: Object.values(checks).every(Boolean),
    clear: {
      fps: clearMetrics.fps,
      drawCalls: clearMetrics.drawCalls,
      triangles: clearMetrics.triangles,
      instances: clearMetrics.instances,
      plan: clearMetrics.plan,
    },
      roles: clearMetrics.roles,
    seedCheck,
    traffic: trafficMetrics,
    storm: stormMetrics.weather,
    snow: snowMetrics.weather,
    consoleErrors,
    pageErrors,
    externalRequests,
  };
  await writeFile(resolve(projectRoot, 'docs/qa/browser-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
