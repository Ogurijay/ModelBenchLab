// 角色装配:把 Y-up 的 glTF 立进 Z-up 的世界,并把「多大」「正面朝哪」量出来。
//
// UE 侧对应 Tools/import_alex.py 的第 3 步 measure:导入后量网格高度定 MeshUniformScale、
// 量脚尖方向定 MeshYaw,再写回 DefaultGame.ini。浏览器这边没有「导入期」可以落盘,
// 所以两次量测都放在载入完成那一刻现算 —— 换一版 GLB 不必改代码,也就不会有过期的常量。
//
// 这里是渲染侧文件,可以碰 GLTFLoader;仿真层(src/sim/**、core/selftest.js)不许 import 它。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER } from '../sim/protoTypes.js';

/**
 * GLB 地址。用 `import.meta.url` 而不是写死 './models/...':
 * 页面挂在子路径下(`/claudeopus5-protomotion-parkour/`)时它照样对,
 * `vite build` 还会把 .glb 收进产物并换成带 hash 的名字。
 */
export const ALEX_GLB_URL = new URL('../../models/Alex_ProtoMotion.glb', import.meta.url).href;

/** Alex 在源资源里的身高(cm)。同 import_alex.py 的 EXPECTED_HEIGHT_CM。 */
const ALEX_HEIGHT_CM = 188.5;

/**
 * 骨头探针失败时的兜底 meshYaw(度)。
 * import_alex.py 也是先给一个值再让量测覆盖它;这里的 +90 是本 GLB 的实测结果
 * (UE 侧量到 -90,差的 180° 正是 glTF→UE 的左右手翻转,不是谁量错了)。
 */
const FALLBACK_MESH_YAW_DEG = 90;

/**
 * 只信脚尖。拆包数据里 `_L`/`_R` 的命名与视觉左右已经对不上(glTF→UE 的镜像),
 * 所以肩膀连线判不出前后;脚尖减脚踝无论镜像与否都指向前方。两只脚取平均是为了抵掉外八。
 */
const FOOT_BONE_PAIRS = [
  ['Ankle_L', 'Ball_L'],
  ['Ankle_R', 'Ball_R'],
];

/** 量出的朝向离 90° 不超过这么多,就认定是外八残差而吸附到轴上(同 import_alex.py)。 */
const YAW_SNAP_TOLERANCE_DEG = 20;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/**
 * 载入 Alex 并装配好。
 *
 * @param {string} url GLB 地址,缺省用同目录相对解析出的 models/Alex_ProtoMotion.glb
 * @returns {Promise<{
 *   meshRoot: THREE.Group,          // 世界里唯一该被外部移动的节点
 *   skinnedMesh: THREE.SkinnedMesh, // 顶点最多的那片(身体),调试与包围盒以它为准
 *   mixer: THREE.AnimationMixer,
 *   clips: Map<string, THREE.AnimationClip>,
 *   meshYawDeg: number,
 *   bones: Map<string, THREE.Bone>,
 * }>}
 *
 * 调用方需要知道两件事:
 *  - 模型原点在**脚底**(包围盒 min.z ≈ 0),所以 `meshRoot.position` 要放在
 *    胶囊中心 + (0,0,-CapsuleHalfHeight) —— 就是 UE 里网格相对位置 Z = -94 的那条。
 *  - `meshRoot.quaternion` 已被本函数占用(Rz(meshYaw) * Rx(+90°))。要跟角色 yaw 转身,
 *    每帧重算成 `Rz(bodyYaw + meshYaw) * Rx(+90°)`,这也是返回 meshYawDeg 的用途。
 */
export async function loadAlexRig(url = ALEX_GLB_URL) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  const skinnedMeshes = [];
  const bones = new Map();
  model.traverse((obj) => {
    if (obj.isSkinnedMesh) skinnedMeshes.push(obj);
    if (obj.isBone) bones.set(obj.name, obj);
  });
  if (skinnedMeshes.length === 0) {
    throw new Error(`[rig] ${url} 里没有蒙皮网格`);
  }

  const meshRoot = new THREE.Group();
  meshRoot.name = 'AlexMeshRoot';
  meshRoot.add(model);

  // 缩放挂在**内层**节点上,把 meshRoot 的 position/quaternion/scale 整个让给调用方,
  // 免得渲染层某天写一句 meshRoot.scale.set(1,1,1) 就把 Alex 缩回 1.9 cm。
  const bindBox = measureBindBox(skinnedMeshes);
  model.scale.setScalar(measureUniformScale(bindBox) * CHARACTER.MeshUniformScale);

  // 先只上 Rx(+90°) 立成 Z-up,量测就在这个坐标系里做 —— 量出来的角度可以直接当 yaw 补偿用。
  const zUpQuat = new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2);
  meshRoot.quaternion.copy(zUpQuat);
  meshRoot.updateMatrixWorld(true);

  const meshYawDeg = measureMeshYaw(bones, bindBox);

  meshRoot.quaternion
    .setFromAxisAngle(AXIS_Z, THREE.MathUtils.degToRad(meshYawDeg))
    .multiply(zUpQuat);
  meshRoot.updateMatrixWorld(true);

  for (const mesh of skinnedMeshes) prepareSkinnedMesh(mesh);

  // mixer 的根取 gltf.scene:片段的轨道名是节点名,PropertyBinding 从这个子树里找骨头。
  // 挂在 meshRoot 之下不影响解析,因为它只按名字找,不看世界变换。
  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map();
  for (const clip of gltf.animations) clips.set(clip.name, clip);

  // 顶点最多的那片是身体(另两片是头和装备),共用同一副骨架。
  const skinnedMesh = skinnedMeshes.reduce((best, m) =>
    vertexCount(m) > vertexCount(best) ? m : best);

  return { meshRoot, skinnedMesh, mixer, clips, meshYawDeg, bones };
}

