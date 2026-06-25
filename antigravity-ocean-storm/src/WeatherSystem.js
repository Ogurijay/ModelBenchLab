import * as THREE from 'three';

// 4种天气的物理及环境配置参数
const WEATHER_PRESETS = {
  sunny: {
    waveHeightMultiplier: 0.6,
    waveLengthMultiplier: 0.8,
    waveSpeedMultiplier: 0.8,
    sharpness: 0.25,
    deepColor: new THREE.Color('#031424'),
    shallowColor: new THREE.Color('#0c4d5c'),
    skyReflectColor: new THREE.Color('#102235'),
    
    ambientLightColor: new THREE.Color('#050e18'),
    dirLightColor: new THREE.Color('#fffaed'),
    dirLightIntensity: 1.5,
    fogColor: new THREE.Color('#0b1d2d'),
    fogDensity: 0.005,
    
    targetRainCount: 0,
    lightningFreq: 0, // 0表示无闪电
    tornadoStrength: 0.0 // 0.0表示无龙卷风
  },
  cloudy: {
    waveHeightMultiplier: 1.1,
    waveLengthMultiplier: 1.1,
    waveSpeedMultiplier: 1.1,
    sharpness: 0.45,
    deepColor: new THREE.Color('#08101a'),
    shallowColor: new THREE.Color('#152e3b'),
    skyReflectColor: new THREE.Color('#121b25'),
    
    ambientLightColor: new THREE.Color('#03060c'),
    dirLightColor: new THREE.Color('#94a3b8'),
    dirLightIntensity: 0.5,
    fogColor: new THREE.Color('#0e131d'),
    fogDensity: 0.015,
    
    targetRainCount: 0,
    lightningFreq: 0,
    tornadoStrength: 0.0
  },
  rainy: {
    waveHeightMultiplier: 2.2,
    waveLengthMultiplier: 1.5,
    waveSpeedMultiplier: 1.8,
    sharpness: 0.75,
    deepColor: new THREE.Color('#040810'),
    shallowColor: new THREE.Color('#102230'),
    skyReflectColor: new THREE.Color('#090f15'),
    
    ambientLightColor: new THREE.Color('#010205'),
    dirLightColor: new THREE.Color('#384252'),
    dirLightIntensity: 0.2,
    fogColor: new THREE.Color('#080b12'),
    fogDensity: 0.025,
    
    targetRainCount: 3500, // 雨滴粒子数
    lightningFreq: 35,    // 闪电概率
    tornadoStrength: 0.0
  },
  tornado: {
    waveHeightMultiplier: 3.5, // 终极巨浪
    waveLengthMultiplier: 2.2,
    waveSpeedMultiplier: 2.8,
    sharpness: 0.95,          // 极其尖锐的浪头
    deepColor: new THREE.Color('#020408'),
    shallowColor: new THREE.Color('#081824'),
    skyReflectColor: new THREE.Color('#04070a'),
    
    ambientLightColor: new THREE.Color('#010103'),
    dirLightColor: new THREE.Color('#1e293b'),
    dirLightIntensity: 0.1,
    fogColor: new THREE.Color('#05060a'),
    fogDensity: 0.04,         // 漫天大雾
    
    targetRainCount: 5000,
    lightningFreq: 80,
    tornadoStrength: 1.0     // 开启暴风吸力
  }
};

// 辅助函数，用来深拷贝预设并保留 THREE.Color 的实例方法
function clonePreset(preset) {
  return {
    waveHeightMultiplier: preset.waveHeightMultiplier,
    waveLengthMultiplier: preset.waveLengthMultiplier,
    waveSpeedMultiplier: preset.waveSpeedMultiplier,
    sharpness: preset.sharpness,
    deepColor: preset.deepColor.clone(),
    shallowColor: preset.shallowColor.clone(),
    skyReflectColor: preset.skyReflectColor.clone(),
    
    ambientLightColor: preset.ambientLightColor.clone(),
    dirLightColor: preset.dirLightColor.clone(),
    dirLightIntensity: preset.dirLightIntensity,
    fogColor: preset.fogColor.clone(),
    fogDensity: preset.fogDensity,
    
    targetRainCount: preset.targetRainCount,
    lightningFreq: preset.lightningFreq,
    tornadoStrength: preset.tornadoStrength
  };
}

