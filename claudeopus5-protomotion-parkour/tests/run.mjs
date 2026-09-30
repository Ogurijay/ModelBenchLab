// 无头回归:`node tests/run.mjs`(cwd = 仓库根,也就是 `npm test`)。
// 风格同 collision.test.mjs / body.test.mjs —— 不用测试框架,能手算的数字直接写死在断言里。
//
// 七节,按「越靠前越是验收标准」排:
//   1. 13 项自检(整套移植的验收标准,页面上的自检按钮跑的是同一份 runSelfTest);
//   2. 常量对齐:从 UE 头文件里抠出 UPROPERTY 默认值,与 protoTypes.js 的 TUNING 逐条比
//      —— 漂移只报 WARN(理由见该节),读不到头文件则明确 skip;
//   3. 关卡几何审计:13 项自检的坐标能成立的**前提**(墙面在哪、砖多高、地面在 z=0);
//   4. 13 个传送点本身合法(不嵌实体、脚下有地);
//   5. 诚实性下限:证明自检不是「侥幸」通过的 —— 这一节比第 1 节更能防退化;
//   6. 自检的传递依赖里没有浏览器 API(页面与 node 跑同一份代码的前提);
//   7. 上游两套测试(collision / body)整体纳入,失败一并计入。

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as THREE from 'three';

import { runSelfTest, SELF_TEST_STEPS } from '../src/core/selftest.js';
import { createCourseWorld } from '../src/sim/collision.js';
import { ProtoWorld } from '../src/sim/world.js';
import { STRUCTURES, PLAYER_START, LIGHTING, ueRotatorToQuaternion } from '../src/levels/protoCourse.js';
import { ueRotatorForward } from '../src/gfx/scene.js';
import {
  CHARACTER, CUSTOM_MOVE, DERIVED, ENGINE, MOTION_STATE, MOVE_MODE, TAGS, TUNING,
} from '../src/sim/protoTypes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
const warnings = [];
const ok = (cond, name, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
};
const section = (t) => console.log(`\n== ${t} ==`);
const warn = (line) => {
  warnings.push(line);
  console.log(`  ⚠   ${line}`);
};

const R = CHARACTER.CapsuleRadius; // 42
const HH = CHARACTER.CapsuleHalfHeight; // 94
const DT = DERIVED.FixedStep; // 1/120

const course = createCourseWorld();
const byId = new Map(STRUCTURES.map((s) => [s.id, s]));
/** 结构的世界包围盒(轴对齐盒;Angle_* 那两块是 OBB,这里只用来查未旋转的那些)。 */
const faceOf = (id, axis, sign) => {
  const s = byId.get(id);
  return s ? s.center[axis] + sign * s.halfSize[axis] : NaN;
};

// ─────────────────────────────────────────────────────────────────────────────
section('1. 13 项自检(core/selftest.js —— 页面按钮跑的是同一份)');

const st = runSelfTest();
for (const [i, c] of st.cases.entries()) {
  ok(c.pass, `${String(i + 1).padStart(2, '0')} ${c.name}`, c.detail);
}
ok(st.total === 13, '一共 13 步(移动 13 项;UE 侧另有 5 步战斗,在本移植范围之外)', String(st.total));
ok(st.passed === 13, `合计 ${st.passed}/${st.total}`);

// ─────────────────────────────────────────────────────────────────────────────
section('2. 常量对齐:UE ProtoMovementComponent.h vs protoTypes.js TUNING');

