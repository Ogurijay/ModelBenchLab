// 地图构建工具:程序化贴图、天空、水面、盒体/圆柱(网格 + 碰撞体一起建)。
import * as THREE from 'three';
import { RAPIER, GROUPS } from './physics.js';

// ---------- 程序化贴图 ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  if (typeof document === 'undefined') return null;
  let base = texCache.get(key);
  if (!base) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    base = new THREE.CanvasTexture(cv);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 8;
    texCache.set(key, base);
  }
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };

export const TEX = {
  planks: (c = '#b9824e', rep) => canvasTex('planks' + c, 256, 256, (g, w, h) => {
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = shade(c, 0.86 + rnd() * 0.24); g.fillRect(0, r * h / rows, w, h / rows);
      g.strokeStyle = shade(c, 0.6); g.lineWidth = 3; g.strokeRect(-2, r * h / rows, w + 4, h / rows);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(60,30,10,${0.06 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 2;
        const y = r * h / rows + rnd() * h / rows;
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.6, y + rnd() * 6 - 3, w, y); g.stroke();
      }
      const off = (r % 2) * w / 2;
      g.fillStyle = shade(c, 0.55); g.fillRect((off + w / 2) % w, r * h / rows, 3, h / rows);
    }
  }, rep),
  tiles: (c = '#d9d4cc', grout = '#9b958c', n = 4, rep) => canvasTex('tiles' + c + n, 256, 256, (g, w, h) => {
    g.fillStyle = grout; g.fillRect(0, 0, w, h);
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = shade(c, 0.92 + rnd() * 0.12); g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
  }, rep),
  concrete: (c = '#9c9a96', rep) => canvasTex('conc' + c, 256, 256, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.07})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5); }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }, rep),
  metal: (c = '#8f979f', rep) => canvasTex('metal' + c, 256, 256, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32 % 2) * 16; x < w; x += 32) {
      g.fillStyle = shade(c, 1.15); g.save(); g.translate(x + 8, y + 8); g.rotate(0.6); g.fillRect(-7, -2, 14, 4); g.restore();
    }
    g.strokeStyle = shade(c, 0.6); g.lineWidth = 4; g.strokeRect(0, 0, w, h);
  }, rep),
  hazard: (rep) => canvasTex('hazard', 128, 128, (g, w, h) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#26262a';
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 48, 0); g.lineTo(i * 48 + 24, 0); g.lineTo(i * 48 + 24 + h, h); g.lineTo(i * 48 + h, h); g.fill(); }
  }, rep),
  windows: (c = '#2c3550', lit = '#ffd98a', rep) => canvasTex('win' + c, 256, 256, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 32) for (let x = 8; x < w; x += 32) {
      const on = rnd() < 0.42;
      g.fillStyle = on ? (rnd() < 0.3 ? '#bfe6ff' : lit) : shade(c, 0.6);
      g.fillRect(x, y, 18, 20);
    }
  }, rep),
  snow: (rep) => canvasTex('snow', 256, 256, (g, w, h) => {
    g.fillStyle = '#eef6ff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${150 + rnd() * 60},${190 + rnd() * 40},255,${rnd() * 0.15})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 6, 0, 7); g.fill(); }
  }, rep),
  ice: (rep) => canvasTex('ice', 256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#dff6ff'); gr.addColorStop(1, '#bfe7fa');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rnd() * 40 - 20; y += rnd() * 40 - 20; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }, rep),
  grass: (rep) => canvasTex('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#6fb34a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${40 + rnd() * 60},${120 + rnd() * 80},${30 + rnd() * 40},0.5)`; g.fillRect(rnd() * w, rnd() * h, 1.5, 3 + rnd() * 4); }
  }, rep),
  rock: (c = '#8b7d6b', rep) => canvasTex('rock' + c, 256, 256, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = shade(c, 0.7 + rnd() * 0.5); g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 22, 4 + rnd() * 12, rnd() * 3, 0, 7); g.fill(); }
  }, rep),
  sign: (text, bg = '#ff3e6c', fg = '#fff6d0') => {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
    const g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, 492, 140);
    g.fillStyle = fg; g.font = 'bold 92px "Microsoft YaHei", "PingFang SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 84);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  },
};

