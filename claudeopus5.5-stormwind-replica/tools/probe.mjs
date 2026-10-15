// 在页面里跑一段表达式并打印结果（等 __bench.ready 后执行；有状态的验证放在一次表达式里完成）。
// 用法（在仓库根或项目目录）：node tools/probe.mjs "http://localhost:3067/?only=houses" "__bench.getState()"
import { launchBrowser } from 'file:///C:/Users/OguriJay/.claude/skills/3d-scene-builder/scripts/lib/browser.mjs';

const [url, expr] = process.argv.slice(2);
const { browser } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.location()?.url || '')) errors.push(m.text());
  if (m.type() === 'info' || m.type() === 'warning') console.log(`[page:${m.type()}] ${m.text()}`);
});
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__bench?.ready === true, null, { timeout: 120000 });
const out = await page.evaluate(`(async () => (${expr}))()`);
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('页面错误：\n' + errors.join('\n'));
await browser.close();
