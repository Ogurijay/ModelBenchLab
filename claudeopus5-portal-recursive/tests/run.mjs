// 无头回归测试:node tests/run.mjs(或 npm test)。不需要浏览器,直接跑模拟层。
// 覆盖:传送纯函数 10 组冻结用例 / 盒布尔减法性质 / 关卡几何审计 / 五关可解性 / 防作弊下限。
import { runSelfTest } from '../src/core/selftest.js';
import { subtractBox, boxesOverlap, raycast } from '../src/core/boxes.js';
import { CHAMBERS } from '../src/levels/index.js';
import { World } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { makeEntity, isOverlapping, groundProbe } from '../src/sim/motion.js';

let failures = 0;
const ok = (cond, name, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
};
const section = (t) => console.log(`\n== ${t} ==`);

// ── 1. 传送变换冻结用例 ────────────────────────────────────
section('传送逻辑自测(冻结 10 组)');
const st = runSelfTest();
for (const c of st.cases) ok(c.pass, c.name);
ok(st.passed === 10 && st.total === 10, '合计 10/10', `${st.passed}/${st.total}`);

// ── 2. 盒布尔减法性质 ──────────────────────────────────────
section('盒减法:体积守恒 + 补集互不重叠(400 组随机)');
const vol = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
let seed = 20260724;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let volBad = 0; let overlapBad = 0; let maxPieces = 0;
for (let i = 0; i < 400; i++) {
  const b = { min: [0, 0, 0], max: [4, 3, 5], mat: 'white' };
  const lo = [rnd() * 5 - 1, rnd() * 4 - 1, rnd() * 6 - 1];
  const hole = { min: lo, max: [lo[0] + rnd() * 3, lo[1] + rnd() * 3, lo[2] + rnd() * 3] };
  const parts = subtractBox(b, hole);
  maxPieces = Math.max(maxPieces, parts.length);
  const inter = [0, 1, 2].reduce((acc, a) =>
    acc * Math.max(0, Math.min(b.max[a], hole.max[a]) - Math.max(b.min[a], hole.min[a])), 1);
  if (Math.abs(parts.reduce((a, p) => a + vol(p), 0) - (vol(b) - inter)) > 1e-9) volBad++;
  for (let j = 0; j < parts.length; j++) {
    for (let k = j + 1; k < parts.length; k++) if (boxesOverlap(parts[j], parts[k])) overlapBad++;
  }
  if (parts.some((p) => p.mat !== 'white')) volBad++;
}
ok(volBad === 0, '补集体积 = 原体积 − 交集体积', `${volBad} 处不符`);
ok(overlapBad === 0, '补集之间互不重叠', `${overlapBad} 对重叠`);
ok(maxPieces <= 6, '单次减法最多 6 块', `实测 ${maxPieces}`);

// ── 3. 关卡几何审计 ────────────────────────────────────────
section('关卡几何审计');
const HALF = [0.3, 0.9, 0.3];
for (const level of CHAMBERS) {
  const w = new World(level);
  const e = makeEntity(level.spawn.pos, HALF);
  ok(!isOverlapping(e, w.baseSolids), `C${level.id} 出生点不嵌入实体`);
  let grounded = false;
  for (let d = 0; d <= 3; d += 0.05) {
    e.pos[1] = level.spawn.pos[1] - d;
    if (groundProbe(e, w.baseSolids)) { grounded = true; break; }
  }
  ok(grounded, `C${level.id} 出生点下方 3m 内有地面`);
  for (const c of level.cubes || []) {
    const ce = makeEntity(c, [0.25, 0.25, 0.25]);
    ok(!isOverlapping(ce, w.baseSolids), `C${level.id} 方块初始不嵌入实体`);
  }
  // 白面板必须放得下一扇门(1.2 × 2.0)
  for (const b of w.baseSolids.filter((x) => x.mat === 'white')) {
    const dims = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].sort((x, y) => y - x);
    ok(dims[0] >= 1.2 && dims[1] >= 1.2, `C${level.id} 白面板尺寸够放门`, dims.map((v) => v.toFixed(2)).join('×'));
  }
}
// 天花板门(冻结要求③)至少要有一处可放
let ceilingWhite = 0;
for (const level of CHAMBERS) {
  const w = new World(level);
  for (let x = -6; x <= 6; x += 0.5) {
    for (let z = -16; z <= 14; z += 0.5) {
      const hit = raycast([x, 1.2, z], [0, 1, 0], w.baseSolids, 12);
      if (hit && hit.box.mat === 'white' && hit.normal[1] === -1) ceilingWhite++;
    }
  }
}
ok(ceilingWhite > 0, '存在朝下的白色面(天花板门可放置)', `命中 ${ceilingWhite} 次`);

