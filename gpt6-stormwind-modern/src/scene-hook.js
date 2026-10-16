// 3D场景搭建 skill 的调试钩子：多机位截图、线框、隐藏 UI、悬浮检测都靠它。
// 用法见 SKILL.md「调试钩子与截图」。THREE 由调用方传入，不在这里 import，
// 这样项目用 'three' 还是 'three/webgpu' 都只会有一份实例。

const DEFAULT_UI_SELECTORS = ['.lil-gui', '[data-ui]', '#ui', '.hud', '#hud', '.stats'];

export function installSceneHook({
  THREE,
  renderer,
  scene,
  camera,
  controls = null,
  views = {},
  render = null,
  uiSelectors = DEFAULT_UI_SELECTORS,
  globalName = '__scene',
  target = null, // 传入已有钩子对象（如 window.__bench）时，方法会并进去
}) {
  const doRender = render || (() => renderer.render(scene, camera));
  const initialFov = camera.fov;
  const wireState = new Map(); // material -> 原 wireframe 值
  const hiddenEls = new Map(); // element -> 原 visibility
  let wireOn = false;
  let savedBackground = null;

  const hook = target || {};
  // 并入已有钩子时保留它原来的 ready
  if (!('ready' in hook)) hook.ready = false;
  hook.captureMode = false; // 为 true 时，游戏逻辑应停止驱动相机

  Object.assign(hook, {
    markReady() {
      hook.ready = true;
    },

    listViews() {
      return Object.keys(views);
    },

    setView(name) {
      const v = views[name];
      if (!v) throw new Error(`未定义的机位 "${name}"，可用：${Object.keys(views).join(', ')}`);
      hook.captureMode = true;
      if (typeof v === 'function') {
        v({ camera, controls, THREE });
      } else {
        const t = new THREE.Vector3(...(v.target || [0, 0, 0]));
        camera.position.set(...v.pos);
        if (camera.isPerspectiveCamera) camera.fov = v.fov ?? initialFov;
        if (controls?.target) controls.target.copy(t);
        camera.lookAt(t);
        // A review view must preserve its specified eye height, even when
        // orbit navigation normally clamps the polar angle above the horizon.
      }
      camera.updateProjectionMatrix?.();
      // matrixWorld 由 render 懒更新；单帧取证前必须手动刷新，否则自定义 pass 拿到旧视角
      camera.updateMatrixWorld(true);
    },

    release() {
      hook.captureMode = false;
    },

    setWireframe(on) {
      if (on === wireOn) return;
      wireOn = on;
      if (on) {
        scene.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of [].concat(o.material)) {
            if (m && 'wireframe' in m && !wireState.has(m)) {
              wireState.set(m, m.wireframe);
              m.wireframe = true;
              m.needsUpdate = true;
            }
          }
        });
        savedBackground = scene.background;
        scene.background = new THREE.Color(0x111318);
      } else {
        for (const [m, w] of wireState) {
          m.wireframe = w;
          m.needsUpdate = true;
        }
        wireState.clear();
        scene.background = savedBackground;
      }
    },

    setUI(visible) {
      if (visible) {
        for (const [el, v] of hiddenEls) el.style.visibility = v;
        hiddenEls.clear();
        return;
      }
      for (const el of document.querySelectorAll(uiSelectors.join(','))) {
        if (hiddenEls.has(el)) continue;
        hiddenEls.set(el, el.style.visibility);
        el.style.visibility = 'hidden';
      }
    },

    // 同步渲染一帧：隐藏 tab 里 rAF 会停，截图前必须调用。WebGPU 下可能返回 Promise。
    renderNow() {
      return doRender();
    },

    // 找出悬空的物体：userData.grounded 的物体 vs userData.ground 的地面。
    // 包围盒底面 5 个采样点向下打射线，最小间隙仍大于 tolerance 视为悬空。
    checkGrounding({ tolerance = 0.01, maxInstances = 2000 } = {}) {
      scene.updateMatrixWorld(true);
      const grounds = [];
      const items = [];
      scene.traverse((o) => {
        if (o.userData?.ground) grounds.push(o);
        if (o.userData?.grounded) items.push(o);
      });
      if (!grounds.length) {
        return { checked: 0, floating: [], noGround: [], note: '场景里没有 userData.ground 标记的地面，已跳过' };
      }

      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const origin = new THREE.Vector3();
      const box = new THREE.Box3();
      const floating = [];
      const noGround = [];
      let checked = 0;

      const isInside = (hit, owner) => {
        for (let p = hit; p; p = p.parent) if (p === owner) return true;
        return false;
      };

      const probe = (label, owner) => {
        if (box.isEmpty()) return;
        checked++;
        const { min, max } = box;
        const ix = (max.x - min.x) * 0.1;
        const iz = (max.z - min.z) * 0.1;
        const cx = (min.x + max.x) / 2;
        const cz = (min.z + max.z) / 2;
        const samples = [
          [cx, cz],
          [min.x + ix, min.z + iz],
          [max.x - ix, min.z + iz],
          [min.x + ix, max.z - iz],
          [max.x - ix, max.z - iz],
        ];
        let minGap = Infinity;
        for (const [x, z] of samples) {
          ray.set(origin.set(x, max.y + 0.01, z), down);
          const hit = ray.intersectObjects(grounds, true).find((h) => !isInside(h.object, owner));
          if (hit) minGap = Math.min(minGap, min.y - hit.point.y);
        }
        if (minGap === Infinity) noGround.push(label);
        else if (minGap > tolerance) floating.push({ name: label, gap: +minGap.toFixed(4) });
      };

      const mat = new THREE.Matrix4();
      for (const o of items) {
        const label = o.name || `${o.type}#${o.id}`;
        if (o.isInstancedMesh) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          const n = Math.min(o.count, maxInstances);
          for (let i = 0; i < n; i++) {
            o.getMatrixAt(i, mat);
            box.copy(o.geometry.boundingBox).applyMatrix4(mat.premultiply(o.matrixWorld));
            probe(`${label}[${i}]`, o);
          }
        } else {
          box.setFromObject(o);
          probe(label, o);
        }
      }
      return { checked, tolerance, floating, noGround };
    },

    getInfo() {
      const r = renderer.info?.render ?? {};
      const m = renderer.info?.memory ?? {};
      const size = renderer.getSize?.(new THREE.Vector2());
      return {
        revision: THREE.REVISION,
        renderer: renderer.isWebGPURenderer ? 'WebGPU' : 'WebGL',
        calls: r.calls ?? r.drawCalls,
        triangles: r.triangles,
        geometries: m.geometries,
        textures: m.textures,
        size: size ? [size.x, size.y] : undefined,
        pixelRatio: renderer.getPixelRatio?.(),
      };
    },
  });

  if (!target) window[globalName] = hook;
  return hook;
}
