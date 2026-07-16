// 动态火光:主点光(火核,cube shadow 投出摇曳影子)+ 上方副光(照亮烟底与壶底)。
// 闪烁曲线由 CPU FBM 生成,同一 flicker 值也喂给体积 shader 与柴堆炭红,
// 保证"光—焰—炭"三者呼吸同步(要求③:照亮周围实体,亮度随燃烧自然波动)。

import * as THREE from 'three';
import { fbm1, noise1 } from './noise.js';

const WARM = new THREE.Color('#ff8f3a');
const HOT = new THREE.Color('#ffc36b');

export class FireLight {
  constructor(scene) {
    this.main = new THREE.PointLight(0xff9440, 40, 0, 2);
    this.main.position.set(0, 0.55, 0);
    this.main.castShadow = true;
    this.main.shadow.mapSize.set(1024, 1024);
    this.main.shadow.camera.near = 0.12;
    this.main.shadow.camera.far = 14;
    this.main.shadow.bias = -0.012;
    scene.add(this.main);

    this.top = new THREE.PointLight(0xff7a28, 7, 0, 2);
    this.top.position.set(0, 1.55, 0);
    scene.add(this.top);

    this.flicker = 1;
  }

  /** 返回本帧 flicker(0.72–1.16 左右),供体积 shader / 柴堆共用。 */
  update(time, intensity, wind) {
    // 慢呼吸 + 快颤动两层噪声
    const slow = fbm1(time * 2.3);
    const fast = noise1(time * 11.7 + 40);
    const f = 0.72 + 0.36 * slow + 0.08 * (fast - 0.5);
    this.flicker = f;

    this.main.intensity = (22 + 34 * intensity) * f;
    this.main.color.lerpColors(WARM, HOT, slow);
    // 光源位置随火核摆动微漂(影子随之晃动),并被风轻推
    this.main.position.set(
      (noise1(time * 3.1) - 0.5) * 0.14 + wind[0] * 0.18,
      0.5 + 0.28 * intensity + (noise1(time * 2.6 + 7) - 0.5) * 0.1,
      (noise1(time * 3.4 + 13) - 0.5) * 0.14 + wind[1] * 0.18,
    );

    this.top.intensity = (4 + 6 * intensity) * f;
    this.top.position.set(wind[0] * 0.8, 1.3 + 0.5 * intensity, wind[1] * 0.8);
  }

  /** 质量档:0 = 关阴影,否则为 shadow map 边长。 */
  setShadow(size) {
    const on = size > 0;
    if (this.main.castShadow !== on) this.main.castShadow = on;
    if (on && this.main.shadow.mapSize.x !== size) {
      this.main.shadow.mapSize.set(size, size);
      if (this.main.shadow.map) {
        this.main.shadow.map.dispose();
        this.main.shadow.map = null;
      }
    }
  }
}
