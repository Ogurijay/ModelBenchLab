import * as THREE from 'three';

// 8�?Gerstner 波默认参�?
// 每个波的参数: [directionX, directionZ, amplitude, wavelength, speed, Q_steepness]
// Q 值需要满足所有波�?sum(Q * A * k) < 1.0 以防海面自相交产生尖�?
const DEFAULT_WAVES = [
  { dir: new THREE.Vector2(1.0, 0.1).normalize(), amp: 0.6, len: 35.0, speed: 1.6, Q: 0.35 },
  { dir: new THREE.Vector2(0.2, 0.9).normalize(), amp: 0.4, len: 18.0, speed: 2.2, Q: 0.4 },
  { dir: new THREE.Vector2(-0.6, 0.4).normalize(), amp: 0.25, len: 10.0, speed: 2.8, Q: 0.45 },
  { dir: new THREE.Vector2(0.5, -0.5).normalize(), amp: 0.18, len: 7.0, speed: 3.5, Q: 0.5 },
  { dir: new THREE.Vector2(-0.2, -0.9).normalize(), amp: 0.12, len: 4.5, speed: 4.2, Q: 0.5 },
  { dir: new THREE.Vector2(0.8, -0.3).normalize(), amp: 0.08, len: 3.0, speed: 5.0, Q: 0.5 },
  { dir: new THREE.Vector2(-0.7, -0.1).normalize(), amp: 0.05, len: 2.0, speed: 6.0, Q: 0.5 },
  { dir: new THREE.Vector2(0.1, 0.8).normalize(), amp: 0.03, len: 1.2, speed: 7.2, Q: 0.5 }
];

export class Ocean {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.size = options.size || 500;
    this.segments = options.segments || 256;
    
    // 当前海洋物理参数（用于与天气状态插值）
    this.params = {
      waveHeightMultiplier: 1.0,   // 波高倍数
      waveLengthMultiplier: 1.0,   // 波长倍数
      waveSpeedMultiplier: 1.0,    // 波速倍数
      sharpness: 0.4,              // 陡峭度调�?
      deepColor: new THREE.Color('#031020'),  // 深水�?
      shallowColor: new THREE.Color('#0a4454'), // 浅水�?海底散射�?
      foamColor: new THREE.Color('#ffffff'),
      skyReflectColor: new THREE.Color('#102030'), // 天空反射�?
      roughness: 0.15,
      metalness: 0.1
    };

    this.waves = DEFAULT_WAVES.map(w => ({ dir: w.dir.clone(), amp: w.amp, len: w.len, speed: w.speed, Q: w.Q }));
    this.time = 0;

