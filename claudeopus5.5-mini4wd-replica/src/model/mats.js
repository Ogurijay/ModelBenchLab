// 共享材质：底盘 ABS、轮胎橡胶、金属件、电池等。按参数缓存，避免重复创建。
import * as THREE from 'three';

const cache = new Map();
const key = o => JSON.stringify(o);

// 普通注塑塑料（底盘、导轮、齿轮）
export function plastic(color, { rough = 0.5, metal = 0.0, clearcoat = 0.0, ccRough = 0.3, name = '' } = {}) {
  const k = key(['p', color, rough, metal, clearcoat, ccRough]);
  if (!cache.has(k)) {
    const m = clearcoat ? new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat, clearcoatRoughness: ccRough })
      : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    m.name = name || 'plastic';
    cache.set(k, m);
  }
  return cache.get(k);
}

// 金属调 ABS（AR 底盘的金属灰、Super-II 银色件）：带少量金属度和细微清漆
export function metalPlastic(color, { rough = 0.42, metal = 0.45 } = {}) {
  return plastic(color, { rough, metal, clearcoat: 0.25, ccRough: 0.35, name: 'metal-abs' });
}

export function metal(color = 0xd4d8dd, { rough = 0.28 } = {}) {
  const k = key(['m', color, rough]);
  if (!cache.has(k)) { const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough }); m.name = 'metal'; cache.set(k, m); }
  return cache.get(k);
}

export function rubber(color = 0x18191b, { rough = 0.82 } = {}) {
  const k = key(['r', color, rough]);
  if (!cache.has(k)) { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); m.name = 'rubber'; cache.set(k, m); }
  return cache.get(k);
}

// 着色亚光（马达贴纸、海绵等）
export function matte(color, rough = 0.8) { return plastic(color, { rough, name: 'matte' }); }

// 自发光（尾灯等，暂未使用）
export function glow(color, intensity = 1) {
  const k = key(['g', color, intensity]);
  if (!cache.has(k)) { const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity }); cache.set(k, m); }
  return cache.get(k);
}

// 透明座舱（多数车型座舱为贴纸，少数为透明件）
export function clear(color = 0x9fb5c8, { opacity = 0.45, rough = 0.05 } = {}) {
  const k = key(['c', color, opacity, rough]);
  if (!cache.has(k)) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, transmission: 0, transparent: true, opacity, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
    cache.set(k, m);
  }
  return cache.get(k);
}

export const PALETTE = {
  arGray: 0x3a3c41,       // AR 底盘：金属灰 ABS
  black: 0x1e1f22,
  tire: 0x1a1b1d,
  silver: 0xb9bec4,
  gunmetal: 0x55585e,
  screw: 0xc9ccd0,
  copper: 0xc07a45,
  brass: 0xc9a24c,
};
