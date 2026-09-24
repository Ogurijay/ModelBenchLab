import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildProgram } from "./bowlMath.js";
import { applyLook, clipPlanes, createMaterials } from "./materials.js";
import { buildBowl } from "./buildBowl.js";
import { buildRoof } from "./buildRoof.js";
import { buildFacade } from "./buildFacade.js";
import { buildPitch } from "./buildPitch.js";
import { buildInterior } from "./buildInterior.js";
import { buildSite } from "./buildSite.js";
import { createWalker } from "./walk.js";

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc5d5e4);
scene.fog = new THREE.Fog(0xc5d5e4, 280, 760);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.15, 1600);
camera.position.set(168, 78, 196);
const ortho = new THREE.OrthographicCamera(-200, 200, 140, -140, 0.1, 1600);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 14, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const hemi = new THREE.HemisphereLight(0xd7e6f5, 0x8d7a64, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e8, 2.4);
sun.position.set(90, 140, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 520;
sun.shadow.camera.left = -190;
sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190;
sun.shadow.camera.bottom = -190;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.06;
scene.add(sun);

const clock = new THREE.Clock();
let frames = 0;
let acc = 0;
let activeCam = camera;
let walkMode = false;
let sectionAxis = null;
const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const aspect = w / h;
  const half = ortho.top;
  ortho.left = -half * aspect;
  ortho.right = half * aspect;
  ortho.updateProjectionMatrix();
}
addEventListener("resize", resize);

function boot() {
  const program = buildProgram();
  const mats = createMaterials();
  const bowl = buildBowl(program, mats);
  const roof = buildRoof(program, mats);
  const facade = buildFacade(program, mats);
  const pitch = buildPitch(program, mats);
  const interior = buildInterior(program, mats);
  const site = buildSite(program, mats);

  scene.add(pitch, bowl.group, roof.group, facade, interior.group, site);
  bowl.parts.lower.userData.explode = new THREE.Vector3(0, 0, 0);
  bowl.parts.club.userData.explode = new THREE.Vector3(0, 9, 0);
  bowl.parts.upper.userData.explode = new THREE.Vector3(0, 20, 0);

  const floods = roof.floods.map((f) => {
    const spot = new THREE.SpotLight(0xf4f7ff, 0, 260, 0.55, 0.6, 2);
    spot.position.set(f.x, f.y, f.z);
    spot.target.position.set(0, 0.5, 0);
    scene.add(spot, spot.target);
    return spot;
  });

  const parts = {
    pitch: { label: "场地", obj: pitch },
    lower: { label: "下层看台", obj: bowl.parts.lower },
    club: { label: "俱乐部层", obj: bowl.parts.club },
    upper: { label: "上层看台", obj: bowl.parts.upper },
    roof: { label: "屋盖", obj: roof.group },
    facade: { label: "立面与基座", obj: facade },
    interior: { label: "内部空间", obj: interior.group },
    site: { label: "周边场地", obj: site },
  };

  const walker = createWalker(camera, canvas, program, interior, site);
  const stats = program.stats;
  document.getElementById("capacity").innerHTML = `${stats.total.toLocaleString("zh-CN")}<small>实际座位</small>`;
  document.getElementById("stats").innerHTML = program.report.map((line) => `<p>${line}</p>`).join("");

  const partRoot = document.getElementById("parts");
  for (const [id, part] of Object.entries(parts)) {
    const row = document.createElement("div");
    row.className = "part";
    row.innerHTML = `<span>${part.label}</span>`;
    const hide = document.createElement("button");
    hide.textContent = "隐藏";
    hide.onclick = () => {
      part.obj.visible = !part.obj.visible;
      hide.textContent = part.obj.visible ? "隐藏" : "显示";
      hide.classList.toggle("on", !part.obj.visible);
    };
    const focus = document.createElement("button");
    focus.textContent = "对焦";
    focus.onclick = () => frame(part.obj);
    row.append(hide, focus);
    partRoot.append(row);
    void id;
  }

  const jumps = [
    ["南广场", 0, 0, 150, Math.PI],
    ["南主楼梯", 0, 2, 78, Math.PI],
    ["下层环廊", -4, program.levels.lowerConcourse, 0, 0],
    ["俱乐部环廊", 70, program.levels.clubConcourse, 0, Math.PI / 2],
    ["上层环廊", 0, program.levels.upperConcourse, 78, Math.PI],
    ["西侧包厢", program.vipRooms[0] ? program.vipRooms[0].xOut + 1.2 : -90, program.vipRooms[0]?.y || 24, 0, Math.PI / 2],
    ["球员通道", program.tunnel.innerX + 8, 0, 0, Math.PI / 2],
    ["主队更衣室", program.tunnel.innerX + 6, 0, program.tunnel.halfW + 4, 0],
    ["新闻发布厅", program.tunnel.innerX + 6, 0, program.tunnel.halfW + 18, 0],
    ["中圈", 0, 0.05, 8, 0],
    ["训练场", 0, 0.05, -240, 0],
  ];
  const jumpRoot = document.getElementById("jumps");
  for (const [name, x, y, z, yaw] of jumps) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => {
      setWalk(true);
      walker.teleport(x, y, z, yaw);
      camera.rotation.set(0, yaw, 0);
    };
    jumpRoot.append(b);
  }

  const views = [
    ["透视", "persp"],
    ["俯视", "top"],
    ["南立面", "south"],
    ["西立面", "west"],
    ["横剖", "cutZ"],
    ["纵剖", "cutX"],
    ["漫游", "walk"],
  ];
  const viewRoot = document.getElementById("views");
  const viewButtons = {};
  for (const [label, id] of views) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => setView(id);
    viewRoot.append(b);
    viewButtons[id] = b;
  }

  const lookRoot = document.getElementById("looks");
  const looks = [
    ["材质", "material"],
    ["白模", "clay"],
    ["X-ray", "xray"],
  ];
  const lookButtons = {};
  for (const [label, id] of looks) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      applyLook(scene, id, mats);
      for (const btn of Object.values(lookButtons)) btn.classList.remove("on");
      b.classList.add("on");
    };
    lookRoot.append(b);
    lookButtons[id] = b;
  }
  lookButtons.material.classList.add("on");

  const hour = document.getElementById("hour");
  const explode = document.getElementById("explode");
  const slice = document.getElementById("slice");
  hour.addEventListener("input", () => applyHour(Number(hour.value) / 100, floods, mats));
  explode.addEventListener("input", () => {
    const k = Number(explode.value) / 100;
    scene.traverse((obj) => {
      const e = obj.userData.explode;
      if (e) obj.position.copy(e).multiplyScalar(k);
    });
  });
  slice.addEventListener("input", () => {
    sectionPlane.constant = Number(slice.value);
  });

  function setWalk(on) {
    walkMode = on;
    document.body.classList.toggle("walk", on);
    controls.enabled = !on;
    document.getElementById("hint").textContent = on
      ? "点击画面锁定鼠标 · WASD 行走 · Shift 加快 · Esc 退出"
      : "拖拽旋转 · 滚轮推进 · 点选部位可隐藏或对焦";
    if (on) {
      activeCam = camera;
      sectionAxis = null;
      clipPlanes.length = 0;
    }
  }

  canvas.addEventListener("click", () => {
    if (walkMode && !walker.controls.isLocked) walker.controls.lock();
  });

  function setView(id) {
    for (const btn of Object.values(viewButtons)) btn.classList.remove("on");
    viewButtons[id].classList.add("on");
    setWalk(id === "walk");
    sectionAxis = null;
    clipPlanes.length = 0;
    activeCam = camera;
    controls.enabled = id !== "walk";
    if (id === "persp" || id === "walk") {
      camera.position.set(168, 78, 196);
      controls.target.set(0, 14, 0);
      controls.update();
      return;
    }
    activeCam = ortho;
    const span = id === "top" ? 230 : 150;
    ortho.top = span;
    ortho.bottom = -span;
    resize();
    ortho.position.set(0, 320, 0);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(0, 0, 0);
    if (id === "south") {
      ortho.up.set(0, 1, 0);
      ortho.position.set(0, 40, 320);
      ortho.lookAt(0, 24, 0);
    } else if (id === "west") {
      ortho.up.set(0, 1, 0);
      ortho.position.set(-320, 40, 0);
      ortho.lookAt(0, 24, 0);
    } else if (id === "cutZ" || id === "cutX") {
      sectionAxis = id;
      sectionPlane.normal.set(id === "cutX" ? 1 : 0, 0, id === "cutZ" ? 1 : 0);
      sectionPlane.constant = Number(slice.value);
      clipPlanes[0] = sectionPlane;
      ortho.up.set(0, 1, 0);
      if (id === "cutZ") {
        ortho.position.set(0, 36, 240);
        ortho.lookAt(0, 20, 0);
      } else {
        ortho.position.set(240, 36, 0);
        ortho.lookAt(0, 20, 0);
      }
    }
  }

  function frame(obj) {
    setView("persp");
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(size * 0.55, size * 0.32, size * 0.55));
  }

  applyHour(0.18, floods, mats);
  setView("persp");
  document.getElementById("boot").hidden = true;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    if (!walkMode) controls.update();
    else walker.update(dt);
    renderer.render(scene, activeCam);
    frames++;
    acc += dt;
    if (acc >= 0.5) {
      document.getElementById("fps").textContent = `${Math.round(frames / acc)} fps`;
      frames = 0;
      acc = 0;
    }
  });
}

