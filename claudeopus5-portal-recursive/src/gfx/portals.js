// 递归门景渲染:门里看到的画面自己也含一扇门,再往里还有一层(L4「门中门」)。
//
// 每帧的顺序是「由深到浅」:
//   level 2 → 用漩涡占位画进 rt[P][2]
//   level 1 → 场景里的 P 门贴 rt[P][2],画进 rt[P][1]
//   主画面 → 场景里的 P 门贴 rt[P][1]
// 每一层的虚拟相机 = 主相机连乘 level 次穿越矩阵;渲染时用 Lengyel 斜近裁剪把出口门
// 背后的几何切掉,否则会看见「墙的背面」糊在画面上。
import * as THREE from 'three';
import { APERTURE } from '../sim/world.js';
import { throughMatrix } from '../core/transform.js';

const COLORS = { blue: 0x2f9bff, orange: 0xff8a1e };
const NEAR_PUSH = 0.55; // 相机贴近门面时把门盘朝观察者顶出,避免被近裁剪面切穿

const _plane = new THREE.Plane();
const _v = new THREE.Vector3();
const _q = new THREE.Vector4();
const _c = new THREE.Vector4();

function applyOblique(proj, plane) {
  const m = proj.elements;
  _q.set(
    (Math.sign(plane.normal.x) + m[8]) / m[0],
    (Math.sign(plane.normal.y) + m[9]) / m[5],
    -1,
    (1 + m[10]) / m[14],
  );
  _c.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  _c.multiplyScalar(2 / _c.dot(_q));
  m[2] = _c.x;
  m[6] = _c.y;
  m[10] = _c.z + 1;
  m[14] = _c.w;
}

