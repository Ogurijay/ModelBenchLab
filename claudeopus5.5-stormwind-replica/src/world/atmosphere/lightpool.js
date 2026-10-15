// 光源池：场景里登记了几百个光源（壁炉 / 烛台 / 熔炉 / 奥术 / 路灯…），实际只用 ≤16 盏 PointLight（不投影），
// 每 0.2 s 按「距离 ÷ 优先级」重新分派。灯一直挂在场景里（数量不变 → 不触发着色器重编译），闲置时强度为 0。
//
// 强度换算（r155+ 物理单位：坎德拉，按 1/d² 衰减，见 pitfalls.md）：
//   登记的 intensity 是相对值；实际 cd = intensity × KINDS[kind].cd × settings.poolGain。
//   壁炉 1.0 → 30 cd：距 3 m 的墙面辐照度 ≈ 3.3，距 5 m ≈ 1.2——足够照亮 6×10 m 的房间（白天日光直射约 3）。
//   路灯 1.0 → 22 cd、挂高 3.7 m：灯下 ≈ 1.6，水平 6 m 处 ≈ 0.25，截止距离 14 m——地面光圈半径约 8 m。
import * as THREE from 'three';

export const MAX_LIGHTS = 16;

const KINDS = {
  lamp: { color: 0xffc070, cd: 22, range: 14, prio: 1.0 },
  fire: { color: 0xff8a3a, cd: 30, range: 13, prio: 2.2, flicker: true },
  candle: { color: 0xffb262, cd: 6, range: 7, prio: 1.6, flicker: true },
  forge: { color: 0xff6a20, cd: 90, range: 24, prio: 2.4, flicker: true },
  arcane: { color: 0xa070ff, cd: 26, range: 14, prio: 1.4 },
  window: { color: 0xffc46b, cd: 8, range: 8, prio: 0.6 },
  default: { color: 0xffd0a0, cd: 18, range: 12, prio: 1.0 },
};
const INDOOR_KINDS = new Set(['fire', 'candle', 'forge']);

export function createLightPool(ctx) {
  const { scene, settings } = ctx;
  const reg = ctx.lights;
  const lights = [];
  const slots = []; // slot → { entry, k(当前淡入系数) }
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const p = new THREE.PointLight(0xffffff, 0, 10, 2);
    p.castShadow = false;
    p.name = `atmo-pool-${i}`;
    scene.add(p);
    lights.push(p);
    slots.push({ entry: null, k: 0 });
  }

  let timer = 0;
  const cand = [];

  // 预处理登记项：补默认值、颜色缓存、闪烁相位
  function prep(l) {
    if (l._atmo) return;
    const kd = KINDS[l.kind] || KINDS.default;
    l._atmo = {
      kd,
      color: new THREE.Color(l.color ?? kd.color),
      range: l.range ?? kd.range,
      flicker: l.flicker ?? kd.flicker ?? false,
      phase: Math.random() * 100,
      prio: l.prio ?? kd.prio, // 登记项可自带优先级覆盖
    };
  }

  function assign() {
    const cam = ctx.camera.position;
    const night = ctx.env.night;
    const indoor = ctx.indoor;
    cand.length = 0;
    for (const l of reg.list) {
      prep(l);
      if (l.nightOnly && night <= 0.3) continue;
      if ((l.intensity ?? 1) <= 0) continue;
      const a = l._atmo;
      // 带 room 的室内灯（民居登记）：相机在房间 AABB（放宽 0.5 m）内才正常派发；
      // 相机在室外时白天不派（否则透过墙漏到街面），夜里最多 15% 强度（模拟透窗余光）。
      a.roomK = 1;
      if (l.room) {
        const r = l.room;
        const inRoom = cam.x > r.x0 - 0.5 && cam.x < r.x1 + 0.5 && cam.z > r.z0 - 0.5 && cam.z < r.z1 + 0.5 && cam.y > (r.y0 ?? -1e9) - 0.5 && cam.y < (r.y1 ?? 1e9) + 0.5;
        if (!inRoom) {
          if (night <= 0.3) continue;
          a.roomK = 0.15;
        }
      }
      const d = Math.hypot(l.x - cam.x, (l.y ?? 0) - cam.y, l.z - cam.z);
      if (d > 160 + a.range) continue;
      let prio = a.prio;
      if (a.roomK < 1) prio *= 0.35; // 透窗余光：排在街灯后面
      if (indoor && INDOOR_KINDS.has(l.kind)) prio *= 2.5;
      // 比自身照明半径还远时，优先级打折（照不到眼前的东西）
      const s = Math.max(0, d - a.range * 0.5) / prio;
      cand.push({ l, s });
    }
    cand.sort((p, q) => p.s - q.s);
    const chosen = new Set();
    for (let i = 0; i < Math.min(MAX_LIGHTS, cand.length); i++) chosen.add(cand[i].l);

    // 稳定分配：仍入选的保持原槽位（不移动、不闪），落选的让出槽位
    for (const s of slots) {
      if (s.entry && !chosen.has(s.entry)) {
        s.entry._slot = null;
        s.entry = null;
        s.k = 0;
        s.rk = null;
      }
    }
    for (const l of chosen) {
      if (l._slot != null && slots[l._slot]?.entry === l) continue;
      const i = slots.findIndex((s) => !s.entry);
      if (i < 0) break;
      slots[i].entry = l;
      slots[i].k = 0;
      slots[i].rk = null;
      l._slot = i;
      const p = lights[i];
      p.position.set(l.x, l.y ?? 0, l.z);
      p.color.copy(l._atmo.color);
      p.distance = l._atmo.range;
    }
  }

  function update(dt, t) {
    timer -= dt;
    if (timer <= 0 || dt === 0) {
      assign();
      timer = 0.2;
    }
    const night = ctx.env.night;
    let active = 0;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const s = slots[i];
      const p = lights[i];
      const l = s.entry;
      if (!l) {
        p.intensity = 0;
        continue;
      }
      const a = l._atmo;
      // 新派到的灯 0.35 s 淡入，避免突然亮起
      s.k = dt > 0 ? Math.min(1, s.k + dt / 0.35) : 1;
      let f = 1;
      if (a.flicker) {
        const ph = a.phase;
        f = 0.84 + 0.09 * Math.sin(t * 9.3 + ph) + 0.05 * Math.sin(t * 23.1 + ph * 1.7) + 0.04 * Math.sin(t * 41.7 + ph * 0.3);
        p.position.y = (l.y ?? 0) + 0.04 * Math.sin(t * 13 + ph);
      }
      const nightK = l.nightOnly ? THREE.MathUtils.smoothstep(night, 0.3, 0.6) : 1;
      // 室内 / 室外切换时 roomK 平滑过渡
      s.rk = s.rk == null || dt === 0 ? a.roomK : s.rk + (a.roomK - s.rk) * Math.min(1, dt * 6);
      p.intensity = (l.intensity ?? 1) * a.kd.cd * settings.poolGain * f * s.k * nightK * s.rk;
      if (p.intensity > 0.01) active++;
    }
    reg.active = active;
  }

  return { update, lights };
}