// ── 4. 五关可解性(编程驱动预期解法) ────────────────────────
section('五关可解性');
const mkGame = (i) => { const g = new Game(); g.load(i, true); step(g, 20); return g; };
function step(g, n) { for (let i = 0; i < n; i++) g.update(1 / 60); }
function aim(g, t) {
  const e = g.player.eye();
  const d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
  const L = Math.hypot(...d);
  g.player.yaw = Math.atan2(-d[0] / L, -d[2] / L);
  g.player.pitch = Math.asin(d[1] / L);
}
function walkTo(g, tx, tz, max = 2200, tol = 0.35) {
  for (let i = 0; i < max; i++) {
    const q = g.player.ent.pos;
    const dx = tx - q[0]; const dz = tz - q[2];
    if (Math.hypot(dx, dz) < tol) break;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = 0;
    g.player.keys.KeyW = true;
    g.update(1 / 60);
  }
  g.player.keys.KeyW = false;
  step(g, 5);
  return g.player.ent.pos.map((v) => +v.toFixed(2));
}
function runUntilTeleport(g, frames = 400) {
  const t0 = g.stats.teleports;
  for (let i = 0; i < frames; i++) { g.player.keys.KeyW = true; g.update(1 / 60); if (g.stats.teleports > t0) break; }
  g.player.keys.KeyW = false;
  return g.stats.teleports > t0;
}