export const mat = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...opts });

// ---------- 天空 ----------
export function makeSky(scene, { top = '#5fa8ff', horizon = '#d9efff', bottom = '#f3f8ff', sunDir = new THREE.Vector3(0.4, 0.7, 0.3), sun = '#fff3d0', stars = 0 } = {}) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) }, sunDir: { value: sunDir.clone().normalize() }, sunCol: { value: new THREE.Color(sun) }, stars: { value: stars } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, horizon, bottom, sunCol, sunDir; uniform float stars; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y,0.0,1.0), 0.6)) : mix(horizon, bottom, clamp(-y*3.0,0.0,1.0));
        float s = max(dot(vD, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
        if (stars > 0.0 && y > 0.0) { vec3 q = floor(vD * 220.0); float r = h(q); c += vec3(step(0.996, r)) * stars * y; }
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

// ---------- 水面 ----------
export function makeWater(scene, { size = 400, level = 0, color = '#2a8fc4', deep = '#0b3a5c', amp = 0.25, freq = 0.35, foam = '#e9f8ff', opacity = 0.92 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const uniforms = { uT: { value: 0 }, uAmp: { value: amp }, uFreq: { value: freq }, uCol: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uFoam: { value: new THREE.Color(foam) } };
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.05, transparent: opacity < 1, opacity });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uT, uAmp, uFreq; varying float vH; varying vec3 vW;
      float wv(vec2 p){ return sin(p.x*uFreq + uT*1.1)*0.5 + sin(p.y*uFreq*1.3 - uT*0.9)*0.35 + sin((p.x+p.y)*uFreq*2.1 + uT*1.7)*0.18 + sin((p.x-p.y*0.7)*uFreq*3.7 - uT*2.3)*0.08; }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      { vec3 wp = (modelMatrix * vec4(position,1.0)).xyz; float e = 0.3;
        float hx = wv(wp.xz + vec2(e,0.0)) - wv(wp.xz - vec2(e,0.0)); float hz = wv(wp.xz + vec2(0.0,e)) - wv(wp.xz - vec2(0.0,e));
        objectNormal = normalize(vec3(-hx*uAmp/(2.0*e), 1.0, -hz*uAmp/(2.0*e))); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 wp = (modelMatrix * vec4(position,1.0)).xyz; vH = wv(wp.xz); transformed.y += vH * uAmp; vW = wp; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uCol, uDeep, uFoam; varying float vH; varying vec3 vW;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(uDeep, uCol, smoothstep(-0.8, 0.9, vH));
      float fo = smoothstep(0.72, 0.95, vH + sin(vW.x*3.1+vW.z*2.3)*0.08);
      diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, fo*0.8);`);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = level;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // CPU 端同一波形,用于判定入水与浮力
  const wv = (x, z, t) => Math.sin(x * freq + t * 1.1) * 0.5 + Math.sin(z * freq * 1.3 - t * 0.9) * 0.35 + Math.sin((x + z) * freq * 2.1 + t * 1.7) * 0.18 + Math.sin((x - z * 0.7) * freq * 3.7 - t * 2.3) * 0.08;
  return {
    mesh, uniforms,
    heightAt: (x, z, t) => mesh.position.y + wv(x, z, t) * uniforms.uAmp.value,
    update(t) { uniforms.uT.value = t; },
  };
}

// ---------- 构建器 ----------
export class Builder {
  constructor(game, root) {
    this.game = game; this.phys = game.phys; this.root = root;
  }
  add(obj) { this.root.add(obj); return obj; }

  // 盒体:pos 为中心;opts: { rot:[x,y,z], collide=true, friction, body, tag, ice, noGrab, shadow=true }
  box(w, h, d, pos, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    (opts.parent || this.root).add(mesh);
    if (opts.collide !== false) {
      const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
      const c = this.phys.staticBox(w / 2, h / 2, d / 2, { x: pos[0], y: pos[1], z: pos[2] }, { x: q.x, y: q.y, z: q.z, w: q.w }, { friction: opts.friction, body: opts.body, tag: opts.tag });
      const info = this.phys.info(c);
      if (opts.ice) info.ice = true;
      if (opts.noGrab) info.noGrab = true;
      mesh.userData.collider = c;
    }
    return mesh;
  }

  cyl(rTop, rBot, h, pos, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 20), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    (opts.parent || this.root).add(mesh);
    if (opts.collide !== false) {
      const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
      const c = this.phys.staticCylinder(h / 2, Math.max(rTop, rBot), { x: pos[0], y: pos[1], z: pos[2] }, { x: q.x, y: q.y, z: q.z, w: q.w }, { body: opts.body, tag: opts.tag, friction: opts.friction });
      if (opts.ice) this.phys.info(c).ice = true;
      mesh.userData.collider = c;
    }
    return mesh;
  }

  // 只加碰撞
  solid(w, h, d, pos, opts = {}) {
    const q = opts.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...opts.rot)) : new THREE.Quaternion();
    return this.phys.staticBox(w / 2, h / 2, d / 2, { x: pos[0], y: pos[1], z: pos[2] }, { x: q.x, y: q.y, z: q.z, w: q.w }, opts);
  }

  // 背景城市楼群(无碰撞)
  city({ count = 60, inner = 26, outer = 120, minH = 10, maxH = 60, baseY = -40, seed = 3 } = {}) {
    let s = seed;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const group = new THREE.Group();
    const cols = ['#2c3550', '#3a3047', '#24384a', '#3b4152', '#4a3a3a'];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = inner + r() * (outer - inner);
      const w = 6 + r() * 12, dd = 6 + r() * 12, h = minH + r() * (maxH - minH);
      const c = cols[Math.floor(r() * cols.length)];
      const m = mat({ map: TEX.windows(c, '#ffd98a', [w / 8, h / 8]), emissive: '#ffffff', emissiveMap: TEX.windows(c, '#ffd98a', [w / 8, h / 8]), emissiveIntensity: 0.35 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
      b.position.set(Math.cos(a) * d, baseY + h / 2, Math.sin(a) * d);
      b.rotation.y = r() * Math.PI;
      group.add(b);
    }
    this.root.add(group);
    return group;
  }
}

// 动态浮体浮力(采样点在刚体局部坐标)
export function applyBuoyancy(body, samples, water, t, { k = 30, damp = 2.5, linDrag = 0.6 } = {}) {
  const tr = body.translation(), ro = body.rotation();
  const q = new THREE.Quaternion(ro.x, ro.y, ro.z, ro.w);
  const lv = body.linvel(), av = body.angvel();
  const m = body.mass();
  const per = m / samples.length;
  const p = new THREE.Vector3();
  let sub = 0;
  for (const s of samples) {
    p.copy(s).applyQuaternion(q).add(tr);
    const wh = water.heightAt(p.x, p.z, t);
    const depth = wh - p.y;
    if (depth <= 0) continue;
    sub++;
    const rx = p.x - tr.x, ry = p.y - tr.y, rz = p.z - tr.z;
    const vy = lv.y + av.z * rx - av.x * rz;
    const f = per * (k * Math.min(depth, 1.2) - damp * vy) * (1 / 60);
    body.applyImpulseAtPoint({ x: 0, y: Math.max(0, f), z: 0 }, { x: p.x, y: p.y, z: p.z }, true);
  }
  if (sub) {
    const frac = sub / samples.length;
    body.applyImpulse({ x: -lv.x * m * linDrag * frac / 60, y: 0, z: -lv.z * m * linDrag * frac / 60 }, true);
    body.applyTorqueImpulse({ x: -av.x * m * 0.4 * frac / 60, y: -av.y * m * 0.4 * frac / 60, z: -av.z * m * 0.4 * frac / 60 }, true);
  }
  return sub;
}

export { RAPIER, GROUPS };
