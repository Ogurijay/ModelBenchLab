// 黄昏天空、远山剪影、雾、太阳/天光、环境贴图与场景灯光。

import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.8, 0.47, 0.37).normalize();

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // 永远在最远处
}`;

const skyFrag = /* glsl */ `
uniform vec3 uSun;
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sunDot = max(dot(d, uSun), 0.0);
  vec3 zenith = vec3(0.07, 0.13, 0.3);
  vec3 mid = vec3(0.32, 0.36, 0.52);
  vec3 horizonWarm = vec3(1.25, 0.62, 0.32);
  vec3 horizonCool = vec3(0.55, 0.52, 0.6);
  float az = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 2.0);
  vec3 horizon = mix(horizonCool, horizonWarm, az);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.2, 0.85, h));
  // 地平线以下：暗沉的远景雾
  col = mix(col, vec3(0.28, 0.24, 0.24), smoothstep(0.0, -0.12, h));
  // 太阳与光晕
  col += vec3(1.6, 0.9, 0.5) * pow(sunDot, 12.0) * 0.6;
  col += vec3(1.2, 0.7, 0.4) * pow(sunDot, 3.0) * 0.25;
  col += vec3(40.0, 26.0, 14.0) * smoothstep(0.9993, 0.9997, sunDot);
  // 云层（平面投影）
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv * 1.6);
    c = smoothstep(0.48, 0.82, c) * smoothstep(0.0, 0.18, h);
    vec3 cloudLit = mix(vec3(0.36, 0.3, 0.38), vec3(1.5, 0.82, 0.5), pow(sunDot, 2.0) * 0.8 + az * 0.3);
    col = mix(col, cloudLit, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function mountainTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const layer = (base, amp, color, seed) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    for (let x = 0; x <= 2048; x += 8) {
      const t = (x / 2048) * Math.PI * 2;
      const y = base
        - Math.sin(t * 3 + seed) * amp * 0.5
        - Math.sin(t * 7 + seed * 2.1) * amp * 0.3
        - Math.abs(Math.sin(t * 13 + seed * 0.7)) * amp * 0.25
        - Math.sin(t * 29 + seed) * amp * 0.06;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(2048, 256);
    ctx.closePath();
    ctx.fill();
  };
  layer(150, 90, 'rgba(92,80,96,1)', 1.3);
  layer(190, 60, 'rgba(58,50,62,1)', 4.1);
  layer(225, 30, 'rgba(38,34,42,1)', 2.2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class Environment {
  constructor(renderer, scene, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    const mt = mountainTexture();
    const mm = new THREE.MeshBasicMaterial({ map: mt, transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
    this.mountains = new THREE.Mesh(new THREE.CylinderGeometry(380, 380, 90, 96, 1, true), mm);
    this.mountains.position.y = 22;
    this.mountains.renderOrder = -9;
    scene.add(this.mountains);

    scene.fog = new THREE.FogExp2(new THREE.Color(0.5, 0.43, 0.43), 0.0085);
    scene.background = null;

    // 太阳
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.74, 0.52), 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(90);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = quality !== 'low';
    const ss = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera;
    sc.left = -72; sc.right = 72; sc.top = 72; sc.bottom = -72;
    sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.hemi = new THREE.HemisphereLight(new THREE.Color(0.55, 0.62, 0.82), new THREE.Color(0.32, 0.26, 0.22), 0.75);
    scene.add(this.hemi);

    // 环境贴图：由天空本身生成
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat.clone());
    envSky.material.uniforms.uSun.value = SUN_DIR.clone();
    envScene.add(envSky);
    // 简单地面让下半球不至于全黑
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.15, 0.14) }));
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -1;
    envScene.add(gnd);
    this.envTex = pm.fromScene(envScene, 0.03).texture;
    scene.environment = this.envTex;
    pm.dispose();

    this.dynamicLights = [];
  }

  /** 根据地图标记创建点光源/聚光灯（画质低时只保留关键光源） */
  addMapLights(lights) {
    const keep = (l) => {
      if (this.quality !== 'low') return true;
      return l.core || l.heli || l.type === 'spot';
    };
    for (const l of lights) {
      if (!keep(l)) continue;
      if (l.type === 'point') {
        const p = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
        p.position.set(l.x, l.y, l.z);
        this.scene.add(p);
        if (l.core) this.coreLight = p;
        if (l.heli) this.heliLight = p;
        this.dynamicLights.push(p);
      } else {
        const s = new THREE.SpotLight(l.color, l.intensity, l.distance, l.angle, 0.55, 2);
        s.position.set(l.x, l.y, l.z);
        s.target.position.set(l.tx, l.ty, l.tz);
        this.scene.add(s, s.target);
        this.dynamicLights.push(s);
      }
    }
  }

  update(dt, time) {
    this.sky.material.uniforms.uTime.value = time;
    if (this.coreLight) this.coreLight.intensity = 170 + Math.sin(time * 2.3) * 25 + Math.sin(time * 13.7) * 8;
  }

  /** 让阴影相机跟随玩家（覆盖地图即可，这里只做轻微居中提升精度） */
  follow(x, z) {
    const cx = Math.max(-20, Math.min(20, x)) * 0.5;
    const cz = Math.max(-20, Math.min(20, z)) * 0.5;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.copy(SUN_DIR).multiplyScalar(90).add(this.sun.target.position);
  }
}
