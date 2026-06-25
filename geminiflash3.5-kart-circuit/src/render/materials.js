import * as THREE from 'three';

/**
 * 创建赛博朋克网格地平线天空盒材质
 */
export function createCyberSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColorTop: { value: new THREE.Color('#1e0030') },      // 深紫
      uColorHorizon: { value: new THREE.Color('#4c004a') },  // 玫红
      uColorGrid: { value: new THREE.Color('#ff007f') }       // 霓虹粉
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
      uniform float uTime;
      uniform vec3 uColorTop;
      uniform vec3 uColorHorizon;
      uniform vec3 uColorGrid;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float horizon = smoothstep(-0.12, 0.45, dir.y);
        
        // 天空基础渐变
        vec3 skyColor = mix(uColorHorizon, uColorTop, horizon);

        // ----------------------------------------------------
        // 地平线下方及附近的赛博空间透视网格 (Cyber Grid)
        // ----------------------------------------------------
        if (dir.y < 0.22) {
          // 只在地平线以下或接近地平线处投影三维网格
          // 将 3D 球方向转换为平面投影 (2D 伪平面坐标)
          vec2 planeUV = dir.xz / (dir.y + 0.18);
          
          // 对平面坐标产生流动位移，造成车辆前行时网格向后流逝的假象
          planeUV.y += uTime * 0.45;

          // 计算网格线强度 (使用极窄的正弦脉冲)
          vec2 gridLine = abs(fract(planeUV * 0.15 - 0.5) - 0.5) / fwidth(planeUV * 0.15);
          float lineIntensity = 1.0 - min(min(gridLine.x, gridLine.y), 1.0);

          // 距离地平线处越远，网格越暗（淡出雾化效果）
          float fade = smoothstep(0.22, -0.05, dir.y) * smoothstep(18.0, 2.0, length(planeUV));
          
          skyColor = mix(skyColor, uColorGrid, lineIntensity * fade * 0.72);
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `
  });
}

/**
 * 创建发光霓虹赛道格栅材质
 */
export function createNeonTrackMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRoadColor: { value: new THREE.Color('#05010a') },       // 暗紫黑路面
      uGridColor: { value: new THREE.Color('#8b5cf6') },       // 发光紫线条
      uBorderColor: { value: new THREE.Color('#38bdf8') },     // 冰蓝霓虹边界
      uWrongWay: { value: 0.0 } // 1.0为逆行警告发红
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vLocalPosition = position;
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uRoadColor;
      uniform vec3 uGridColor;
      uniform vec3 uBorderColor;
      uniform float uWrongWay;

      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;

      void main() {
        // vUv.x: 0~1 代表道路的横向截面 (0.5 为赛道中心，0 和 1 为赛道边缘)
        // vUv.y: 对应赛道样条环线的纵向进度
        
        // 1. 基础道路色
        vec3 color = uRoadColor;

        // 2. 绘制纵向和横向的霓虹网格格栅
        // 横向线 (横跨马路)
        float gridX = abs(fract(vUv.x * 6.0 - 0.5) - 0.5) / fwidth(vUv.x * 6.0);
        float lineX = 1.0 - min(gridX, 1.0);

        // 纵向线 (沿着马路，并向后流逝)
        float repeatY = vUv.y * 320.0 - uTime * 6.0;
        float gridY = abs(fract(repeatY - 0.5) - 0.5) / fwidth(repeatY);
        float lineY = 1.0 - min(gridY, 1.0);

        // 组合网格线
        float gridLines = max(lineX * 0.65, lineY * 0.45);
        vec3 finalGridColor = mix(uGridColor, vec3(1.0, 0.1, 0.1), uWrongWay); // 逆行时网格发红
        color = mix(color, finalGridColor, gridLines * 0.58);

        // 3. 绘制赛道两侧边缘的发光霓虹护边
        // 当 vUv.x 极其接近 0 或 1 时绘制发光彩条
        float borderDist = min(vUv.x, 1.0 - vUv.x);
        float borderGlow = smoothstep(0.065, 0.0, borderDist);
        float borderLine = smoothstep(0.012, 0.0, borderDist);

        vec3 activeBorderColor = mix(uBorderColor, vec3(1.0, 0.2, 0.2), uWrongWay);
        color = mix(color, activeBorderColor * 1.5, borderLine);
        color = mix(color, activeBorderColor * 0.6, borderGlow * (1.0 - borderLine));

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

/**
 * 动态气垫车尾喷口火焰材质 (根据 Boost 状态机变换颜色)
 */
export function createJetFlameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBoostType: { value: 0 } // 0:正常(橙红), 1:蓝喷(冰蓝), 2:紫喷(紫色), 3:加速带(炽白)
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoostType;
      varying vec2 vUv;
      varying vec3 vPosition;

      // 快速噪波，用于火焰随机形状抖动
      float snoise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        // vUv.y: 从火焰根部 (0.0) 到火焰尖端 (1.0)
        // vUv.x: 环形切面
        
        // 1. 火焰根据 BoostType 选择霓虹基础色
        vec3 flameColor;
        if (uBoostType == 1.0) {
          flameColor = vec3(0.0, 0.75, 1.0); // 冰蓝
        } else if (uBoostType == 2.0) {
          flameColor = vec3(0.72, 0.0, 1.0); // 艳紫
        } else if (uBoostType == 3.0) {
          flameColor = vec3(1.0, 0.95, 0.95); // 炽白
        } else {
          flameColor = vec3(1.0, 0.35, 0.05); // 正常推进橙色
        }

        // 2. 纵向噪声波动形变
        float noise = snoise(vec2(vUv.x * 4.0, uTime * 22.0)) * 0.18;
        float cap = vUv.y + noise;

        // 3. 火焰边缘向外淡出及尖端淡出
        float alpha = smoothstep(1.0, 0.0, cap) * (1.0 - abs(vUv.x - 0.5) * 2.0);
        
        // 给火焰增加明亮的发光内芯
        vec3 finalColor = mix(flameColor * 0.3, vec3(1.0), smoothstep(0.9, 0.0, cap) * 0.65);

        gl_FragColor = vec4(finalColor * 2.0, alpha * 0.85);
      }
    `
  });
}
