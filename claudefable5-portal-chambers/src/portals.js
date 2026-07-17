// 传送门系统:放置校验、门面视觉(漩涡/RT)、透视渲染(虚拟相机 + 斜近裁剪面)
import * as THREE from 'three';
import { makeFrame, toLocalPoint } from './portal-math.js';
import { raycastBoxes, rayBox, PORTAL_HX, PORTAL_HY } from './physics.js';

export const PORTAL_COLORS = { blue: 0x2f9bff, orange: 0xff8a1e };

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _FLIP = new THREE.Matrix4().makeRotationY(Math.PI);
const _plane = new THREE.Plane();
const _v1 = new THREE.Vector3();
const _q = new THREE.Vector4();
const _clip = new THREE.Vector4();

// Lengyel 斜近裁剪:把投影矩阵的近平面替换为任意视空间平面
function applyOblique(proj, plane) {
  const m = proj.elements;
  _q.set(
    (Math.sign(plane.normal.x) + m[8]) / m[0],
    (Math.sign(plane.normal.y) + m[9]) / m[5],
    -1.0,
    (1.0 + m[10]) / m[14],
  );
  _clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  _clip.multiplyScalar(2.0 / _clip.dot(_q));
  m[2] = _clip.x;
  m[6] = _clip.y;
  m[10] = _clip.z + 1.0;
  m[14] = _clip.w;
}

