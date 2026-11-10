import * as THREE from 'three';
import { SHARED_SKY_GLSL } from './atmosphere.js';

export function createSkyDome() {
  const geometry = new THREE.SphereGeometry(14800, 48, 32);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.4, 0.5).normalize() },
    uZenithColor: { value: new THREE.Color('#0c3b75') },
    uHorizonColor: { value: new THREE.Color('#7cc4f5') },
    uSunColor: { value: new THREE.Color('#fff9ed') },
    uCloudCover: { value: 0.34 },
    uCloudDarkness: { value: 0.16 },
    uLightningFlash: { value: 0.0 },
    uLightningPos: { value: new THREE.Vector3(0, 260, -180) },
    uWindAngle: { value: 0.48 },
    uWindSpeed: { value: 9.6 }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vWorldDir;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldDir = worldPos.xyz - cameraPosition;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;
    varying vec3 vWorldDir;
    uniform float uTime;
    ${SHARED_SKY_GLSL}

    void main() {
      vec3 dir = normalize(vWorldDir);
      vec3 col = evaluateAtmosphereAndClouds(dir, uTime, true);
      // 轻度 ACES 风格色调压缩
      col = col / (1.0 + col * 0.16);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    uniforms,
    update(time, atmo, params, lightningPos) {
      uniforms.uTime.value = time;
      uniforms.uSunDir.value.copy(atmo.sunDir);
      uniforms.uZenithColor.value.copy(atmo.zenithColor);
      uniforms.uHorizonColor.value.copy(atmo.horizonColor);
      uniforms.uSunColor.value.copy(atmo.sunColor);
      uniforms.uCloudCover.value = params.cloudCover;
      uniforms.uCloudDarkness.value = params.cloudDarkness;
      uniforms.uLightningFlash.value = params.lightningFlash || 0.0;
      if (lightningPos) uniforms.uLightningPos.value.copy(lightningPos);
      uniforms.uWindAngle.value = THREE.MathUtils.degToRad(params.windDirDeg);
      uniforms.uWindSpeed.value = params.windSpeed;
    }
  };
}
