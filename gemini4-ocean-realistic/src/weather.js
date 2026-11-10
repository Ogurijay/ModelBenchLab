import * as THREE from 'three';

/**
 * 1. 动态斜雨幕系统 (GPU 顶点动画，零每帧 CPU 拷贝开销)
 */
function createRainSystem(count = 3200) {
  const positions = new Float32Array(count * 2 * 3);
  const seeds = new Float32Array(count * 2 * 2);

  for (let i = 0; i < count; i++) {
    const rx = (Math.random() - 0.5) * 140;
    const ry = Math.random() * 65;
    const rz = (Math.random() - 0.5) * 140;
    const speed = 0.82 + Math.random() * 0.45;

    const base = i * 6;
    positions[base + 0] = rx;
    positions[base + 1] = ry;
    positions[base + 2] = rz;

    positions[base + 3] = rx;
    positions[base + 4] = ry;
    positions[base + 5] = rz;

    const sBase = i * 4;
    seeds[sBase + 0] = 0.0;
    seeds[sBase + 1] = speed;
    seeds[sBase + 2] = 1.0;
    seeds[sBase + 3] = speed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 2));

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uWindVec: { value: new THREE.Vector2(4, 2) },
    uIntensity: { value: 0.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec2 uWindVec;
      uniform float uIntensity;
      varying float vAlpha;

      void main() {
        float isTail = aSeed.x;
        float speed = aSeed.y;
        float fallSpeed = 38.0 * speed;

        vec3 p = position;
        p.y = mod(p.y - uTime * fallSpeed, 65.0) - 8.0;
        p.x = mod(p.x - uCamPos.x + uTime * uWindVec.x * 0.55 + 70.0, 140.0) - 70.0 + uCamPos.x;
        p.z = mod(p.z - uCamPos.z + uTime * uWindVec.y * 0.55 + 70.0, 140.0) - 70.0 + uCamPos.z;

        vec3 streak = vec3(-uWindVec.x * 0.085, 2.35 * speed, -uWindVec.y * 0.085);
        vec3 worldPos = p + streak * isTail;

        float dist = length(worldPos.xz - uCamPos.xz);
        float distFade = 1.0 - smoothstep(18.0, 68.0, dist);
        vAlpha = uIntensity * distFade * (isTail > 0.5 ? 0.04 : 0.42);

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(0.76, 0.86, 0.96, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;

  return {
    lines,
    update(time, camera, windSpeed, windDirDeg, intensity) {
      lines.visible = intensity > 0.02;
      if (!lines.visible) return;
      uniforms.uTime.value = time;
      uniforms.uCamPos.value.copy(camera.position);
      const rad = THREE.MathUtils.degToRad(windDirDeg);
      uniforms.uWindVec.value.set(Math.cos(rad) * windSpeed, Math.sin(rad) * windSpeed);
      uniforms.uIntensity.value = intensity;
    }
  };
}

/**
 * 2. 宽体电弧带 3D 分叉闪电系统 (含发光白芯 + 电蓝等离子辉光带)
 */
function createLightningSystem() {
  const maxSegments = 220;
  const positions = new Float32Array(maxSegments * 6 * 3);
  const uvs = new Float32Array(maxSegments * 6 * 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setDrawRange(0, 0);

  const uniforms = {
    uFlash: { value: 0.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFlash;
      varying vec2 vUv;
      void main() {
        if (uFlash < 0.01) discard;
        float distFromCenter = abs(vUv.x - 0.5) * 2.0;
        float core = exp(-distFromCenter * distFromCenter * 18.0);
        float glow = exp(-distFromCenter * 3.2);
        vec3 col = mix(vec3(0.45, 0.72, 1.0), vec3(1.0, 0.98, 1.0), core);
        float alpha = (core * 1.0 + glow * 0.65) * uFlash * vUv.y;
        gl_FragColor = vec4(col * 2.2, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  const boltMesh = new THREE.Mesh(geometry, material);
  boltMesh.frustumCulled = false;
  boltMesh.visible = false;

  const boltLight = new THREE.PointLight(0xbbe0ff, 0, 1200, 1.2);
  boltLight.position.set(0, 140, -110);

  let activeTimer = 0;
  let activeDuration = 0.48;
  let flashIntensity = 0;
  const strikePos = new THREE.Vector3(-12, 150, -95);

  function buildBoltRibbon(startX, startZ) {
    let vertIdx = 0;
    const addRibbonSeg = (ax, ay, az, bx, by, bz, halfWidth, intensity) => {
      if (vertIdx + 6 > maxSegments * 6) return;
      // 横向展开方向兼顾 X 与 Z，确保任意水平角度可见
      const rx = 0.78 * halfWidth;
      const rz = -0.62 * halfWidth;

      const p0 = [ax - rx, ay, az - rz];
      const p1 = [ax + rx, ay, az + rz];
      const p2 = [bx - rx, by, bz - rz];
      const p3 = [bx + rx, by, bz + rz];

      const quadPos = [p0, p2, p1, p1, p2, p3];
      const quadUv = [
        [0, intensity],
        [0, intensity],
        [1, intensity],
        [1, intensity],
        [0, intensity],
        [1, intensity]
      ];

      for (let k = 0; k < 6; k++) {
        const pIdx = (vertIdx + k) * 3;
        positions[pIdx + 0] = quadPos[k][0];
        positions[pIdx + 1] = quadPos[k][1];
        positions[pIdx + 2] = quadPos[k][2];

        const uIdx = (vertIdx + k) * 2;
        uvs[uIdx + 0] = quadUv[k][0];
        uvs[uIdx + 1] = quadUv[k][1];
      }
      vertIdx += 6;
    };

    const steps = 28;
    let cx = startX;
    let cy = 240;
    let cz = startZ;

    for (let i = 0; i < steps; i++) {
      const nextY = 240 * (1 - (i + 1) / steps);
      const nx = cx + (Math.random() - 0.5) * 14;
      const nz = cz + (Math.random() - 0.5) * 14;
      addRibbonSeg(cx, cy, cz, nx, nextY, nz, 2.2, 1.0);

      // 分叉闪电枝条
      if (i > 3 && i < steps - 4 && Math.random() < 0.52) {
        let bx = nx;
        let by = nextY;
        let bz = nz;
        const bDirX = (Math.random() - 0.5) * 16;
        const bDirZ = (Math.random() - 0.5) * 16;
        const branchSteps = 5 + Math.floor(Math.random() * 5);
        for (let b = 0; b < branchSteps; b++) {
          const nbx = bx + bDirX + (Math.random() - 0.5) * 9;
          const nby = Math.max(4, by - (12 + Math.random() * 10));
          const nbz = bz + bDirZ + (Math.random() - 0.5) * 9;
          const branchFade = 1.0 - b / branchSteps;
          addRibbonSeg(bx, by, bz, nbx, nby, nbz, 1.15 * branchFade, 0.78 * branchFade);
          bx = nbx;
          by = nby;
          bz = nbz;
        }
      }

      cx = nx;
      cy = nextY;
      cz = nz;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
    geometry.setDrawRange(0, vertIdx);
  }

  function triggerStrike(customPos = null) {
    // 默认落在主视野正前方至右前方海面区域 (-65..-10, -65..-115)
    const sx = customPos ? customPos.x : -62 + Math.random() * 52;
    const sz = customPos ? customPos.z : -68 - Math.random() * 45;

    strikePos.set(sx, 140, sz);
    boltLight.position.set(sx, 120, sz);
    buildBoltRibbon(sx, sz);

    activeDuration = 0.45 + Math.random() * 0.15;
    activeTimer = activeDuration;
    boltMesh.visible = true;
    flashIntensity = 1.0;
    uniforms.uFlash.value = 1.0;

    return { x: sx, z: sz, distance: Math.hypot(sx, sz) };
  }

  function update(dt) {
    if (activeTimer <= 0) {
      flashIntensity = 0;
      uniforms.uFlash.value = 0;
      boltMesh.visible = false;
      boltLight.intensity = 0;
      return 0;
    }

    activeTimer -= dt;
    const norm = 1.0 - Math.max(0, activeTimer) / activeDuration;
    const pulse1 = Math.exp(-norm * 9.0);
    const pulse2 = Math.exp(-Math.pow((norm - 0.38) * 14.0, 2.0)) * 0.95;
    const jitter = 0.82 + 0.18 * Math.sin(norm * 90.0);
    flashIntensity = Math.min(1.0, (pulse1 + pulse2) * jitter);

    uniforms.uFlash.value = flashIntensity;
    boltLight.intensity = flashIntensity * 220;
    if (activeTimer <= 0) {
      boltMesh.visible = false;
      boltLight.intensity = 0;
      flashIntensity = 0;
      uniforms.uFlash.value = 0;
    }
    return flashIntensity;
  }

  return {
    boltMesh,
    boltLight,
    strikePos,
    triggerStrike,
    update,
    getFlash: () => flashIntensity
  };
}

/**
 * 3. 远海 3D 水龙卷系统 (Waterspout Funnel + 底部吸升海雾粒子环)
 */
function createWaterspoutSystem() {
  const group = new THREE.Group();

  const radialSegs = 44;
  const heightSegs = 64;
  const funnelGeo = new THREE.CylinderGeometry(28, 4.2, 220, radialSegs, heightSegs, true);
  funnelGeo.translate(0, 108, 0);

  const funnelUniforms = {
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uLightningFlash: { value: 0 }
  };

  const funnelMat = new THREE.ShaderMaterial({
    uniforms: funnelUniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      varying float vHeightNorm;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        float h = clamp(position.y / 220.0, 0.0, 1.0);
        vHeightNorm = h;

        float bendFactor = sin(h * 3.14159265) * 11.5;
        vec3 p = position;
        p.x += sin(uTime * 1.45 + h * 4.2) * bendFactor;
        p.z += cos(uTime * 1.15 + h * 3.6) * bendFactor * 0.85;

        float flare = 1.0 + pow(h, 2.8) * 1.15 + exp(-h * 12.0) * 0.72;
        p.x *= flare;
        p.z *= flare;

        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      uniform float uLightningFlash;
      varying vec2 vUv;
      varying float vHeightNorm;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        if (uStrength < 0.01) discard;
        vec2 spiralUV = vec2(vUv.x * 7.0 + vHeightNorm * 6.0 - uTime * 2.6, vHeightNorm * 9.0 - uTime * 1.6);
        float n = noise(spiralUV) * 0.65 + noise(spiralUV * 2.5) * 0.35;

        // 柱体边缘柔和羽化
        float sil = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 0.65);
        float edgeFade = smoothstep(0.0, 0.06, vHeightNorm) * (1.0 - smoothstep(0.82, 1.0, vHeightNorm));
        float alpha = clamp((0.45 + 0.55 * n) * edgeFade * sil * uStrength * 0.92, 0.0, 0.92);

        vec3 baseCol = mix(vec3(0.46, 0.56, 0.64), vec3(0.12, 0.17, 0.24), vHeightNorm);
        baseCol = mix(vec3(0.78, 0.88, 0.94), baseCol, smoothstep(0.0, 0.22, vHeightNorm));
        baseCol += vec3(0.55, 0.78, 1.0) * uLightningFlash * 0.75;

        gl_FragColor = vec4(baseCol, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const funnelMesh = new THREE.Mesh(funnelGeo, funnelMat);
  group.add(funnelMesh);

  // 底部旋转水雾喷流粒子环
  const sprayCount = 480;
  const sprayPos = new Float32Array(sprayCount * 3);
  const sprayData = [];
  for (let i = 0; i < sprayCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 20;
    const height = Math.random() * 34;
    const speed = 3.5 + Math.random() * 3.8;
    sprayData.push({ angle, radius, height, speed });
    sprayPos[i * 3 + 0] = Math.cos(angle) * radius;
    sprayPos[i * 3 + 1] = height;
    sprayPos[i * 3 + 2] = Math.sin(angle) * radius;
  }

  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const sprayUniforms = {
    uOpacity: { value: 0.55 }
  };
  const sprayMat = new THREE.ShaderMaterial({
    uniforms: sprayUniforms,
    vertexShader: /* glsl */ `
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(240.0 / max(-mvPosition.z, 1.0), 2.5, 16.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (d > 1.0) discard;
        float soft = pow(1.0 - d, 2.2);
        gl_FragColor = vec4(0.82, 0.91, 0.98, soft * uOpacity * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
  group.add(sprayPoints);

  const state = {
    x: -22,
    z: -92,
    radius: 22,
    strength: 0
  };

  group.visible = false;

  return {
    group,
    state,
    setImmediate(enabled) {
      state.strength = enabled ? 1.0 : 0.0;
      group.visible = state.strength > 0.01;
    },
    update(dt, time, enabled, lightningFlash) {
      const targetStrength = enabled ? 1.0 : 0.0;
      state.strength += (targetStrength - state.strength) * Math.min(1.0, Math.max(dt * 4.5, 0.08));

      group.visible = state.strength > 0.01;
      if (!group.visible) return;

      // 位于右前方海面视野内巡游，构图上与左侧灯塔岛平衡
      state.x = -22 + Math.sin(time * 0.22) * 12;
      state.z = -92 + Math.cos(time * 0.16) * 10;
      group.position.set(state.x, -1.5, state.z);

      funnelUniforms.uTime.value = time;
      funnelUniforms.uStrength.value = state.strength;
      funnelUniforms.uLightningFlash.value = lightningFlash || 0;

      const posArr = sprayGeo.attributes.position.array;
      for (let i = 0; i < sprayCount; i++) {
        const d = sprayData[i];
        d.angle += dt * d.speed;
        d.height += dt * 15.0;
        if (d.height > 34) d.height -= 34;
        const r = d.radius * (0.55 + 0.65 * (d.height / 34));
        posArr[i * 3 + 0] = Math.cos(d.angle) * r;
        posArr[i * 3 + 1] = d.height;
        posArr[i * 3 + 2] = Math.sin(d.angle) * r;
      }
      sprayGeo.attributes.position.needsUpdate = true;
      sprayUniforms.uOpacity.value = 0.65 * state.strength;
    }
  };
}

/**
 * 综合天气与极端风暴管理器
 */
export function createWeatherManager(scene, onThunderCallback) {
  const rain = createRainSystem(3200);
  const lightning = createLightningSystem();
  const waterspout = createWaterspoutSystem();

  scene.add(rain.lines);
  scene.add(lightning.boltMesh);
  scene.add(lightning.boltLight);
  scene.add(waterspout.group);

  let nextAutoBoltTimer = 4.2;

  function triggerLightning(customPos = null) {
    const info = lightning.triggerStrike(customPos);
    if (onThunderCallback) {
      onThunderCallback(info);
    }
    return info;
  }

  function update(dt, time, camera, params) {
    rain.update(time, camera, params.windSpeed, params.windDirDeg, params.rainIntensity);

    if (params.lightningAuto) {
      nextAutoBoltTimer -= dt;
      if (nextAutoBoltTimer <= 0) {
        triggerLightning();
        const baseInterval = Math.max(2.0, params.lightningInterval || 5.0);
        nextAutoBoltTimer = baseInterval * (0.55 + Math.random() * 0.85);
      }
    }

    const flash = lightning.update(dt);
    params.lightningFlash = flash;

    waterspout.update(dt, time, Boolean(params.waterspout), flash);

    return {
      flash,
      lightningPos: lightning.strikePos,
      tornadoState: waterspout.state
    };
  }

  return {
    rain,
    lightning,
    waterspout,
    triggerLightning,
    update
  };
}