function discMaterial(colorHex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMode: { value: 0 }, // 0 漩涡占位 / 1 RT 透视
      uTex: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color(colorHex) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform int uMode;
      uniform sampler2D uTex;
      uniform vec2 uRes;
      uniform vec3 uColor;
      uniform float uTime;
      // RT 里存的是线性值(three 渲到 RenderTarget 不做输出转换),显示前手动转 sRGB,
      // 否则门内画面比直视同一表面明显偏暗
      vec3 lin2srgb(vec3 c) {
        vec3 lo = c * 12.92;
        vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
        return mix(lo, hi, step(vec3(0.0031308), c));
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (uMode == 1) {
          vec2 suv = gl_FragCoord.xy / uRes;
          vec3 col = lin2srgb(texture2D(uTex, suv).rgb);
          float edge = smoothstep(1.0, 0.82, r); // 边缘一圈门色光晕
          gl_FragColor = vec4(mix(uColor * 1.5, col, edge), 1.0);
        } else {
          float a = atan(p.y, p.x);
          float sw = sin(a * 3.0 - uTime * 3.0 + r * 10.0) * 0.5 + 0.5;
          float sw2 = sin(a * 5.0 + uTime * 2.0 - r * 14.0) * 0.5 + 0.5;
          float core = smoothstep(0.9, 0.1, r);
          vec3 col = uColor * (0.12 + 0.55 * sw * core + 0.35 * sw2 * core * core);
          col += uColor * 1.2 * smoothstep(0.82, 1.0, r) * smoothstep(1.0, 0.94, r);
          gl_FragColor = vec4(col, 1.0);
        }
      }
    `,
  });
}

class Portal {
  constructor(color, scene) {
    this.color = color;
    this.colorHex = PORTAL_COLORS[color];
    this.frame = null; // 纯数组框架 {P,N,U,X}(与 portal-math 冻结口径一致)
    this.hostBox = null;
    this.fixed = false;
    this.placed = false;
    this.spawnT = 1;
    this.mode = 0;
    this.rt = null;

    this.group = new THREE.Group();
    this.group.visible = false;
    // 门面(椭圆 RT/漩涡)
    this.discMat = discMaterial(this.colorHex);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.discMat);
    this.disc.scale.set(PORTAL_HX, PORTAL_HY, 1);
    this.disc.position.z = 0.015;
    // 光圈
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.1, 48),
      new THREE.MeshBasicMaterial({ color: this.colorHex, transparent: true, opacity: 0.95 }),
    );
    this.ring.scale.set(PORTAL_HX, PORTAL_HY, 1);
    this.ring.position.z = 0.02;
    this.light = new THREE.PointLight(this.colorHex, 2.2, 3.5);
    this.light.position.z = 0.4;
    this.group.add(this.disc, this.ring, this.light);
    scene.add(this.group);

    // 三维向量缓存(渲染用)
    this.pV = new THREE.Vector3();
    this.nV = new THREE.Vector3();
    this.frameM = new THREE.Matrix4();
  }

  setFrame(P, N, U, hostBox, fixed) {
    this.frame = makeFrame(P, N, U);
    this.hostBox = hostBox;
    this.fixed = !!fixed;
    this.placed = true;
    this.spawnT = 0;
    this.pV.fromArray(P);
    this.nV.fromArray(N);
    const X = this.frame.X;
    this.frameM.makeBasis(
      new THREE.Vector3().fromArray(X),
      new THREE.Vector3().fromArray(U),
      this.nV.clone(),
    );
    this.frameM.setPosition(this.pV);
    this.group.matrixAutoUpdate = false;
    this.group.matrix.copy(this.frameM);
    this.group.matrixWorld.copy(this.frameM);
    this.group.visible = true;
  }

  clear() {
    this.frame = null;
    this.hostBox = null;
    this.placed = false;
    this.fixed = false;
    this.group.visible = false;
  }

  setMode(m) {
    this.mode = m;
    this.discMat.uniforms.uMode.value = m;
  }

  update(dt, eyePos, pairActive) {
    if (!this.placed) return;
    this.discMat.uniforms.uTime.value += dt;
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / 0.18);
      const s = 0.2 + 0.8 * this.spawnT;
      this.disc.scale.set(PORTAL_HX * s, PORTAL_HY * s, 1);
      this.ring.scale.set(PORTAL_HX * s, PORTAL_HY * s, 1);
    }
    // 近距挤出:玩家眼睛贴近门面时把门面朝观察者顶出,避免近裁剪面穿帮
    let offset = 0.015;
    if (pairActive && eyePos) {
      const l = toLocalPoint(this.frame, eyePos);
      if (Math.abs(l[0]) < PORTAL_HX + 0.35 && Math.abs(l[1]) < PORTAL_HY + 0.45 && l[2] > -0.05 && l[2] < 0.55) {
        offset = 0.02 + Math.max(0, 0.55 - l[2]) * 0.55;
      }
    }
    this.disc.position.z = offset;
  }
}

export class PortalSystem {
  constructor(scene) {
    this.scene = scene;
    this.blue = new Portal('blue', scene);
    this.orange = new Portal('orange', scene);
    this.vcam = new THREE.PerspectiveCamera();
    this.vcam.matrixAutoUpdate = false;
    this.rtSize = new THREE.Vector2(0, 0);
    this.tracers = [];
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);
  }

  get(color) { return color === 'blue' ? this.blue : this.orange; }
  other(color) { return color === 'blue' ? this.orange : this.blue; }
  pairActive() { return this.blue.placed && this.orange.placed; }

  clearAll() {
    this.blue.clear();
    this.orange.clear();
  }

  // 消解栅:清除玩家放置的门(固定门保留)
  clearPlacedOnly() {
    let cleared = false;
    for (const p of [this.blue, this.orange]) {
      if (p.placed && !p.fixed) { p.clear(); cleared = true; }
    }
    return cleared;
  }

  // 发射:从相机位置沿视线放置 color 门
  // rayList: 可挡弹的盒(静态墙 + 关门 + 方块);fizzlerBoxes: 消解栅体积(挡弹)
  tryPlace(color, origin, dir, rayList, fizzlerBoxes) {
    const hit = raycastBoxes(origin, dir, rayList, 200);
    let fizzT = Infinity;
    for (const fb of fizzlerBoxes) {
      const fh = rayBox(origin, dir, fb);
      if (fh && fh.t < fizzT) fizzT = fh.t;
    }
    if (!hit || fizzT < hit.t) {
      const t = Math.min(fizzT, hit ? hit.t : 60);
      const pt = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
      this.spawnTracer(origin, pt, color);
      return { ok: false, reason: 'fizzler' };
    }
    this.spawnTracer(origin, hit.point, color);
    if (hit.box.mat !== 'white') return { ok: false, reason: 'surface' };

    const N = hit.normal;
    const nAxis = N[1] !== 0 ? 1 : (N[0] !== 0 ? 0 : 2);
    const P = [...hit.point];
    let U;
    const margin = 0.04;
    if (nAxis === 1) {
      // 地面/天花板:上向量取视线的水平投影(门随视角朝向),椭圆按外接圆保守钳制
      const h = Math.hypot(dir[0], dir[2]);
      U = h > 1e-4 ? [dir[0] / h, 0, dir[2] / h] : [0, 0, -1];
      if (N[1] > 0) U = [-U[0], 0, -U[2]]; // 地面门:上向量背向来路,穿出配对门时朝向自然
      const r = PORTAL_HY + margin;
      for (const a of [0, 2]) {
        const lo = hit.box.min[a] + r, hi = hit.box.max[a] - r;
        if (lo > hi) return { ok: false, reason: 'fit' };
        P[a] = Math.min(hi, Math.max(lo, P[a]));
      }
    } else {
      U = [0, 1, 0];
      const aLat = nAxis === 0 ? 2 : 0; // 面上的水平轴
      const loY = hit.box.min[1] + PORTAL_HY + margin, hiY = hit.box.max[1] - PORTAL_HY - margin;
      const loL = hit.box.min[aLat] + PORTAL_HX + margin, hiL = hit.box.max[aLat] - PORTAL_HX - margin;
      if (loY > hiY || loL > hiL) return { ok: false, reason: 'fit' };
      P[1] = Math.min(hiY, Math.max(loY, P[1]));
      P[aLat] = Math.min(hiL, Math.max(loL, P[aLat]));
    }
    // 与另一扇门重叠检查(同平面)
    const other = this.other(color);
    if (other.placed) {
      const of = other.frame;
      const sameNormal = of.N[0] === N[0] && of.N[1] === N[1] && of.N[2] === N[2];
      if (sameNormal && Math.abs((P[0] - of.P[0]) * N[0] + (P[1] - of.P[1]) * N[1] + (P[2] - of.P[2]) * N[2]) < 0.03) {
        const d = toLocalPoint(of, P);
        if (Math.abs(d[0]) < PORTAL_HX * 2 + 0.06 && Math.abs(d[1]) < PORTAL_HY * 2 + 0.06) {
          return { ok: false, reason: 'overlap' };
        }
      }
    }
    const portal = this.get(color);
    if (portal.fixed) return { ok: false, reason: 'fixed' }; // 固定门不可被覆盖(理论上不会发生)
    portal.setFrame(P, N, U, hit.box, false);
    return { ok: true };
  }

  // 关卡加载:按数据放固定门
  setFixed(defs, staticBoxes) {
    for (const d of defs) {
      const probe = [
        d.P[0] - d.N[0] * 0.05,
        d.P[1] - d.N[1] * 0.05,
        d.P[2] - d.N[2] * 0.05,
      ];
      let host = null;
      for (const b of staticBoxes) {
        if (probe[0] > b.min[0] && probe[0] < b.max[0] && probe[1] > b.min[1] && probe[1] < b.max[1] && probe[2] > b.min[2] && probe[2] < b.max[2]) {
          host = b;
          break;
        }
      }
      this.get(d.color).setFrame(d.P, d.N, d.U, host, true);
    }
  }

  spawnTracer(from, to, color) {
    const geo = new THREE.SphereGeometry(0.06, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: PORTAL_COLORS[color] });
    const m = new THREE.Mesh(geo, mat);
    m.position.fromArray(from);
    this.tracerGroup.add(m);
    this.tracers.push({ m, from: [...from], to: [...to], t: 0 });
  }

  update(dt, eyePos) {
    const active = this.pairActive();
    this.blue.update(dt, eyePos, active);
    this.orange.update(dt, eyePos, active);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt / 0.1;
      if (tr.t >= 1) {
        this.tracerGroup.remove(tr.m);
        tr.m.geometry.dispose();
        tr.m.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        tr.m.position.set(
          tr.from[0] + (tr.to[0] - tr.from[0]) * tr.t,
          tr.from[1] + (tr.to[1] - tr.from[1]) * tr.t,
          tr.from[2] + (tr.to[2] - tr.from[2]) * tr.t,
        );
      }
    }
  }

  ensureRT(renderer) {
    const size = renderer.getDrawingBufferSize(this.rtSize.clone());
    if (size.x === 0 || size.y === 0) return false; // 窗格尚未有尺寸
    if (size.x !== this.rtSize.x || size.y !== this.rtSize.y) {
      this.rtSize.copy(size);
      for (const p of [this.blue, this.orange]) {
        if (p.rt) p.rt.dispose();
        p.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 2 });
        p.discMat.uniforms.uRes.value.set(size.x, size.y);
      }
    }
    return true;
  }

  // 每帧主渲染前调用:把两扇门各自的"另一侧视野"渲染到纹理
  renderViews(renderer, scene, camera) {
    if (!this.pairActive()) {
      this.blue.setMode(0);
      this.orange.setMode(0);
      return;
    }
    if (!this.ensureRT(renderer)) return;
    camera.updateMatrixWorld();
    // 通道内两门先回落漩涡,防止读到过期 RT 造成反馈
    this.blue.setMode(0);
    this.orange.setMode(0);
    for (const [A, B] of [[this.blue, this.orange], [this.orange, this.blue]]) {
      const vcam = this.vcam;
      // 虚拟相机 = 主相机经 A→B 穿越变换
      _m1.copy(A.frameM).invert();
      _m2.copy(B.frameM).multiply(_FLIP).multiply(_m1).multiply(camera.matrixWorld);
      vcam.matrixWorld.copy(_m2);
      vcam.matrixWorld.decompose(vcam.position, vcam.quaternion, vcam.scale);
      vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
      vcam.projectionMatrix.copy(camera.projectionMatrix);
      vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
      // 斜近裁剪:剔除 B 门平面之后的几何(防止穿模墙体挡视野)
      _plane.setFromNormalAndCoplanarPoint(B.nV, _v1.copy(B.pV).addScaledVector(B.nV, 0.005));
      _plane.applyMatrix4(vcam.matrixWorldInverse);
      applyOblique(vcam.projectionMatrix, _plane);
      B.group.visible = false; // 相机就贴在 B 背后,B 门面/光圈不能挡视野
      renderer.setRenderTarget(A.rt);
      renderer.render(scene, vcam);
      renderer.setRenderTarget(null);
      B.group.visible = true;
      A.discMat.uniforms.uTex.value = A.rt.texture;
    }
    this.blue.setMode(1);
    this.orange.setMode(1);
  }
}