{ // C1:走进固定蓝门 → 对岸
  const g = mkGame(0);
  g.player.yaw = Math.PI / 2;
  const tp = runUntilTeleport(g, 300);
  step(g, 20);
  ok(tp && g.player.ent.pos[2] < -5 && g.player.ent.onGround, 'C1 穿门抵达对岸', g.player.ent.pos.map((v) => v.toFixed(1)).join(','));
}
{ // C2:蓝门打右墙 → 从固定橙门出到高台
  const g = mkGame(1);
  aim(g, [6.92, 1.0, 4]);
  g.shoot('blue');
  aim(g, [6.92, 0.9, 4]);
  g.player.pitch = 0;
  const tp = runUntilTeleport(g, 400);
  step(g, 60);
  ok(tp && g.player.ent.pos[1] > 4 && g.player.ent.onGround, 'C2 单色门送上 3.4m 高台', g.player.ent.pos.map((v) => v.toFixed(1)).join(','));
}
{ // C3:坑底取方块 → 坑壁门带出 → 压按钮开门
  const g = mkGame(2);
  aim(g, [-7.92, 1.2, 1]);
  g.shoot('orange');
  g.player.ent.pos = [5, -2.1, -4];
  g.player.ent.vel = [0, 0, 0];
  step(g, 20);
  aim(g, [3, -1.9, -4]);
  g.shoot('blue');
  aim(g, [5, -2.75, -4]);
  step(g, 3);
  g.interact();
  ok(!!g.carried, 'C3 拾起方块');
  aim(g, [3, -2.1, -4]);
  g.player.pitch = 0;
  const tp = runUntilTeleport(g, 400);
  step(g, 30);
  ok(tp && g.player.ent.pos[1] > 0.5, 'C3 带着方块离开深坑', g.player.ent.pos.map((v) => v.toFixed(1)).join(','));
  walkTo(g, 0, 3.2);
  aim(g, [0, 0.3, 4]);
  step(g, 8);
  g.interact();
  step(g, 150);
  ok(g.buttons[0].pressed && g.doors[0].target === 1, 'C3 方块压住按钮并开门');
}
for (const [idx, name] of [[3, 'C4'], [4, 'C5']]) { // 飞跃
  const g = mkGame(idx);
  walkTo(g, 5.5, 1.3);
  aim(g, [0, 6.5, 2.12]);
  g.shoot('orange');
  walkTo(g, 5.2, 6);
  walkTo(g, 5.2, 14, 2200, 0.6);
  walkTo(g, 3.85, 14, 700, 0.25);
  aim(g, [-0.9, 0, 14]);
  g.shoot('blue');
  ok(!!g.portals.blue.placed && !!g.portals.orange.placed, `${name} 两扇门就位`);
  g.player.yaw = Math.PI / 2;
  g.player.pitch = 0;
  g.player.keys.KeyW = true;
  let landed = null;
  for (let i = 0; i < 700; i++) {
    g.update(1 / 60);
    if (g.stats.teleports > 0 && g.player.ent.onGround) { landed = [...g.player.ent.pos]; break; }
    if (g.stats.deaths > 0) break;
  }
  g.player.keys.KeyW = false;
  ok(!!landed && landed[2] < -7, `${name} 飞跃落在对岸`, landed ? landed.map((v) => v.toFixed(1)).join(',') : '坠落');
}
{ // C5 后半:取方块 → 压按钮 → 出口
  const g = mkGame(4);
  g.player.ent.pos = [0, 0.9, -12];
  g.player.ent.vel = [0, 0, 0];
  step(g, 20);
  walkTo(g, 0, -12.5);
  aim(g, [0, 0.25, -13]);
  step(g, 3);
  g.interact();
  walkTo(g, 3.6, -12.2, 900);
  aim(g, [3.6, 0.3, -13]);
  step(g, 6);
  g.interact();
  step(g, 150);
  ok(g.buttons[0].pressed && g.doors[0].target === 1, 'C5 方块压住按钮并开门');
  walkTo(g, 0, -18.4, 900);
  g.player.yaw = 0;
  g.player.keys.KeyW = true;
  for (let i = 0; i < 400 && g.mode === 'play'; i++) g.update(1 / 60);
  g.player.keys.KeyW = false;
  ok(g.mode === 'transition', 'C5 抵达出口电梯');
  ok(!g.portals.blue.placed && !g.portals.orange.placed, 'C5 消解栅清除了玩家的门');
}

// ── 5. 防作弊下限:普通跑跳跨不过深渊 ──────────────────────
section('防作弊:普通跑跳跨不过深渊');
for (const [idx, name] of [[3, 'C4'], [4, 'C5']]) {
  const g = mkGame(idx);
  let cheated = false;
  for (const jumpAt of [2.4, 2.0, 1.6, 1.2, 0.9, 0.6]) {
    g.load(idx, true);
    step(g, 10);
    g.player.ent.pos = [0, 0.9, 8];
    g.player.ent.vel = [0, 0, 0];
    g.player.yaw = 0;
    g.player.pitch = 0;
    let jumped = false;
    for (let i = 0; i < 420; i++) {
      if (!jumped && g.player.ent.pos[2] < jumpAt) { g.player.queueJump(); jumped = true; }
      g.player.keys.KeyW = true;
      g.update(1 / 60);
      if (g.stats.deaths > 0) break;
      if (jumped && g.player.ent.onGround && g.player.ent.pos[2] < -6.5) { cheated = true; break; }
    }
    g.player.keys.KeyW = false;
    if (cheated) break;
  }
  ok(!cheated, `${name} 深渊无法靠跑跳越过`);
}

