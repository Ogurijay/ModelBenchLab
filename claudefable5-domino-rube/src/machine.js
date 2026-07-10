// ============================================================
// machine.js — 鲁布戈德堡机关链(纯 cannon-es,不依赖 three)
// 机关类型:①多米诺弧线 ②斜坡+高架滚球 ③杠杆跷跷板弹射
//           ④摆锤(铰链单摆) ⑤终点铃铛  (+发球台/围栏等辅助)
// 复位 = 丢弃整个 Machine,new 一个新的(逐比特确定性)
// ============================================================
import * as CANNON from 'cannon-es';
import { createWorld } from './physicsWorld.js';
import {
  FIXED_DT, LANE_Z, TABLE, MESA, DOMINO, LEDGE, BIG_BALL, RAMP, TRACK,
  SEESAW, SMALL_BALL, PENDULUM, BELL, PHYS, deg,
} from './config.js';

/** 计算多米诺摆位:返回 [{pos:{x,z}, yaw, dir:{x,z}}] */
export function dominoLayout() {
  const list = [];
  const a0 = deg(DOMINO.arcStartDeg);
  const a1 = deg(DOMINO.arcEndDeg);
  // 弧线段(θ 递减 → 顺时针走向)
  for (let i = 0; i < DOMINO.arcCount; i++) {
    const th = a0 + (a1 - a0) * (i / (DOMINO.arcCount - 1));
    const x = MESA.cx + DOMINO.arcRadius * Math.cos(th);
    const z = MESA.cz + DOMINO.arcRadius * Math.sin(th);
    const dir = { x: Math.sin(th), z: -Math.cos(th) };   // 行进切线
    list.push({ pos: { x, z }, yaw: Math.atan2(-dir.z, dir.x), dir });
  }
  // 直线段(沿 +x,z = LANE_Z)
  const sx = MESA.cx + DOMINO.arcRadius * Math.cos(a1); // 弧线终点 x
  for (let i = 1; i <= DOMINO.straightCount; i++) {
    const x = sx + i * DOMINO.straightSpacing;
    list.push({ pos: { x, z: LANE_Z }, yaw: 0, dir: { x: 1, z: 0 } });
  }
  return list;
}

