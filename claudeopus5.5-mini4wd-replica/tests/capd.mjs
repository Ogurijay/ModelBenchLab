// 常驻截图服务（开发期）：保持一个无头 Edge 页面，HTTP 请求触发重载并截图，避免每次冷启动浏览器。
// 启动：node tests/capd.mjs [port=3999]
// 请求：GET /cap?car=cyclone&views=ref,ref2&out=<目录>&explode=0&bg=white  → JSON 文件列表
//      GET /eval?js=<表达式>  → 在页面里求值（调试用）
import { chromium } from 'playwright';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = Number(process.argv[2] || 3999);
const base = process.env.MINI4WD_URL || 'http://localhost:3000/claudeopus5.5-mini4wd-replica/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
let errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let currentQuery = '';

async function open(q) {
  errors = [];
  const url = base + '?' + q;
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 90000 });
  currentQuery = q;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/cap') {
      const car = u.searchParams.get('car') || 'cyclone';
      const views = (u.searchParams.get('views') || 'ref').split(',');
      const out = resolve(u.searchParams.get('out') || '../tmp/mini4wd-lab/shots');
      const suffix = u.searchParams.get('suffix') || '';
      const q = new URLSearchParams({ lab: car, view: views[0] });
      for (const k of ['bg', 'detail', 'explode', 'look', 'noground']) if (u.searchParams.get(k)) q.set(k, u.searchParams.get(k));
      await open(q.toString());
      await mkdir(out, { recursive: true });
      const files = [];
      for (const v of views) {
        const data = await page.evaluate(n => window.__lab.capture(n), v);
        const f = resolve(out, `${car}-${v}${suffix}.png`);
        await writeFile(f, Buffer.from(data.split(',')[1], 'base64'));
        files.push(f);
      }
      const stats = await page.evaluate(() => window.__lab.stats());
      res.end(JSON.stringify({ files, stats, errors }));
    } else if (u.pathname === '/eval') {
      const r = await page.evaluate(js => { try { return JSON.stringify(eval(js)); } catch (e) { return 'ERR ' + e.message; } }, u.searchParams.get('js'));
      res.end(r + '\n' + JSON.stringify(errors));
    } else if (u.pathname === '/quit') {
      res.end('bye'); await browser.close(); process.exit(0);
    } else res.end('?');
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message, errors }));
  }
});
server.listen(port, () => console.log('capd on', port));
