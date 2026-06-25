import * as THREE from 'three';

/**
 * 创建海面 Shader 材质 (解析法线、菲涅尔反射、太阳镜面高光、次表面散射、高频微波)
 */
export function createOceanMaterial(waves, settings) {
  // 生成多重波的初始 uniform 数组
  const waveDirections = waves.map(w => new THREE.Vector2(w.direction.x, w.direction.y));
  const waveAmplitudes = waves.map(w => w.amplitude);
  const waveLengths = waves.map(w => w.wavelength);
  const waveSpeeds = waves.map(w => w.speed);
  const waveQs = waves.map(w => w.q);

  const material = new THREE.ShaderMaterial({
    transparent: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uChoppiness: { value: settings.choppiness },
      uFoamAmount: { value: settings.foamAmount },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) }, // 动态更新
      uSunColor: { value: new THREE.Color('#fff') },
      uDeepColor: { value: new THREE.Color('#06233c') },
      uShallowColor: { value: new THREE.Color('#127f92') },
      uFoamColor: { value: new THREE.Color('#d7f6ff') },
      
      // 5重波物理数据
      uWaveDirections: { value: waveDirections },
      uWaveAmplitudes: { value: waveAmplitudes },
      uWaveLengths: { value: waveLengths },
      uWaveSpeeds: { value: waveSpeeds },
      uWaveQs: { value: waveQs }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uChoppiness;
      uniform vec2 uWaveDirections[5];
      uniform float uWaveAmplitudes[5];
      uniform float uWaveLengths[5];
      uniform float uWaveSpeeds[5];
      uniform float uWaveQs[5];

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying float vFoamMask;

      const float PI = 3.14159265359;

      void main() {
        vec3 transformed = position;
        
        // 位移累加
        float dx = 0.0;
        float dy = 0.0;
        float dz = 0.0;

        // 偏导数累加项，用于顶点解析求导计算完美法线
        float tx_x = 0.0; // d(dx)/dx
        float tx_y = 0.0; // d(dy)/dx
        float tx_z = 0.0; // d(dz)/dx
        float tz_y = 0.0; // d(dy)/dz
        float tz_z = 0.0; // d(dz)/dz

        for (int i = 0; i < 5; i++) {
          vec2 dir = normalize(uWaveDirections[i]);
          float wavelength = uWaveLengths[i];
          float amplitude = uWaveAmplitudes[i];
          float speed = uWaveSpeeds[i];
          float q = uWaveQs[i] * uChoppiness; // 结合全局陡度

          float k = 2.0 * PI / wavelength;
          
          // dot(position, direction) * k + phase
          float phase = (transformed.x * dir.x + transformed.z * dir.y) * k + uTime * speed;
          
          float cosVal = cos(phase);
          float sinVal = sin(phase);

          // 位移累加
          dx += q * amplitude * dir.x * cosVal;
          dz += q * amplitude * dir.y * cosVal;
          dy += amplitude * sinVal;

          // 解析偏导数项
          float qAk = q * amplitude * k;
          float Ak = amplitude * k;

          tx_x += qAk * dir.x * dir.x * sinVal;
          tx_y += Ak * dir.x * cosVal;
          tx_z += qAk * dir.x * dir.y * sinVal;

          tz_y += Ak * dir.y * cosVal;
          tz_z += qAk * dir.y * dir.y * sinVal;
        }

        // 应用位移
        transformed.x += dx;
        transformed.z += dz;
        transformed.y += dy;

        // 构建切线和副切线
        vec3 tangent = vec3(1.0 - tx_x, tx_y, -tx_z);
        vec3 bitangent = vec3(-tx_z, tz_y, 1.0 - tz_z);

        // 解析求导计算法向量 N = B x T
        vec3 normal = normalize(cross(bitangent, tangent));
        
        // 传递给 Fragment Shader
        vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(modelViewMatrix * vec4(normal, 0.0)).xyz; // 视图空间法线
        
        // 保存至世界空间法线 (用于后续光照)
        vNormal = normal; 
        vWaveHeight = dy;

        // 计算泡沫聚集度 (波脊顶峰处，或者法线倾角剧烈处产生泡沫)
        // dy 越高，且法线偏离垂直方向越多，泡沫越多
        vFoamMask = clamp((dy * 0.45 + (1.0 - normal.y) * 0.85), 0.0, 1.0);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFoamAmount;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying float vFoamMask;

      // 快速三维 Pseudo-Random 噪声，用于合成表面高频微波细节
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      void main() {
        // 归一化基本法线
        vec3 baseNormal = normalize(vNormal);

        // ----------------------------------------------------
        // 高频微波细节 (Micro-Capillary Waves)
        // ----------------------------------------------------
        // 利用两重正弦高频噪声，在片元级别对顶点法线进行扰动
        vec2 uv = vWorldPosition.xz * 1.8;
        float n = noise(uv + uTime * 0.8) * 0.4 + noise(uv * 2.5 - uTime * 1.2) * 0.2;
        vec3 microNormal = vec3(cos(n * 6.28), 12.0, sin(n * 6.28));
        
        // 混合基本法线与微波法线
        vec3 normal = normalize(baseNormal + normalize(microNormal) * 0.14);
        if(normal.y < 0.0) normal = -normal;

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 sunDir = normalize(uSunDirection);

        // ----------------------------------------------------
        // 菲涅尔折射与反射混合 (Fresnel Approximation)
        // ----------------------------------------------------
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.5);
        
        // ----------------------------------------------------
        // 太阳镜面高光 (Specular Highlight) - 双高光模型
        // ----------------------------------------------------
        vec3 halfDir = normalize(sunDir + viewDir);
        float specAngle = max(dot(normal, halfDir), 0.0);
        // 锐利耀眼的主高光
        float spec1 = pow(specAngle, 180.0) * 1.5;
        // 柔和的次高光，营造微波闪烁感
        float spec2 = pow(specAngle, 12.0) * 0.28;
        vec3 specular = (spec1 + spec2) * uSunColor;

        // ----------------------------------------------------
        // 漫反射与水体颜色 (Subsurface Scattering & Water Color)
        // ----------------------------------------------------
        // 根据海浪深度插值：波谷颜色深，波脊颜色浅
        // 范围映射从 [-swellHeight, swellHeight] 映射到 [0, 1]
        float depthFactor = smoothstep(-2.5, 2.5, vWaveHeight);
        vec3 waterBaseColor = mix(uDeepColor, uShallowColor, depthFactor);

        // 次表面散射 (SSS) 模拟：当太阳光照向观察者，且穿透波脊时，水面呈现翠绿/半透光色
        float sssFactor = max(dot(viewDir, -sunDir), 0.0) * pow(depthFactor, 2.0);
        vec3 sssColor = vec3(0.05, 0.72, 0.65) * sssFactor * 0.75 * uSunColor;

        // 漫反射光照项
        float diffuse = max(dot(normal, sunDir), 0.0);
        vec3 diffuseColor = waterBaseColor * (0.35 + diffuse * 0.65);

        // 合并折射（漫反射）与反射（天空色）
        // 假设反射出的天顶天空色近似为浅蓝色
        vec3 reflectSkyColor = mix(vec3(0.42, 0.64, 0.78), uSunColor * 0.85, fresnel);
        vec3 finalColor = mix(diffuseColor + sssColor, reflectSkyColor, fresnel * 0.55);

        // 加上耀眼的高光
        finalColor += specular;

        // ----------------------------------------------------
        // 海浪泡沫混合 (Foam Blend)
        // ----------------------------------------------------
        // 泡沫受到 uFoamAmount 的调节
        float foamFactor = smoothstep(0.48, 0.82, vFoamMask * uFoamAmount * 1.25);
        
        // 给泡沫一些随机微波镂空边缘，使泡沫看起来更自然，而不是一整块白色
        float foamNoise = noise(vWorldPosition.xz * 4.5 + uTime * 0.4);
        foamFactor = clamp(foamFactor - foamNoise * 0.12, 0.0, 1.0);
        
        finalColor = mix(finalColor, uFoamColor, foamFactor * 0.88);

        // 雾气效仿（根据摄像机深度）
        float dist = length(cameraPosition - vWorldPosition);
        float fogFactor = 1.0 - exp(-dist * 0.0035);
        vec3 fogColor = mix(vec3(0.08, 0.15, 0.22), vec3(0.02, 0.04, 0.06), sunDir.y < 0.0 ? 1.0 : (1.0 - sunDir.y));
        finalColor = mix(finalColor, fogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });

  return material;
}

