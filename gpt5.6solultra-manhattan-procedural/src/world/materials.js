import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { clamp01 } from './helpers.js';

const colorOf = (key, fallback) => PALETTE?.[key] ?? fallback;

function makeFacadeTexture(baseHex, accentHex, seed) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const base = new THREE.Color(baseHex);
  const accent = new THREE.Color(accentHex);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const mullion = x % 8 < 2 || y % 10 < 2;
      const lit = !mullion && ((x * 17 + y * 29 + seed * 13) % 19 < 5);
      const variation = 0.78 + (((x * 7 + y * 11 + seed) % 9) / 50);
      const source = lit ? accent : base;
      data[index] = Math.round(source.r * 255 * (lit ? 1 : variation));
      data[index + 1] = Math.round(source.g * 255 * (lit ? 1 : variation));
      data[index + 2] = Math.round(source.b * 255 * (lit ? 1 : variation));
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function enableSnow(material, snowColor = colorOf('snow', 0xeef3f5)) {
  const uniforms = { snow: { value: 0 } };
  const snow = new THREE.Color(snowColor);
  material.userData.snowUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldSnow = uniforms.snow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldSnowNormal;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          vWorldSnowNormal = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        #else
          vWorldSnowNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWorldSnow;
        varying vec3 vWorldSnowNormal;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float upwardSnow = smoothstep(0.48, 0.86, vWorldSnowNormal.y) * uWorldSnow;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${snow.r.toFixed(5)}, ${snow.g.toFixed(5)}, ${snow.b.toFixed(5)}), upwardSnow * 0.92);
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'gpt56-world-snow-v1';
  return material;
}

function facadeMaterial(name, base, lit, seed, metalness, roughness) {
  const texture = makeFacadeTexture(base, lit, seed);
  const material = enableSnow(new THREE.MeshStandardMaterial({
    name,
    color: 0xffffff,
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color(lit).multiplyScalar(0.55),
    emissiveIntensity: 0.18,
    metalness,
    roughness,
  }));
  material.userData.facade = true;
  return material;
}

export function createWorldMaterials() {
  const limestone = facadeMaterial('石灰岩窗格', colorOf('limestone', 0xb5aa92), 0xffd68a, 3, 0.04, 0.72);
  const brick = facadeMaterial('砖墙窗格', colorOf('brick', 0x6d352b), 0xffb65e, 7, 0.02, 0.83);
  const glass = facadeMaterial('玻璃幕墙窗格', colorOf('glass', 0x1b526d), 0x9fdfff, 11, 0.56, 0.2);
  const buildingMaterials = [limestone, brick, glass];

  const roadMaterial = enableSnow(new THREE.MeshStandardMaterial({
    name: '可湿润沥青',
    color: colorOf('asphalt', 0x20252a),
    roughness: 0.88,
    metalness: 0.02,
  }));
  roadMaterial.userData.dryRoughness = 0.88;
  roadMaterial.userData.wetRoughness = 0.16;

  const parkMaterial = enableSnow(new THREE.MeshStandardMaterial({
    name: '中央公园顶点地貌',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  }));
  const rockMaterial = enableSnow(new THREE.MeshStandardMaterial({ color: 0x5e6460, roughness: 0.92, flatShading: true }));
  const bridgeMaterial = enableSnow(new THREE.MeshStandardMaterial({ color: 0x8f8174, roughness: 0.8, metalness: 0.04 }));
  const metalMaterial = enableSnow(new THREE.MeshStandardMaterial({ color: 0x2d3439, roughness: 0.42, metalness: 0.78 }));
  const statueMaterial = enableSnow(new THREE.MeshStandardMaterial({ color: colorOf('copper', 0x60a28b), roughness: 0.7, metalness: 0.3 }));
  const sidewalkMaterial = enableSnow(new THREE.MeshStandardMaterial({ color: 0x999894, roughness: 0.92 }));
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: colorOf('water', 0x286981),
    roughness: 0.18,
    metalness: 0.12,
    transmission: 0.08,
    transparent: true,
    opacity: 0.86,
    depthWrite: true,
  });
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xe9e4cf });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd58b, emissive: 0xffb84a, emissiveIntensity: 0.3 });
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f6f7,
    roughness: 1,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  const snowSurfaces = [roadMaterial, parkMaterial, rockMaterial, bridgeMaterial, metalMaterial, statueMaterial, sidewalkMaterial, ...buildingMaterials];

  function setDaylight(daylight) {
    const day = clamp01(daylight);
    const night = Math.pow(1 - day, 1.35);
    for (const material of buildingMaterials) material.emissiveIntensity = 0.1 + night * 2.25;
    lampMaterial.emissiveIntensity = 0.18 + night * 4.8;
  }

  function setWeatherResponse({ wetness = 0, snow = 0 } = {}) {
    const wet = clamp01(wetness);
    const snowAmount = clamp01(snow);
    roadMaterial.roughness = THREE.MathUtils.lerp(roadMaterial.userData.dryRoughness, roadMaterial.userData.wetRoughness, wet);
    roadMaterial.metalness = THREE.MathUtils.lerp(0.02, 0.2, wet);
    waterMaterial.roughness = THREE.MathUtils.lerp(0.18, 0.36, wet);
    for (const material of snowSurfaces) {
      if (material.userData.snowUniforms) material.userData.snowUniforms.snow.value = snowAmount;
    }
  }

  return {
    roadMaterial,
    buildingMaterials,
    parkMaterial,
    rockMaterial,
    bridgeMaterial,
    metalMaterial,
    statueMaterial,
    sidewalkMaterial,
    waterMaterial,
    lineMaterial,
    lampMaterial,
    cloudMaterial,
    snowSurfaces,
    setDaylight,
    setWeatherResponse,
  };
}
