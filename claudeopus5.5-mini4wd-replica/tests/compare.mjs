// 生成“官方主图 vs 标定机位渲染”对照（开发 / 验收用）。参考图来自被忽略的 tmp/car-reference-shots，不随项目发布。
// 用法：node tests/compare.mjs [outDir]   （需根目录 npm run dev 运行中）
import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] || 'tmp/reference-compare');
const base = process.env.MINI4WD_URL || 'http://localhost:3000/claudeopus5.5-mini4wd-replica/';
const CARS = ['cyclone', 'hurricane', 'tridagger', 'evolution', 'cobra', 'spider', 'gigant', 'stinger'];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base + '?lab=cyclone&view=ref&noground=1', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 90000 });
for (const id of CARS) {
  await page.evaluate(c => window.__lab.setCar(c), id);
  for (const v of ['ref', 'rear', 'top']) {
    const data = await page.evaluate(n => window.__lab.capture(n), v);
    await writeFile(resolve(out, `${id}-${v}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(id, JSON.stringify(await page.evaluate(() => window.__lab.stats())));
}
console.log(errors.length ? 'ERRORS ' + errors.join('; ') : 'no errors');
await browser.close();
