// 三维视图：车库（展示转台、拆解、点选）与赛场（场馆、赛道、赛车、镜头）。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, setExplode, disposeCar } from '../model/car.js';
import { PARTS } from './parts.js';
import { buildTrackMesh, buildVenue, addLights } from './world.js';

const MM = 0.001;

export class View {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.mode = 'garage';
    this.raycaster = new THREE.Raycaster();
    this.buildGarage();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------------- 车库 ----------------
  buildGarage() {
    const s = this.garageScene = new THREE.Scene();
    s.environment = this.envMap; s.environmentIntensity = 0.75;
    s.background = new THREE.Color(0x10141b);
    s.fog = new THREE.Fog(0x10141b, 1.4, 3.2);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(0.5, 1.1, 0.7); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.1, far: 3 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.002;
    const rim = new THREE.DirectionalLight(0x9fc0ff, 1.2); rim.position.set(-0.7, 0.5, -0.6);
    const fill = new THREE.HemisphereLight(0xdfe8ff, 0x1a1e26, 0.55);
    s.add(key, rim, fill);
    // 转台
    const stage = this.stage = new THREE.Group(); s.add(stage);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.175, 0.012, 96), new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.35, metalness: 0.6 }));
    disc.position.y = -0.006; disc.receiveShadow = true; stage.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.0018, 8, 128), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.0005; stage.add(ring);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.0125; floor.receiveShadow = true; s.add(floor);
    const grid = new THREE.PolarGridHelper(1.2, 12, 8, 96, 0x243041, 0x1a222e); grid.position.y = -0.012; s.add(grid);
    this.carHolder = new THREE.Group(); this.carHolder.scale.setScalar(MM); stage.add(this.carHolder);
    this.explodeT = 0; this.explodeTarget = 0;
    this.selectBox = new THREE.Box3Helper(new THREE.Box3(), 0xffb02e); this.selectBox.visible = false; s.add(this.selectBox);
  }

  showGarageCar(def, look) {
    if (this.garageCar) { this.carHolder.remove(this.garageCar); disposeCar(this.garageCar); }
    const car = this.garageCar = buildCar(def, { detail: 1, look });
    this.carHolder.add(car);
    setExplode(car, this.explodeT);
    this.selectedPart = null; this.selectBox.visible = false;
    return car;
  }

  enterGarage() {
    this.mode = 'garage';
    this.scene = this.garageScene;
    this.renderer.toneMappingExposure = 1.05;
    this.controls.enabled = true; this.controls.target.set(0, 0.02, 0);
    this.controls.minDistance = 0.18; this.controls.maxDistance = 1.2; this.controls.maxPolarAngle = Math.PI * 0.49;
    this.camera.fov = 30; this.camera.near = 0.01; this.camera.far = 20; this.camera.updateProjectionMatrix();
    this.camera.position.set(0.32, 0.18, 0.34);
    this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.8;
  }

  setExplodeTarget(on) { this.explodeTarget = on ? 1 : 0; }

  // 零件屏幕坐标（拆解标签）
  partAnchors() {
    if (!this.garageCar) return [];
    const out = [], v = new THREE.Vector3(), box = new THREE.Box3();
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    for (const p of this.garageCar.userData.parts) {
      const id = p.userData.part.id;
      if (/^wheel-(fl|rl)$/.test(id)) continue;      // 左侧车轮标签与右侧重复，省略
      box.setFromObject(p); if (box.isEmpty()) continue;
      box.getCenter(v); v.project(this.camera);
      if (v.z > 1) continue;
      out.push({ id, label: p.userData.part.label, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h });
    }
    return out;
  }

  pick(clientX, clientY) {
    if (!this.garageCar) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.garageCar, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.part) o = o.parent; if (o) return this.selectPart(o.userData.part.id); }
    return this.selectPart(null);
  }

  selectPart(id) {
    const p = id && this.garageCar?.userData.parts.find(x => x.userData.part.id === id);
    this.selectedPart = p || null;
    this.selectBox.visible = !!p;
    if (p) { this.selectBox.box.setFromObject(p); }
    return p ? p.userData.part : null;
  }

  // ---------------- 赛场 ----------------
  buildRace(track, venue, racers, lookOf) {
    this.disposeRace();
    const s = this.raceScene = new THREE.Scene();
    s.background = new THREE.Color(venue.sky); s.environment = this.envMap; s.environmentIntensity = venue.id === 'night' ? 0.35 : 0.6;
    const b = this.bounds = track.bounds();
    s.add(buildVenue(venue, b));
    addLights(s, venue, b);
    s.add(buildTrackMesh(track, venue));
    this.track = track; this.venue = venue;
    this.raceCars = racers.map(r => {
      const holder = new THREE.Group(); holder.scale.setScalar(MM);
      const car = buildCar(r.car, { detail: 0.55, look: lookOf(r) });
      holder.add(car); s.add(holder);
      // 车尾残影（冲刺时）
      return { holder, car, racer: r };
    });
    this.particles = new THREE.Group(); s.add(this.particles);
    this.renderer.toneMappingExposure = venue.exposure;
    this.cameraMode = this.cameraMode || 'follow';
    this.tvIndex = 0;
  }

  disposeRace() {
    if (!this.raceScene) return;
    for (const rc of this.raceCars || []) disposeCar(rc.car);
    this.raceScene.traverse(o => { if (o.isMesh && !o.parent?.userData?.def) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m?.map?.dispose?.(); m?.dispose?.(); } } });
    this.raceScene = null; this.raceCars = [];
  }

  enterRace() {
    this.mode = 'race'; this.scene = this.raceScene;
    this.controls.autoRotate = false;
    this.camera.fov = 45; this.camera.near = 0.01; this.camera.far = 80; this.camera.updateProjectionMatrix();
    const b = this.bounds;
    this.controls.target.set(b.cx, 0, b.cz); this.controls.minDistance = 0.3; this.controls.maxDistance = 25; this.controls.maxPolarAngle = Math.PI * 0.48;
    this.camera.position.set(b.cx + 4, 3.2, b.cz + 5);
    this.setCameraMode(this.cameraMode);
  }

  setCameraMode(m) {
    this.cameraMode = m;
    this.controls.enabled = m === 'orbit';
    if (m === 'top') { const b = this.bounds; this.camera.position.set(b.cx, Math.max(b.x1 - b.x0, b.z1 - b.z0) * 1.15 + 1, b.cz + 0.01); this.camera.lookAt(b.cx, 0, b.cz); }
  }

  // 由模拟状态更新赛车姿态
  syncRace(race, dt) {
    const T = race.track;
    for (const rc of this.raceCars) {
      const r = rc.racer, h = rc.holder;
      if (r.status === 'out' && r.crash) {
        // 冲出赛道：抛物线飞出并翻滚，落地后停住
        const c = r.crash, t = Math.min(1.6, race.time - c.t);
        const fx = Math.cos(c.h), fz = Math.sin(c.h), nx = -Math.sin(c.h), nz = Math.cos(c.h);
        const lat = (c.vlat >= 0 ? 1 : -1) * (0.35 + Math.abs(c.vlat)) * t, fwd = c.v * 0.6 * t;
        const y = Math.max(0.012, c.y + (c.vy + 0.9) * t - 4.9 * t * t);
        h.position.set(c.x + fx * fwd + nx * lat, y, c.z + fz * fwd + nz * lat);
        const spin = Math.min(t, 0.9) * 7;
        h.rotation.set(spin * 0.6, -c.h + spin * 0.4, spin, 'YXZ');
        continue;
      }
      const p = T.pose(r.s, r.lane);
      const y = r.air ? r.air.y : p.y;
      h.position.set(p.x, y + 0.0002, p.z);
      const slope = r.air ? Math.atan2(r.air.vy, Math.max(0.5, r.v)) * 0.6 : Math.atan(T.slope(r.s, r.lane));
      h.rotation.set(0, 0, 0); h.rotation.order = 'YZX';
      h.rotation.y = -p.h; h.rotation.z = slope; h.rotation.x = -(p.bank || 0);
      // 车轮转动（按车辆自身轮径）
      const wheels = rc.car.userData.wheels;
      for (const w of Object.values(wheels)) w.userData.spin.rotation.z = -r.wheelAngle;
    }
  }

  updateRaceCamera(race, dt) {
    const m = this.cameraMode, T = race.track, r = race.player, rc = this.raceCars.find(c => c.racer === r);
    if (!rc) return;
    const target = rc.holder.position;
    if (m === 'follow') {
      const p = T.pose(r.s - 0.26, r.lane), fwd = T.pose(r.s + 0.22, r.lane);
      const want = new THREE.Vector3(p.x, Math.max(p.y, target.y) + 0.095, p.z);
      // 偏向车道外侧一点，看到车侧面
      want.x += -Math.sin(p.h) * 0.035; want.z += Math.cos(p.h) * 0.035;
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 7));
      this.camera.lookAt(fwd.x, Math.max(fwd.y, target.y) + 0.02, fwd.z);
    } else if (m === 'tv') {
      // 场边机位：选离车最近的若干固定点
      const b = this.bounds;
      if (!this.tvSpots) {
        this.tvSpots = [];
        for (let i = 0; i < 10; i++) { const p = T.pose(T.length * i / 10, 0), nx = -Math.sin(p.h), nz = Math.cos(p.h); this.tvSpots.push(new THREE.Vector3(p.x - nx * 0.9, 0.55, p.z - nz * 0.9)); }
      }
      let best = this.tvSpots[0], bd = Infinity;
      for (const sp of this.tvSpots) { const d = sp.distanceToSquared(target); if (d < bd) { bd = d; best = sp; } }
      this.camera.position.lerp(best, 1 - Math.exp(-dt * 2.5));
      this.camera.lookAt(target);
    } else if (m === 'top') {
      const b = this.bounds; this.camera.lookAt(b.cx, 0, b.cz);
    } else {
      this.controls.update();
    }
  }

  render(dt) {
    if (this.mode === 'garage') {
      const k = 1 - Math.exp(-dt * 6);
      const prev = this.explodeT;
      this.explodeT += (this.explodeTarget - this.explodeT) * k;
      if (this.garageCar && Math.abs(prev - this.explodeT) > 1e-4) {
        setExplode(this.garageCar, this.explodeT);
        if (this.selectedPart) this.selectBox.box.setFromObject(this.selectedPart);
      }
      // 拆解时把车整体抬高，避免零件陷进转台
      this.carHolder.position.y = this.explodeT * 0.012;
      this.controls.update();
    }
    if (this.scene) this.renderer.render(this.scene, this.camera);
  }
}

// 缩略图：独立小渲染器
export async function makeThumbnails(defs, lookOf, size = [320, 200]) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(size[0], size[1], false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r); s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 1.4); s.add(key, new THREE.HemisphereLight(0xffffff, 0x334455, 0.6));
  const cam = new THREE.PerspectiveCamera(24, size[0] / size[1], 0.01, 10);
  cam.position.set(0.3, 0.16, 0.3); cam.lookAt(0, 0.012, 0);
  const holder = new THREE.Group(); holder.scale.setScalar(MM); s.add(holder);
  const out = {};
  for (const def of defs) {
    const car = buildCar(def, { detail: 0.5, look: lookOf(def) });
    holder.add(car); r.render(s, cam);
    out[def.id] = canvas.toDataURL('image/png');
    holder.remove(car); disposeCar(car);
    await new Promise(res => setTimeout(res, 0));
  }
  r.dispose(); r.forceContextLoss?.();
  return out;
}

export const partSlotLabel = slot => PARTS[slot]?.label || slot;
