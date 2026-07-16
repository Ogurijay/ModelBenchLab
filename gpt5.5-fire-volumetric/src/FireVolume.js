import * as THREE from 'three';
import { fireFragmentShader, fireVertexShader } from './shaders/fireShader.js';

const HALF_SIZE = new THREE.Vector3(1.14, 2.35, 1.14);

export class FireVolume extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.BoxGeometry(HALF_SIZE.x * 2, HALF_SIZE.y * 2, HALF_SIZE.z * 2);
    const uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uTurbulence: { value: 0.72 },
      uWind: { value: 0.18 },
      uSteps: { value: 72 },
      uCameraLocal: { value: new THREE.Vector3() },
      uHalfSize: { value: HALF_SIZE.clone() },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };

    const material = new THREE.ShaderMaterial({
      name: 'VolumetricFireMaterial',
      uniforms,
      vertexShader: fireVertexShader,
      fragmentShader: fireFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    super(geometry, material);
    this.name = 'VolumetricFire';
    this.position.y = 2.65;
    this.renderOrder = 4;
    this.frustumCulled = false;
  }

  update(time, camera, resolution) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uResolution.value.copy(resolution);
    this.updateWorldMatrix(true, false);
    this.material.uniforms.uCameraLocal.value
      .copy(camera.position)
      .applyMatrix4(this.matrixWorld.clone().invert());
  }

  setParameters({ intensity, turbulence, wind, steps }) {
    const uniforms = this.material.uniforms;
    if (intensity !== undefined) uniforms.uIntensity.value = intensity;
    if (turbulence !== undefined) uniforms.uTurbulence.value = turbulence;
    if (wind !== undefined) uniforms.uWind.value = wind;
    if (steps !== undefined) uniforms.uSteps.value = steps;
  }

  getParameters() {
    const uniforms = this.material.uniforms;
    return {
      intensity: uniforms.uIntensity.value,
      turbulence: uniforms.uTurbulence.value,
      wind: uniforms.uWind.value,
      steps: uniforms.uSteps.value,
    };
  }
}
