// 浏览器冒烟测试：隔离的无头 Edge 上下文，覆盖车库 → 改装 → 拆解 → 三赛道比赛 → 成绩 → 存档恢复。
// 需根目录 `npm run dev`（:3000）运行中；截图写入 tmp/screenshots/，结果写入 tmp/browser-validation.json。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.MINI4WD_URL || 'http://localhost:3000/claudeopus5.5-mini4wd-replica/';
const shots = new URL('../tmp/screenshots/', import.meta.url);
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const snap = () => page.evaluate(() => window.mini4wd.snapshot());
const shot = name => page.screenshot({ path: fileURLToPath(new URL(name + '.png', shots)) });
const ok = msg => { checks.push(msg); console.log('PASS', msg); };

try {
  await page.goto(base, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.mini4wd && window.mini4wd.snapshot().thumbs === 8, null, { timeout: 120000 });
  let s = await snap();
  assert.equal(s.carCount, 8); assert.equal(s.mode, 'garage');
  ok('八台车型与缩略图生成完成');
  await page.waitForTimeout(800); await shot('garage');

  // 真实点击：选车、装零件、切换原型档案
  await page.click('[data-car="stinger"]');
  assert.equal((await snap()).car, 'stinger');
  await page.click('[data-slot="motor"][data-opt="3"]');
  await page.click('[data-slot="brake"][data-opt="2"]');
  await page.click('[data-slot="damper"][data-opt="2"]');
  s = await snap(); assert.equal(s.build.motor, 3); assert.equal(s.build.brake, 2); assert.equal(s.build.damper, 2);
  ok('点击选车与改装零件，配置写入当前车辆');
  await page.click('[data-tab="proto"]');
  assert.ok((await page.locator('.features li').count()) >= 5);
  ok('原型档案列出识别要点');

  // 拆解与零件点选标签
  await page.click('[data-act="explode"]');
  await page.waitForTimeout(1600);
  assert.ok((await page.locator('.plabel').count()) >= 8);
  await shot('garage-exploded');
  ok('拆解结构显示零件标签');
  await page.click('[data-act="explode"]');

  // 存档：刷新后保持选车与改装
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.mini4wd, null, { timeout: 120000 });
  s = await snap(); assert.equal(s.car, 'stinger'); assert.equal(s.build.motor, 3);
  ok('刷新后选车与改装从本地存档恢复');

  // 三条赛道 × 三个场馆各跑一场（无头确定性推进）
  for (const [layout, venue, mode] of [['basic', 'shop', 'real'], ['technical', 'arena', 'anime'], ['speed', 'night', 'real']]) {
    await page.evaluate(o => window.mini4wd.startRace(o), { layout, venue, mode, lanes: 5 });
    await page.evaluate(() => window.mini4wd.step(5));
    await shot(`race-${layout}`);
    s = await page.evaluate(() => window.mini4wd.step(120));
    assert.equal(s.race.state, 'finished');
    assert.ok(s.race.racers.every(r => r.status === 'finished' || r.status === 'out'));
    assert.ok(s.race.racers.some(r => r.status === 'finished'));
    ok(`${layout} / ${venue} / ${mode}：比赛完成，${s.race.racers.filter(r => r.status === 'finished').length} 台完赛`);
  }
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.results tbody tr').count(), 5);
  await shot('results');
  ok('成绩表列出 5 台赛车');

  // 镜头与暂停
  await page.click('[data-act="restart"]');
  await page.evaluate(() => window.mini4wd.step(4));
  for (const cam of ['tv', 'top', 'orbit', 'follow']) { await page.click(`[data-cam="${cam}"]`); await page.evaluate(() => window.mini4wd.step(0.3)); }
  const raceRender = (await snap()).render;
  assert.ok(raceRender.calls < 1500, '比赛绘制调用 ' + raceRender.calls);
  ok(`5 车比赛渲染 ${raceRender.calls} 次绘制调用、${raceRender.triangles} 三角形（含阴影）`);
  await page.keyboard.press('Space');
  assert.equal((await snap()).race.state, 'paused');
  const t0 = (await snap()).race.time; await page.evaluate(() => window.mini4wd.step(1)); assert.equal((await snap()).race.time, t0);
  await page.keyboard.press('Space');
  ok('四种镜头切换；空格暂停冻结模拟、再次空格继续');
  await page.keyboard.press('Escape');
  assert.equal((await snap()).mode, 'garage');
  ok('Esc 退出比赛回到车库');

  s = await page.evaluate(() => window.mini4wd.step(0.2));
  assert.ok(s.render.calls < 400, '车库绘制调用 ' + s.render.calls);
  ok(`车库渲染 ${s.render.calls} 次绘制调用、${s.render.triangles} 三角形（含阴影）`);
  assert.deepEqual(errors, []);
  ok('无页面异常与控制台错误');
  await writeFile(new URL('../tmp/browser-validation.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), browser: 'Microsoft Edge（无头，WebGL 2 / ANGLE D3D11）', base, checks, errors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors: errors.length }));
} catch (e) {
  console.error('FAILED', e); console.error('console errors', errors);
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
