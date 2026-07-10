// ============================================================
// physicsWorld.js — 确定性物理世界工厂
// 复位策略:整个 World 连同全部刚体/约束彻底重建,保证逐比特一致
// ============================================================
import * as CANNON from 'cannon-es';
import { GRAVITY, PHYS } from './config.js';

/**
 * 创建一个全新的、参数完全固定的 cannon-es World。
 * 返回 { world, mats } —— mats 为共享物理材质句柄。
 */
export function createWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0),
  });

  // 确定性三要素:固定步长(由外部驱动)、禁睡眠、固定求解器参数
  world.allowSleep = false;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = PHYS.solverIterations;
  world.solver.tolerance = PHYS.solverTolerance;

  const wood = new CANNON.Material('wood');
  const metal = new CANNON.Material('metal');
  const ballMat = new CANNON.Material('ball');
  const domino = new CANNON.Material('domino');

  world.defaultContactMaterial.friction = PHYS.friction.default;
  world.defaultContactMaterial.restitution = PHYS.restitution.default;

  world.addContactMaterial(new CANNON.ContactMaterial(wood, wood, {
    friction: PHYS.friction.dominoGround,
    restitution: PHYS.restitution.default,
  }));
  // 骨牌底面 vs 台面:高摩擦抓地(骨牌被推时底部不打滑)
  world.addContactMaterial(new CANNON.ContactMaterial(domino, wood, {
    friction: PHYS.friction.dominoGround,
    restitution: PHYS.restitution.default,
  }));
  // 骨牌 vs 骨牌:摩擦必须为 0(实测:>0 时下落骨牌顶边在下一张面上
  // 形成摩擦自锁楔,GS 求解器把推力全部耗散,链条呈准静态蠕变卡死;
  // headless 扫描 fric∈{0.02,0.05,...} 全部卡死,fric=0 时 25 张 ~2.5s 稳定走通)
  world.addContactMaterial(new CANNON.ContactMaterial(domino, domino, {
    friction: PHYS.friction.dominoDomino,
    restitution: PHYS.restitution.domino,
  }));
  // 末牌 vs 重球:把倒下动能传给球
  world.addContactMaterial(new CANNON.ContactMaterial(domino, ballMat, {
    friction: 0.3,
    restitution: 0.1,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wood, {
    friction: PHYS.friction.ballWood,   // 球在木面上依赖摩擦滚动
    restitution: PHYS.restitution.ball,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, metal, {
    friction: 0.3,
    restitution: 0.25,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(metal, metal, {
    friction: 0.2,
    restitution: 0.3,
  }));

  return { world, mats: { wood, metal, ballMat, domino } };
}
