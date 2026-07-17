import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
try {
  await page.goto(process.env.MANHATTAN_QA_URL ?? 'http://127.0.0.1:3036/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__BENCH__?.ready === true);
  const profile = await page.evaluate(() => {
    const systems = new Set(['world-root', 'traffic-system', 'ambient-agents', 'weather-system', 'day-night-system']);
    const output = {};
    window.__BENCH__.scene.traverse((object) => {
      if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
      let parent = object;
      while (parent && !systems.has(parent.userData?.benchRole)) parent = parent.parent;
      const system = parent?.userData?.benchRole ?? 'other';
      output[system] ??= { renderables: 0, instanced: 0, meshes: 0, lines: 0, points: 0, shadowCasters: 0 };
      output[system].renderables += 1;
      output[system].instanced += Number(Boolean(object.isInstancedMesh));
      output[system].meshes += Number(Boolean(object.isMesh));
      output[system].lines += Number(Boolean(object.isLine));
      output[system].points += Number(Boolean(object.isPoints));
      output[system].shadowCasters += Number(Boolean(object.castShadow));
    });
    return { systems: output, metrics: window.__BENCH__.getMetrics() };
  });
  console.log(JSON.stringify(profile, null, 2));
} finally {
  await browser.close();
}
