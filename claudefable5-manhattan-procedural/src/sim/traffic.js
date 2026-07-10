// 交通仿真:由规划节点构建有向车道图(大道单行双车道、街道单行单车道,方向交替),
// 26s 信号周期沿大道做绿波偏移;车辆跟车防撞、红灯停车、路口转向。
// 车身/车顶/刹车灯/夜间大灯光池共用同一实例矩阵(局部偏移烘进几何)。
import * as THREE from 'three';
import { CITY } from '../city/plan.js';
import { Rng } from '../core/prng.js';

const CYCLE = 26, AVE_G = 12, AVE_Y = 14.5, ST_G = 23.5;
const GAP_ST = 8, GAP_AVE = 12;   // 路口净空
const CAR_N = 210, CAR_LEN = 4.9;
const VMAX_AVE = 13, VMAX_ST = 8.5, ACC = 4.2, BRK = 9;

function signalFor(node, isAve, simT) {
  const t = (simT + node.phaseOffset) % CYCLE;
  if (isAve) return t < AVE_G ? 'G' : t < AVE_Y ? 'Y' : 'R';
  return t >= AVE_Y && t < ST_G ? 'G' : t >= ST_G ? 'Y' : 'R';
}

function buildGraph(plan) {
  const lanes = [];
  const outgoing = new Map();
  const addOut = (nodeId, laneId) => {
    if (!outgoing.has(nodeId)) outgoing.set(nodeId, []);
    outgoing.get(nodeId).push(laneId);
  };

  // 大道:单行,方向交替,双车道
  for (let ai = 0; ai < CITY.aveXs.length; ai++) {
    const x = CITY.aveXs[ai];
    const dz = ai % 2 === 0 ? 1 : -1;
    const ns = plan.nodes.filter((n) => n.ai === ai).sort((a, b) => (a.z - b.z) * dz);
    for (let i = 0; i < ns.length - 1; i++) {
      const a = ns[i], b = ns[i + 1];
      if (Math.abs(b.si - a.si) !== 1) continue; // 被公园隔断
      for (const off of [-3.2, 3.2]) {
        const z0 = a.z + dz * GAP_ST, z1 = b.z - dz * GAP_ST;
        const len = Math.abs(z1 - z0);
        if (len < 8) continue;
        const id = lanes.length;
        lanes.push({ id, x0: x + off, z0, dx: 0, dz, len, isAve: true, start: a.id, end: b.id, yaw: Math.atan2(0, dz), cars: [] });
        addOut(a.id, id);
      }
    }
  }
  // 街道:单行,方向交替,单车道(靠行驶方向右侧)
  for (let si = 0; si < plan.streets.length; si++) {
    const z = plan.streets[si];
    const dx = si % 2 === 0 ? 1 : -1;
    const ns = plan.nodes.filter((n) => n.si === si).sort((a, b) => (a.x - b.x) * dx);
    for (let i = 0; i < ns.length - 1; i++) {
      const a = ns[i], b = ns[i + 1];
      if (Math.abs(b.ai - a.ai) !== 1) continue;
      const x0 = a.x + dx * GAP_AVE, x1 = b.x - dx * GAP_AVE;
      const len = Math.abs(x1 - x0);
      if (len < 8) continue;
      const id = lanes.length;
      lanes.push({ id, x0, z0: z + 2.6 * dx, dx, dz: 0, len, isAve: false, start: a.id, end: b.id, yaw: Math.atan2(dx, 0), cars: [] });
      addOut(a.id, id);
    }
  }
  return { lanes, outgoing };
}

const CAR_COLORS = [0xf2f3f5, 0x1c1e22, 0xb8bcc2, 0x8c1f28, 0x274b73, 0x4a4e55, 0x5c6670];

