import * as THREE from 'three';

/**
 * 指针抓取:raycast 命中旗面 → 取最近粒子 → 拖拽期间把该粒子钉在
 * 「过抓取点、垂直于相机视线」的平面与指针射线的交点上,松手释放。
 * 抓取时临时禁用 OrbitControls,避免相机跟着转。
 */
export class DragController {
  constructor({ dom, camera, cloth, controls }) {
    this.dom = dom;
    this.camera = camera;
    this.cloth = cloth;
    this.controls = controls;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.hit = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.dragging = false;

    this._onDown = (e) => this.onDown(e);
    this._onMove = (e) => this.onMove(e);
    this._onUp = () => this.onUp();
    dom.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _setPointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  onDown(e) {
    if (e.button !== 0) return;
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.cloth.mesh, false);
    if (!hits.length) return;
    const hitPoint = hits[0].point;
    const idx = this.cloth.nearestParticle(hitPoint);
    if (idx < 0) return;
    this.dragging = true;
    this.controls.enabled = false;
    this.camera.getWorldDirection(this.camDir);
    this.plane.setFromNormalAndCoplanarPoint(this.camDir, hitPoint);
    this.cloth.startDrag(idx);
    this.cloth.setDragTarget(hitPoint);
    this.dom.style.cursor = 'grabbing';
  }

  onMove(e) {
    if (this.dragging) {
      this._setPointer(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
        this.cloth.setDragTarget(this.hit);
      }
      return;
    }
    // 悬停提示:指到旗面显示可抓取
    if (e.buttons !== 0) return; // 正在旋转/平移相机时不做 raycast
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.cloth.mesh, false);
    this.dom.style.cursor = hits.length ? 'grab' : '';
  }

  onUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this.cloth.endDrag();
    this.controls.enabled = true;
    this.dom.style.cursor = '';
  }
}
