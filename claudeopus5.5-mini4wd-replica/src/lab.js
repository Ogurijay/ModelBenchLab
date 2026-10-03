// 建模对照实验室：?lab=<车型>&view=<机位>。白底影棚灯光，与官方商品照同机位渲染，供参考图叠加比对。
// 也用于无头截图：window.__lab.capture(view) 返回 PNG dataURL。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CARS, carById } from './model/cars/index.js';
import { buildCar, setExplode, disposeCar } from './model/car.js';

// 机位：az 自车头向左侧转角（度），el 仰角，dist 距离（mm），fov，目标点 t，roll（度）
export const VIEWS = {
  ref: { az: 41, el: 27, dist: 900, fov: 13.5, t: [-2, 14, 4], roll: 0, size: [900, 640] },   // 官方商品照（左前上方）
  ref2: { az: -38, el: 30, dist: 900, fov: 13.5, t: [0, 12, 0], roll: 0, size: [900, 640] },  // 右前上方
  rear: { az: 145, el: 28, dist: 900, fov: 13.5, t: [0, 14, 0], roll: 0, size: [900, 640] },  // 左后上方
  top: { ortho: true, dir: [0, 1, 0], up: [1, 0, 0], span: 175, size: [900, 640] },
  side: { ortho: true, dir: [0, 0, -1], up: [0, 1, 0], span: 175, t: [0, 20, 0], size: [900, 400] },
  front: { ortho: true, dir: [1, 0, 0], up: [0, 1, 0], span: 120, t: [0, 20, 0], size: [700, 400] },
  back: { ortho: true, dir: [-1, 0, 0], up: [0, 1, 0], span: 120, t: [0, 20, 0], size: [700, 400] },
};

