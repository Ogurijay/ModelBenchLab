// 两件"让城市活起来"的小东西:
//  1) 光源池 —— 全城几百处火光/路灯只用 8 盏真实点光源,按距离动态改派,其余靠自发光材质撑住。
//  2) 烟囱炊烟 —— 单个 Points + 自定义着色器,逐粒子透明度与尺寸。
import * as THREE from 'three';
import { TEX } from '../core/textures.js';

// three r155 之后点光源是物理单位(坎德拉,按 1/d² 衰减),"看起来合理"的数值要放大一个量级。
// 各处 emitter 只写相对亮度,这里统一乘增益,调一处就能整城对齐。
const LIGHT_GAIN = 9.5;

export function createLightPool(scene, max = 8) {
  const lights = [];
  for (let i = 0; i < max; i++) {
    const l = new THREE.PointLight(0xffaa55, 0, 20, 1.9);
    l.visible = false;
    l.castShadow = false;
    scene.add(l);
    lights.push({ light: l, src: null, phase: Math.random() * 6.28 });
  }
  let emitters = [];
  let acc = 0;

  function setEmitters(list) { emitters = list; }

  function reassign(camPos, night) {
    const cand = [];
    for (const e of emitters) {
      if (e.night && night < 0.25) continue;
      const dx = e.x - camPos.x, dy = e.y - camPos.y, dz = e.z - camPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 4900) continue;
      cand.push({ e, d2 });
    }
    cand.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < lights.length; i++) {
      const slot = lights[i];
      const pick = cand[i];
      if (!pick) { slot.src = null; slot.light.visible = false; continue; }
      slot.src = pick.e;
      slot.light.visible = true;
      slot.light.color.setHex(pick.e.color);
      slot.light.distance = pick.e.distance || 14;
      slot.light.position.set(pick.e.x, pick.e.y, pick.e.z);
    }
  }

  function update(dt, camPos, night, t) {
    acc += dt;
    if (acc > 0.22) { acc = 0; reassign(camPos, night); }
    for (const s of lights) {
      if (!s.src) continue;
      const f = s.src.flicker || 0;
      // 室内火光白天照样要亮 —— 屋里本来就没有太阳
      const flick = f ? 1 + Math.sin(t * 11 + s.phase) * 0.09 * f + Math.sin(t * 27.3 + s.phase * 2) * 0.05 * f : 1;
      s.light.intensity = (s.src.intensity || 1.5) * flick * LIGHT_GAIN;
    }
    void night;
  }

  return { update, setEmitters, lights, dispose() { for (const s of lights) scene.remove(s.light); } };
}

/* ------------------------------------------------------------------ */

const SMOKE_VERT = /* glsl */`
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (320.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const SMOKE_FRAG = /* glsl */`
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
    #include <colorspace_fragment>
  }
`;

export function createSmoke(sources, perSource = 7) {
  const n = Math.max(1, sources.length * perSource);
  const pos = new Float32Array(n * 3);
  const alpha = new Float32Array(n);
  const size = new Float32Array(n);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const s = sources[i % sources.length] || { x: 0, y: 0, z: 0, rate: 1 };
    parts.push({ s, t: Math.random(), speed: 0.16 + Math.random() * 0.14, drift: Math.random() * 6.28, r: Math.random() });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

  const material = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: TEX.smoke() }, uColor: { value: new THREE.Color(0xb8bcc0) } },
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.name = 'smoke';

  function update(dt, wind = 0.6) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt * p.speed * (p.s.rate || 1);
      if (p.t > 1) { p.t -= 1; p.r = Math.random(); p.drift = Math.random() * 6.28; }
      const life = p.t;
      const rise = life * 13 * (p.s.rate || 1);
      pos[i * 3] = p.s.x + Math.sin(p.drift + life * 2.4) * (0.4 + life * 2.2) + wind * rise * 0.35;
      pos[i * 3 + 1] = p.s.y + rise;
      pos[i * 3 + 2] = p.s.z + Math.cos(p.drift * 1.7 + life * 2.0) * (0.4 + life * 2.0) + wind * rise * 0.18;
      alpha[i] = Math.max(0, (1 - life) * 0.42 * Math.min(1, life * 7));
      size[i] = 1.6 + life * 9;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  update(0);
  return { points, material, update, dispose() { geo.dispose(); material.dispose(); } };
}
