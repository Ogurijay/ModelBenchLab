// ============================================================
// lighting.js — 三类光源与昼夜氛围联动
//   ① SpotLight:每件展品一盏(penumbra ≥ 0.5),仅 3 盏雕塑灯投影
//   ② RectAreaLight:两条檐口洗墙补光 + 天窗面光
//   ③ 可开关天光:DirectionalLight(阳光,经天窗分格条投影)
//      + HemisphereLight 环境层次;切换时全场色温 / 曝光 / 环境强度联动过渡
// ============================================================
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

let rectAreaInit = false;

export function setupLighting(scene, renderer, exhibitList, room) {
  if (!rectAreaInit) {
    RectAreaLightUniformsLib.init();
    rectAreaInit = true;
  }

  const counts = { spot: 0, rectArea: 0, directional: 0, hemisphere: 0, shadowCasters: 0 };
  const fixtures = new THREE.Group();
  fixtures.name = 'lightFixtures';
  scene.add(fixtures);

  // ---------- ① 展品射灯 ----------
  const headGeo = new THREE.CylinderGeometry(0.075, 0.05, 0.2, 16).rotateX(Math.PI / 2);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x141418, metalness: 0.7, roughness: 0.45 });
  const spots = [];

  function addSpot({ anchor, target, angle, penumbra, intensity, castShadow }, withFixture = true) {
    const spot = new THREE.SpotLight(0xffd9a8, intensity, 18, angle, penumbra, 1.8);
    spot.position.copy(anchor);
    spot.target.position.copy(target);
    if (castShadow) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0002;
      spot.shadow.normalBias = 0.02;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 18;
      counts.shadowCasters++;
    }
    spot.userData.base = intensity;
    scene.add(spot, spot.target);
    spots.push(spot);
    counts.spot++;
    if (withFixture) {
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.copy(anchor);
      head.lookAt(target);
      const stemH = Math.max(0.08, 5.0 - anchor.y);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, stemH, 8), headMat);
      stem.position.set(anchor.x, anchor.y + stemH / 2, anchor.z);
      fixtures.add(head, stem);
    }
    return spot;
  }

  for (const e of exhibitList) addSpot(e.spot);

  // 入口主题墙洗光(引导动线的第一盏灯)
  addSpot({
    anchor: new THREE.Vector3(-10.4, 4.6, -3.0),
    target: new THREE.Vector3(-13, 2.5, -3.0),
    angle: 0.55, penumbra: 0.7, intensity: 55, castShadow: false,
  });

  // ---------- ② 面光 / 补光(RectArea) ----------
  const coveN = new THREE.RectAreaLight(0xffe2c4, 2.4, 19, 0.55);
  coveN.position.set(0, 4.5, -6.55);
  coveN.lookAt(0, 0.4, -4.0);
  scene.add(coveN);
  const coveS = new THREE.RectAreaLight(0xffe2c4, 2.4, 19, 0.55);
  coveS.position.set(0, 4.5, 6.55);
  coveS.lookAt(0, 0.4, 4.0);
  scene.add(coveS);
  counts.rectArea += 2;

  // 天窗面光(白昼主要环境光,夜晚熄灭)
  const skyRect = new THREE.RectAreaLight(0xdfe9ff, 0, 11.8, 2.8);
  skyRect.position.set(0, 4.92, 0);
  skyRect.lookAt(0, 0, 0);
  scene.add(skyRect);
  counts.rectArea++;

  // ---------- ③ 可开关天光 ----------
  const sun = new THREE.DirectionalLight(0xeaf2ff, 0);
  sun.position.set(5.5, 11.5, 3.2);
  sun.target.position.set(-1.2, 0, -0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 32;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  counts.directional++;
  counts.shadowCasters++;

  const hemi = new THREE.HemisphereLight(0xbfcbdd, 0x2f2a24, 0.2);
  scene.add(hemi);
  counts.hemisphere++;

  // ---------- 昼夜状态机(value: 0 = 夜 · 射灯剧场感,1 = 昼 · 天光通透) ----------
  let value = 1;
  let target = 1;

  function apply(s) {
    sun.intensity = 3.1 * s;
    skyRect.intensity = 4.6 * s;
    hemi.intensity = 0.2 + 0.42 * s;
    hemi.color.setRGB(0.72 + 0.06 * s, 0.76 + 0.05 * s, 0.84 + 0.05 * s);
    scene.environmentIntensity = 0.5 + 0.45 * s;
    renderer.toneMappingExposure = 1.16 - 0.2 * s;
    // 白昼时射灯自动收敛,保持全场曝光统一
    for (const sp of spots) sp.intensity = sp.userData.base * (1 - 0.32 * s);
    // 天穹玻璃:夜晚深蓝黑 → 白昼过曝亮天
    room.skyPanelMat.color.setRGB(0.015 + 1.35 * s, 0.025 + 1.5 * s, 0.06 + 1.85 * s);
  }

  const api = {
    toggle() {
      target = target > 0.5 ? 0 : 1;
      return target === 1;
    },
    setSkylight(on) {
      target = on ? 1 : 0;
      return target === 1;
    },
    isOn() {
      return target === 1;
    },
    getState() {
      return { on: target === 1, value: Math.round(value * 1000) / 1000 };
    },
    getCounts() {
      return { ...counts };
    },
    update(dt) {
      if (Math.abs(target - value) > 1e-4) {
        const step = dt / 1.6; // 1.6s 完成过渡
        value += THREE.MathUtils.clamp(target - value, -step, step);
      } else {
        value = target;
      }
      apply(value * value * (3 - 2 * value)); // smoothstep 缓动
    },
  };

  api.update(0); // 初始化立即应用
  return api;
}
