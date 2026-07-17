// 世界构建:把关卡数据的轴对齐盒变成网格,附灯光/招牌/顶灯
import * as THREE from 'three';
import { signTexture } from './textures.js';

// 按盒尺寸设置贴图平铺密度(每 2m 一格)
function materialFor(base, size) {
  if (!base.map) return base;
  const m = base.clone();
  m.map = base.map.clone();
  const dims = [...size].sort((a, b) => b - a);
  m.map.repeat.set(Math.max(0.5, dims[0] / 2), Math.max(0.5, dims[1] / 2));
  m.map.needsUpdate = true;
  return m;
}

export function buildChamber(level, scene, mats) {
  const group = new THREE.Group();

  for (const box of level.boxes) {
    const size = [
      box.max[0] - box.min[0],
      box.max[1] - box.min[1],
      box.max[2] - box.min[2],
    ];
    const base = mats[box.mat] || mats.dark;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      materialFor(base, size),
    );
    mesh.position.set(
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    );
    group.add(mesh);
  }

  // 灯光:环境 + 半球 + 数据点光,近顶灯位放发光灯板
  group.add(new THREE.AmbientLight(0xffffff, 0.5));
  group.add(new THREE.HemisphereLight(0xdfe8ee, 0x2a2d2f, 0.55));
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf2f6f5, emissive: 0xf0f5f2, emissiveIntensity: 1.6, roughness: 0.6,
  });
  for (const [x, y, z, intensity] of level.lights) {
    const pl = new THREE.PointLight(0xf5f8f2, intensity ?? 1.1, 24, 1.6);
    pl.position.set(x, y, z);
    group.add(pl);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), lampMat);
    lamp.position.set(x, y + 0.28, z);
    group.add(lamp);
  }

  // 测试室编号招牌
  if (level.sign) {
    const t = signTexture(level.sign.num, 5, level.name);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: t }),
    );
    sign.position.fromArray(level.sign.pos);
    sign.rotation.y = level.sign.rotY;
    group.add(sign);
  }

  scene.add(group);
  return group;
}

// 递归释放一个组的几何/材质/贴图
export function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) {
      for (const mm of Array.isArray(m) ? m : [m]) {
        if (mm.map) mm.map.dispose();
        mm.dispose();
      }
    }
  });
  root.parent?.remove(root);
}
