// 无头截图：渲染建模实验室的指定车型与机位，输出 PNG（开发期对照用）。
// 用法：node tests/capture.mjs <car[,car]> <view[,view]> [outDir] [--explode=1] [--bg=white] [--detail=1]
// 依赖根目录 `npm run dev` 已在 :3000 运行；可用 MINI4WD_URL 覆盖地址。
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const pos = args.filter(a => !a.startsWith('--'));
const cars = (pos[0] || 'cyclone').split(',');
const views = (pos[1] || 'ref').split(',');
const out = resolve(pos[2] || '../tmp/mini4wd-lab/shots');
const base = process.env.MINI4WD_URL || 'http://localhost:3000/claudeopus5.5-mini4wd-replica/';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: flags.channel || 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const q = new URLSearchParams({ lab: cars[0], view: views[0], ...(flags.bg ? { bg: flags.bg } : {}), ...(flags.detail ? { detail: flags.detail } : {}), ...(flags.explode ? { explode: flags.explode } : {}) });
await page.goto(base + '?' + q.toString(), { waitUntil: 'commit' });
await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 60000 }).catch(e => { console.error('lab not ready', errors); throw e; });
for (const car of cars) {
  await page.evaluate(id => window.__lab.setCar(id), car);
  for (const v of views) {
    const data = await page.evaluate(n => window.__lab.capture(n), v);
    const file = resolve(out, `${car}-${v}${flags.explode ? '-x' : ''}.png`);
    await writeFile(file, Buffer.from(data.split(',')[1], 'base64'));
    console.log(file);
  }
}
if (flags.stats) console.log(JSON.stringify(await page.evaluate(() => window.__lab.stats())));
if (errors.length) console.error('ERRORS', errors);
await browser.close();
