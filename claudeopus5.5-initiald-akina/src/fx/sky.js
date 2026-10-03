// 手绘风天空与远景：渐变天穹 + 赛璐璐二阶云 + 星空 + 三层远山剪影（画布手绘笔触）
import * as THREE from 'three';
import { canvasTex } from './toon.js';
import { rng, fbm } from '../core/math.js';

const vert = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  gl_Position = p.xyww;
}`;
const frag = /* glsl */`
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow;
uniform vec3 sunDir; uniform vec3 cloudLit; uniform vec3 cloudDark;
uniform float clouds; uniform float stars; uniform float time; uniform float moon;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.07; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, y));
  col = mix(col, top, smoothstep(0.18, 0.75, y));
  if (y < 0.0) col = mix(horizon, mid * 0.6, smoothstep(0.0, -0.3, y));
  // 太阳/月亮方向的晕染
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += glow * pow(sd, 6.0) * 0.55 * (1.0 - moon * 0.7);
  col = mix(col, glow, smoothstep(0.9975, 0.9988, sd) * (moon > 0.5 ? 0.9 : 1.0));
  // 星空
  if (stars > 0.0 && y > 0.05) {
    vec2 sp = d.xz / (y + 0.3) * 160.0;
    float s = h21(floor(sp));
    float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 40.0);
    col += vec3(step(0.9965, s) * tw * stars * smoothstep(0.05, 0.3, y));
  }
  // 手绘感二阶云：投影到云层平面，噪声阈值成块
  if (clouds > 0.0 && y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(time * 0.004, 0.0);
    float c = fbm(cp) + fbm(cp * 3.1) * 0.25;
    float th = 1.05 - clouds * 0.55;
    float body = smoothstep(th, th + 0.04, c);
    float lit = smoothstep(th + 0.12, th + 0.16, c + dot(d.xz, normalize(sunDir.xz + 1e-4)) * 0.08);
    vec3 cc = mix(cloudDark, cloudLit, lit);
    col = mix(col, cc, body * smoothstep(0.0, 0.12, y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() },
      clouds: { value: 0.5 }, stars: { value: 0 }, time: { value: 0 }, moon: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // 三层远山：越远越淡，营造动画背景的层次
    this.layers = [];
    const specs = [
      { r: 3200, h: 520, seed: 3, rough: 0.55, y: -60 },
      { r: 2600, h: 380, seed: 7, rough: 0.7, y: -40 },
      { r: 2000, h: 240, seed: 11, rough: 0.85, y: -30 }
    ];
    specs.forEach((s, i) => {
      const tex = paintRidge(s.seed, s.rough, i);
      const mat2 = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, color: 0xffffff });
      const geo = new THREE.CylinderGeometry(s.r, s.r, s.h, 96, 1, true);
      const m = new THREE.Mesh(geo, mat2);
      m.position.y = s.y + s.h / 2;
      m.renderOrder = -9 + i;
      m.frustumCulled = false;
      scene.add(m);
      this.layers.push(m);
    });
    this.center = new THREE.Vector3();
  }

  apply(pal) {
    const u = this.uniforms;
    u.top.value.set(pal.skyTop); u.mid.value.set(pal.skyMid); u.horizon.value.set(pal.horizon);
    u.glow.value.set(pal.glow); u.cloudLit.value.set(pal.cloudLit); u.cloudDark.value.set(pal.cloudDark);
    u.clouds.value = pal.clouds; u.stars.value = pal.stars; u.moon.value = pal.stars > 0.5 ? 1 : 0;
    const el = pal.sunElev * Math.PI / 180, az = pal.sunAz * Math.PI / 180;
    u.sunDir.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    this.layers.forEach((l, i) => l.material.color.set(pal.mountain[i]));
  }

  update(dt, camPos) {
    this.uniforms.time.value += dt;
    this.dome.position.copy(camPos);
    for (const l of this.layers) { l.position.x = camPos.x; l.position.z = camPos.z; }
  }
}

/** 画布绘制一圈山脊剪影：主体平涂 + 笔触高光，顶部柔和 */
function paintRidge(seed, rough, layer) {
  const r = rng(seed);
  return canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const pts = [];
    const off = r() * 100;
    for (let x = 0; x <= w; x += 4) {
      const t = x / w;
      // 首尾相接（圆柱贴图无缝）
      const n = fbm(Math.cos(t * Math.PI * 2) * 2 + off, Math.sin(t * Math.PI * 2) * 2 + off, 5);
      const peak = Math.pow(Math.max(0, fbm(Math.cos(t * Math.PI * 2) * 0.8 + off * 2, Math.sin(t * Math.PI * 2) * 0.8, 3) - 0.3), 1.3);
      const y = h * (0.92 - (n * rough * 0.9 + peak * 0.9));
      pts.push([x, Math.max(h * 0.06, y)]);
    }
    g.beginPath(); g.moveTo(0, h);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(w, h); g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(235,235,240,1)');
    g.fillStyle = grad; g.fill();
    // 笔触：山脊下方斜向阴影带（手绘的面感）
    g.save(); g.clip();
    g.globalAlpha = 0.16 + layer * 0.04;
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h;
      g.fillStyle = r() < 0.5 ? '#000000' : '#ffffff';
      g.beginPath();
      g.ellipse(x, y, 20 + r() * 60, 3 + r() * 6, -0.5 + r() * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // 山脊亮边
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + 1) : g.moveTo(x, y + 1))); g.stroke();
  });
}