// ── 6. 回归:审查发现过的坑 ────────────────────────────────
section('回归:审查发现过的坑');
{ // 单扇门不得开孔(否则会出现「进得去、不传送、出不来」的墙内空腔)
  const g = mkGame(3);
  const before = g.world.solids.length;
  aim(g, [-0.9, 0, 14]);
  g.shoot('blue');
  ok(g.portals.blue.placed, '单门可放置');
  ok(g.world.solids.length === before && g.world.plugs.length === 0, '单扇门不开孔、不生成背板');
  aim(g, [0, 6.5, 2.12]);
  g.player.ent.pos = [1.5, 0.9, 1.0];
  step(g, 2);
  aim(g, [0, 6.5, 2.12]);
  g.shoot('orange');
  ok(g.world.solids.length !== before && g.world.plugs.length === 2, '配对后才开孔并生成两块背板');
}
{ // 门口被相邻垂直墙挡住时必须拒绝(C3 坑内角)
  const g = mkGame(2);
  g.player.ent.pos = [5, -2.1, -3];
  g.player.ent.vel = [0, 0, 0];
  step(g, 4);
  aim(g, [3, -1.5, -5.9]);
  g.shoot('blue');
  const p = g.portals.blue;
  ok(!p.placed || p.frame.P[2] > -5.6, '坑内角的门被拒绝或被夹到安全位置', p.placed ? p.frame.P.map((v) => v.toFixed(2)).join(',') : '已拒绝');
}
{ // 站在门口时换门位置,不能把玩家冻死在补回来的地板里
  const g = mkGame(3);
  aim(g, [0, 6.5, 2.12]);
  g.player.ent.pos = [1.5, 0.9, 1.0];
  step(g, 2);
  aim(g, [0, 6.5, 2.12]);
  g.shoot('orange');
  g.player.ent.pos = [-1, 0.9, 15];
  step(g, 2);
  aim(g, [-1, 0, 14]);
  g.shoot('blue');
  walkTo(g, -1, 14.2, 200, 0.2); // 走到门口上方(会掉进洞里)
  step(g, 10);
  aim(g, [0.5, 0, 15]);
  g.shoot('blue'); // 就地把门挪走 → 地板补回来
  const p0 = [...g.player.ent.pos];
  g.player.keys.KeyW = true;
  step(g, 90);
  g.player.keys.KeyW = false;
  const moved = Math.hypot(g.player.ent.pos[0] - p0[0], g.player.ent.pos[1] - p0[1], g.player.ent.pos[2] - p0[2]);
  ok(moved > 0.2, '换门位置后玩家仍能移动(不会被封死)', `位移 ${moved.toFixed(2)}m`);
}
{ // 地面门上向量与冲刺方向相反时(出口带下坠分量),射程仍够到对岸
  const g = mkGame(3);
  g.player.ent.pos = [-5.5, 0.9, 14];
  g.player.ent.vel = [0, 0, 0];
  step(g, 4);
  aim(g, [-1, 0, 14]); // 从西侧朝东下方开枪 → U = +X,与后面朝 -X 的冲刺相反
  g.shoot('blue');
  g.player.ent.pos = [1.5, 0.9, 1.0];
  step(g, 2);
  aim(g, [0, 6.5, 2.12]);
  g.shoot('orange');
  g.player.ent.pos = [5.2, 8.4, 14];
  g.player.ent.vel = [0, 0, 0];
  g.player.yaw = Math.PI / 2;
  g.player.pitch = 0;
  g.player.keys.KeyW = true;
  let landed = null;
  for (let i = 0; i < 700; i++) {
    g.update(1 / 60);
    if (g.stats.teleports > 0 && g.player.ent.onGround) { landed = [...g.player.ent.pos]; break; }
    if (g.stats.deaths > 0) break;
  }
  g.player.keys.KeyW = false;
  ok(!!landed && landed[2] < -7, '逆向上向量的飞跃也能过深渊', landed ? landed.map((v) => v.toFixed(1)).join(',') : '坠落');
}
{ // 过场进行中按重置:不能把状态机永久卡在 transition
  const g = mkGame(0);
  g.mode = 'transition';
  g.restart();
  ok(g.mode === 'play', '过场中重置能把状态机拉回 play');
}

console.log(`\n${failures === 0 ? '✓ 全部通过' : '✗ ' + failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