function discMaterial(hex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMode: { value: 0 },
      uTex: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color(hex) },
      uTime: { value: 0 },
      uOpen: { value: 1 },
      uEncode: { value: 1 }, // 只有最终画到画布那一遍才做 linear→sRGB,渲进 RT 时保持线性
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform int uMode;
      uniform sampler2D uTex;
      uniform vec2 uRes;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpen;
      uniform float uEncode;
      // RT 里是线性值(three 渲到 RenderTarget 不做输出转换),只在最终写画布时转 sRGB。
      // 若每一层都转,递归第二层就会被 gamma 编码两次,门中门那块明显发白。
      vec3 lin2srgb(vec3 c) {
        vec3 lo = c * 12.92;
        vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
        return mix(lo, hi, step(vec3(0.0031308), c));
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        // 超椭圆:与物理门口的矩形一致,视觉上是圆角矩形
        float d = pow(abs(p.x), 4.0) + pow(abs(p.y), 4.0);
        float open = uOpen * uOpen;
        if (d > open) discard;
        float edge = smoothstep(open, open * 0.55, d);
        vec3 col;
        if (uMode == 1) {
          vec3 raw = texture2D(uTex, gl_FragCoord.xy / uRes).rgb;
          col = uEncode > 0.5 ? lin2srgb(raw) : raw;
        } else {
          float a = atan(p.y, p.x);
          float r = length(p);
          float s1 = sin(a * 3.0 - uTime * 2.6 + r * 9.0) * 0.5 + 0.5;
          float s2 = sin(a * 5.0 + uTime * 1.9 - r * 13.0) * 0.5 + 0.5;
          col = uColor * (0.10 + 0.5 * s1 + 0.3 * s2 * s2);
        }
        col = mix(uColor * 2.2, col, edge);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

class Disc {
  constructor(color, scene) {
    this.color = color;
    this.material = discMaterial(COLORS[color]);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(APERTURE.hx * 2, APERTURE.hy * 2),
      this.material,
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.light = new THREE.PointLight(COLORS[color], 1.6, 4.5);
    this.light.visible = false;
    scene.add(this.mesh, this.light);
    this.rt = [null, null, null]; // 索引 1/2 对应递归层级
    this.basis = new THREE.Matrix4();
    this.origin = new THREE.Vector3();
    this.normal = new THREE.Vector3();
  }

  syncFrame(frame) {
    this.origin.fromArray(frame.P);
    this.normal.fromArray(frame.N);
    this.basis.makeBasis(
      new THREE.Vector3().fromArray(frame.X),
      new THREE.Vector3().fromArray(frame.U),
      this.normal.clone(),
    );
    this.basis.setPosition(this.origin);
  }

  place(offset) {
    this.mesh.matrix.copy(this.basis);
    this.mesh.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, offset));
    this.mesh.matrixWorld.copy(this.mesh.matrix);
    this.light.position.copy(this.origin).addScaledVector(this.normal, 0.55);
  }

  dispose() {
    for (const rt of this.rt) rt?.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export class PortalRenderer {
  constructor(scene) {
    this.scene = scene;
    this.discs = { blue: new Disc('blue', scene), orange: new Disc('orange', scene) };
    this.vcam = new THREE.PerspectiveCamera();
    this.vcam.matrixAutoUpdate = false;
    this.maxDepth = 2;
    this.size = new THREE.Vector2(0, 0);
    this.tmp = new THREE.Vector2();
    this.M = { blue: new THREE.Matrix4(), orange: new THREE.Matrix4() };
  }

  /** 每帧从模拟状态同步:门是否存在、开合动画、贴近时的顶出量 */
  sync(game, eye, dt) {
    for (const color of ['blue', 'orange']) {
      const p = game.portals[color];
      const d = this.discs[color];
      d.material.uniforms.uTime.value += dt;
      if (!p.placed) {
        d.mesh.visible = false;
        d.light.visible = false;
        continue;
      }
      d.syncFrame(p.frame);
      d.material.uniforms.uOpen.value = Math.max(0.05, p.spawnT);
      // 相机贴近门面时把门盘朝外顶,避免近裁剪面切穿
      const rel = _v.set(eye[0], eye[1], eye[2]).sub(d.origin);
      const along = rel.dot(d.normal);
      const lateral = rel.clone().addScaledVector(d.normal, -along).length();
      let offset = 0.012;
      if (along > -0.1 && along < NEAR_PUSH && lateral < 1.6) {
        // 顶出方向朝观察者,必须夹住:顶过头门盘会落进近裁剪面之内甚至跑到相机背后,
        // 结果就是「越贴近门,门内画面越先消失」——正好和这段代码的本意相反。
        const want = 0.012 + (NEAR_PUSH - Math.max(0, along)) * 0.5;
        offset = Math.min(want, Math.max(0.012, along - 0.11));
      }
      d.place(offset);
      d.mesh.visible = true;
      d.light.visible = true;
    }
  }

  ensureTargets(renderer) {
    const size = renderer.getDrawingBufferSize(this.tmp);
    if (size.x < 2 || size.y < 2) return false;
    if (size.x === this.size.x && size.y === this.size.y) return true;
    this.size.copy(size);
    for (const color of ['blue', 'orange']) {
      const d = this.discs[color];
      // 循环覆盖全部层级:降层时把高层的 RT 真正释放掉,不然它既不跟随窗口尺寸也一直占着显存
      for (let level = 1; level < d.rt.length; level++) {
        d.rt[level]?.dispose();
        if (level > this.maxDepth) { d.rt[level] = null; continue; }
        const scale = level === 1 ? 1 : 0.5;
        d.rt[level] = new THREE.WebGLRenderTarget(
          Math.max(2, Math.floor(size.x * scale)),
          Math.max(2, Math.floor(size.y * scale)),
          { samples: level === 1 ? 2 : 0, depthBuffer: true },
        );
      }
    }
    return true;
  }

  setRes(w, h) {
    this.discs.blue.material.uniforms.uRes.value.set(w, h);
    this.discs.orange.material.uniforms.uRes.value.set(w, h);
  }

  setMode(color, mode, texture) {
    const u = this.discs[color].material.uniforms;
    u.uMode.value = mode;
    u.uTex.value = texture || null;
  }

  setEncode(on) {
    this.discs.blue.material.uniforms.uEncode.value = on ? 1 : 0;
    this.discs.orange.material.uniforms.uEncode.value = on ? 1 : 0;
  }

  /** 主渲染前调用:把两扇门各自的多层视图渲染到纹理链上 */
  renderViews(renderer, scene, camera, game) {
    const pair = game.portals.blue.placed && game.portals.orange.placed;
    this.setEncode(true);
    if (!pair || !this.ensureTargets(renderer)) {
      this.setMode('blue', 0, null);
      this.setMode('orange', 0, null);
      this.setRes(this.size.x || 1, this.size.y || 1);
      return;
    }
    camera.updateMatrixWorld();
    // 穿越矩阵:M[c] 把主相机送到「从另一扇门往外看」的位置
    this.M.blue.fromArray(throughMatrix(game.portals.blue.frame, game.portals.orange.frame));
    this.M.orange.fromArray(throughMatrix(game.portals.orange.frame, game.portals.blue.frame));

    for (let level = this.maxDepth; level >= 1; level--) {
      for (const color of ['blue', 'orange']) {
        const other = color === 'blue' ? 'orange' : 'blue';
        const self = this.discs[color];
        const exit = this.discs[other];
        const vcam = this.vcam;
        vcam.matrixWorld.copy(camera.matrixWorld);
        for (let i = 0; i < level; i++) vcam.matrixWorld.premultiply(this.M[color]);
        vcam.matrixWorld.decompose(vcam.position, vcam.quaternion, vcam.scale);
        vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
        vcam.projectionMatrix.copy(camera.projectionMatrix);
        vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
        // 斜近裁剪:只保留出口门前方的世界
        _plane.setFromNormalAndCoplanarPoint(
          exit.normal,
          _v.copy(exit.origin).addScaledVector(exit.normal, 0.004),
        );
        _plane.applyMatrix4(vcam.matrixWorldInverse);
        applyOblique(vcam.projectionMatrix, _plane);

        const rt = self.rt[level];
        this.setRes(rt.width, rt.height);
        this.setEncode(false); // 渲进 RT:保持线性,最终画布那一遍再统一编码
        // 本层里:自己贴更深一层的画面(最深层用漩涡),出口门隐藏(相机就贴在它背面)
        this.setMode(color, level === this.maxDepth ? 0 : 1, self.rt[level + 1]?.texture);
        this.setMode(other, 0, null);
        const exitVisible = exit.mesh.visible;
        exit.mesh.visible = false;
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, vcam);
        renderer.setRenderTarget(null);
        exit.mesh.visible = exitVisible;
      }
    }
    this.setRes(this.size.x, this.size.y);
    this.setEncode(true);
    this.setMode('blue', 1, this.discs.blue.rt[1].texture);
    this.setMode('orange', 1, this.discs.orange.rt[1].texture);
  }

  setDepth(n) {
    if (n === this.maxDepth) return;
    this.maxDepth = n;
    this.size.set(0, 0); // 触发重建
  }
}