export class WeatherSystem {
  constructor(scene, ocean, lights) {
    this.scene = scene;
    this.ocean = ocean;
    this.lights = lights; // 包含 ambientLight 和 dirLight
    
    this.currentPreset = clonePreset(WEATHER_PRESETS.sunny);
    this.targetPresetName = 'sunny';
    this.lightMultiplier = 1.0;
    this.lightMultiplier = 1.0;
    this.transitionProgress = 1.0; // 0.0 ~ 1.0
    
    // 初始化子天气模块
    this.initRain();
    this.initTornado();
    this.initLightning();
  }

  // ==========================================
  // 雨滴粒子系统初始化
  // ==========================================
  initRain() {
    this.rainCount = 5000;
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(this.rainCount * 3);
    this.rainVelocities = new Float32Array(this.rainCount);

    // 随机散布雨滴
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 300;     // X
      this.rainPositions[i * 3 + 1] = Math.random() * 120;        // Y (天空高度)
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 300; // Z
      this.rainVelocities[i] = 1.5 + Math.random() * 1.5;         // 下落速度系数
    }

    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    // 程序化雨滴材质渲染
    const rainMaterial = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.6,
      transparent: true,
      opacity: 0.0, // 初始为晴天，不可见
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, rainMaterial);
    this.scene.add(this.rainPoints);
  }

  // ==========================================
  // 龙卷风粒子系统初始化
  // ==========================================
  initTornado() {
    this.tornadoParticleCount = 2000;
    this.tornadoGeometry = new THREE.BufferGeometry();
    this.tornadoPositions = new Float32Array(this.tornadoParticleCount * 3);
    
    // 龙卷风粒子特有参数：每个粒子的 [y高度, 初始弧度, 速度系数]
    this.tornadoParams = new Float32Array(this.tornadoParticleCount * 3);

    for (let i = 0; i < this.tornadoParticleCount; i++) {
      const y = Math.random() * 120; // 从0到120高度
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.0;
      
      this.tornadoParams[i * 3] = y;
      this.tornadoParams[i * 3 + 1] = angle;
      this.tornadoParams[i * 3 + 2] = speed;

      // 临时位置占位
      this.tornadoPositions[i * 3] = 0;
      this.tornadoPositions[i * 3 + 1] = y;
      this.tornadoPositions[i * 3 + 2] = 0;
    }

    this.tornadoGeometry.setAttribute('position', new THREE.BufferAttribute(this.tornadoPositions, 3));

    const tornadoMaterial = new THREE.PointsMaterial({
      color: 0x57606a,
      size: 1.8,
      transparent: true,
      opacity: 0.0, // 初始晴天隐藏
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.tornadoPoints = new THREE.Points(this.tornadoGeometry, tornadoMaterial);
    this.scene.add(this.tornadoPoints);

    // 龙卷风在海面的核心位置，会随着时间随机游走
    this.tornadoCenter = new THREE.Vector2(0, 0);
  }

  // ==========================================
  // 雷电闪烁系统初始化
  // ==========================================
  initLightning() {
    this.lightningLines = [];
    this.lightningTimer = 0;
    this.flashTimer = 0; // 控制电闪雷鸣时环境光闪烁
  }

  // 触发一次闪电
  triggerLightning() {
    // 随机起点和终点
    const startX = (Math.random() - 0.5) * 120;
    const startZ = (Math.random() - 0.5) * 120;
    const startPoint = new THREE.Vector3(startX, 100, startZ);
    // 击落至海面
    const endPoint = new THREE.Vector3(
      startX + (Math.random() - 0.5) * 30, 
      0, 
      startZ + (Math.random() - 0.5) * 30
    );

    const segments = [];
    this.generateLightningBranch(startPoint, endPoint, 5, segments);

    // 拼装雷电几何体
    const points = [];
    segments.forEach(seg => {
      points.push(seg.start, seg.end);
    });

    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 1.0
    });

    const line = new THREE.LineSegments(geom, mat);
    this.scene.add(line);
    
    // 闪电加入活动列表，包含生命周期 (ms)
    this.lightningLines.push({
      line: line,
      mat: mat,
      life: 0.15 // 维持 0.15 秒
    });

    // 触发环境光暴闪计数器
    this.flashTimer = 0.2; // 0.2秒的暴闪
  }

  // 递归生成闪电分叉线段 (中点分形算法)
  generateLightningBranch(start, end, depth, segments) {
    if (depth <= 0) {
      segments.push({ start, end });
      return;
    }

    // 求中点并加上随机偏移
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // 主脉络的偏折程度
    const length = start.distanceTo(end);
    const offsetAmount = length * 0.15;
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * offsetAmount,
      (Math.random() - 0.5) * offsetAmount * 0.3, // y偏移略小
      (Math.random() - 0.5) * offsetAmount
    );
    mid.add(offset);

    // 递归分割两半
    this.generateLightningBranch(start, mid, depth - 1, segments);
    this.generateLightningBranch(mid, end, depth - 1, segments);

    // 概率分出支流
    if (Math.random() < 0.3 && depth > 2) {
      const branchEnd = new THREE.Vector3(
        mid.x + (Math.random() - 0.5) * length * 0.4,
        mid.y - Math.random() * length * 0.3,
        mid.z + (Math.random() - 0.5) * length * 0.4
      );
      this.generateLightningBranch(mid, branchEnd, depth - 2, segments);
    }
  }

  // ==========================================
  // 天气切换 API
  // ==========================================
  transitionTo(presetName) {
    if (WEATHER_PRESETS[presetName]) {
      this.targetPresetName = presetName;
      this.transitionProgress = 0.0;
      this.currentPreset = clonePreset(this.currentPreset);
    }
  }

  // ==========================================
  // 逐帧更新逻辑
  // ==========================================
  update(dt, time) {
    // 1. 处理天气参数平滑插值过渡
    if (this.transitionProgress < 1.0) {
      this.transitionProgress += dt * 0.5; // 2秒完成过渡
      if (this.transitionProgress > 1.0) this.transitionProgress = 1.0;

      const pStart = this.currentPreset;
      const pEnd = WEATHER_PRESETS[this.targetPresetName];
      const t = this.transitionProgress;

      // 缓动曲线
      const ease = t * t * (3.0 - 2.0 * t);

      // 海洋参数插值
      this.ocean.params.waveHeightMultiplier = THREE.MathUtils.lerp(pStart.waveHeightMultiplier, pEnd.waveHeightMultiplier, ease);
      this.ocean.params.waveLengthMultiplier = THREE.MathUtils.lerp(pStart.waveLengthMultiplier, pEnd.waveLengthMultiplier, ease);
      this.ocean.params.waveSpeedMultiplier = THREE.MathUtils.lerp(pStart.waveSpeedMultiplier, pEnd.waveSpeedMultiplier, ease);
      this.ocean.params.sharpness = THREE.MathUtils.lerp(pStart.sharpness, pEnd.sharpness, ease);
      this.ocean.params.deepColor.lerpColors(pStart.deepColor, pEnd.deepColor, ease);
      this.ocean.params.shallowColor.lerpColors(pStart.shallowColor, pEnd.shallowColor, ease);
      this.ocean.params.skyReflectColor.lerpColors(pStart.skyReflectColor, pEnd.skyReflectColor, ease);

      // 灯光与雾气插值
      this.currentPreset.ambientLightColor.lerpColors(pStart.ambientLightColor, pEnd.ambientLightColor, ease);
      this.currentPreset.dirLightColor.lerpColors(pStart.dirLightColor, pEnd.dirLightColor, ease);
      this.currentPreset.dirLightIntensity = THREE.MathUtils.lerp(pStart.dirLightIntensity, pEnd.dirLightIntensity, ease);
      this.currentPreset.fogColor.lerpColors(pStart.fogColor, pEnd.fogColor, ease);
      this.currentPreset.fogDensity = THREE.MathUtils.lerp(pStart.fogDensity, pEnd.fogDensity, ease);
      
      // 天气特效插值
      this.currentPreset.targetRainCount = THREE.MathUtils.lerp(pStart.targetRainCount, pEnd.targetRainCount, ease);
      this.currentPreset.lightningFreq = THREE.MathUtils.lerp(pStart.lightningFreq, pEnd.lightningFreq, ease);
      this.currentPreset.tornadoStrength = THREE.MathUtils.lerp(pStart.tornadoStrength, pEnd.tornadoStrength, ease);

      // 在过渡结束时，固化预设
      if (this.transitionProgress === 1.0) {
        this.currentPreset = clonePreset(pEnd);
      }
    }

    // 2. 将环境插值结果应用到场景
    this.lights.ambient.color.copy(this.currentPreset.ambientLightColor).multiplyScalar(this.lightMultiplier);
    this.lights.directional.color.copy(this.currentPreset.dirLightColor);
    this.lights.directional.intensity = this.currentPreset.dirLightIntensity * this.lightMultiplier;
    
    // 更新雾效
    this.scene.fog.color.copy(this.currentPreset.fogColor);
    this.scene.fog.density = this.currentPreset.fogDensity;

    // 3. 渲染更新雨水系统
    this.updateRain(dt);

    // 4. 渲染更新龙卷风系统
    this.updateTornado(dt, time);

    // 5. 渲染更新闪电与暴闪
    this.updateLightning(dt);
  }

  updateRain(dt) {
    const rainPositions = this.rainGeometry.attributes.position.array;
    const count = this.rainCount;
    
    // 雨量平滑控制材质的透明度
    const rainOpacity = this.currentPreset.targetRainCount / 5000;
    this.rainPoints.material.opacity = THREE.MathUtils.lerp(this.rainPoints.material.opacity, rainOpacity * 0.7, 0.05);

    // 如果处于晴天状态，且透明度几乎为0，跳过顶点位置计算以节省CPU
    if (this.rainPoints.material.opacity < 0.01) {
      this.rainPoints.visible = false;
      return;
    }
    this.rainPoints.visible = true;

    // 根据风向产生横向漂移
    // 龙卷风模式下风力特别大
    const windX = this.targetPresetName === 'tornado' ? -25.0 : -10.0;
    const rainSpeed = 70.0; // 下落基础速度

    for (let i = 0; i < count; i++) {
      const vMult = this.rainVelocities[i];
      // Y 轴下落
      rainPositions[i * 3 + 1] -= rainSpeed * vMult * dt;
      // X 轴随风偏斜
      rainPositions[i * 3] += windX * vMult * dt;

      // 如果落入海平面以下，重置回天空顶部
      if (rainPositions[i * 3 + 1] < 0) {
        rainPositions[i * 3] = (Math.random() - 0.5) * 300;
        rainPositions[i * 3 + 1] = 100 + Math.random() * 30;
        rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 300;
      }
    }
    this.rainGeometry.attributes.position.needsUpdate = true;
  }

  updateTornado(dt, time) {
    const strength = this.currentPreset.tornadoStrength;
    this.tornadoPoints.material.opacity = THREE.MathUtils.lerp(this.tornadoPoints.material.opacity, strength * 0.65, 0.05);

    if (this.tornadoPoints.material.opacity < 0.01) {
      this.tornadoPoints.visible = false;
      return;
    }
    this.tornadoPoints.visible = true;

    // 龙卷风中心位置游走逻辑 (缓慢游走)
    if (this.targetPresetName === 'tornado') {
      this.tornadoCenter.x = Math.sin(time * 0.4) * 20.0;
      this.tornadoCenter.y = Math.cos(time * 0.3) * 20.0;
    } else {
      // 晴天/退散时慢慢收缩回原点
      this.tornadoCenter.lerp(new THREE.Vector2(0, 0), 0.05);
    }

    const pos = this.tornadoGeometry.attributes.position.array;
    const count = this.tornadoParticleCount;

    for (let i = 0; i < count; i++) {
      // 获取当前粒子的高度、弧度、速度系数
      let y = this.tornadoParams[i * 3];
      let angle = this.tornadoParams[i * 3 + 1];
      const speed = this.tornadoParams[i * 3 + 2];

      // 1. 高度上升
      y += speed * 12.0 * dt;
      if (y > 120.0) {
        y = 0; // 从海面重置
        angle = Math.random() * Math.PI * 2;
      }
      this.tornadoParams[i * 3] = y;

      // 2. 角度旋转
      // 越往高处，由于风切变角速度有所不同，叠加高度的影响产生螺线滞后
      angle += speed * 4.0 * dt;
      this.tornadoParams[i * 3 + 1] = angle;

      // 3. 计算半径 (上宽下窄，呈喇叭漏斗状)
      // 海面接触点极窄，云层处极大
      const progress = y / 120.0;
      const radius = 1.5 + Math.pow(progress, 2.0) * 35.0;

      // 4. 空间扭曲 (龙卷风身躯扭动)
      // 正弦扰动随着高度 $y$ 传播
      const twistX = Math.sin(y * 0.06 + time * 2.5) * 6.0 * progress;
      const twistZ = Math.cos(y * 0.04 + time * 2.0) * 6.0 * progress;

      // 5. 写入最终三维位置
      pos[i * 3] = this.tornadoCenter.x + twistX + Math.cos(angle) * radius;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = this.tornadoCenter.y + twistZ + Math.sin(angle) * radius;
    }

    this.tornadoGeometry.attributes.position.needsUpdate = true;
  }

  updateLightning(dt) {
    // 1. 自动触发闪电逻辑
    const freq = this.currentPreset.lightningFreq;
    if (freq > 0) {
      // 基于概率计算，freq 越大，触发率越高
      // dt 通常是 0.016 秒
      if (Math.random() < freq * 0.0003) {
        this.triggerLightning();
      }
    }

    // 2. 渲染队列中的闪电线，并逐渐消亡
    for (let i = this.lightningLines.length - 1; i >= 0; i--) {
      const item = this.lightningLines[i];
      item.life -= dt;
      
      if (item.life <= 0) {
        this.scene.remove(item.line);
        item.line.geometry.dispose();
        item.line.material.dispose();
        this.lightningLines.splice(i, 1);
      } else {
        // 闪电闪烁变淡
        item.mat.opacity = item.life / 0.15;
      }
    }

    // 3. 闪电发生时强光闪烁控制
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      
      // 快速交替模拟电光闪动
      const flash = Math.sin(this.flashTimer * 120.0) > 0.0;
      
      if (flash) {
        // 瞬间强光照亮场景
        this.lights.ambient.color.setRGB(0.7, 0.85, 1.0);
        this.lights.directional.color.setRGB(0.9, 0.95, 1.0);
        this.lights.directional.intensity = 5.0;
        this.scene.fog.color.setRGB(0.5, 0.6, 0.7);
      } else {
        // 恢复原有插值环境
        this.lights.ambient.color.copy(this.currentPreset.ambientLightColor).multiplyScalar(this.lightMultiplier);
        this.lights.directional.color.copy(this.currentPreset.dirLightColor);
        this.lights.directional.intensity = this.currentPreset.dirLightIntensity * this.lightMultiplier;
        this.scene.fog.color.copy(this.currentPreset.fogColor);
      }
    }
  }
}