function vertexCount(mesh) {
  return mesh.geometry?.getAttribute('position')?.count ?? 0;
}

/** 所有 primitive 的绑定姿势包围盒并集(glTF 局部空间,Y 朝上)。 */
function measureBindBox(skinnedMeshes) {
  const box = new THREE.Box3();
  for (const mesh of skinnedMeshes) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (geo.boundingBox) box.union(geo.boundingBox);
  }
  return box;
}

/**
 * 用身高反推缩放,公式与 import_alex.py 一致(含「差 5% 以内就当成 1」那条)。
 * 本 GLB 是 glTF 标准的米制(实测高 1.8867),世界单位是厘米,所以这里会算出 ≈99.9;
 * 哪天 GLB 改成厘米导出,同一个公式自动变成 1,不必回来改代码。
 */
function measureUniformScale(bindBox) {
  const height = bindBox.getSize(new THREE.Vector3()).y;
  if (!(height > 1e-6)) {
    console.warn('[rig] 网格包围盒退化,缩放保持 1');
    return 1;
  }
  const scale = ALEX_HEIGHT_CM / height;
  return Math.abs(scale - 1) < 0.05 ? 1 : scale;
}

/**
 * 量 meshYaw:把量到的模型正面转到世界 +X 需要的 yaw(度)。
 *
 * 骨头读的是**节点层级**的世界变换,而不是 skeleton.boneInverses 反推的绑定姿势 ——
 * 这个 GLB 的根节点 AlexRoot 带了 180° 的 Y 旋转而 inverseBindMatrices 没算它,
 * 两者差整整 180°。蒙皮跟着骨头走(顶点最终位置 = boneWorld * IBM * p),
 * 所以骨头在哪儿,看到的腿就在哪儿 —— 要量「看起来朝哪」就必须读节点层级这一份。
 *
 * 调用前 meshRoot 必须只带 Rx(+90°) 且位于原点,这样骨头的世界坐标就是 Z-up 局部坐标。
 */
function measureMeshYaw(bones, bindBox) {
  const forward = new THREE.Vector3();
  const ankleWorld = new THREE.Vector3();
  const ballWorld = new THREE.Vector3();
  let samples = 0;

  for (const [ankleName, ballName] of FOOT_BONE_PAIRS) {
    const ankle = bones.get(ankleName);
    const ball = bones.get(ballName);
    if (!ankle || !ball) {
      console.warn(`[rig] 缺骨头 ${ankleName}/${ballName},这只脚不参与量测`);
      continue;
    }
    ankle.getWorldPosition(ankleWorld);
    ball.getWorldPosition(ballWorld);
    forward.add(ballWorld.sub(ankleWorld));
    samples += 1;
  }

  forward.z = 0; // 只要 yaw,脚尖那点抬升不参与
  if (samples === 0 || forward.lengthSq() < 1e-8) {
    console.warn(`[rig] 脚尖探针退化,meshYaw 兜底 ${FALLBACK_MESH_YAW_DEG}°`);
    return FALLBACK_MESH_YAW_DEG;
  }
  forward.divideScalar(samples);

  let forwardYawDeg = THREE.MathUtils.radToDeg(Math.atan2(forward.y, forward.x));
  const snapped = Math.round(forwardYawDeg / 90) * 90;
  const residual = Math.abs((((forwardYawDeg - snapped) + 180) % 360) - 180);
  if (residual <= YAW_SNAP_TOLERANCE_DEG) {
    // 这套骨架是轴对齐做的,差几度是残留的外八而不是真的斜着站。
    forwardYawDeg = snapped;
  } else {
    console.warn(`[rig] 正面 ${forwardYawDeg.toFixed(1)}° 离轴 ${residual.toFixed(1)}°,不吸附`);
  }

  // 侧影交叉检查:人横向比纵向宽得多,所以正面必须落在水平方向较窄的那一轴上。
  // bindBox 在 glTF 空间,Rx(+90°) 之后 glTF 的 Z 变成世界 Y,X 不动。
  const size = bindBox.getSize(new THREE.Vector3());
  const forwardIsY = Math.abs(Math.sin(THREE.MathUtils.degToRad(forwardYawDeg))) > 0.5;
  const narrowIsY = size.z < size.x;
  if (forwardIsY !== narrowIsY) {
    console.warn(
      `[rig] 正面 ${forwardYawDeg.toFixed(0)}° 与侧影 ${(size.x).toFixed(2)}×${(size.z).toFixed(2)} 不符`,
    );
  }

  return -forwardYawDeg;
}

/** 蒙皮网格的例行修正:阴影、剔除、双面、贴图色彩空间。 */
function prepareSkinnedMesh(mesh) {
  mesh.castShadow = true;
  // 绑定姿势的包围球盖不住动画里甩出去的四肢,开剔除会在极端姿势下整片闪掉。
  mesh.frustumCulled = false;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of materials) {
    if (!mat) continue;
    // GLB 里这些材质是 doubleSided。双面在阴影贴图上会自己咬出条纹,而且白算一倍三角形;
    // 角色是闭合实体,关掉没有损失。
    mat.side = THREE.FrontSide;
    // 基础色是 sRGB 编码的,法线/粗糙度是线性数据 —— 只能动前者。
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    mat.needsUpdate = true;
  }
}
