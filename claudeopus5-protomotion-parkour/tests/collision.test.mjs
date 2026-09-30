// 碰撞世界的无头回归:node tests/collision.test.mjs(cwd = 仓库根)。
// 不用测试框架 —— 这层的每条断言都有解析解,能手算出来的数字就该直接写死在断言里。
//
// 覆盖:轴对齐盒六个面的法线与命中时刻 / OBB(Angle_30deg)三个方向的面法线 /
// 薄板不穿透(50 cm 的 Glide_LandingPad、100 cm 的 Climb_10m、100 cm 的 Angle_30deg)/
// 6000 cm 高空一步落地 / lineTraceDown / overlapCapsule 的最浅推出 / 17 个结构的关卡审计 /
// 随机扫掠的不变量(命中点不穿透 + 未命中则整条路径都不穿透)。

import { CollisionWorld, loadCourse, createCourseWorld } from '../src/sim/collision.js';
import { STRUCTURES } from '../src/levels/protoCourse.js';
import { CHARACTER, DERIVED, TAGS } from '../src/sim/protoTypes.js';

let failures = 0;
const ok = (cond, name, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
};
const section = (t) => console.log(`\n== ${t} ==`);

const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const nearVec = (v, x, y, z, eps = 1e-6) => !!v && near(v.x, x, eps) && near(v.y, y, eps) && near(v.z, z, eps);
const fmtV = (v) => (v ? `(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})` : 'null');

const R = CHARACTER.CapsuleRadius;      // 42
const HH = CHARACTER.CapsuleHalfHeight; // 94
const HL = HH - R;                      // 52,胶囊轴线半长
const COS30 = Math.cos(Math.PI / 6);
const COS15 = Math.cos(Math.PI / 12);

const course = createCourseWorld();