export function buildTraffic(plan, scene, disposables) {
  const rng = new Rng(plan.seed ^ 0x7ea11);
  const { lanes, outgoing } = buildGraph(plan);

  // ---------- 车辆网格 ----------
  const bodyGeo = new THREE.BoxGeometry(2.0, 1.1, 4.4).translate(0, 0.98, 0);
  const cabinGeo = new THREE.BoxGeometry(1.78, 0.82, 2.3).translate(0, 1.78, -0.25);
  const brakeGeo = new THREE.BoxGeometry(1.66, 0.26, 0.12).translate(0, 0.95, -2.24);
  const poolGeo = new THREE.CircleGeometry(4.6, 16).rotateX(-Math.PI / 2).translate(0, 0.13, 5.2);

  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.2, metalness: 0.6 });
  const brakeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const poolTexCv = document.createElement('canvas');
  poolTexCv.width = poolTexCv.height = 64;
  {
    const ctx = poolTexCv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,244,214,0.85)');
    g.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const poolTex = new THREE.CanvasTexture(poolTexCv);
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, CAR_N);
  const cabins = new THREE.InstancedMesh(cabinGeo, cabinMat, CAR_N);
  const brakes = new THREE.InstancedMesh(brakeGeo, brakeMat, CAR_N);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, CAR_N);
  bodies.castShadow = true;
  const group = new THREE.Group();
  group.add(bodies, cabins, brakes, pools);
  scene.add(group);
  disposables.push(bodyGeo, cabinGeo, brakeGeo, poolGeo, bodyMat, cabinMat, brakeMat, poolMat, poolTex);

  // ---------- 生成车辆 ----------
  const cars = [];
  const laneOrder = [...lanes].sort(() => rng.next() - 0.5);
  outer:
  for (const lane of laneOrder) {
    const slots = Math.floor(lane.len / 16);
    for (let k = 0; k < slots; k++) {
      if (cars.length >= CAR_N) break outer;
      cars.push({
        lane, s: (k + rng.range(0.2, 0.8)) * (lane.len / Math.max(1, slots)),
        v: rng.range(2, 8), yaw: lane.yaw, crossing: null,
        taxi: rng.chance(0.42), braking: false, brakeShown: -1,
      });
      lane.cars.push(cars[cars.length - 1]);
    }
  }
  const cTint = new THREE.Color();
  cars.forEach((c, i) => {
    cTint.set(c.taxi ? 0xf3b929 : CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)]);
    bodies.setColorAt(i, cTint);
    brakes.setColorAt(i, cTint.set(0x3a0f0c));
    pools.setColorAt(i, cTint.set(0xffffff));
  });

  // ---------- 信号可视状态缓存 ----------
  const lastState = new Array(plan.nodes.length).fill('');

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let simT = rng.range(0, CYCLE);

  function laneAt(lane, s) {
    return [lane.x0 + lane.dx * s, lane.z0 + lane.dz * s];
  }

  function respawn(car) {
    for (let tries = 0; tries < 24; tries++) {
      const lane = lanes[rng.int(0, lanes.length - 1)];
      const blocked = lane.cars.some((c) => c.s < 14);
      if (blocked || lane.len < 20) continue;
      car.lane = lane;
      car.s = 0.5;
      car.v = 3;
      car.yaw = lane.yaw;
      car.crossing = null;
      lane.cars.push(car);
      return;
    }
    car.s = 0.5; // 兜底:留在原车道头部
    car.lane.cars.push(car);
  }

  return {
    group,
    stats: { cars: CAR_N, lanes: lanes.length, signals: plan.nodes.length },
    dispose() { scene.remove(group); },
    update(dt, props, night) {
      simT += dt;

      // 信号可视化(仅状态变化时写颜色)
      for (const n of plan.nodes) {
        const a = signalFor(n, true, simT), s = signalFor(n, false, simT);
        const key = a + s;
        if (lastState[n.id] !== key) {
          lastState[n.id] = key;
          props.setNodeState(n.id, a, s);
        }
      }

      // 车道内排序,保证跟车查询正确
      for (const lane of lanes) {
        if (lane.cars.length > 1) lane.cars.sort((c1, c2) => c1.s - c2.s);
      }

      for (const car of cars) {
        if (car.crossing) {
          const c = car.crossing;
          c.t += (Math.max(car.v, 3) * dt) / c.dist;
          if (c.t >= 1) {
            car.lane = c.toLane;
            car.s = 0.01;
            car.yaw = c.toLane.yaw;
            car.crossing = null;
            c.toLane.cars.push(car);
          } else {
            let d = c.yaw1 - c.yaw0;
            d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
            car.yaw = c.yaw0 + d * Math.min(1, c.t * 1.6);
          }
          continue;
        }

        const lane = car.lane;
        const vmax = lane.isAve ? VMAX_AVE : VMAX_ST;
        let vTarget = vmax;

        // 跟车
        const idx = lane.cars.indexOf(car);
        const leader = lane.cars[idx + 1];
        if (leader) {
          const gap = leader.s - car.s - CAR_LEN;
          const follow = 2.5 + car.v * 0.85;
          if (gap < follow) vTarget = Math.min(vTarget, gap < 1.6 ? 0 : gap * 1.35);
        }

        // 信号
        const node = plan.nodes[lane.end];
        const sig = signalFor(node, lane.isAve, simT);
        const distEnd = lane.len - car.s;
        if (sig !== 'G') {
          const stopDist = (car.v * car.v) / (2 * BRK) + 2.5;
          if (distEnd < stopDist + 6) vTarget = Math.min(vTarget, Math.max(0, (distEnd - 1.2) * 1.2));
        }

        car.braking = vTarget < car.v - 0.5;
        if (car.v < vTarget) car.v = Math.min(vTarget, car.v + ACC * dt);
        else car.v = Math.max(vTarget, car.v - BRK * dt);
        car.s += car.v * dt;

        if (sig !== 'G' && car.s > lane.len - 0.6) {
          car.s = lane.len - 0.6;
          car.v = 0;
        }

        // 到达路口:选择直行或转向
        if (car.s >= lane.len - 0.2 && sig === 'G') {
          const opts = (outgoing.get(lane.end) || []).map((id) => lanes[id])
            .filter((l) => !(l.dx === -lane.dx && l.dz === -lane.dz));
          lane.cars.splice(lane.cars.indexOf(car), 1);
          if (!opts.length) { respawn(car); continue; }
          const straight = opts.filter((l) => l.dx === lane.dx && l.dz === lane.dz);
          const next = (straight.length && rng.chance(0.72))
            ? straight[rng.int(0, straight.length - 1)]
            : opts[rng.int(0, opts.length - 1)];
          const [fx, fz] = laneAt(lane, lane.len);
          const dist = Math.hypot(next.x0 - fx, next.z0 - fz);
          car.crossing = { x0: fx, z0: fz, x1: next.x0, z1: next.z0, yaw0: lane.yaw, yaw1: next.yaw, t: 0, dist: Math.max(dist, 2), toLane: next };
        }
      }

      // ---------- 写实例矩阵 ----------
      const brakeLit = new THREE.Color(0xff2a1c), brakeDim = new THREE.Color(0x3a0f0c);
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        let x, z;
        if (car.crossing) {
          const c = car.crossing;
          x = THREE.MathUtils.lerp(c.x0, c.x1, c.t);
          z = THREE.MathUtils.lerp(c.z0, c.z1, c.t);
        } else {
          [x, z] = laneAt(car.lane, car.s);
        }
        pos.set(x, 0.42, z);
        q.setFromAxisAngle(up, car.yaw);
        m4.compose(pos, q, one);
        bodies.setMatrixAt(i, m4);
        cabins.setMatrixAt(i, m4);
        brakes.setMatrixAt(i, m4);
        pools.setMatrixAt(i, m4);
        const bs = car.braking ? 1 : 0;
        if (car.brakeShown !== bs) {
          car.brakeShown = bs;
          brakes.setColorAt(i, bs ? brakeLit : brakeDim);
          brakes.instanceColor.needsUpdate = true;
        }
      }
      bodies.instanceMatrix.needsUpdate = true;
      cabins.instanceMatrix.needsUpdate = true;
      brakes.instanceMatrix.needsUpdate = true;
      pools.instanceMatrix.needsUpdate = true;
      poolMat.opacity = night * 0.32;
    },
  };
}
