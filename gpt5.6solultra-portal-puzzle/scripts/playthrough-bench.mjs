import { chromium } from 'playwright';
import { resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:3035/';
const screenshotPath = resolve(process.argv[3] || 'docs/playthrough.png');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

const state = () => page.evaluate(() => window.__bench.getState());
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function lookAtXZ(target, pitch = 0) {
  const current = await state();
  const yaw = yawTo(current.player.position, target);
  await page.evaluate(({ yaw, pitch }) => window.__bench.setLook(yaw, pitch), { yaw, pitch });
}

async function shoot(kind) {
  const result = await page.evaluate((value) => window.__bench.firePortal(value), kind);
  if (!result.ok) throw new Error(`${kind} portal placement failed: ${result.reason}`);
}

async function walkUntil(predicate, timeoutMs = 5000) {
  const started = Date.now();
  await page.keyboard.down('w');
  try {
    while (Date.now() - started < timeoutMs) {
      const current = await state();
      if (predicate(current)) return current;
      await page.waitForTimeout(50);
    }
  } finally {
    await page.keyboard.up('w');
  }
  throw new Error(`walkUntil timeout: ${JSON.stringify(await state())}`);
}

async function walkTo(target, timeoutMs = 5000) {
  const started = Date.now();
  await page.keyboard.down('w');
  try {
    while (Date.now() - started < timeoutMs) {
      const current = await state();
      const dx = current.player.position.x - target.x;
      const dz = current.player.position.z - target.z;
      if (current.completed || dx * dx + dz * dz < 0.13) return current;
      const yaw = yawTo(current.player.position, target);
      await page.evaluate((value) => window.__bench.setLook(value, 0), yaw);
      await page.waitForTimeout(50);
    }
  } finally {
    await page.keyboard.up('w');
  }
  throw new Error('walkTo timeout: ' + JSON.stringify(await state()));
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.click('#startBtn');
  await page.waitForFunction(() => document.pointerLockElement instanceof HTMLCanvasElement, null, { timeout: 5000 });
  await page.waitForFunction(() => typeof window.__bench?.setLook === 'function');

  // 东墙主锚点。
  await lookAtXZ({ x: 10.99, z: 4.0 }, 0.015);
  await shoot('cyan');

  // 透过玻璃向密封舱后墙低处放置副锚点，保证返程无需额外跳跃。
  await lookAtXZ({ x: -10.99, z: -5.0 }, -0.055);
  await shoot('amber');
  let current = await state();
  if (!current.portals.linked) throw new Error('双向链路未建立');

  // 进入取样舱并拾取立方体。
  await lookAtXZ({ x: current.portals.cyan.position[0], z: current.portals.cyan.position[2] });
  current = await walkUntil((value) => value.teleportCount >= 1, 5200);
  await walkTo(current.cube.position, 2500);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__bench.getState().cube.held, null, { timeout: 2000 });

  // 带着立方体穿回主舱。
  current = await state();
  await lookAtXZ({ x: current.portals.amber.position[0], z: current.portals.amber.position[2] });
  current = await walkUntil((value) => value.teleportCount >= 2, 3200);
  if (!current.cube.held) throw new Error('跨门后手持关系丢失');

  // 走到压力平台后方，把手持目标放在平台中心。
  const standPoint = { x: 6.05, z: -7.72 };
  await walkTo(standPoint, 5200);
  await lookAtXZ({ x: 5.4, z: -9.3 }, -0.18);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__bench.getState().buttonPressed, null, { timeout: 3500 });
  await page.waitForFunction(() => window.__bench.getState().doorOpen, null, { timeout: 3500 });

  // 走过已开启的门禁并核对通关状态。
  await walkTo({ x: 4.65, z: -19.0 }, 5200);
  current = await state();
  await page.waitForSelector('#complete:not(.hidden)', { timeout: 2000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    completed: current.completed,
    teleportCount: current.teleportCount,
    buttonPressed: current.buttonPressed,
    doorOpen: current.doorOpen,
    time: current.time,
  }, null, 2));
} finally {
  await browser.close();
}