// ─────────────────────────────────────────────────────────────────────────────
section('1. 轴对齐盒:六个面各打一次');
// 立方体半长 100,胶囊中心与盒心同高 → 接触时中心离面 100 + 42 = 142
{
  const w = new CollisionWorld();
  w.addBox({ id: 'Cube', center: [0, 0, 0], halfSize: [100, 100, 100] });

  const faces = [
    // [名字, start, end, 期望法线, 期望接触面坐标轴与值, 期望 time]
    ['+X', [1000, 0, 0], [-1000, 0, 0], [1, 0, 0], ['x', 100], 858 / 2000],
    ['-X', [-1000, 0, 0], [1000, 0, 0], [-1, 0, 0], ['x', -100], 858 / 2000],
    ['+Y', [0, 1000, 0], [0, -1000, 0], [0, 1, 0], ['y', 100], 858 / 2000],
    ['-Y', [0, -1000, 0], [0, 1000, 0], [0, -1, 0], ['y', -100], 858 / 2000],
    // 竖直方向接触时中心离面 100 + 52 + 42 = 194(轴线半长也要算进去)
    ['+Z', [0, 0, 1000], [0, 0, -1000], [0, 0, 1], ['z', 100], 806 / 2000],
    ['-Z', [0, 0, -1000], [0, 0, 1000], [0, 0, -1], ['z', -100], 806 / 2000],
  ];
  for (const [label, s, e, n, [axis, planeVal], t] of faces) {
    const hit = w.capsuleSweep(s, e, R, HH);
    ok(!!hit && hit.id === 'Cube', `${label} 面命中`, hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, n[0], n[1], n[2]), `${label} 面法线 = (${n})`, fmtV(hit && hit.normal));
    ok(!!hit && near(hit.time, t, 1e-6), `${label} 面 time = ${t.toFixed(6)}`, hit ? hit.time.toFixed(6) : 'null');
    ok(!!hit && near(hit.point[axis], planeVal, 1e-3), `${label} 面接触点 ${axis} = ${planeVal}`,
      hit ? hit.point[axis].toFixed(4) : 'null');
  }

  // 打不到的扫掠必须返回 null,不能「顺手」报个最近的盒
  ok(w.capsuleSweep([1000, 1000, 0], [1000, -1000, 0], R, HH) === null, '错过盒子返回 null');
  // 起点已在盒内:往更深处走要报 time 0 的阻挡(带 startPenetrating 让下游先解穿透);
  // 往外走则不该报 —— 否则角色一旦陷进去就再也出不来。
  // 盒心处最浅推出方向是 +X(142 < 194),所以 -X 是「往里」、+X 是「往外」。
  const deeper = w.capsuleSweep([0, 0, 0], [-50, 0, 0], R, HH);
  ok(!!deeper && deeper.time === 0 && deeper.startPenetrating && near(deeper.depth, 142, 1e-9),
    '起点嵌在盒内且继续往里 → time 0 + startPenetrating', deeper ? deeper.depth.toFixed(4) : 'null');
  ok(w.capsuleSweep([0, 0, 0], [50, 0, 0], R, HH) === null, '起点嵌在盒内但正在往外走 → 不算阻挡');
  const still = w.capsuleSweep([0, 0, 0], [0, 0, 0], R, HH);
  ok(!!still && still.time === 0 && still.startPenetrating, '零位移扫掠 → 只报初始穿透');
  ok(w.capsuleSweep([1000, 0, 0], [1000, 0, 0], R, HH) === null, '零位移且无穿透 → null');
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. OBB(Angle_30deg,pitch 30°)的面法线');
// 盒心 (1200, 4200, 600),半长 (500, 50, 600),UE FRotator 的 Pitch 30°。
// 局部 +X / +Z 面的世界法线被旋转;局部 ±Y 面(那块大面)绕 Y 转不变 —— 正是 protoCourse
// 注释里指出的「源脚本用 Pitch 所以三块 |n.z| 其实都是 0」那件事的直接验证。
//
// 法线的**符号**是这一节真正在钉的东西:UE 的 Pitch 为正 ⇒ 前向抬起
// (`FRotator::Vector() = (cosP·cosY, cosP·sinY, sinP)`),所以局部 +X 面法线的 z 是 **+sin30**、
// 倾斜顶面法线的 x 是 **−sin30**。写成右手系的「绕 +Y 转 +pitch」会得到整块镜像的板,
// 而镜像板的 ±Y 大面法线一模一样 ⇒ 13 项自检察觉不到。所以只能靠这几条断言守住。
{
  const cx = 1200, cy = 4200, cz = 600;
  // (a) 局部 +X 面:法线 (cos30, 0, +sin30)
  {
    const n = [COS30, 0, 0.5];
    const fc = [cx + 500 * n[0], cy, cz + 500 * n[2]];
    const start = [fc[0] + 400 * n[0], cy, fc[2] + 400 * n[2]];
    const end = [fc[0] - 100 * n[0], cy, fc[2] - 100 * n[2]];
    const hit = course.capsuleSweep(start, end, R, HH);
    ok(!!hit && hit.id === 'Angle_30deg', '+X 面命中 Angle_30deg', hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, n[0], n[1], n[2]), '+X 面法线 = (0.8660, 0, +0.5)', fmtV(hit && hit.normal));
    // 胶囊轴在局部空间是斜的,离 +X 面最近的是**下**端点(局部 x 随世界 z 上升而增大):
    // 起点下端点局部 x = 900 - 52*sin30 = 874,接触在 500 + 42 = 542 处
    const t = (874 - 542) / 500;
    ok(!!hit && near(hit.time, t, 1e-6), `+X 面 time = ${t.toFixed(6)}`, hit ? hit.time.toFixed(6) : 'null');
  }
  // (b) 局部 +Z 面(倾斜的顶面):法线 (-sin30, 0, cos30)
  {
    const n = [-0.5, 0, COS30];
    const fc = [cx + 600 * n[0], cy, cz + 600 * n[2]];
    const start = [fc[0] + 400 * n[0], cy, fc[2] + 400 * n[2]];
    const end = [fc[0] - 100 * n[0], cy, fc[2] - 100 * n[2]];
    const hit = course.capsuleSweep(start, end, R, HH);
    ok(!!hit && hit.id === 'Angle_30deg', '+Z 面命中 Angle_30deg', hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, n[0], n[1], n[2]), '+Z 面法线 = (-0.5, 0, 0.8660)', fmtV(hit && hit.normal));
    const t = (1000 - 52 * COS30 - 642) / 500;
    ok(!!hit && near(hit.time, t, 1e-6), `+Z 面 time = ${t.toFixed(6)}`, hit ? hit.time.toFixed(6) : 'null');
  }
  // (c) 局部 -Y 面:pitch 不改变 ±Y 法线,应当精确等于 (0,-1,0)
  {
    const hit = course.capsuleSweep([cx, 3500, cz], [cx, 4400, cz], R, HH);
    ok(!!hit && hit.id === 'Angle_30deg', '-Y 面命中 Angle_30deg', hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, 0, -1, 0), '-Y 面法线 = (0,-1,0)(pitch 不改变它)', fmtV(hit && hit.normal));
    ok(!!hit && near(hit.time, (4108 - 3500) / 900, 1e-6), '-Y 面 time = 0.675556',
      hit ? hit.time.toFixed(6) : 'null');
    ok(!!hit && near(Math.abs(hit.normal.z), 0, 1e-9), '|n.z| = 0 → 会被当成墙(与 UE 侧同样的「意图落空」)');
  }
  // (d) OBB 上的射线法线:从盒心正上方往下打,命中倾斜顶面
  {
    const hit = course.lineTraceDown([cx, cy, 5000], 5000);
    const topZ = cz + 600 / COS30;
    ok(!!hit && hit.id === 'Angle_30deg', 'lineTraceDown 命中 Angle_30deg', hit ? hit.id : 'null');
    ok(!!hit && near(hit.point.z, topZ, 1e-6), `倾斜顶面高度 = ${topZ.toFixed(4)}`,
      hit ? hit.point.z.toFixed(4) : 'null');
    ok(nearVec(hit && hit.normal, -0.5, 0, COS30, 1e-9), '射线法线 = (-0.5, 0, 0.8660)', fmtV(hit && hit.normal));
  }
  {
    const hit = course.lineTraceDown([-400, 4200, 5000], 5000);
    const topZ = 600 + 600 / COS15;
    ok(!!hit && hit.id === 'Angle_15deg' && near(hit.point.z, topZ, 1e-6),
      `Angle_15deg 倾斜顶面 = ${topZ.toFixed(4)}`, hit ? hit.point.z.toFixed(4) : 'null');
    ok(nearVec(hit && hit.normal, -Math.sin(Math.PI / 12), 0, COS15, 1e-9),
      'Angle_15deg 射线法线 = (-0.2588, 0, 0.9659)', fmtV(hit && hit.normal));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. 薄板不穿透(大位移单步)');
{
  // Glide_LandingPad 只有 50 cm 厚,10500 cm 单步竖直穿过去
  const pad = course.capsuleSweep([3000, 6000, 10000], [3000, 6000, -500], R, HH);
  ok(!!pad && pad.id === 'Glide_LandingPad', '10500 cm 一步落到 50 cm 厚的落点板', pad ? pad.id : 'null');
  ok(nearVec(pad && pad.normal, 0, 0, 1), '落点板法线 = (0,0,1)', fmtV(pad && pad.normal));
  ok(!!pad && near(pad.time, (10000 - 144) / 10500, 1e-6), '落点板 time = 0.938667',
    pad ? pad.time.toFixed(6) : 'null');
  ok(!!pad && near(pad.point.z, 50, 1e-3), '接触点在板顶 z = 50', pad ? pad.point.z.toFixed(4) : 'null');

  // Climb_10m 厚 100 cm,横向 5000 / 19000 cm 单步都必须挡住
  for (const [endX, L] of [[-6000, 5000], [-20000, 19000]]) {
    const hit = course.capsuleSweep([-1000, -200, 300], [endX, -200, 300], R, HH);
    ok(!!hit && hit.id === 'Climb_10m', `${L} cm 一步撞 100 cm 厚的 Climb_10m`, hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, 1, 0, 0), '  法线 = (1,0,0)', fmtV(hit && hit.normal));
    ok(!!hit && near(hit.time, 2108 / L, 1e-6), `  time = ${(2108 / L).toFixed(6)}`,
      hit ? hit.time.toFixed(6) : 'null');
  }

  // 旋转的薄板(Angle_30deg 在 Y 向只有 100 cm)也要挡住 6000 cm 单步
  const ang = course.capsuleSweep([1200, 2000, 600], [1200, 8000, 600], R, HH);
  ok(!!ang && ang.id === 'Angle_30deg', '6000 cm 一步撞旋转薄板 Angle_30deg', ang ? ang.id : 'null');
  ok(!!ang && near(ang.time, 2108 / 6000, 1e-6), '  time = 0.351333', ang ? ang.time.toFixed(6) : 'null');

  // 球扫掠(墙探针 r = 25.2)也走同一条路径
  const probe = course.sphereSweep([1000, 0, 2000], [5000, 0, 2000], DERIVED.ProbeSphereRadius);
  ok(!!probe && probe.id === 'WallRun_Target', '球扫掠命中跑墙墙', probe ? probe.id : 'null');
  ok(nearVec(probe && probe.normal, -1, 0, 0), '  法线 = (-1,0,0)', fmtV(probe && probe.normal));
  ok(!!probe && near(probe.time, (4150 - DERIVED.ProbeSphereRadius - 1000) / 4000, 1e-6),
    '  time = 0.781200', probe ? probe.time.toFixed(6) : 'null');
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. 6000 cm 高空一步落地');
{
  for (const [endZ, L] of [[-100, 6100], [-6000, 12000]]) {
    const hit = course.capsuleSweep([0, 0, 6000], [0, 0, endZ], R, HH);
    ok(!!hit && hit.id === 'Floor', `${L} cm 单步下坠命中 Floor`, hit ? hit.id : 'null');
    ok(nearVec(hit && hit.normal, 0, 0, 1), '  法线 = (0,0,1)', fmtV(hit && hit.normal));
    ok(!!hit && near(hit.time, 5906 / L, 1e-6), `  time = ${(5906 / L).toFixed(6)}`,
      hit ? hit.time.toFixed(6) : 'null');
    ok(!!hit && near(hit.point.z, 0, 1e-3), '  接触点在地面 z = 0', hit ? hit.point.z.toFixed(4) : 'null');
  }
  // 站在地面上水平扫掠不能被地板挡住(否则角色一步都走不了)。
  // 靠的是「分离方向上不再接近 ⇒ 该盒永不可达」这条剔除规则,不是特例判断。
  ok(course.capsuleSweep([0, 0, HH], [500, 0, HH], R, HH) === null, '贴地(z=94)水平扫掠 → 无阻挡');
  ok(course.capsuleSweep([0, 0, HH - 1], [500, 0, HH - 1], R, HH) === null, '已陷入地面 1 cm 水平扫掠 → 仍无阻挡');
  const down = course.capsuleSweep([0, 0, HH - 1], [0, 0, HH - 2], R, HH);
  ok(!!down && down.id === 'Floor' && down.time === 0, '已陷入地面继续下压 → time 0 命中', down ? down.id : 'null');
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. lineTraceDown');
{
  const top = course.lineTraceDown([4200, 0, 5000], DERIVED.FloorTraceDistance);
  ok(!!top && top.id === 'WallRun_Target', '跑墙墙顶命中 WallRun_Target', top ? top.id : 'null');
  ok(!!top && near(top.point.z, 4000, 1e-9), '墙顶高度 = 4000', top ? top.point.z.toFixed(4) : 'null');
  ok(!!top && near(top.distance, 1000, 1e-9), '从 z=5000 量到墙顶的距离 = 1000',
    top ? top.distance.toFixed(4) : 'null');
  ok(nearVec(top && top.normal, 0, 0, 1), '墙顶法线 = (0,0,1)', fmtV(top && top.normal));

  const spawn = course.lineTraceDown([0, 0, 120], DERIVED.FloorTraceDistance);
  ok(!!spawn && spawn.id === 'Floor' && near(spawn.distance, 120, 1e-9), '出生点离地 120', spawn ? spawn.distance : 'null');

  ok(course.lineTraceDown([0, 0, 20000], 100) === null, '射程不够 → null');
  ok(course.lineTraceDown([30000, 0, 500], 5000) === null, '地面之外(x=30000)→ null');

  const inBox = course.lineTraceDown([0, 0, -50], 1000);
  ok(!!inBox && inBox.distance === 0 && nearVec(inBox.normal, 0, 0, 1), '起点在盒内 → distance 0、法线 +Z');
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. overlapCapsule:最浅推出方向');
{
  // 整根轴线埋在 Climb_10m(半厚 50)里,中心偏 +X 20 cm → 沿 +X 推出最便宜
  // 需要的距离 = 半厚 50 + 半径 42 − 20 = 72;沿 -X 要 112,沿 ±Y/±Z 要 542 / 594
  const deep = course.overlapCapsule([-3180, -200, 500], R, HH);
  ok(!!deep && deep.id === 'Climb_10m', '轴线埋进墙 → 报 Climb_10m', deep ? deep.id : 'null');
  ok(nearVec(deep && deep.normal, 1, 0, 0), '  推出方向 = (1,0,0)(最浅那面)', fmtV(deep && deep.normal));
  ok(!!deep && near(deep.depth, 72, 1e-9), '  推出深度 = 72', deep ? deep.depth.toFixed(4) : 'null');

  // 只有胶囊侧面切进墙:轴线在盒外,走最近点分支
  const graze = course.overlapCapsule([-3120, -200, 500], R, HH);
  ok(!!graze && graze.id === 'Climb_10m' && nearVec(graze.normal, 1, 0, 0) && near(graze.depth, 12, 1e-9),
    '侧面切进墙 12 cm', graze ? `${graze.id} ${graze.depth.toFixed(4)}` : 'null');

  ok(course.overlapCapsule([-3000, -200, 500], R, HH) === null, '离墙 108 cm → null');
  ok(course.overlapCapsule([0, 0, HH], R, HH) === null, '刚好站在地面上(z=94)→ 不算穿透');

  const sunk = course.overlapCapsule([0, 0, HH - 4], R, HH);
  ok(!!sunk && sunk.id === 'Floor' && nearVec(sunk.normal, 0, 0, 1) && near(sunk.depth, 4, 1e-9),
    '陷入地面 4 cm → 沿 +Z 推 4', sunk ? `${sunk.id} ${sunk.depth.toFixed(4)}` : 'null');

  // 同时压着地面(深 54)和 80 cm 矮台(深 134)→ 必须报更深的那个
  const both = course.overlapCapsule([1200, -200, 40], R, HH);
  ok(!!both && both.id === 'Low_Step_80cm' && near(both.depth, 134, 1e-9),
    '同时重叠两个盒 → 取最深的 Low_Step_80cm', both ? `${both.id} ${both.depth.toFixed(4)}` : 'null');

  // 推出后必须真的分离 —— 这是「最浅推出」的定义,顺手验一遍
  for (const c of [[-3180, -200, 500], [-3120, -200, 500], [0, 0, HH - 4], [1200, -200, 40]]) {
    let p = [...c];
    let guard = 0;
    let hit = course.overlapCapsule(p, R, HH);
    while (hit && guard++ < 8) {
      p = [p[0] + hit.normal.x * hit.depth, p[1] + hit.normal.y * hit.depth, p[2] + hit.normal.z * hit.depth];
      hit = course.overlapCapsule(p, R, HH);
    }
    ok(!hit, `迭代推出能收敛到无穿透 @ (${c})`, `${guard} 次`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. 关卡审计:17 个结构');
{
  ok(STRUCTURES.length === 17, 'STRUCTURES 有 17 项', String(STRUCTURES.length));
  ok(course.boxes.length === 17, 'loadCourse 灌进 17 个盒', String(course.boxes.length));

  let missing = 0;
  let tagged = 0;
  for (const s of STRUCTURES) {
    const b = course.getBox(s.id);
    if (!b) { missing++; continue; }
    if (b.hx !== s.halfSize[0] || b.hy !== s.halfSize[1] || b.hz !== s.halfSize[2]) missing++;
    if (b.cx !== s.center[0] || b.cy !== s.center[1] || b.cz !== s.center[2]) missing++;
    if (b.tags.length) tagged++;
  }
  ok(missing === 0, '每个结构的 id / 中心 / 半长都对上了', `${missing} 处不符`);
  ok(tagged === 1, '只有一个结构带标签', String(tagged));

  const slab = course.getBox('Unclimbable_Slab');
  ok(!!slab && slab.tags.includes(TAGS.Unclimbable), 'Unclimbable_Slab 带 unclimbable 标签',
    slab ? slab.tags.join(',') : 'null');

  // 旋转标记:只有 Angle_15deg / Angle_30deg 该是 OBB(pitch 0 的 Angle_00deg 是单位四元数)
  const obb = course.boxes.filter((b) => b.rot !== null).map((b) => b.id);
  ok(obb.length === 2 && obb.includes('Angle_15deg') && obb.includes('Angle_30deg'),
    '恰好两个盒按 OBB 处理', obb.join(',') || '无');

  // 标签要能随命中结果传下去 —— §3.1 的 unclimbable 拒绝规则靠这个
  const slabHit = course.sphereSweep([0, -3500, 600], [0, -4300, 600], DERIVED.ProbeSphereRadius);
  ok(!!slabHit && slabHit.id === 'Unclimbable_Slab' && slabHit.tags.includes(TAGS.Unclimbable),
    '命中结果带回 unclimbable 标签', slabHit ? `${slabHit.id} [${slabHit.tags}]` : 'null');
  ok(!!slabHit && near(slabHit.time, (4150 - DERIVED.ProbeSphereRadius - 3500) / 800, 1e-6),
    '  time = 0.781000', slabHit ? slabHit.time.toFixed(6) : 'null');

  // 每个结构从正上方都该被自己接住(没有一块被别的结构盖住)
  let shadowed = 0;
  for (const s of STRUCTURES) {
    const hit = course.lineTraceDown([s.center[0], s.center[1], 20000], 25000);
    if (!hit || hit.id !== s.id) { shadowed++; console.log(`        ${s.id} → ${hit ? hit.id : 'null'}`); }
  }
  ok(shadowed === 0, '17 个结构从上方都能被自己的顶面接住', `${shadowed} 处异常`);

  // loadCourse 接受外部 world(sim/world.js 会这么用)
  const w2 = loadCourse(new CollisionWorld());
  ok(w2.boxes.length === 17, 'loadCourse(new CollisionWorld()) 同样灌满', String(w2.boxes.length));
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. 随机扫掠不变量(命中不穿透 / 未命中则整条路径都不穿透)');
{
  // 采样间距固定 10 cm:比最薄的盒(50 cm)和胶囊直径(84 cm)都小得多,
  // 真穿过去了一定会被采到。
  const SAMPLE_STEP = 10;
  const TOL = 0.05;
  let seed = 20260803;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  let hitPenetration = 0;
  let tunnelled = 0;
  let worst = 0;
  let hits = 0;
  let skipped = 0;
  const CASES = 160;
  for (let i = 0; i < CASES; i++) {
    const start = [rnd() * 16000 - 8000, rnd() * 16000 - 8000, rnd() * 6000];
    if (course.overlapCapsule(start, R, HH)) { skipped++; continue; } // 起点已嵌入 → 不变量不适用
    const theta = rnd() * Math.PI * 2;
    const phi = Math.acos(2 * rnd() - 1);
    const len = 50 + rnd() * 8000;
    const dir = [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)];
    const end = [start[0] + dir[0] * len, start[1] + dir[1] * len, start[2] + dir[2] * len];

    const hit = course.capsuleSweep(start, end, R, HH);
    if (hit) hits++;
    const tEnd = hit ? hit.time : 1;
    const steps = Math.max(1, Math.min(2000, Math.ceil((len * tEnd) / SAMPLE_STEP)));
    let bad = 0;
    for (let k = 0; k <= steps; k++) {
      const t = (tEnd * k) / steps;
      const p = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t];
      const ov = course.overlapCapsule(p, R, HH);
      if (ov && ov.depth > TOL) { bad++; if (ov.depth > worst) worst = ov.depth; }
    }
    if (bad) { if (hit) hitPenetration++; else tunnelled++; }
  }
  ok(hits > CASES * 0.2, `随机用例里有足够多的命中(${hits}/${CASES - skipped})`);
  ok(hitPenetration === 0, '命中时刻之前的整段路径都不穿透', `${hitPenetration} 例`);
  ok(tunnelled === 0, '报告未命中的扫掠确实一路无接触(没有穿墙)', `${tunnelled} 例`);
  ok(worst === 0, '最深越界量 = 0', worst.toFixed(6));
}

// ─────────────────────────────────────────────────────────────────────────────
section('9. time 与暴力采样求得的真 TOI 一致(独立方法交叉验证)');
{
  // 独立参照:1 cm 粗采样找到第一个穿透点,再二分逼近 —— 只用 overlapCapsule,
  // 与保守推进完全无关,所以能真正验出扫掠的 time 而不是自证。
  const bruteToi = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const hits = (t) => !!course.overlapCapsule(at(t), R, HH);
    const steps = Math.ceil(len);
    let lo = -1, hi = -1;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (hits(t)) { hi = t; lo = (k - 1) / steps; break; }
    }
    if (hi < 0) return null;
    if (lo < 0) return 0;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (hits(mid)) hi = mid; else lo = mid;
    }
    return lo;
  };

  const cases = [
    ['正撞 Climb_10m', [-1000, -200, 300], [-4000, -200, 300]],
    ['6000 cm 下坠', [0, 0, 6000], [0, 0, -100]],
    ['穿 50 cm 落点板', [3000, 6000, 3000], [3000, 6000, -200]],
    ['掠射 Climb_10m 面', [-3100, -600, 300], [-3110, 200, 300]],
    ['擦 Climb_10m 竖棱', [-2800, 700, 300], [-3500, 100, 300]],
    ['斜撞 OBB Angle_30deg', [2400, 3000, 900], [800, 4600, 300]],
    ['落到 80 cm 矮台顶', [1200, -200, 900], [1200, -200, 100]],
    ['擦过 Angle_00deg 端头', [-1450, 3600, 600], [-1420, 4800, 600]],
  ];
  for (const [name, a, b] of cases) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const hit = course.capsuleSweep(a, b, R, HH);
    const truth = bruteToi(a, b);
    if (truth === null) {
      ok(hit === null, `${name}:双方都判无命中`, hit ? `扫掠报了 ${hit.id}@${hit.time.toFixed(4)}` : '');
      continue;
    }
    const err = hit ? (hit.time - truth) * len : NaN;
    // 保守推进只会停在真接触**之前**,所以误差必须 <= 0(容一点浮点)且量级在容差内
    ok(!!hit && err <= 1e-6 && err > -0.5, `${name}:time 误差 ${hit ? err.toFixed(5) : 'n/a'} cm`,
      hit ? `${hit.id} ${hit.time.toFixed(6)} vs ${truth.toFixed(6)}` : 'null');
  }
}

console.log(`\n${failures === 0 ? '✓ 全部通过' : '✗ ' + failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