/**
 * 随滑块动态调节更新波浪参数
 */
export function updateOceanMaterialWaves(material, waves) {
  material.uniforms.uWaveDirections.value = waves.map(w => new THREE.Vector2(w.direction.x, w.direction.y));
  material.uniforms.uWaveAmplitudes.value = waves.map(w => w.amplitude);
  material.uniforms.uWaveLengths.value = waves.map(w => w.wavelength);
  material.uniforms.uWaveSpeeds.value = waves.map(w => w.speed);
  material.uniforms.uWaveQs.value = waves.map(w => w.q);
}

/**
 * 动态天空 Shader 材质 (支持根据太阳方向实时解算日落晚霞与晨光)
 */
export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(0.35, 0.42, 0.5) },
      uNoonTopColor: { value: new THREE.Color('#38bdf8') },
      uNoonHorizonColor: { value: new THREE.Color('#bae6fd') },
      uSunsetTopColor: { value: new THREE.Color('#312e81') },
      uSunsetHorizonColor: { value: new THREE.Color('#f97316') },
      uNightTopColor: { value: new THREE.Color('#030712') },
      uNightHorizonColor: { value: new THREE.Color('#111827') }
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uNoonTopColor;
      uniform vec3 uNoonHorizonColor;
      uniform vec3 uSunsetTopColor;
      uniform vec3 uSunsetHorizonColor;
      uniform vec3 uNightTopColor;
      uniform vec3 uNightHorizonColor;

      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float horizon = smoothstep(-0.06, 0.45, dir.y);

        // 提取太阳高度 (Y 分量，在 -1.0 到 1.0 之间)
        vec3 sunDir = normalize(uSunDirection);
        float sunHeight = sunDir.y;

        vec3 skyColor;
        
        // ----------------------------------------------------
        // 多时段天空颜色插值 (正午 -> 黄昏 -> 夜晚)
        // ----------------------------------------------------
        if (sunHeight > 0.15) {
          // 正午/白昼模式
          float t = smoothstep(0.15, 0.65, sunHeight);
          vec3 top = mix(uSunsetTopColor, uNoonTopColor, t);
          vec3 hor = mix(uSunsetHorizonColor, uNoonHorizonColor, t);
          skyColor = mix(hor, top, horizon);
        } else if (sunHeight > -0.1) {
          // 黄昏/傍晚模式
          float t = smoothstep(-0.1, 0.15, sunHeight);
          vec3 top = mix(uNightTopColor, uSunsetTopColor, t);
          vec3 hor = mix(uNightHorizonColor, uSunsetHorizonColor, t);
          skyColor = mix(hor, top, horizon);
        } else {
          // 深夜模式
          skyColor = mix(uNightHorizonColor, uNightTopColor, horizon);
        }

        // ----------------------------------------------------
        // 绘制太阳光晕与散射 (Sun Disk)
        // ----------------------------------------------------
        float sunDot = max(dot(dir, sunDir), 0.0);
        
        if (sunHeight > -0.15) {
          // 太阳主体
          float sunDisk = pow(sunDot, 650.0) * 1.8;
          // 周围光晕
          float sunGlow = pow(sunDot, 12.0) * 0.72;
          
          // 根据太阳高度给光晕变色（靠近地平线变红/橙）
          vec3 glowColor = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.95, 0.85), smoothstep(0.0, 0.3, sunHeight));
          skyColor += (sunDisk * vec3(1.0) + sunGlow * glowColor);
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `
  });
}