function applyHour(t, floods, mats) {
  const day = 1 - smooth(t, 0.42, 0.62);
  const night = smooth(t, 0.48, 0.7);
  const elev = THREE.MathUtils.lerp(1.15, -0.2, smooth(t, 0.35, 0.75));
  sun.position.set(Math.cos(0.8) * 160, elev * 140, Math.sin(0.8) * 160);
  sun.intensity = 0.15 + day * 2.5;
  sun.castShadow = day > 0.2;
  hemi.intensity = 0.28 + day * 0.65;
  hemi.color.set(day > 0.5 ? 0xd7e6f5 : 0x24324c);
  hemi.groundColor.set(day > 0.5 ? 0x8d7a64 : 0x2a211c);
  const sky = new THREE.Color(0xc5d5e4).lerp(new THREE.Color(0x10182a), night);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  renderer.toneMappingExposure = 1.05 - night * 0.08;
  for (const spot of floods) spot.intensity = night * 280000;
  mats.lib.lamp.emissiveIntensity = 0.25 + night * 1.6;
  mats.lib.emitWarm.emissiveIntensity = 0.08 + night * 1.6;
  mats.lib.membrane.emissiveIntensity = night * 0.08;
  mats.lib.glass.emissive = new THREE.Color(0xffc48a);
  mats.lib.glass.emissiveIntensity = night * 0.55;
}

function smooth(t, a, b) {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

requestAnimationFrame(() => {
  document.getElementById("boot-line").textContent = "正在安放看台、屋盖与内部空间…";
  requestAnimationFrame(() => {
    try {
      boot();
    } catch (err) {
      document.getElementById("boot-line").textContent = "模型没有建成：" + err.message;
      console.error(err);
    }
  });
});
