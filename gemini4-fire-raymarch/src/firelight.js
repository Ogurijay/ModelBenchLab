// 动态火光照明系统 (firelight.js)：
// 双点光源 + 顶部反射补光与体积火焰共享同一套 FBM 呼吸与摇曳信号，
// 实时照亮周围岩石、木柴、铁架铜鼎与砂砾地面，并投射随火舌摇曳的软阴影。

import * as THREE from 'three';
import { evaluateFireFlicker } from './noise.js';

const SPECTRUM_LIGHT_COLORS = [
  { main: 0xff7b29, ember: 0xff420d }, // 0: 标准松木
  { main: 0xff9e44, ember: 0xff5e1a }, // 1: 锻炉炽焰
  { main: 0x38e878, ember: 0x16a055 }, // 2: 铜盐青焰
  { main: 0x7b52ff, ember: 0x4220c8 }, // 3: 幽冥魂火
];

export class FireLightRig {
  constructor(scene) {
    // 主火源点光（位于火焰质心，投射全向立方体阴影）
    this.mainLight = new THREE.PointLight(0xff7b29, 5.2, 13.5, 1.65);
    this.mainLight.position.set(0, 0.62, 0);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.bias = -0.0025;
    this.mainLight.shadow.normalBias = 0.02;
    this.mainLight.shadow.camera.near = 0.16;
    this.mainLight.shadow.camera.far = 11.5;
    this.mainLight.shadow.mapSize.set(1024, 1024);
    scene.add(this.mainLight);

    // 底部炭红余烬补光（近距离照亮木柴内侧、火盆铁骨与内圈石块）
    this.emberLight = new THREE.PointLight(0xff420d, 1.9, 4.6, 2.0);
    this.emberLight.position.set(0, 0.20, 0);
    scene.add(this.emberLight);

    this.flicker = 1.0;
    this.currentSpectrum = -1;
  }

  /** 根据质量档位切换阴影开关与贴图分辨率 */
  setShadowResolution(mapSize) {
    if (mapSize <= 0) {
      this.mainLight.castShadow = false;
      return;
    }
    this.mainLight.castShadow = true;
    if (this.mainLight.shadow.mapSize.x !== mapSize) {
      this.mainLight.shadow.mapSize.set(mapSize, mapSize);
      if (this.mainLight.shadow.map) {
        this.mainLight.shadow.map.dispose();
        this.mainLight.shadow.map = null;
      }
    }
  }

  /** 每帧同步火光亮度波动、风向偏移与光谱色彩 */
  update(time, { intensity, turbulence, wind, stokeBoost = 0, spectrum = 0 }) {
    if (this.currentSpectrum !== spectrum) {
      this.currentSpectrum = spectrum;
      const palette = SPECTRUM_LIGHT_COLORS[spectrum] || SPECTRUM_LIGHT_COLORS[0];
      this.mainLight.color.setHex(palette.main);
      this.emberLight.color.setHex(palette.ember);
    }

    const { flicker, swayX, swayZ } = evaluateFireFlicker(time, turbulence);
    this.flicker = flicker;

    const effIntensity = intensity + stokeBoost * 0.55;

    // 光源位置随湍流微幅摆动并受风力顺风偏斜，令地面石影真实摇曳
    const wx = wind[0] * 0.14;
    const wz = wind[1] * 0.14;
    this.mainLight.position.set(
      swayX * 0.65 + wx,
      0.56 + 0.14 * effIntensity + (flicker - 1.0) * 0.11,
      swayZ * 0.65 + wz
    );

    this.mainLight.intensity = 5.4 * effIntensity * flicker;
    this.emberLight.intensity = 1.95 * effIntensity * (0.68 + 0.32 * flicker);
  }
}