    this.initGeometry();
    this.initMaterial();
    this.initMesh();
  }

  initGeometry() {
    // 采用高精度平面网�?
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    // 旋转让它水平躺下
    this.geometry.rotateX(-Math.PI / 2);
  }

  initMaterial() {
    // 创建自定�?Uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uWaveHeightMultiplier: { value: this.params.waveHeightMultiplier },
      uWaveLengthMultiplier: { value: this.params.waveLengthMultiplier },
      uWaveSpeedMultiplier: { value: this.params.waveSpeedMultiplier },
      uSharpness: { value: this.params.sharpness },
      
      uDeepColor: { value: this.params.deepColor },
      uShallowColor: { value: this.params.shallowColor },
      uFoamColor: { value: this.params.foamColor },
      uSkyReflectColor: { value: this.params.skyReflectColor },
      
      uLightDirection: { value: new THREE.Vector3(10, 20, 10).normalize() },
      uLightColor: { value: new THREE.Color('#ffffff') },
      uAmbientLightColor: { value: new THREE.Color('#050a12') },
      uCameraPosition: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Color('#050508') },
      uFogDensity: { value: 0.015 }
    };

    // 顶点着色器：计算多�?Gerstner 波形偏移与解析法�?
    const vertexShader = `
      uniform float uTime;
      uniform float uWaveHeightMultiplier;
      uniform float uWaveLengthMultiplier;
      uniform float uWaveSpeedMultiplier;
      uniform float uSharpness;
      uniform vec3 uCameraPosition;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFoamFactor;

      // 定义 8 重波结构
      struct Wave {
        vec2 dir;
        float amp;
        float len;
        float speed;
        float Q;
      };

      Wave waves[8];

      void initWaves() {
        // 在着色器内部初始化波浪数据，以获得更高编译期优化
        waves[0] = Wave(vec2(1.0, 0.1), 0.6, 35.0, 1.6, 0.35);
        waves[1] = Wave(vec2(0.2, 0.9), 0.4, 18.0, 2.2, 0.4);
        waves[2] = Wave(vec2(-0.6, 0.4), 0.25, 10.0, 2.8, 0.45);
        waves[3] = Wave(vec2(0.5, -0.5), 0.18, 7.0, 3.5, 0.5);
        waves[4] = Wave(vec2(-0.2, -0.9), 0.12, 4.5, 4.2, 0.5);
        waves[5] = Wave(vec2(0.8, -0.3), 0.08, 3.0, 5.0, 0.5);
        waves[6] = Wave(vec2(-0.7, -0.1), 0.05, 2.0, 6.0, 0.5);
        waves[7] = Wave(vec2(0.1, 0.8), 0.03, 1.2, 7.2, 0.5);
      }

      void main() {
        initWaves();

        vec3 gridPoint = position;
        vec3 displaced = gridPoint;
        
        // 切线与副切线初始化，用于计算解析法线
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);

        float dx = 0.0;
        float dy = 0.0;
        float dz = 0.0;

        float dxdx = 0.0;
        float dxdy = 0.0;
        float dxdz = 0.0;
        float dydy = 0.0;
        float dydz = 0.0;
        float dzdz = 0.0;

        // 叠加 8 重波
        for (int i = 0; i < 8; i++) {
          Wave w = waves[i];
          
          float amp = w.amp * uWaveHeightMultiplier;
          float len = w.len * uWaveLengthMultiplier;
          float speed = w.speed * uWaveSpeedMultiplier;
          
          // 波数 k = 2pi / L
          float k = 6.283185 / len;
          // 角频�?w = sqrt(g * k)
          float omega = speed * k;
          
          // 陡峭度控�?Q
          float Q = w.Q * uSharpness;
          
          // 投影方向 dir
          vec2 d = normalize(w.dir);
          
          // theta = k * (dir . xz) - omega * t
          float dotXZ = dot(d, gridPoint.xz);
          float theta = k * dotXZ - omega * uTime;
          
          float cosTheta = cos(theta);
          float sinTheta = sin(theta);

          // 顶点位移叠加
          // x = x0 + sum(Q * A * dx * cos(theta))
          // z = z0 + sum(Q * A * dz * cos(theta))
          // y = sum(A * sin(theta))
          displaced.x += Q * amp * d.x * cosTheta;
          displaced.z += Q * amp * d.y * cosTheta;
          displaced.y += amp * sinTheta;

          // 导数计算（用于切线与副切线）
          float kA = k * amp;
          float QkA = Q * kA;
          
          dxdx += QkA * d.x * d.x * sinTheta;
          dxdz += QkA * d.x * d.y * sinTheta;
          dzdz += QkA * d.y * d.y * sinTheta;

          dy     += kA * cosTheta;
          dxdy   += kA * d.x * cosTheta;
          dydz   += kA * d.y * cosTheta;
        }

        // 解析计算切线与副切线
        tangent.x = 1.0 - dxdx;
        tangent.y = dxdy;
        tangent.z = -dxdz;

        binormal.x = -dxdz;
        binormal.y = dydz;
        binormal.z = 1.0 - dzdz;

        // 法线为副切线与切线的叉乘
        vec3 normal = normalize(cross(binormal, tangent));
        vNormal = normal;

        // 泡沫度计算：根据波顶高度以及波谷陡度产生的挤压程�?
        // 当顶点被横向挤压剧烈时（即QkA很大），泡沫增加
        float choppiness = (dxdx + dzdz) * 0.8;
        vFoamFactor = clamp((displaced.y * 0.4 + choppiness * 0.6), 0.0, 1.0);

        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    // 片元着色器：菲涅尔、水下散射、高动态高光及动态程序噪声泡�?
    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSkyReflectColor;
      
      uniform vec3 uLightDirection;
      uniform vec3 uLightColor;
      uniform vec3 uAmbientLightColor;
      uniform vec3 uCameraPosition;
      
      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFoamFactor;

      // 简�?3D 噪声函数，用以产生程序化细密海面波纹和白浪泡�?
      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      
      float noise(in vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        float n = p.x + p.y*57.0 + 113.0*p.z;
        return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                       mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                   mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                       mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
      }

      // 分形布朗运动 (FBM) 生成泡沫精细纹路
      float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p = p * 2.02;
        f += 0.2500 * noise(p); p = p * 2.03;
        f += 0.1250 * noise(p); p = p * 2.01;
        return f;
      }

      void main() {
        vec3 normal = normalize(vNormal);
        if (normal.y < 0.0) normal = -normal;
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
        
        // 菲涅尔效应计�?(Fresnel)
        // 视线与法线夹角越小（直视），菲涅尔反射越低，透出水底色；夹角越大（平视），反射天空光越强
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 5.0);
        fresnel = clamp(fresnel, 0.0, 0.9);

        // 半透光海底散射 (Subsurface Scattering)
        // 波峰附近水体较薄且被光照亮，颜色较浅；波谷及暗部水色深沉
        // 光照在法线反向上的投影作为散射强�?
        float sss = max(dot(normal, uLightDirection), 0.0) * 0.35;
        vec3 waterBaseColor = mix(uDeepColor, uShallowColor, vFoamFactor * 0.5 + sss);
        vec3 lightFactor = uLightColor * 0.35 + uAmbientLightColor * 1.5;
        waterBaseColor *= lightFactor;

        // 天空镜面反射
        vec3 reflectionColor = uSkyReflectColor * lightFactor;

        // 混合水体底色与天空反射色
        vec3 finalColor = mix(waterBaseColor, reflectionColor, fresnel);

        // Blinn-Phong 镜面高光 (Specular)
        vec3 halfDir = normalize(uLightDirection + viewDir);
        float specFactor = pow(max(dot(normal, halfDir), 0.0), 120.0);
        vec3 specular = uLightColor * specFactor * 1.5;
        
        // 环境光照
        finalColor += uAmbientLightColor * (1.0 - fresnel * 0.5);
        finalColor += specular;

        // 浪尖程序化白浪泡�?(Foam) 渲染
        // 根据 vFoamFactor (高度和形变系�? 触发泡沫阈�?
        float foamThreshold = 0.45;
        if (vFoamFactor > foamThreshold) {
          // 利用 FBM 噪声在波峰生成细密的网格状白色泡�?
          vec3 foamCoord = vWorldPosition * 0.4 + vec3(0.0, 0.0, uTime * 0.2);
          float n = fbm(foamCoord * 3.0);
          
          // 泡沫边界过渡
          float foamMask = smoothstep(foamThreshold, 0.7, vFoamFactor);
          float foamPattern = smoothstep(0.4, 0.7, n) * foamMask;
          
          finalColor = mix(finalColor, uFoamColor, foamPattern * 0.8);
        }

        // 添加基于距离的指数雾�?(Fog)
        float depth = length(uCameraPosition - vWorldPosition);
        float fogFactor = 1.0 - exp(-depth * uFogDensity);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        finalColor = mix(finalColor, uFogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      wireframe: false,
      side: THREE.DoubleSide
    });
  }

  initMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  // 物理海洋参数缓动修改 API（供天气切换使用�?
  setParams(newParams, duration = 2.0) {
    // 缓动�?main.js �?tick 循环中由过渡器接管，此处更新目标参数
    Object.assign(this.params, newParams);
  }

  update(time, camera) {
    this.time = time;
    
    // 更新 Uniforms
    this.uniforms.uTime.value = time;
    this.uniforms.uWaveHeightMultiplier.value = this.params.waveHeightMultiplier;
    this.uniforms.uWaveLengthMultiplier.value = this.params.waveLengthMultiplier;
    this.uniforms.uWaveSpeedMultiplier.value = this.params.waveSpeedMultiplier;
    this.uniforms.uSharpness.value = this.params.sharpness;

    // 动态插值颜�?
    this.uniforms.uDeepColor.value.copy(this.params.deepColor);
    this.uniforms.uShallowColor.value.copy(this.params.shallowColor);
    this.uniforms.uSkyReflectColor.value.copy(this.params.skyReflectColor);

    if (camera) {
      this.uniforms.uCameraPosition.value.copy(camera.position);
    }
  }

  // ==========================================
  // CPU 物理浮力计算接口
  // ==========================================
  // 给定世界水平坐标 (x, z)，返回精确的海面高度 y 与法向量 normal
  // 由于 Gerstner 波包含水平位移，给定最终位移后坐标 x, z 需要通过数值迭代求出原始点坐标 x0, z0
  getBuoyancyData(x, z, time) {
    // 1. 初始化原始平面坐标猜测�?
    let x0 = x;
    let z0 = z;
    
    const waves = this.waves;
    const heightMult = this.params.waveHeightMultiplier;
    const lengthMult = this.params.waveLengthMultiplier;
    const speedMult = this.params.waveSpeedMultiplier;
    const sharpness = this.params.sharpness;

    // 2. 迭代求解原始坐标 (x0, z0)
    // 通常 3 遍迭代即能达到毫米级收敛精度
    for (let iter = 0; iter < 3; iter++) {
      let dispX = 0;
      let dispZ = 0;

      for (let i = 0; i < 8; i++) {
        const w = waves[i];
        const amp = w.amp * heightMult;
        const len = w.len * lengthMult;
        const speed = w.speed * speedMult;
        const Q = w.Q * sharpness;

        const k = (2 * Math.PI) / len;
        const omega = speed * k;
        const dotXZ = w.dir.x * x0 + w.dir.y * z0;
        const theta = k * dotXZ - omega * time;

        dispX += Q * amp * w.dir.x * Math.cos(theta);
        dispZ += Q * amp * w.dir.y * Math.cos(theta);
      }

      // 根据位移偏差反向修正猜测�?
      x0 = x - dispX;
      z0 = z - dispZ;
    }

    // 3. 计算最终物理坐�?y，并在此坐标求出精确切线与法�?
    let y = 0;
    let tangent = new THREE.Vector3(1, 0, 0);
    let binormal = new THREE.Vector3(0, 0, 1);

    let dxdx = 0, dxdz = 0, dzdz = 0;
    let dy = 0, dxdy = 0, dydz = 0;

    for (let i = 0; i < 8; i++) {
      const w = waves[i];
      const amp = w.amp * heightMult;
      const len = w.len * lengthMult;
      const speed = w.speed * speedMult;
      const Q = w.Q * sharpness;

      const k = (2 * Math.PI) / len;
      const omega = speed * k;
      const dotXZ = w.dir.x * x0 + w.dir.y * z0;
      const theta = k * dotXZ - omega * time;

      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      y += amp * sinTheta;

      const kA = k * amp;
      const QkA = Q * kA;

      dxdx += QkA * w.dir.x * w.dir.x * sinTheta;
      dxdz += QkA * w.dir.x * w.dir.y * sinTheta;
      dzdz += QkA * w.dir.y * w.dir.y * sinTheta;

      dxdy += kA * w.dir.x * cosTheta;
      dydz += kA * w.dir.y * cosTheta;
    }

    // 计算切线与副切线向量
    tangent.set(1.0 - dxdx, dxdy, -dxdz);
    binormal.set(-dxdz, dydz, 1.0 - dzdz);

    // 叉乘求得解析法向�?
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return { y, normal };
  }
}