export function startLab(params) {
  const carId = params.get('lab') || CARS[0].id;
  const viewName = params.get('view') || 'ref';
  const bg = params.get('bg') || 'white';
  document.body.classList.add('lab');
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg === 'white' ? 0xffffff : bg === 'gray' ? 0x8a8d92 : 0x1b1d21);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(200, 520, 260); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 10, far: 1500 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.4;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dde3, 0.5));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  ground.visible = !params.has('noground');

  const persp = new THREE.PerspectiveCamera(15, 900 / 640, 5, 20000);
  const ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, -2000, 2000);
  let camera = persp;
  let car = null, currentId = null;
  const controls = new OrbitControls(persp, canvas);
  controls.enabled = params.has('orbit');

  function setCar(id, opts = {}) {
    if (car) { scene.remove(car); disposeCar(car); }
    const def = carById(id);
    car = buildCar(def, { detail: Number(params.get('detail') || 1), ...opts });
    scene.add(car); currentId = id;
    if (params.has('explode')) setExplode(car, Number(params.get('explode')) || 1);
    return car;
  }

  function setView(name, override = {}) {
    const own = car?.userData.def?.refViews?.[name];
    const v = { ...VIEWS[name], ...own, ...override };
    const [w, h] = v.size || [900, 640];
    renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    if (v.ortho) {
      camera = ortho;
      const aspect = w / h, s = v.span / 2;
      Object.assign(ortho, { left: -s * aspect, right: s * aspect, top: s, bottom: -s });
      const t = new THREE.Vector3(...(v.t || [0, 0, 0]));
      ortho.position.copy(t).addScaledVector(new THREE.Vector3(...v.dir), 600);
      ortho.up.set(...v.up); ortho.lookAt(t); ortho.updateProjectionMatrix();
    } else {
      applyCam(v);
    }
    render();
    return v;
  }

  function render() { renderer.render(scene, camera); }

  // 将车身坐标点投影到图像像素
  function project(points) {
    camera.updateMatrixWorld();
    const s = renderer.getSize(new THREE.Vector2());
    return points.map(p => { const v = new THREE.Vector3(...p).project(camera); return [(v.x + 1) / 2 * s.x, (1 - v.y) / 2 * s.y]; });
  }

  // 相机拟合：landmarks=[{p:[x,y,z], img:[u,v]}]；目标点 t 固定，拟合 az/el/dist/roll/fov 与主点偏移 shift，
  // 共 7 个自由度（等价于一般针孔相机），Nelder–Mead 多次重启。
  function fit(landmarks, base = 'ref', { fitFov = true, iters = 1500 } = {}) {
    const v0 = { ...VIEWS[base], shift: VIEWS[base].shift || [0, 0] };
    const keys = ['az', 'el', 'dist', 'roll', 'sx', 'sy'].concat(fitFov ? ['fov'] : []);
    const get = (v, k) => k === 'sx' ? v.shift[0] : k === 'sy' ? v.shift[1] : v[k];
    const pack = v => keys.map(k => get(v, k));
    const unpack = arr => { const v = { ...v0, shift: [...v0.shift] }; keys.forEach((k, i) => { if (k === 'sx') v.shift[0] = arr[i]; else if (k === 'sy') v.shift[1] = arr[i]; else v[k] = arr[i]; }); return v; };
    const err = arr => { const v = unpack(arr); if (v.dist < 60 || v.fov < 3 || v.fov > 80) return 1e12; setViewSilent(v); const pr = project(landmarks.map(l => l.p)); let e = 0; pr.forEach((q, i) => { const w = landmarks[i].w ?? 1; e += w * ((q[0] - landmarks[i].img[0]) ** 2 + (q[1] - landmarks[i].img[1]) ** 2); }); return e; };
    const steps = { az: 5, el: 5, dist: 80, roll: 2, sx: 30, sy: 30, fov: 4 };
    let best = null;
    let start = pack(v0);
    for (let restart = 0; restart < 4; restart++) {
      let simplex = [start];
      keys.forEach((k, i) => { const p = start.slice(); p[i] += steps[k] / (restart + 1); simplex.push(p); });
      let vals = simplex.map(err);
      for (let it = 0; it < iters; it++) {
        const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
        simplex = order.map(i => simplex[i]); vals = order.map(i => vals[i]);
        const n = keys.length, c = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
        const refl = c.map((v, j) => v + (v - simplex[n][j])), fr = err(refl);
        if (fr < vals[0]) { const ex = c.map((v, j) => v + 2 * (v - simplex[n][j])), fe = err(ex); if (fe < fr) { simplex[n] = ex; vals[n] = fe; } else { simplex[n] = refl; vals[n] = fr; } }
        else if (fr < vals[n - 1]) { simplex[n] = refl; vals[n] = fr; }
        else { const ct = c.map((v, j) => v + 0.5 * (simplex[n][j] - v)), fc = err(ct); if (fc < vals[n]) { simplex[n] = ct; vals[n] = fc; } else { for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); vals[i] = err(simplex[i]); } } }
      }
      const i0 = vals.indexOf(Math.min(...vals));
      if (!best || vals[i0] < best.e) best = { e: vals[i0], x: simplex[i0] };
      start = best.x;
    }
    const v = unpack(best.x);
    setViewSilent(v);
    const wsum = landmarks.reduce((s, l) => s + (l.w ?? 1), 0);
    const pr = project(landmarks.map(l => l.p));
    return { view: v, rms: Math.sqrt(best.e / wsum), residuals: pr.map((q, i) => [+(q[0] - landmarks[i].img[0]).toFixed(1), +(q[1] - landmarks[i].img[1]).toFixed(1)]) };
  }
  function applyCam(v) {
    const [w, h] = v.size || [900, 640];
    if (renderer.getSize(new THREE.Vector2()).x !== w || renderer.getSize(new THREE.Vector2()).y !== h) { renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    camera = persp; persp.fov = v.fov; persp.aspect = w / h;
    const az = THREE.MathUtils.degToRad(v.az), el = THREE.MathUtils.degToRad(v.el), t = new THREE.Vector3(...v.t);
    persp.position.set(t.x + v.dist * Math.cos(el) * Math.cos(az), t.y + v.dist * Math.sin(el), t.z - v.dist * Math.cos(el) * Math.sin(az));
    persp.up.set(0, 1, 0); persp.lookAt(t); if (v.roll) persp.rotateZ(THREE.MathUtils.degToRad(v.roll));
    if (v.shift && (v.shift[0] || v.shift[1])) persp.setViewOffset(w, h, v.shift[0], v.shift[1], w, h); else persp.clearViewOffset();
    persp.updateProjectionMatrix(); persp.updateMatrixWorld();
    controls.target.copy(t);
  }
  const setViewSilent = applyCam;

  setCar(carId);
  setView(viewName);
  const loop = () => { if (controls.enabled) { controls.update(); render(); } requestAnimationFrame(loop); };
  if (controls.enabled) loop();

  window.__lab = {
    ready: true, CARS: CARS.map(c => c.id), VIEWS,
    setCar: (id, o) => { setCar(id, o); render(); return true; },
    setView: (n, o) => setView(n, o),
    capture: (n, o) => { if (n) setView(n, o); render(); return canvas.toDataURL('image/png'); },
    explode: t => { setExplode(car, t); render(); },
    project, fit,
    stats: () => { let tris = 0, meshes = 0; car.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { meshes, tris: Math.round(tris) }; },
    get car() { return car; },
  };
}
