// 天气系统:6 种预设(晴/多云/雾/雨/雷暴/雪),所有参数指数平滑过渡;
// 驱动全局积雪/风 uniform、雾密度、云层实例(位移雕刻的体积云团)。
import * as THREE from 'three';
import { makeNoise3D } from '../core/noise.js';
import { globalUniforms } from '../core/shaderpatch.js';

export const WEATHERS = {
  '晴': { cloud: 0.12, cloudDark: 0.6, fog: 0.00055, sunDim: 1.0, rain: 0, snow: 0, wind: 4, wet: 0, snowCov: 0, bolt: 0, haze: 0.25 },
  '多云': { cloud: 0.55, cloudDark: 0.5, fog: 0.0009, sunDim: 0.72, rain: 0, snow: 0, wind: 7, wet: 0, snowCov: 0, bolt: 0, haze: 0.42 },
  '雾': { cloud: 0.7, cloudDark: 0.55, fog: 0.0044, sunDim: 0.5, rain: 0, snow: 0, wind: 2, wet: 0.15, snowCov: 0, bolt: 0, haze: 1.0 },
  '雨': { cloud: 0.82, cloudDark: 0.3, fog: 0.0017, sunDim: 0.4, rain: 0.75, snow: 0, wind: 10, wet: 1, snowCov: 0, bolt: 0, haze: 0.8 },
  '雷暴': { cloud: 0.97, cloudDark: 0.11, fog: 0.0021, sunDim: 0.2, rain: 1, snow: 0, wind: 17, wet: 1, snowCov: 0, bolt: 1, haze: 0.85 },
  '雪': { cloud: 0.75, cloudDark: 0.62, fog: 0.0024, sunDim: 0.55, rain: 0, snow: 0.85, wind: 6, wet: 0.2, snowCov: 1, bolt: 0, haze: 0.9 },
};

// 各参数的过渡时间常数(秒):积雪慢积慢融,湿度居中,其余较快
const TAU = { snowCov: 6, wet: 4, fog: 3, default: 2.2 };

function makeCloudGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const n3 = makeNoise3D(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    v.multiplyScalar(1 + (n3(v.x * 1.6, v.y * 1.6, v.z * 1.6) - 0.5) * 0.5);
    p.setXYZ(i, v.x, v.y * 0.55, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createWeather(scene, rng) {
  const cur = { ...WEATHERS['晴'] };
  let target = WEATHERS['晴'];
  let name = '晴';

  // ---------- 体积云 ----------
  const MAXP = 168;
  const cloudGeo = makeCloudGeo(9001);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, flatShading: true,
    emissive: 0x8d939c, emissiveIntensity: 0.42,   // 柔化底面阴影
    transparent: true, opacity: 0.92, depthWrite: false,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, MAXP);
  clouds.castShadow = false;
  clouds.renderOrder = 2;
  clouds.frustumCulled = false;
  const puffs = [];
  const cRng = rng.fork('clouds');
  for (let c = 0; c < 22; c++) {
    const cx = cRng.range(-880, 880), cz = cRng.range(-880, 880);
    const cy = cRng.range(390, 470);
    const n = cRng.int(6, 10);
    for (let i = 0; i < n && puffs.length < MAXP; i++) {
      puffs.push({
        x: cx + cRng.range(-26, 26), y: cy + cRng.range(-5, 8), z: cz + cRng.range(-18, 18),
        sx: cRng.range(11, 22), sy: cRng.range(7, 12), sz: cRng.range(10, 19),
        rot: cRng.range(0, Math.PI * 2),
      });
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vC = new THREE.Color();
  scene.add(clouds);

  function lerpTo(dt) {
    for (const k of Object.keys(cur)) {
      const tau = TAU[k] || TAU.default;
      const a = 1 - Math.exp(-dt / tau);
      cur[k] += (target[k] - cur[k]) * a;
    }
  }

  return {
    cur,
    clouds,
    get name() { return name; },
    setWeather(n) {
      if (WEATHERS[n]) { target = WEATHERS[n]; name = n; }
    },
    setWind(v) {
      target = { ...target, wind: v };
    },
    dispose() {
      scene.remove(clouds);
      cloudGeo.dispose();
      cloudMat.dispose();
    },
    update(dt) {
      lerpTo(dt);
      globalUniforms.uSnow.value = cur.snowCov;
      globalUniforms.uWind.value = cur.wind;

      // 云:数量按覆盖率,随风漂移,亮度按云暗度
      const visible = Math.round(THREE.MathUtils.clamp(cur.cloud, 0, 1) * MAXP);
      clouds.count = visible;
      const drift = (2 + cur.wind * 2.2) * dt;
      vC.setScalar(THREE.MathUtils.lerp(1.0, cur.cloudDark * 0.75 + 0.18, THREE.MathUtils.smoothstep(cur.cloud, 0.35, 0.95)));
      for (let i = 0; i < visible; i++) {
        const p = puffs[i];
        p.x += drift;
        if (p.x > 960) p.x -= 1920;
        e.set(0, p.rot, 0);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
        clouds.setMatrixAt(i, m4);
        clouds.setColorAt(i, vC);
      }
      clouds.instanceMatrix.needsUpdate = true;
      if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
      return cur;
    },
  };
}
