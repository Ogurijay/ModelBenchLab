// 参考机位拟合（开发工具）：用已知三维地标与参考照片像素坐标拟合相机。
// 用法：node tests/fit.mjs <landmarks.json>
// landmarks.json: { "car": "cyclone", "base": "ref", "size": [900,640], "fitFov": true,
//                   "points": [{ "name": "...", "p": [x,y,z], "img": [u,v] }] }
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const base = process.env.MINI4WD_URL || 'http://localhost:3000/claudeopus5.5-mini4wd-replica/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(`${base}?lab=${spec.car || 'cyclone'}&view=${spec.base || 'ref'}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 60000 });
const res = await page.evaluate(s => {
  const runs = [];
  for (const start of s.starts || [{}]) {
    Object.assign(window.__lab.VIEWS[s.base || 'ref'], start, s.size ? { size: s.size } : {});
    runs.push(window.__lab.fit(s.points, s.base || 'ref', { fitFov: !!s.fitFov, iters: s.iters || 1500 }));
  }
  runs.sort((a, b) => a.rms - b.rms);
  return runs[0];
}, spec);
const v = res.view;
console.log(JSON.stringify({ rms: +res.rms.toFixed(2), view: { az: +v.az.toFixed(2), el: +v.el.toFixed(2), dist: +v.dist.toFixed(1), fov: +v.fov.toFixed(2), t: v.t.map(n => +n.toFixed(1)), roll: +v.roll.toFixed(2), shift: (v.shift || [0, 0]).map(n => +n.toFixed(1)) } }));
spec.points.forEach((p, i) => console.log(p.name.padEnd(22), res.residuals[i].join(', ')));
await browser.close();