// 这一节的价值在于:让「手感常量漂移」从靠人盯变成机器盯。
// UE 工程在它自己的会话里继续调参,所以差异是 **WARN 而不是 FAIL** ——
// 做成硬失败会让仓库里永久留一条红灯。
//
// **锚定规则(只有一条,不要逐个常量各自决定)**:
//   本移植锚定「2026-08-03 18:28 前后读到的那一版上游」。那一刻墙面四个值已经是
//   700/700/500/700(UE 头文件的注释写明了理由:`Matching ClimbUpSpeed makes the handoff
//   continuous`、`climbing runs at the same speed as RunSpeed`),16 个动画槽位还是
//   supersol_/brawler_/infect_ 借来的那套。
//   之后上游在同一天 18:49:5x 又动了两处 —— `ProtoMovementComponent.h`(WalkSpeed 260 → 140)
//   与 `ProtoAnimInstance.cpp`(整表换成 alex_ 自己的片段、参考速度改 139/572/1033 + 683、
//   playRate 钳制放到 2.5)。这两处都在快照之后,所以**都不跟**。
//   也就是说「墙面速度跟到当前、WalkSpeed 与动画表停在旧值」不是两套标准,
//   而是同一个时刻的横切面 —— 上游是在那之后才继续走的。
// 路径可以用环境变量覆盖:默认值只在开发这台机器上成立,而「机器盯常量漂移」是本项目
// 唯一能发现上游调参的手段 —— 换机器就静默 skip 等于这套机制只有一台机器有效。
const UE_HEADER = process.env.PROTOMOTION_UE_HEADER
  || 'E:/EpicGames/Projects/ProtoMotion_Lab/Source/ProtoMotion/Public/ProtoMovementComponent.h';
{
  let src = null;
  try {
    src = readFileSync(UE_HEADER, 'utf8');
  } catch (err) {
    src = null;
  }

  if (src === null) {
    // 别人机器上没有这份头文件 —— 明确 skip,不假装通过
    console.log(`  skip  读不到 UE 头文件,跳过常量对齐检查(不计入失败)`);
    console.log(`        ${UE_HEADER}`);
    console.log(`        换机器请设 PROTOMOTION_UE_HEADER=<ProtoMovementComponent.h 的路径>`);
  } else {
    // `float Name = 数;`。UPROPERTY 紧贴在声明上一行 —— 靠它把**手感常量**和
    // 私有运行时状态(VaultCooldown / ClimbVertical 之类同样是 `float x = 0.f;`)分开。
    const lines = src.split(/\r?\n/);
    const tuning = new Map();
    const stateFields = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*float\s+(\w+)\s*=\s*(-?\d+(?:\.\d*)?)f?\s*;/.exec(lines[i]);
      if (!m) continue;
      const prev = i > 0 ? lines[i - 1] : '';
      if (prev.includes('UPROPERTY')) tuning.set(m[1], Number(m[2]));
      else stateFields.push(m[1]);
    }

    // 唯一的硬断言是「正则还认得这份头文件」:上游改了写法(比如换成 constexpr)会让
    // 抠出来的表变空,那时若只比对交集就会**静默地一条都不比**,比漂移更危险。
    ok(tuning.size > 20, `抠到 ${tuning.size} 个 UPROPERTY float 默认值`,
      `另有 ${stateFields.length} 个私有状态字段(非手感常量,已忽略)`);

    let drift = 0;
    let compared = 0;
    let missing = 0;
    for (const [key, mine] of Object.entries(TUNING)) {
      if (!tuning.has(key)) {
        missing++;
        drift++;
        warn(`TUNING.${key} 在 UE 头文件里已经找不到(改名或删除?)—— 本项目 ${mine}`);
        continue;
      }
      compared++;
      const theirs = tuning.get(key);
      if (Math.abs(theirs - mine) > 1e-9) {
        drift++;
        warn(`常量漂移 ${key}:UE 现值 ${theirs} vs 本项目 ${mine}`);
      }
    }
    for (const [key, theirs] of tuning) {
      if (key in TUNING) continue;
      drift++;
      warn(`UE 侧新增手感常量 ${key} = ${theirs},本项目未实现`);
    }
    console.log(`        逐条比对 ${compared} / ${Object.keys(TUNING).length} 个 TUNING 常量`
      + (missing ? `,${missing} 个在 UE 侧已找不到` : ''));

    if (drift === 0) {
      ok(true, '与 UE 当前头文件逐位一致(0 处漂移)');
    } else {
      console.log(`  ⚠     共 ${drift} 处漂移。上游又动了 —— 本项目锚定 2026-08-03 18:28 那一版上游,`);
      console.log(`        故**不计入失败、不影响退出码**(锚定规则见本节开头的注释)。`);
      console.log(`        要跟进:改 protoTypes.js + 同步 PORT_SPEC §1 的表**和** §2.5/§3.3/§3.4 的伪代码,`);
      console.log(`        两处一起改 —— 只改表不改伪代码就是上一次留下 640/300/320/420/240 那批化石的原因。`);
    }
  }

  // 引擎级参数不在那份头文件里(它们在构造函数 .cpp 里设),所以这两条不比上游、只比自洽 ——
  // 也正因为如此,读不到头文件时它们照样要跑。派生值算错比跟上游漂移更致命。
  ok(Math.abs(ENGINE.Gravity - ENGINE.GravityZ * ENGINE.GravityScale) < 1e-9,
    'ENGINE.Gravity = GravityZ × GravityScale = -1960', String(ENGINE.Gravity));
  ok(Math.abs(ENGINE.WalkableFloorZ - Math.cos((ENGINE.WalkableFloorAngle * Math.PI) / 180)) < 1e-12,
    'ENGINE.WalkableFloorZ = cos(WalkableFloorAngle)', ENGINE.WalkableFloorZ.toFixed(6));
  // DERIVED 里那几个由常量算出来的探针几何(自检 9~13 全靠它们分辨台阶/障碍/墙)
  ok(DERIVED.ProbeReach === CHARACTER.CapsuleRadius + TUNING.WallProbeDistance,
    `DERIVED.ProbeReach = Radius + WallProbeDistance = ${DERIVED.ProbeReach}`, String(DERIVED.ProbeReach));
  ok(Math.abs(DERIVED.WalkStateSpeedMax - TUNING.WalkSpeed * 1.25) < 1e-9,
    'DERIVED.WalkStateSpeedMax = WalkSpeed × 1.25 = 325', String(DERIVED.WalkStateSpeedMax));
  ok(Math.abs(DERIVED.FixedStep - 1 / 120) < 1e-12, 'DERIVED.FixedStep = 1/120(自检与渲染共用)');
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. 关卡几何审计:13 项自检的坐标前提');
{
  ok(STRUCTURES.length === 17, '17 个结构齐全', String(STRUCTURES.length));
  ok(new Set(STRUCTURES.map((s) => s.id)).size === 17, '17 个 id 互不重复');
  ok(course.boxes.length === 17, '碰撞世界里也是 17 个盒', String(course.boxes.length));

  // Floor 上表面必须精确在 z = 0:整张表的高度(StandZ = 150、砖顶 40/80、墙高)都以它为基准
  ok(faceOf('Floor', 2, +1) === 0, 'Floor 上表面在 z = 0', String(faceOf('Floor', 2, +1)));
  const floorTop = course.lineTraceDown([0, 0, 1000], 2000);
  ok(!!floorTop && floorTop.id === 'Floor' && floorTop.point.z === 0,
    '  从上方量到的地面高度也是 0', floorTop ? floorTop.point.z.toFixed(4) : 'null');

  // 出生点(自检不用,但页面用它)
  ok(course.overlapCapsule(PLAYER_START.position, R, HH) === null, '出生点不嵌进任何实体');
  const spawnFloor = course.lineTraceDown(PLAYER_START.position, HH + 300);
  ok(!!spawnFloor, '出生点下方 3 m 内有地面', spawnFloor ? `${spawnFloor.id} @ ${spawnFloor.distance.toFixed(1)}` : 'null');

  // 第 8 项:冲刺从 x = 2500 起跑,撞的是 x = 4150 那面(16.5 m 助跑)
  ok(faceOf('WallRun_Target', 0, -1) === 4150, '跑墙墙面在 x = 4150', String(faceOf('WallRun_Target', 0, -1)));
  ok(faceOf('WallRun_Target', 2, +1) === 4000, '  墙高 40 m(跑墙上冲不会翻过顶)', String(faceOf('WallRun_Target', 2, +1)));

  // 第 9/10/11 项:站 (−3000, 1200) 朝 −X,打的是 Climb_20m 的 +X 面
  ok(faceOf('Climb_20m', 0, +1) === -3150, 'Climb_20m 面在 x = -3150', String(faceOf('Climb_20m', 0, +1)));
  ok(faceOf('Climb_20m', 1, -1) === 700 && faceOf('Climb_20m', 1, +1) === 1700,
    '  Y 跨 700 ~ 1700(自检站 y = 1200 才打得到)',
    `${faceOf('Climb_20m', 1, -1)} ~ ${faceOf('Climb_20m', 1, +1)}`);
  ok(faceOf('Climb_20m', 2, +1) === 2000, '  墙高 20 m(10 m 那面会在一秒半内被爬穿,见 UE 注释)',
    String(faceOf('Climb_20m', 2, +1)));

  // 第 12 项:板面在 y = -4150,自检从 y = -3900 朝 -Y 走过去
  ok(faceOf('Unclimbable_Slab', 1, +1) === -4150, 'Unclimbable_Slab 面在 y = -4150',
    String(faceOf('Unclimbable_Slab', 1, +1)));
  const slabTag = byId.get('Unclimbable_Slab');
  // 标签断言写**字面串**而不是 TAGS.Unclimbable:protoCourse 也是用同一个枚举填的,
  // 拿它当量尺等于「A 包含 A」。字面串才能钉住「探针查的那个词和关卡打的那个词是同一个」。
  ok(!!slabTag && slabTag.tags.includes('unclimbable'), '  带 unclimbable 标签', slabTag.tags.join(','));
  ok(TAGS.Unclimbable === 'unclimbable', '  TAGS.Unclimbable 就是这个字面串', TAGS.Unclimbable);
  // 探针在贴住板面时真能打到它、且标签随命中带回 —— 否则第 12 项会因为「根本没探到」而假过。
  // 起点取角色最终贴住的位置(y = 板面 + 胶囊半径),探针长度用真实的 ProbeReach。
  const slabZ = HH + DERIVED.ProbeLowerZ;
  const slabProbe = course.sphereSweep(
    [0, faceOf('Unclimbable_Slab', 1, +1) + R, slabZ],
    [0, faceOf('Unclimbable_Slab', 1, +1) + R - DERIVED.ProbeReach, slabZ],
    DERIVED.ProbeSphereRadius,
  );
  ok(!!slabProbe && slabProbe.id === 'Unclimbable_Slab' && slabProbe.tags.includes(TAGS.Unclimbable),
    '  贴住时下探针命中它、且 unclimbable 标签随命中带回',
    slabProbe ? `${slabProbe.id} [${slabProbe.tags}]` : 'null');

  // 第 13 项:80 cm 高过 MaxStepHeight 才轮得到翻越;40 cm 那块必须仍是普通台阶
  ok(faceOf('Low_Step_80cm', 2, +1) === 80, 'Low_Step_80cm 顶面在 z = 80', String(faceOf('Low_Step_80cm', 2, +1)));
  ok(faceOf('Low_Step_80cm', 2, +1) > ENGINE.MaxStepHeight,
    `  80 > MaxStepHeight(${ENGINE.MaxStepHeight}) ⇒ 迈不过去,只有翻越分支能过`);
  ok(faceOf('Low_Step_40cm', 2, +1) === 40 && faceOf('Low_Step_40cm', 2, +1) < ENGINE.MaxStepHeight,
    'Low_Step_40cm 顶面 z = 40 < MaxStepHeight ⇒ 仍是普通台阶', String(faceOf('Low_Step_40cm', 2, +1)));
  ok(faceOf('Low_Step_80cm', 0, -1) === 1000 && faceOf('Low_Step_80cm', 1, +1) === 0,
    '  砖占 x = 1000~1400、y = -400~0(自检从 (600, -200) 朝 +X 撞上去)',
    `x0=${faceOf('Low_Step_80cm', 0, -1)} y1=${faceOf('Low_Step_80cm', 1, +1)}`);

  // 第 1~5 项跑的 LaneY = 1000 必须是条空道:从 x = -2000 到 +2500 全程无障碍
  let laneBlocked = null;
  for (let x = -2000; x <= 2500; x += 50) {
    if (course.overlapCapsule([x, 1000, HH], R, HH)) { laneBlocked = x; break; }
  }
  ok(laneBlocked === null, 'Y = 1000 跑道在 x = -2000 ~ 2500 上没有障碍',
    laneBlocked === null ? '' : `x = ${laneBlocked} 处被挡`);

  // --- FRotator → 四元数的约定(protoCourse.ueRotatorToQuaternion)-------------
  // UE 的权威定义是 FRotationMatrix 的三行:
  //   row0(前) = ( cosP·cosY,              cosP·sinY,              sinP    )
  //   row1(右) = ( sinR·sinP·cosY−cosR·sinY, sinR·sinP·sinY+cosR·cosY, −sinR·cosP )
  //   row2(上) = (−(cosR·sinP·cosY+sinR·sinY), cosY·sinR−cosR·sinP·sinY,  cosR·cosP )
  // 也就是「pitch 为正 ⇒ 前向抬起」。右手系里绕 +Y 转 +pitch 恰好相反,所以转换函数必须给
  // pitch / roll 取反。**这条约定没有任何一项自检能察觉**:关卡里带 pitch 的三块板是沿 Y 的薄板,
  // 大面法线恒为 (0,±1,0),镜像与否一模一样。所以只能在这里钉死。
  {
    const d2r = Math.PI / 180;
    const ueRow = (P, Y, Rl) => {
      const sp = Math.sin(P * d2r); const cp = Math.cos(P * d2r);
      const sy = Math.sin(Y * d2r); const cy = Math.cos(Y * d2r);
      const sr = Math.sin(Rl * d2r); const cr = Math.cos(Rl * d2r);
      return [
        [cp * cy, cp * sy, sp],
        [sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, -sr * cp],
        [-(cr * sp * cy + sr * sy), cy * sr - cr * sp * sy, cr * cp],
      ];
    };
    const LOCAL = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let worst = 0;
    let worstCase = '';
    for (const [P, Y, Rl] of [[0, 0, 0], [15, 0, 0], [30, 0, 0], [-42, 145, 0], [0, 0, 25], [10, 20, 30]]) {
      const q = ueRotatorToQuaternion(P, Y, Rl);
      const rows = ueRow(P, Y, Rl);
      for (let axis = 0; axis < 3; axis++) {
        const v = new THREE.Vector3(...LOCAL[axis]).applyQuaternion(q);
        const d = Math.max(
          Math.abs(v.x - rows[axis][0]), Math.abs(v.y - rows[axis][1]), Math.abs(v.z - rows[axis][2]),
        );
        if (d > worst) { worst = d; worstCase = `(P${P} Y${Y} R${Rl}) 第 ${axis} 轴`; }
      }
    }
    ok(worst < 1e-12, 'ueRotatorToQuaternion 的三个局部轴与 UE FRotationMatrix 逐位一致',
      worst < 1e-12 ? '6 组角度 × 3 轴' : `最差 ${worst.toFixed(6)} @ ${worstCase}`);

    // 太阳方向必须由同一个约定算出来(gfx/scene.js 曾经另写过一份、符号还是对的,
    // 于是两份实现互相矛盾了半天)。这里顺手确认它们已经收敛成一个。
    const sunRow = ueRow(LIGHTING.sunRotation.pitch, LIGHTING.sunRotation.yaw, LIGHTING.sunRotation.roll)[0];
    const sun = ueRotatorForward(LIGHTING.sunRotation.pitch, LIGHTING.sunRotation.yaw);
    ok(Math.abs(sun.x - sunRow[0]) < 1e-12 && Math.abs(sun.y - sunRow[1]) < 1e-12
      && Math.abs(sun.z - sunRow[2]) < 1e-12,
      '  ueRotatorForward(太阳 pitch -42 / yaw 145)= FRotator::Vector()',
      `(${sun.x.toFixed(4)}, ${sun.y.toFixed(4)}, ${sun.z.toFixed(4)})`);
  }

  // Angle_00/15/30deg:源脚本传的是 **Pitch**,而这三块是沿 Y 的薄板(10 × 1 × 12 m),
  // 大面法线本来就朝 ±Y —— 绕 Y 转不改变它。所以 PORT_SPEC §4 表里写的
  // 「|n.z| = 0.26 应贴住 / |n.z| = 0.50 > 0.35 必须拒绝」在 UE 侧同样做不到:
  // 实测三块的 ±Y 面 |n.z| 全是 0,都会被判成可攀爬的墙。
  // WallMaxNormalZ 的拒绝路径实际由第 12 项的 unclimbable 标签覆盖。
  // 这一条断言是为了让「规格写的和几何做得到的不一致」这件事留在测试输出里,而不是只留在注释里。
  for (const id of ['Angle_00deg', 'Angle_15deg', 'Angle_30deg']) {
    const s = byId.get(id);
    const front = course.sphereSweep(
      [s.center[0], s.center[1] - 400, s.center[2]],
      [s.center[0], s.center[1] - 400 + 500, s.center[2]],
      DERIVED.ProbeSphereRadius,
    );
    ok(!!front && front.id === id && Math.abs(front.normal.z) < 1e-9,
      `${id} 的大面 |n.z| = 0 < WallMaxNormalZ ⇒ 照 UE 原样会被当成墙(§4 表的期望值在源几何下就不成立)`,
      front ? `n = (${front.normal.x.toFixed(3)}, ${front.normal.y.toFixed(3)}, ${front.normal.z.toFixed(3)})` : 'null');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. 13 个传送点本身合法');
{
  let embedded = 0;
  let noFloor = 0;
  for (const step of SELF_TEST_STEPS) {
    const loc = step.location;
    if (course.overlapCapsule(loc, R, HH)) {
      embedded++;
      console.log(`        ${step.name} @ (${loc}) 嵌进实体`);
    }
    // 落在地面附近的那几步必须脚下有地(空中步 fall / glide 例外,它们本来就该下坠)
    if (loc[2] <= 200 && !course.lineTraceDown(loc, HH + 300)) {
      noFloor++;
      console.log(`        ${step.name} @ (${loc}) 下方 3 m 内没有地面`);
    }
  }
  ok(embedded === 0, '13 个传送点都不嵌进实体', `${embedded} 处`);
  ok(noFloor === 0, '贴地的传送点下方 3 m 内都有地面', `${noFloor} 处`);
  // 空中两步必须真的悬空,否则第 6/7 项测不到下坠与滑翔。
  // 高度按 body.heightAboveFloor() 的算法量(下探 halfHeight + 5000,打空 = Infinity),
  // 因为滑翔的 GlideMinHeight 判定读的就是它 —— 换个算法审计等于没审计。
  for (const step of SELF_TEST_STEPS.filter((s) => s.location[2] > 1000)) {
    const h = course.lineTraceDown(step.location, HH + DERIVED.FloorTraceDistance);
    const height = h ? Math.max(0, h.distance - HH) : Infinity;
    ok(height > TUNING.GlideMinHeight,
      `${step.name} 的离地高度 > GlideMinHeight(${TUNING.GlideMinHeight})`,
      Number.isFinite(height) ? height.toFixed(0) : '超出下探距离(= Infinity,更高)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. 诚实性下限:自检不许靠侥幸通过');

/**
 * 独立驱动器 —— 与 selftest.js 的帧内次序**故意写两遍**:
 * 次序(施加意图 → 采样 → step)是这套自检的结论能否成立的唯一前提,
 * 由两份独立实现互相印证,比在同一份代码里自证有意义。
 */
function replay(step, seconds, onFrame, hooks = {}) {
  const world = new ProtoWorld();
  for (let i = 0; i < Math.round(0.75 / DT); i++) world.step(DT); // UE WarmUp
  world.teleport(step.location, step.controlYaw || 0);
  const m = world.movement;
  const input = step.input || [0, 0];
  m.setSprintHeld(!!step.sprint);
  m.setGlideHeld(!!step.glide);
  let timedJump = false;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    const t = i * DT;
    const released = step.releaseInputAfter > 0 && t >= step.releaseInputAfter;
    m.setMoveInput(released ? 0 : input[0], released ? 0 : input[1]);
    m.setSprintHeld(!!step.sprint);
    m.setGlideHeld(!!step.glide);
    if (step.jumpAfter > 0 && !timedJump && t >= step.jumpAfter) {
      timedJump = true;
      // 跳之前 / 之后各留一个钩子:光断言「Jumping 出现在 t = jumpAfter」分不清这一跳
      // 是墙跳还是普通地面跳(两者时刻一样),必须在这里看**来源**。
      if (hooks.beforeJump) hooks.beforeJump(t, m, world.body);
      m.tryJump();
      if (hooks.afterJump) hooks.afterJump(t, m, world.body);
    }
    onFrame(t, m, world.body);
    world.step(DT);
  }
  return world;
}

const stepByName = (name) => SELF_TEST_STEPS.find((s) => s.name === name);

{
  // (0) 第 1、6 项过去只有状态断言、一条硬观测都没有 —— 而这两项恰好是最容易空过的:
  //     第 6 项期望的 Falling 由 `resetForTeleport` 的簿记在**第 0 帧**就写好了
  //     (BeginStep 先 SetMovementMode(Falling),而帧内次序是「施加意图 → 采样 → step」),
  //     所以把重力置 0 它照样报通过、descent 恒 0。UE 侧同构,不是移植错误,
  //     但「13/13 ⇒ 13 条行为都被证明」对它不成立。真正的证据是下坠曲线本身。
  const case1 = st.cases.find((c) => c.name === 'idle');
  const case6 = st.cases.find((c) => c.name === 'fall');

  {
    const step1 = stepByName('idle');
    let idleFrames = 0;
    let maxSpeed2D = 0;
    let framesTotal = 0;
    const w1 = replay(step1, step1.duration, (t, m, body) => {
      framesTotal++;
      if (m.motionState === MOTION_STATE.Idling) idleFrames++;
      maxSpeed2D = Math.max(maxSpeed2D, Math.hypot(body.velocity.x, body.velocity.y));
    });
    // 传送落点 z = 150、站立 z = 94.02 ⇒ 先掉 56 cm(约 0.24 s = 29 帧),其余 91 帧都该是 Idling
    ok(idleFrames > framesTotal * 0.6, '第 1 项:Idling 占了这一步的多数帧(不是一闪而过)',
      `${idleFrames} / ${framesTotal} 帧`);
    ok(maxSpeed2D === 0, '  全程水平速度精确为 0(没有输入就真的一点不动)', maxSpeed2D.toFixed(6));
    ok(Math.abs(w1.body.position.z - 94.02) < 0.05, '  最终站在 z = 94.02', w1.body.position.z.toFixed(3));
    ok(case1.peakSpeed === 0, '  自检报告里的 peakSpeed 也是 0', case1.peakSpeed.toFixed(3));
  }

  {
    const step6 = stepByName('fall');
    let fallingFrames = 0;
    let landedT = -1;
    let minVz = 0;
    const w6 = replay(step6, step6.duration, (t, m, body) => {
      if (m.motionState === MOTION_STATE.Falling) fallingFrames++;
      if (landedT < 0 && body.isMovingOnGround() && t > 0) landedT = t;
      minVz = Math.min(minVz, body.velocity.z);
    });
    // 从 z = 3000 掉到站立 z = 94.02:落差 2906 cm ⇒ 末速 -√(2·1960·2906) ≈ -3375、耗时 ≈ 1.72 s。
    // 门槛写死字面值(不拿 ENGINE.Gravity 反算),这样「重力被改坏」会当场变红。
    ok(minVz < -3000 && minVz > -3500, '第 6 项:下坠峰值落在 -3375 附近(自由落体真的发生了)',
      minVz.toFixed(1));
    ok(fallingFrames > 150, '  Falling 至少持续了 150 帧(不是只有第 0 帧那一次簿记)',
      `${fallingFrames} 帧`);
    ok(landedT > 1.6 && landedT < 1.9, '  落地时刻在 1.72 s 附近', landedT.toFixed(3));
    ok(Math.abs(w6.body.position.z - 94.02) < 0.05, '  最终落回 z = 94.02', w6.body.position.z.toFixed(3));
    ok(case6.peakDescent < -3000, '  自检报告里的 peakDescent 同样到了 -3000 以下',
      case6.peakDescent.toFixed(1));
  }

  // (0b) GetMaxSpeed() 九个分支一条断言都没有过 —— 而 §2.5 的伪代码与 protoTypes 的常量
  //      在 2026-08-03 那次上游调参里已经对不上了(§2.5 至今写 `max(320,420,240)+220 = 640`,
  //      UE 头文件与本项目都是 700/700/500 ⇒ 920)。写死字面值,下一次漂移就不会再静默。
  {
    const w = new ProtoWorld();
    const m = w.movement;
    const b = w.body;
    const maxSpeedIn = (mode, custom = CUSTOM_MOVE.None) => {
      b.setMode(mode, custom);
      return m.getMaxSpeed();
    };
    m.setMoveInput(1, 0);
    m.setSprintHeld(false);
    ok(maxSpeedIn(MOVE_MODE.Custom, CUSTOM_MOVE.WallRun) === 1470,
      'getMaxSpeed Custom WallRun = max(WallRunUp 1250, ClimbLateral 500) + WallStick 220 = 1470');
    ok(maxSpeedIn(MOVE_MODE.Custom, CUSTOM_MOVE.Climb) === 920,
      'getMaxSpeed Custom Climb = max(ClimbUp 700, ClimbDown 700, ClimbLateral 500) + 220 = 920');
    ok(maxSpeedIn(MOVE_MODE.Custom, CUSTOM_MOVE.WallSlide) === 600,
      'getMaxSpeed Custom WallSlide = WallSlide 380 + 220 = 600');
    ok(maxSpeedIn(MOVE_MODE.Falling) === 1500, 'getMaxSpeed Falling(不滑翔)= 1500');
    ok(maxSpeedIn(MOVE_MODE.Walking) === 700, 'getMaxSpeed Walking 满推杆 = RunSpeed 700');
    m.setMoveInput(0.35, 0);
    ok(maxSpeedIn(MOVE_MODE.Walking) === 260, 'getMaxSpeed Walking 轻推杆(0.35 < 0.55)= WalkSpeed 260');
    m.setMoveInput(1, 0);
    m.setSprintHeld(true);
    ok(maxSpeedIn(MOVE_MODE.Walking) === 1500, 'getMaxSpeed Walking 冲刺 = SprintSpeed 1500');
    m.setSprintHeld(false);
    m.startGlide();
    ok(maxSpeedIn(MOVE_MODE.Falling) === 1200, 'getMaxSpeed 滑翔中 = GlideHorizontalSpeed 1200');
    m.stopGlide();
    b.setMode(MOVE_MODE.Walking);
    m.tryRoll();
    ok(m.getMaxSpeed() === 1100, 'getMaxSpeed 翻滚中 = RollSpeed 1100');
  }

  // (a) 第 9 项的 MinPeakAscent = 650 必须由**攀爬本身**满足。
  //     UE 的 PeakAscent 取的是整段的 max(Velocity.Z),而 3 s 足够爬穿 20 m 墙,
  //     墙顶翻越会给出 760 —— 光看 peakAscent 分不清「爬得快」和「弹得高」。
  //     这里只统计 motionState == Climbing 的帧,把这个歧义堵死。
  const step9 = stepByName('climb at run speed');
  let climbFrames = 0;
  let climbMaxVz = -Infinity;
  let mantleVz = -Infinity;
  replay(step9, step9.duration, (t, m, body) => {
    if (m.motionState === MOTION_STATE.Climbing) {
      climbFrames++;
      climbMaxVz = Math.max(climbMaxVz, body.velocity.z);
    } else if (m.motionState === MOTION_STATE.Jumping) {
      mantleVz = Math.max(mantleVz, body.velocity.z);
    }
  });
  ok(climbFrames > 120, '第 9 项:攀爬帧数足够多(不是一闪而过)', `${climbFrames} 帧`);
  ok(climbMaxVz >= step9.minPeakAscent,
    `第 9 项:**攀爬阶段自身**的上升峰值 ≥ MinPeakAscent(${step9.minPeakAscent})`,
    `攀爬 ${climbMaxVz.toFixed(0)} / 翻越 ${mantleVz > -Infinity ? mantleVz.toFixed(0) : 'n/a'}`);
  ok(Math.abs(climbMaxVz - TUNING.ClimbUpSpeed) < 1,
    `  且恰好等于 ClimbUpSpeed = ${TUNING.ClimbUpSpeed}(= RunSpeed,这才是这一项的本意)`,
    climbMaxVz.toFixed(2));

  // (b) 第 11 项的 Jumping 必须是**墙跳那一帧**看到的,不是靠爬到墙顶翻越蒙的。
  //     实测:UE 的帧内次序下首次出现在 t = 1.000 s(= JumpAfter);
  //     改成「step 之后采样」则要等到 t ≈ 2.79 s 的墙顶翻越 —— 那就是侥幸通过。
  //
  //     只盯时刻还不够:把贴墙判定彻底改坏(PushIntoWallDot 调到 1.5)之后,t = 1.0 的 tryJump()
  //     会落到 Walking 分支变成一次普通地面跳,首次 Jumping 的时刻**照样**是 1.000 s。
  //     所以三条一起断言:跳之前必须真在墙上、跳之后的速度必须精确等于墙跳公式、时刻仍是 1.0 s。
  const step11 = stepByName('wall jump (off the wall)');
  let firstJumpT = -1;
  let onWallAtJump = null;
  let wallNormalAtJump = null;
  let velAfterJump = null;
  let stateAfterJump = null;
  replay(step11, step11.duration, (t, m) => {
    if (firstJumpT < 0 && m.motionState === MOTION_STATE.Jumping) firstJumpT = t;
  }, {
    beforeJump: (t, m) => {
      onWallAtJump = m.isOnWall();
      wallNormalAtJump = m.wallProbe.valid ? m.wallProbe.normal.clone() : null;
    },
    afterJump: (t, m, body) => {
      velAfterJump = body.velocity.clone();
      stateAfterJump = m.motionState;
    },
  });
  ok(firstJumpT >= 0 && Math.abs(firstJumpT - step11.jumpAfter) <= DT,
    `第 11 项:Jumping 出现在墙跳那一帧 t = ${step11.jumpAfter}s(不是墙顶翻越)`,
    firstJumpT < 0 ? '从未出现' : `t = ${firstJumpT.toFixed(3)}`);
  ok(onWallAtJump === true, '  按下跳的那一帧角色真的贴在墙上(排除「普通地面跳」)',
    String(onWallAtJump));
  // 墙面在 x = -3150、面朝 +X ⇒ 蹬离方向 (1,0,0),速度写死 620 / 800(= WallJumpAway/Up)
  ok(!!wallNormalAtJump && Math.abs(wallNormalAtJump.x - 1) < 1e-9
    && Math.abs(wallNormalAtJump.y) < 1e-9 && Math.abs(wallNormalAtJump.z) < 1e-9,
    '  探针法线是 Climb_20m 的 +X 面 (1,0,0)',
    wallNormalAtJump ? `(${wallNormalAtJump.x.toFixed(3)}, ${wallNormalAtJump.y.toFixed(3)}, ${wallNormalAtJump.z.toFixed(3)})` : 'null');
  ok(!!velAfterJump && Math.abs(velAfterJump.x - 620) < 1e-9
    && Math.abs(velAfterJump.y) < 1e-9 && Math.abs(velAfterJump.z - 800) < 1e-9,
    '  蹬墙后速度 = normal × 620 + up × 800(墙跳公式,写死字面值)',
    velAfterJump ? `(${velAfterJump.x.toFixed(1)}, ${velAfterJump.y.toFixed(1)}, ${velAfterJump.z.toFixed(1)})` : 'null');
  // 身份由 ExitWall 里的 SetMovementMode 那一刻派生(那时速度还是墙上的 vz = +700 ⇒ Jumping),
  // 而不是由蹬墙后的 800 派生 —— UE TryJump 就是这个次序。
  ok(stateAfterJump === MOTION_STATE.Jumping,
    '  tryJump() 返回时身份是 Jumping(由蹬墙前那一帧的 vz 派生)', String(stateAfterJump));

  // (c) 第 12 项:必须是**走到板前被探针拒绝**,不是「根本没走到」。
  const step12 = stepByName('unclimbable slab is refused');
  let closest = Infinity;
  let sawClimbing = 0;
  const slabFace = faceOf('Unclimbable_Slab', 1, +1); // -4150
  replay(step12, step12.duration, (t, m, body) => {
    closest = Math.min(closest, Math.abs(body.position.y - slabFace) - R);
    if (m.motionState === MOTION_STATE.Climbing) sawClimbing++;
  });
  ok(closest < 1, '第 12 项:角色真的贴到了板面(拒绝发生在墙前,不是没走到)',
    `胶囊表面离板面最近 ${closest.toFixed(2)} cm`);
  ok(sawClimbing === 0, '  全程没有一帧是 Climbing', `${sawClimbing} 帧`);

  // (d) 第 13 项:全程没有跳跃输入 —— Jumping 只可能来自翻越,顺手确认 ledge 事件真的发过火。
  const step13 = stepByName('vault (chest-high block)');
  ok(!step13.jump && !(step13.jumpAfter > 0), '第 13 项:场景里没有任何跳跃意图');
  let ledgeEvents = 0;
  const w13 = replay(step13, step13.duration, (t, m) => {
    if (m.consumeLedgeEvent()) ledgeEvents++;
  });
  ok(ledgeEvents > 0, '  翻越事件真的发过火', `${ledgeEvents} 次`);
  ok(w13.body.position.x > faceOf('Low_Step_80cm', 0, +1),
    '  最终越过了 80 cm 的砖(x > 1400)', w13.body.position.x.toFixed(1));

  // (e) 第 8 项:跑墙必须是**冲刺撞墙**换来的,交接线以下才转攀爬。
  //     跑墙上冲峰值应在 WallRunUpSpeed 附近(撞墙速度已达 SprintSpeed ⇒ lerp 取满)。
  const step8 = stepByName('wall run (sprint into wall)');
  let wallRunFrames = 0;
  let wallRunMaxVz = -Infinity;
  let wallRunMinVz = Infinity;
  replay(step8, step8.duration, (t, m, body) => {
    if (m.motionState === MOTION_STATE.Wallrunning) {
      wallRunFrames++;
      wallRunMaxVz = Math.max(wallRunMaxVz, body.velocity.z);
      wallRunMinVz = Math.min(wallRunMinVz, body.velocity.z);
    }
  });
  ok(wallRunFrames > 10, '第 8 项:跑墙持续了若干帧', `${wallRunFrames} 帧`);
  ok(wallRunMaxVz > TUNING.WallRunUpSpeed * 0.9,
    `  上冲峰值接近 WallRunUpSpeed(${TUNING.WallRunUpSpeed})`, wallRunMaxVz.toFixed(0));
  ok(wallRunMinVz <= TUNING.WallRunHandoffSpeed + TUNING.WallRunDeceleration * DT,
    `  掉速到交接线 WallRunHandoffSpeed(${TUNING.WallRunHandoffSpeed})才交班`, wallRunMinVz.toFixed(0));

  // (f) 第 10 项:下滑必须在松手 + WallSlideDelay 之后才出现(不是一松手就掉)。
  const step10 = stepByName('wall slide (release input)');
  let firstSlideT = -1;
  let slideMinVz = Infinity;
  replay(step10, step10.duration, (t, m, body) => {
    if (firstSlideT < 0 && m.motionState === MOTION_STATE.Sliding) firstSlideT = t;
    if (m.motionState === MOTION_STATE.Sliding) slideMinVz = Math.min(slideMinVz, body.velocity.z);
  });
  const slideDue = step10.releaseInputAfter + TUNING.WallSlideDelay;
  ok(firstSlideT >= step10.releaseInputAfter + TUNING.WallSlideDelay - 2 * DT,
    `第 10 项:下滑不早于松手 + WallSlideDelay = ${slideDue.toFixed(2)}s`,
    firstSlideT < 0 ? '从未出现' : `t = ${firstSlideT.toFixed(3)}`);
  ok(firstSlideT <= slideDue + 4 * DT, '  也不晚于它(衰减确实发生了)',
    firstSlideT < 0 ? '从未出现' : `t = ${firstSlideT.toFixed(3)}`);
  ok(Math.abs(slideMinVz + TUNING.WallSlideSpeed) < 1,
    `  下滑速度 = -WallSlideSpeed = ${-TUNING.WallSlideSpeed}`, slideMinVz.toFixed(2));

  // (g) 第 7 项:滑翔的下降速度必须被钳在 GlideMaxDescendSpeed 附近 ——
  //     它是「滑翔真的接管了物理」而不只是改了个身份标签的证据。
  const glideCase = st.cases.find((c) => c.name === 'glide');
  const glideFloor = -(TUNING.GlideMaxDescendSpeed + -ENGINE.Gravity * TUNING.GlideGravityScale * DT);
  ok(glideCase.peakDescent >= glideFloor - 1,
    `第 7 项:下降速度被钳在 ${-TUNING.GlideMaxDescendSpeed} 附近(单帧只能再掉 ${(-ENGINE.Gravity * TUNING.GlideGravityScale * DT).toFixed(1)})`,
    glideCase.peakDescent.toFixed(1));
  // 上面那条的量尺是 GlideMaxDescendSpeed 本身,所以它对「钳制失效」免疫:
  // 把 GlideMaxDescendSpeed 改成 5000(钳制事实上没了、下降会跑到 -412)它照样绿。
  // 补一条**双边字面量**:下降必须真的被压在 250~300 之间,既证明钳制在起作用,
  // 也证明不是「本来就掉得慢」。
  ok(glideCase.peakDescent <= -250 && glideCase.peakDescent > -300,
    '  且落在 -250 ~ -300 之间(写死字面值:钳制真的在起作用,不是下降本来就慢)',
    glideCase.peakDescent.toFixed(1));
  ok(Math.abs(glideCase.peakSpeed - TUNING.GlideHorizontalSpeed) < 1,
    `  水平速度钳到 GlideHorizontalSpeed = ${TUNING.GlideHorizontalSpeed}`, glideCase.peakSpeed.toFixed(1));

  // (h) 第 5 项的前提:传送后角色在空中,tryJump 必须**拒绝**(空中不能二段跳),
  //     所以「等真正站到地面才发」不是自检的偷懒,而是唯一能发出跳跃的时机。
  const air = new ProtoWorld();
  air.teleport([0, 0, 3000], 0);
  ok(air.movement.tryJump() === false, '第 5 项前提:空中 tryJump() 被拒绝', String(air.body.velocity.z));
  let groundedAt = -1;
  for (let i = 0; i < 400 && groundedAt < 0; i++) {
    air.step(DT);
    if (air.body.isMovingOnGround()) groundedAt = i * DT;
  }
  ok(groundedAt > 0, '  落地后 isMovingOnGround() 为真', `t = ${groundedAt.toFixed(3)}`);
  ok(air.movement.tryJump() === true, '  同一个 tryJump() 在地面上就成功了');
  ok(Math.abs(air.body.velocity.z - TUNING.JumpSpeed) < 1e-9,
    `  且给出 JumpSpeed = ${TUNING.JumpSpeed}(未冲刺)`, air.body.velocity.z.toFixed(2));

  // (i) 走 / 跑 / 冲刺三档的峰值必须真的分开 —— 否则第 2/3/4 项只是同一件事测了三遍。
  //     每档都配一条**字面量**断言:拿 TUNING 常量去校验由同一个常量算出来的观测值是自指的,
  //     对常量本身改坏完全免疫(把 SprintSpeed 改成 700、冲刺与跑毫无区别时,
  //     只有 `|peak - SprintSpeed| < 1` 那条仍然全绿)。
  const peak = (name) => st.cases.find((c) => c.name === name).peakSpeed;
  ok(Math.abs(peak('run (full stick)') - TUNING.RunSpeed) < 1,
    `第 3 项:峰值 = RunSpeed = ${TUNING.RunSpeed}`, peak('run (full stick)').toFixed(1));
  ok(peak('run (full stick)') > 650 && peak('run (full stick)') < 750,
    '  且落在 650 ~ 750(字面量)', peak('run (full stick)').toFixed(1));
  ok(Math.abs(peak('sprint') - TUNING.SprintSpeed) < 1,
    `第 4 项:峰值 = SprintSpeed = ${TUNING.SprintSpeed}`, peak('sprint').toFixed(1));
  ok(peak('sprint') > 1400 && peak('sprint') > peak('run (full stick)') * 1.9,
    '  且 > 1400、并且比跑速档快出 1.9 倍以上(冲刺档真的存在)',
    `${peak('sprint').toFixed(1)} vs ${peak('run (full stick)').toFixed(1)}`);
  // 轻推杆(0.35)的地面稳态 = WalkSpeed × 0.35 = 91;峰值出在传送后那段空中
  // (空中 maxSpeed 是 SprintSpeed × AirControl 量级),所以只断言「远低于 RunSpeed」。
  ok(peak('walk (light stick)') < TUNING.RunSpeed * 0.5,
    `第 2 项:轻推杆峰值远低于 RunSpeed`, peak('walk (light stick)').toFixed(1));
  ok(peak('walk (light stick)') < 200,
    '  且 < 200(字面量:轻推杆真的走不快)', peak('walk (light stick)').toFixed(1));

  // (j) 传送必须与 UE 自检的 BeginStep 逐句一致:只有 `SetMovementMode(MOVE_Falling)` + `Velocity = 0`。
  //     两件事都要验:①朝向跟随要还原(不还原的话下一步会带着「朝向被墙接管」开跑);
  //     ②**不许**顺手清掉 ClimbVertical / NoClimbInputTime / WallRunVerticalSpeed ——
  //     UE 的 BeginStep 不清,那些残留会带进下一步,是自检行为的一部分。
  const step9b = stepByName('climb at run speed');
  const w = new ProtoWorld();
  w.teleport(step9b.location, step9b.controlYaw);
  for (let i = 0; i < 240; i++) {
    w.movement.setMoveInput(1, 0);
    w.step(DT);
    if (w.movement.isOnWall()) break;
  }
  ok(w.movement.isOnWall() && w.movement.climbVertical > 0.9,
    '第 10/11 项的前提:上一步能真的结束在墙上(攀爬中)',
    `onWall=${w.movement.isOnWall()} climbVertical=${w.movement.climbVertical}`);
  ok(w.body.orientToMovement === false, '  贴墙期间朝向跟随是关掉的',
    String(w.body.orientToMovement));
  w.teleport([-2000, 1000, 150], 0);
  ok(w.body.mode === MOVE_MODE.Falling && w.body.velocity.length() === 0,
    '  传送后:模式 = Falling、速度归零(BeginStep 的前两句)',
    `${w.body.mode} |v|=${w.body.velocity.length()}`);
  ok(w.body.orientToMovement === true,
    '  传送后朝向跟随已还原(靠 _setPhysicsMode 的 wasOnWall 分支,不需要走 exitWall)',
    String(w.body.orientToMovement));
  ok(w.movement.climbVertical > 0.9,
    '  但 ClimbVertical 仍保留(证明没有多走一趟 exitWall —— UE BeginStep 也不清它)',
    String(w.movement.climbVertical));
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. 纯仿真:自检的传递依赖里没有一个碰浏览器');
{
  // 「页面按钮和 node 测试跑同一份代码」是自检有意义的前提。一旦有人在 sim 层里
  // 顺手读了 window,这份自检就只能在浏览器里跑,`npm test` 直接崩 ——
  // 那时报错信息是 import 期的 ReferenceError,与真正的病因隔着好几层。这里静态查掉。
  //
  // 注意 src/sim/input.js **确实**碰 DOM(它是唯一的例外,只在 attach() 之后的回调里碰),
  // 但它不在自检的依赖图里 —— 所以按「从 selftest.js 出发的传递闭包」来查,而不是按目录。
  const FORBIDDEN = /\b(window|document|navigator|requestAnimationFrame|WebGLRenderer|GLTFLoader)\b/;
  const seenFiles = new Set();
  const queue = [path.resolve(HERE, '../src/core/selftest.js')];
  const offenders = [];
  while (queue.length) {
    const file = queue.pop();
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);
    const src = readFileSync(file, 'utf8');
    // 逐行查,好报出具体行号;注释行不算(注释里提到 window 是允许的)
    for (const [i, line] of src.split(/\r?\n/).entries()) {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (FORBIDDEN.test(code)) offenders.push(`${path.basename(file)}:${i + 1} ${line.trim()}`);
    }
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      queue.push(path.resolve(path.dirname(file), m[1]));
    }
  }
  ok(offenders.length === 0,
    `自检的 ${seenFiles.size} 个依赖文件里没有浏览器 API`,
    offenders.length ? offenders.join(' | ') : [...seenFiles].map((f) => path.basename(f)).join(','));
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. 上游测试套件(整体纳入,不复述)');
{
  // 两套都自己 process.exit,所以按子进程跑 —— 既不重复它们的断言,也不漏掉任何一条。
  //
  // 除了退出码,还要断言**断言条数没有塌**:文件被截断、或断言被注释光而仍然 exit(0) 时,
  // 只看退出码会平静地打印「0 条断言全绿」并通过。这跟第 2 节对 UE 头文件正则做的
  // `tuning.size > 20` 是同一个道理 —— 静默地一条都不比,比失败更危险。
  const FLOOR = { 'collision.test.mjs': 100, 'body.test.mjs': 80 };
  for (const suite of ['collision.test.mjs', 'body.test.mjs']) {
    const res = spawnSync(process.execPath, [path.join(HERE, suite)], { encoding: 'utf8' });
    const out = (res.stdout || '') + (res.stderr || '');
    const passed = (out.match(/^ {2}ok {2}/gm) || []).length;
    const failed = (out.match(/^ FAIL /gm) || []).length;
    ok(res.status === 0, `${suite}:${passed} 条断言全绿`,
      res.status === 0 ? `${passed} ok / ${failed} fail` : `${failed} 条失败(单独跑 node tests/${suite} 看详情)`);
    ok(passed > FLOOR[suite], `  ${suite} 的断言条数 > ${FLOOR[suite]}(没有被静默掏空)`,
      `${passed} 条`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
if (warnings.length) {
  console.log(`\n⚠ 常量漂移 ${warnings.length} 处(不计入失败,见第 2 节)`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}
console.log(`\n自检 ${st.passed}/${st.total}`);
console.log(`${failures === 0 ? '✓ 全部通过' : '✗ ' + failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
