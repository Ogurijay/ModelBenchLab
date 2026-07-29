// GLB 资源加载 / 缓存 / 归一化。
// DSCS 模型体型差异巨大,统一按包围盒高度缩放到角色设计身高,脚底对齐 y=0。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MODELS_BASE } from './config.js';

const loader = new GLTFLoader();
const cache = new Map(); // model id -> Promise<{scene, animations}>

export function loadModel(modelId) {
  if (!cache.has(modelId)) {
    cache.set(modelId, new Promise((resolve, reject) => {
      loader.load(`${MODELS_BASE}${modelId}.glb`,
        (gltf) => {
          // DSCS 导出的材质 metalness 偏高,无 envMap 时会渲成黑块 — 统一压低;
          // 部分材质带 BLEND 透明标志导致整体幽灵化 — 无 alpha 贴图时强制不透明
          gltf.scene.traverse((o) => {
            const m = o.material;
            if (m && 'metalness' in m) {
              m.metalness = Math.min(m.metalness, 0.25);
              m.roughness = Math.max(m.roughness ?? 0.8, 0.55);
              if (m.transparent) {
                m.transparent = false;
                m.opacity = 1;
                m.depthWrite = true;
                if (m.map) m.alphaTest = 0.35; // 保留镂空贴图(睫毛/羽毛边缘)
              }
            }
          });
          resolve({ scene: gltf.scene, animations: gltf.animations });
        },
        undefined, reject);
    }));
  }
  return cache.get(modelId);
}

export async function loadMany(modelIds, onProgress) {
  let done = 0;
  const jobs = modelIds.map((id) => loadModel(id).then((r) => {
    done++; onProgress?.(done / modelIds.length);
    return r;
  }));
  return Promise.all(jobs);
}

// 蒙皮感知包围盒:部分 DSCS 模型顶点在绑定数据里挤在原点、靠骨骼展开,
// 普通 setFromObject 会严重失真,必须逐顶点应用骨骼变换。
const _v = new THREE.Vector3();
function skinnedBox(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1500)); // 降采样,够准且快
      for (let i = 0; i < pos.count; i += step) {
        o.getVertexPosition(i, _v);        // 应用蒙皮(局部空间)
        _v.applyMatrix4(o.matrixWorld);
        box.expandByPoint(_v);
      }
    } else if (o.isMesh) {
      box.expandByObject(o);
    }
  });
  return box;
}

// 实例化一个角色模型:克隆骨骼、摆待机姿态、按身高归一化(脚底对齐 y=0)。
// 返回 { root, mixer, clips: Map<shortName, clip>, baseY, width, height }
export function instantiate(asset, targetHeight) {
  const root = SkeletonUtils.clone(asset.scene);
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map();
  for (const clip of asset.animations) {
    // 'chr050_bn01' -> 'bn01'
    clips.set(clip.name.replace(/^chr\d+_/, ''), clip);
  }

  // 先摆出战斗待机姿态,再测蒙皮包围盒
  const idle = clips.get('bn01') || clips.get('fe01');
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.0001); }
  const box = skinnedBox(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 1e-4);
  root.scale.setScalar(scale);
  root.position.y = -box.min.y * scale; // 脚底抬到 y=0
  const baseY = root.position.y;

  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // 骨骼动画包围盒不准,防止镜头边缘消失
      if (o.material) {
        o.material = o.material.clone(); // 独立材质,进化闪白等特效不串
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    }
  });

  const width = Math.max(size.x, size.z) * scale;
  return { root, mixer, clips, baseY, width, height: targetHeight };
}

// 离屏渲染头像(选人格子 & HUD 用)
let thumbRenderer = null;
export function renderThumbnail(asset, size = 160, bg = '#10245e') {
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(size, size);
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 2, 2.5);
  scene.add(key);

  // 复用战斗同款归一化(身高 1.55、脚底 y=0),构图完全固定,任何模型不跑偏
  const inst = instantiate(asset, 1.55);
  const mixer = inst.mixer;
  const idle = asset.animations.find((c) => /bn01|fe01/.test(c.name));
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.001); } // 待机姿态比 T-pose 好看
  scene.add(inst.root);

  const focus = new THREE.Vector3(0, 0.82, 0);
  const cam = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  cam.position.set(0.7, 1.15, 2.45); // 模型面向 +Z,正对镜头
  cam.lookAt(focus);

  thumbRenderer.setClearColor(new THREE.Color(bg), 1);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL('image/png');

  // 释放克隆体资源(几何/材质共享原资产,不 dispose,只丢引用)
  scene.clear();
  return url;
}
