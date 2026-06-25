import * as THREE from 'three'

export class Ocean {
  constructor(scene) {
    this.scene = scene
    this.waveTime = 0
    this.roughness = 0.3
    this.waveHeight = 1.0
    
    this.createOcean()
    this.createSkyDome()
  }

  createOcean() {
    const geometry = new THREE.PlaneGeometry(400, 400, 256, 256)
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: this.waveHeight },
        uWaterColor: { value: new THREE.Color(0x0077aa) },
        uDeepColor: { value: new THREE.Color(0x002a40) },
        uSkyColor: { value: new THREE.Color(0x87ceeb) },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.5).normalize() },
        uRoughness: { value: this.roughness },
        uBrightness: { value: 1.5 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWaveHeight;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vWaveElevation;
        
        vec3 gerstnerWave(vec2 direction, float steepness, float wavelength, vec2 position, float time, inout vec3 tangent, inout vec3 binormal) {
          float k = 2.0 * 3.14159 / wavelength;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(direction);
          float f = k * (dot(d, position) - c * time);
          float a = steepness / k;
          
          tangent += vec3(
            -d.x * d.x * steepness * sin(f),
            d.x * steepness * cos(f),
            -d.x * d.y * steepness * sin(f)
          );
          
          binormal += vec3(
            -d.x * d.y * steepness * sin(f),
            d.y * steepness * cos(f),
            -d.y * d.y * steepness * sin(f)
          );
          
          return vec3(
            d.x * a * cos(f),
            a * sin(f),
            d.y * a * cos(f)
          );
        }
        
        void main() {
          vec3 pos = position;
          vec3 tangent = vec3(1.0, 0.0, 0.0);
          vec3 binormal = vec3(0.0, 0.0, 1.0);
          
          vec3 waveOffset = vec3(0.0);
          
          waveOffset += gerstnerWave(vec2(1.0, 0.3), 0.18, 35.0, pos.xz, uTime, tangent, binormal) * uWaveHeight;
          waveOffset += gerstnerWave(vec2(0.5, 1.0), 0.15, 22.0, pos.xz, uTime * 1.2, tangent, binormal) * uWaveHeight;
          waveOffset += gerstnerWave(vec2(-0.7, 0.5), 0.12, 16.0, pos.xz, uTime * 0.8, tangent, binormal) * uWaveHeight;
          waveOffset += gerstnerWave(vec2(0.3, -0.8), 0.10, 10.0, pos.xz, uTime * 1.5, tangent, binormal) * uWaveHeight;
          waveOffset += gerstnerWave(vec2(-0.4, -0.6), 0.08, 7.0, pos.xz, uTime * 0.9, tangent, binormal) * uWaveHeight;
          
          pos += waveOffset;
          vWaveElevation = pos.y;
          
          vec3 normal = normalize(cross(binormal, tangent));
          vNormal = normal;
          vPosition = pos;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uWaterColor;
        uniform vec3 uDeepColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSunDirection;
        uniform float uRoughness;
        uniform float uBrightness;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vWaveElevation;
        
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(cameraPosition - vPosition);
          vec3 sunDir = normalize(uSunDirection);
          
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          
          vec3 reflectDir = reflect(-viewDir, normal);
          
          float skyMix = fresnel * 0.8 + 0.3;
          vec3 waterBase = mix(uDeepColor, uWaterColor, clamp((vWaveElevation + 3.0) * 0.2, 0.0, 1.0));
          vec3 skyReflection = uSkyColor * (0.7 + 0.3 * max(reflectDir.y, 0.0));
          vec3 finalColor = mix(waterBase, skyReflection, skyMix);
          
          float specular = pow(max(dot(reflectDir, sunDir), 0.0), 64.0);
          vec3 specularColor = vec3(1.0, 0.98, 0.9) * specular * 3.0;
          finalColor += specularColor;
          
          float foam = smoothstep(0.3, 1.2, vWaveElevation * uRoughness * 2.0);
          foam *= 0.5 + 0.5 * sin(vPosition.x * 0.3 + uTime * 2.0) * sin(vPosition.z * 0.3 + uTime * 1.5);
          finalColor = mix(finalColor, vec3(0.95, 0.98, 1.0), foam * 0.7);
          
          float depth = smoothstep(-3.0, 1.0, vWaveElevation);
          finalColor = mix(uDeepColor * 0.7, finalColor, depth);
          
          finalColor *= uBrightness;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.receiveShadow = true
    this.scene.add(this.mesh)
  }

  createSkyDome() {
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32)
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor: { value: new THREE.Color(0x0088ff) },
        uBottomColor: { value: new THREE.Color(0xffffff) },
        uOffset: { value: 33 },
        uExponent: { value: 0.6 },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.5).normalize() },
        uSunIntensity: { value: 1.0 },
        uBrightness: { value: 1.3 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        uniform float uOffset;
        uniform float uExponent;
        uniform vec3 uSunDirection;
        uniform float uSunIntensity;
        uniform float uBrightness;
        
        varying vec3 vWorldPosition;
        
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = normalize(vWorldPosition + uOffset).y;
          vec3 color = mix(uBottomColor, uTopColor, max(pow(max(h, 0.0), uExponent), 0.0));
          
          float sunDot = max(dot(dir, uSunDirection), 0.0);
          float sunDisc = smoothstep(0.997, 0.9995, sunDot);
          float sunGlow = pow(sunDot, 24.0) * 0.6;
          color += vec3(1.0, 0.95, 0.8) * (sunDisc + sunGlow) * uSunIntensity;
          
          color *= uBrightness;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide
    })

    this.skyDome = new THREE.Mesh(skyGeometry, skyMaterial)
    this.scene.add(this.skyDome)
  }

  update(deltaTime) {
    this.waveTime += deltaTime
    this.mesh.material.uniforms.uTime.value = this.waveTime
  }

  setWeather(weatherType) {
    const oceanMat = this.mesh.material
    const skyMat = this.skyDome.material

    switch (weatherType) {
      case 'clear':
        oceanMat.uniforms.uWaterColor.value.setHex(0x0088bb)
        oceanMat.uniforms.uDeepColor.value.setHex(0x00334d)
        oceanMat.uniforms.uSkyColor.value.setHex(0x87ceeb)
        oceanMat.uniforms.uWaveHeight.value = 1.0
        oceanMat.uniforms.uRoughness.value = 0.3
        oceanMat.uniforms.uBrightness.value = 1.5
        skyMat.uniforms.uTopColor.value.setHex(0x0099ff)
        skyMat.uniforms.uBottomColor.value.setHex(0xffffff)
        skyMat.uniforms.uSunDirection.value.set(0.5, 0.8, 0.5).normalize()
        skyMat.uniforms.uSunIntensity.value = 1.2
        skyMat.uniforms.uBrightness.value = 1.3
        break

      case 'fog':
        oceanMat.uniforms.uWaterColor.value.setHex(0x5a7b8a)
        oceanMat.uniforms.uDeepColor.value.setHex(0x2a3a45)
        oceanMat.uniforms.uSkyColor.value.setHex(0xc8c8c8)
        oceanMat.uniforms.uWaveHeight.value = 0.6
        oceanMat.uniforms.uRoughness.value = 0.2
        oceanMat.uniforms.uBrightness.value = 1.2
        skyMat.uniforms.uTopColor.value.setHex(0x999999)
        skyMat.uniforms.uBottomColor.value.setHex(0xdddddd)
        skyMat.uniforms.uSunDirection.value.set(0.3, 0.5, 0.4).normalize()
        skyMat.uniforms.uSunIntensity.value = 0.4
        skyMat.uniforms.uBrightness.value = 1.1
        break

      case 'rain':
        oceanMat.uniforms.uWaterColor.value.setHex(0x3a5a6a)
        oceanMat.uniforms.uDeepColor.value.setHex(0x1a2530)
        oceanMat.uniforms.uSkyColor.value.setHex(0x666666)
        oceanMat.uniforms.uWaveHeight.value = 2.0
        oceanMat.uniforms.uRoughness.value = 0.6
        oceanMat.uniforms.uBrightness.value = 1.1
        skyMat.uniforms.uTopColor.value.setHex(0x444444)
        skyMat.uniforms.uBottomColor.value.setHex(0x777777)
        skyMat.uniforms.uSunDirection.value.set(0.2, 0.4, 0.3).normalize()
        skyMat.uniforms.uSunIntensity.value = 0.25
        skyMat.uniforms.uBrightness.value = 1.0
        break

      case 'storm':
        oceanMat.uniforms.uWaterColor.value.setHex(0x2a4a5a)
        oceanMat.uniforms.uDeepColor.value.setHex(0x0a1520)
        oceanMat.uniforms.uSkyColor.value.setHex(0x444455)
        oceanMat.uniforms.uWaveHeight.value = 3.0
        oceanMat.uniforms.uRoughness.value = 0.9
        oceanMat.uniforms.uBrightness.value = 1.0
        skyMat.uniforms.uTopColor.value.setHex(0x2a2a3a)
        skyMat.uniforms.uBottomColor.value.setHex(0x555566)
        skyMat.uniforms.uSunDirection.value.set(0.1, 0.3, 0.2).normalize()
        skyMat.uniforms.uSunIntensity.value = 0.15
        skyMat.uniforms.uBrightness.value = 0.9
        break

      case 'tornado':
        oceanMat.uniforms.uWaterColor.value.setHex(0x1a3a4a)
        oceanMat.uniforms.uDeepColor.value.setHex(0x051018)
        oceanMat.uniforms.uSkyColor.value.setHex(0x333344)
        oceanMat.uniforms.uWaveHeight.value = 3.5
        oceanMat.uniforms.uRoughness.value = 1.0
        oceanMat.uniforms.uBrightness.value = 0.9
        skyMat.uniforms.uTopColor.value.setHex(0x1a1a2a)
        skyMat.uniforms.uBottomColor.value.setHex(0x444455)
        skyMat.uniforms.uSunDirection.value.set(0.1, 0.2, 0.15).normalize()
        skyMat.uniforms.uSunIntensity.value = 0.1
        skyMat.uniforms.uBrightness.value = 0.8
        break
    }
  }
}