/** 静态盒体辅助 */
function staticBox(world, mat, hx, hy, hz, x, y, z, rotZ = 0, kind = 'static') {
  const body = new CANNON.Body({ mass: 0, material: mat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  body.position.set(x, y, z);
  if (rotZ !== 0) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotZ);
  body.__kind = kind;
  world.addBody(body);
  return body;
}

export class Machine {
  /**
   * @param {object} hooks { onImpact({kind,speed,pos}), onBell(), onStage(n) }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    const { world, mats } = createWorld();
    this.world = world;
    this.mats = mats;

    this.tick = 0;             // 已执行的固定步数(触发后才递增)
    this.triggered = false;
    this.currentStage = 0;
    this.bellRung = false;
    this.bellRungAt = -1;      // 仿真时间(秒)
    this.stageTimes = [0, -1, -1, -1, -1, -1];

    this.dyn = {};             // 动态刚体注册表(供视觉层同步)
    this.#build();
  }

  get simTime() { return this.tick * FIXED_DT; }

  // ---------- 搭建 ----------
  #build() {
    const { world, mats } = this;
    const W = mats.wood, M = mats.metal, B = mats.ballMat;

    // 桌面(顶面 y=0)+ 四周低围栏
    staticBox(world, W, TABLE.sizeX / 2, TABLE.thick / 2, TABLE.sizeZ / 2, 0, -TABLE.thick / 2, 0, 0, 'table');
    const rx = TABLE.sizeX / 2, rz = TABLE.sizeZ / 2, rh = TABLE.rimHeight / 2, rt = TABLE.rimThick / 2;
    staticBox(world, W, rx + rt, rh, rt, 0, rh, rz + rt);
    staticBox(world, W, rx + rt, rh, rt, 0, rh, -rz - rt);
    staticBox(world, W, rt, rh, rz + rt, rx + rt, rh, 0);
    staticBox(world, W, rt, rh, rz + rt, -rx - rt, rh, 0);

    // 圆形高台(Y 轴圆柱)
    const mesa = new CANNON.Body({ mass: 0, material: W });
    mesa.addShape(new CANNON.Cylinder(MESA.radius, MESA.radius, MESA.height, 24));
    mesa.position.set(MESA.cx, MESA.height / 2, MESA.cz);
    mesa.__kind = 'mesa';
    world.addBody(mesa);

    // 发球台栈桥(顶面与高台齐平)
    const lLen = LEDGE.x1 - LEDGE.x0;
    staticBox(world, W, lLen / 2, LEDGE.thick / 2, LEDGE.width / 2,
      (LEDGE.x0 + LEDGE.x1) / 2, MESA.height - LEDGE.thick / 2, LANE_Z, 0, 'ledge');
    // (发球台不设物理挡唇:触发前世界冻结,球天然静止;
    //  唇的动能壁垒会吃掉骨牌传给重球的初速,视觉上仅保留平贴铜条装饰)

    // 斜坡(顶面过 (topX,topY)-(botX,botY) 两点)+ 护栏
    this.#buildSlope(RAMP.topX, RAMP.topY, RAMP.botX, RAMP.botY, RAMP);
    // 高架直道 + 护栏 + 支柱
    const tLen = TRACK.x1 - TRACK.x0, tcx = (TRACK.x0 + TRACK.x1) / 2;
    staticBox(world, W, tLen / 2, TRACK.thick / 2, TRACK.width / 2, tcx, TRACK.y - TRACK.thick / 2, LANE_Z, 0, 'track');
    for (const s of [-1, 1]) {
      staticBox(world, W, tLen / 2, TRACK.railH / 2, TRACK.railT / 2,
        tcx, TRACK.y + TRACK.railH / 2, LANE_Z + s * (TRACK.width / 2 + TRACK.railT / 2), 0, 'rail');
      // 支柱(参与碰撞,防止回滚球穿模)
      staticBox(world, W, 0.04, (TRACK.y - TRACK.thick) / 2, 0.04,
        tcx, (TRACK.y - TRACK.thick) / 2, LANE_Z + s * (TRACK.width / 2 + 0.09), 0, 'post');
    }

    // 多米诺骨牌(局部 +x = 行进方向;shape 不共享,避免 body 反引用互踩)
    this.dyn.dominoes = dominoLayout().map((d, i) => {
      const body = new CANNON.Body({
        mass: DOMINO.mass, material: mats.domino,   // 专用材质:骨牌间零摩擦防自锁
        linearDamping: PHYS.linearDamping, angularDamping: PHYS.angularDamping,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(DOMINO.t / 2, DOMINO.h / 2, DOMINO.w / 2)));
      body.position.set(d.pos.x, MESA.height + DOMINO.h / 2, d.pos.z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), d.yaw);
      body.__kind = 'domino';
      body.__index = i;
      body.__dir = d.dir;
      this.#impactSound(body, 'domino', 0.6);
      world.addBody(body);
      return body;
    });

    // 重球(发球台上,倚着挡唇)
    const bigBall = new CANNON.Body({
      mass: BIG_BALL.mass, material: B,
      linearDamping: PHYS.linearDamping, angularDamping: PHYS.angularDamping,
    });
    bigBall.addShape(new CANNON.Sphere(BIG_BALL.r));
    bigBall.position.set(BIG_BALL.restX, MESA.height + BIG_BALL.r, LANE_Z);
    bigBall.__kind = 'bigBall';
    this.#impactSound(bigBall, 'ball', 1.2);
    world.addBody(bigBall);
    this.dyn.bigBall = bigBall;

    // 跷跷板:支座(静态)+ 板(复合体:板面 + 弹射杯唇)+ 铰链
    const stand = new CANNON.Body({ mass: 0, material: M });
    stand.addShape(new CANNON.Box(new CANNON.Vec3(0.08, SEESAW.pivotY / 2, 0.22)));
    stand.position.set(SEESAW.pivotX, SEESAW.pivotY / 2, LANE_Z);
    stand.__kind = 'seesawStand';
    world.addBody(stand);

    const plank = new CANNON.Body({
      mass: SEESAW.mass, material: W,
      linearDamping: 0.005, angularDamping: 0.005,
    });
    plank.addShape(new CANNON.Box(new CANNON.Vec3(SEESAW.halfLen, SEESAW.thick / 2, SEESAW.width / 2)));
    // 弹射杯:四面矮唇围出 0.34×0.30 内槽(小球 Ø0.24 松弛落座)
    const lipY = SEESAW.thick / 2 + SEESAW.cupLipH / 2;
    plank.addShape(new CANNON.Box(new CANNON.Vec3(SEESAW.cupLipT / 2, SEESAW.cupLipH / 2, 0.17)),
      new CANNON.Vec3(SEESAW.cupOffset - 0.19, lipY, 0));
    plank.addShape(new CANNON.Box(new CANNON.Vec3(SEESAW.cupLipT / 2, SEESAW.cupLipH / 2, 0.17)),
      new CANNON.Vec3(Math.min(SEESAW.cupOffset + 0.19, SEESAW.halfLen - SEESAW.cupLipT / 2), lipY, 0));
    for (const s of [-1, 1]) {
      plank.addShape(new CANNON.Box(new CANNON.Vec3(0.19, SEESAW.cupLipH / 2, SEESAW.cupLipT / 2)),
        new CANNON.Vec3(SEESAW.cupOffset, lipY, s * 0.17));
    }
    plank.position.set(SEESAW.pivotX, SEESAW.pivotY, LANE_Z);
    plank.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), deg(SEESAW.tiltDeg));
    plank.__kind = 'plank';
    this.#impactSound(plank, 'wood', 0.8);
    world.addBody(plank);
    this.dyn.plank = plank;
    this.plankAngle0 = deg(SEESAW.tiltDeg);

    world.addConstraint(new CANNON.HingeConstraint(stand, plank, {
      pivotA: new CANNON.Vec3(0, SEESAW.pivotY / 2, 0),
      pivotB: new CANNON.Vec3(0, 0, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    }));

    // 止挡块:近端下摆到 stopDeg 时其下沿角点正好落在块顶 → 板急停、小球出杯
    const ts = deg(SEESAW.stopDeg);
    const stopX = SEESAW.pivotX - SEESAW.halfLen * Math.cos(ts) + (SEESAW.thick / 2) * Math.sin(ts);
    const stopTop = SEESAW.pivotY - SEESAW.halfLen * Math.sin(ts) - (SEESAW.thick / 2) * Math.cos(ts);
    staticBox(world, W, 0.09, stopTop / 2, 0.18, stopX, stopTop / 2, LANE_Z, 0, 'stopper');

    // 弹射小球(静置于杯中)
    const cupAng = deg(SEESAW.tiltDeg);
    const cupX = SEESAW.pivotX + SEESAW.cupOffset * Math.cos(cupAng);
    const cupY = SEESAW.pivotY + SEESAW.cupOffset * Math.sin(cupAng);
    const smallBall = new CANNON.Body({
      mass: SMALL_BALL.mass, material: B,
      linearDamping: PHYS.linearDamping, angularDamping: PHYS.angularDamping,
    });
    smallBall.addShape(new CANNON.Sphere(SMALL_BALL.r));
    smallBall.position.set(cupX, cupY + SEESAW.thick / 2 + SMALL_BALL.r + 0.005, LANE_Z);
    smallBall.__kind = 'smallBall';
    this.#impactSound(smallBall, 'ball', 1.0);
    world.addBody(smallBall);
    this.dyn.smallBall = smallBall;

    // 摆锤:静态铰点 + 锤球 + 铰链(z 轴 → 摆动被约束在链道竖直面内)
    const anchor = new CANNON.Body({ mass: 0 });
    anchor.position.set(PENDULUM.bobX, PENDULUM.bobY + PENDULUM.rodLen, LANE_Z);
    anchor.__kind = 'anchor';
    world.addBody(anchor);

    const bob = new CANNON.Body({
      mass: PENDULUM.bobMass, material: M,
      linearDamping: 0.002, angularDamping: 0.002,
    });
    bob.addShape(new CANNON.Sphere(PENDULUM.bobR));
    bob.position.set(PENDULUM.bobX, PENDULUM.bobY, LANE_Z);
    bob.__kind = 'bob';
    world.addBody(bob);
    this.dyn.bob = bob;

    world.addConstraint(new CANNON.HingeConstraint(anchor, bob, {
      pivotA: new CANNON.Vec3(0, 0, 0),
      pivotB: new CANNON.Vec3(0, PENDULUM.rodLen, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    }));

    // 铃铛(静态球体,碰撞即"响")
    const bell = new CANNON.Body({ mass: 0, material: M });
    bell.addShape(new CANNON.Sphere(BELL.r));
    bell.position.set(BELL.x, BELL.y, LANE_Z);
    bell.__kind = 'bell';
    world.addBody(bell);
    this.bellBody = bell;

    // 锤球 → 铃铛碰撞 = 终点
    bob.addEventListener('collide', (e) => {
      if (e.body === bell && !this.bellRung) {
        this.bellRung = true;
        this.bellRungAt = this.simTime;
        this.#advance(5);
        this.hooks.onBell?.(this.simTime);
      } else if (e.body !== bell) {
        this.#advance(4);
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 0.3) this.hooks.onImpact?.({ kind: 'metal', speed: v, pos: bob.position });
      }
    });
    // 重球砸上跷跷板
    plank.addEventListener('collide', (e) => {
      if (e.body === bigBall) this.#advance(3);
    });
  }

  /** 斜坡:顶面通过 (x0,y0)-(x1,y1) 的旋转盒体 + 两侧护栏 */
  #buildSlope(x0, y0, x1, y1, cfg) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);            // 负值 → +x 端更低
    const ux = dx / len, uy = dy / len;        // 沿坡方向
    const nx = -uy, ny = ux;                   // 上法向(ny>0)
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const hw = len / 2 + 0.06;
    // 坡面盒体中心 = 表面中点沿 -法向 下移半厚
    staticBox(this.world, this.mats.wood, hw, cfg.thick / 2, cfg.width / 2,
      mx - nx * cfg.thick / 2, my - ny * cfg.thick / 2, LANE_Z, ang, 'ramp');
    for (const s of [-1, 1]) {
      staticBox(this.world, this.mats.wood, hw, cfg.railH / 2, cfg.railT / 2,
        mx + nx * cfg.railH / 2, my + ny * cfg.railH / 2,
        LANE_Z + s * (cfg.width / 2 + cfg.railT / 2), ang, 'rail');
    }
  }

  /** 碰撞声钩子(阈值 + 节流由音频层处理) */
  #impactSound(body, kind, minV) {
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > minV) this.hooks.onImpact?.({ kind, speed: v, pos: body.position });
    });
  }

  #advance(stage) {
    if (stage > this.currentStage) {
      this.currentStage = stage;
      this.stageTimes[stage] = this.simTime;
      this.hooks.onStage?.(stage, this.simTime);
    }
  }

  // ---------- 触发 ----------
  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    const first = this.dyn.dominoes[0];
    const d = first.__dir;
    first.applyImpulse(
      new CANNON.Vec3(d.x * DOMINO.impulse, 0, d.z * DOMINO.impulse),
      new CANNON.Vec3(0, DOMINO.impulseYOffset, 0),
    );
    this.#advance(1);
  }

  // ---------- 固定步进(仅触发后推进 → 逐比特确定) ----------
  step() {
    if (!this.triggered) return;
    this.world.step(FIXED_DT);
    this.tick++;
    this.#pollStages();
  }

  #pollStages() {
    // 阶段 2:重球离开发球台
    if (this.currentStage < 2 && this.dyn.bigBall.position.x > BIG_BALL.restX + 0.12) {
      this.#advance(2);
    }
    // 阶段 3 兜底:跷跷板角度变化
    if (this.currentStage < 3) {
      const a = 2 * Math.atan2(this.dyn.plank.quaternion.z, this.dyn.plank.quaternion.w);
      if (Math.abs(a - this.plankAngle0) > deg(5)) this.#advance(3);
    }
    // 阶段 4 兜底:锤球偏离静止位
    if (this.currentStage < 4 && Math.abs(this.dyn.bob.position.x - PENDULUM.bobX) > 0.04) {
      this.#advance(4);
    }
  }

  // ---------- 调试状态 ----------
  getState() {
    return {
      triggered: this.triggered,
      currentStage: this.currentStage,
      bellRung: this.bellRung,
      bellRungAt: this.bellRungAt,
      simTime: this.simTime,
      tick: this.tick,
      stageTimes: [...this.stageTimes],
    };
  }
}
