import * as THREE from 'three';
import { FIELD_WORLD, CAMERA_ELEVATION_DEG, CAMERA_MARGIN } from '../core/constants.js';

// 固定倾角的正交摄像机：始终把整个 26x26 战场安全地框进画面，
// 与窗口宽高比无关（用"contain"式拟合），同时保留 3D 场景的纵深与光影。
export class CameraRig {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 140);
    const rad = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG);
    this.dir = new THREE.Vector3(0, Math.sin(rad), Math.cos(rad)).normalize();
    this.distance = 46;
    this.target = new THREE.Vector3(0, 0, 0);
    this.basePos = new THREE.Vector3();
    this._recomputeBasePos();
    this.resize(window.innerWidth, window.innerHeight);
  }

  _recomputeBasePos() {
    this.basePos.copy(this.dir).multiplyScalar(this.distance).add(this.target);
  }

  resize(pixelWidth, pixelHeight) {
    const aspect = Math.max(0.05, pixelWidth / Math.max(1, pixelHeight));
    const rad = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG);
    const neededHalfW = (FIELD_WORLD / 2 + 1.5) * CAMERA_MARGIN;
    const neededHalfH = ((FIELD_WORLD * Math.sin(rad)) / 2 + 2.4) * CAMERA_MARGIN;

    let halfW, halfH;
    if (neededHalfW / neededHalfH > aspect) {
      halfW = neededHalfW;
      halfH = halfW / aspect;
    } else {
      halfH = neededHalfH;
      halfW = halfH * aspect;
    }

    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  applyShake(offset) {
    if (!offset) {
      this.camera.position.copy(this.basePos);
      return;
    }
    this.camera.position.set(this.basePos.x + offset.x, this.basePos.y + offset.y, this.basePos.z + offset.z);
  }
}
