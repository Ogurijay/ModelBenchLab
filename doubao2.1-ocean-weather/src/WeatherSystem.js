import * as THREE from 'three'

export class WeatherSystem {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.currentWeather = 'clear'
    
    this.rainCount = 10000
    this.rainSpeed = 80
    
    this.fogDensity = 0
    this.targetFogDensity = 0
    
    this.lightningActive = false
    this.lightningIntensity = 0
    this.lightningTimer = 0
    this.nextLightningTime = 2
    this.lightningDuration = 0
    
    this.tornadoActive = false
    this.tornadoIntensity = 0
    this.targetTornadoIntensity = 0
    
    this.createRain()
    this.createLightning()
    this.createTornado()
    this.setupFog()
  }

  createRain() {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.rainCount * 3)
    
    this.rainArea = { x: 150, y: 60, z: 150 }
    
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.rainArea.x
      positions[i * 3 + 1] = Math.random() * this.rainArea.y
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.rainArea.z
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    
    const material = new THREE.PointsMaterial({
      color: 0xbbddee,
      size: 0.4,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false
    })
    
    this.rain = new THREE.Points(geometry, material)
    this.scene.add(this.rain)
  }

  createLightning() {
    const lightningLight = new THREE.PointLight(0xaaccff, 0, 400, 2)
    lightningLight.position.set(0, 50, -30)
    this.scene.add(lightningLight)
    this.lightningLight = lightningLight
    
    const lightningAmbient = new THREE.AmbientLight(0x8899ff, 0)
    this.scene.add(lightningAmbient)
    this.lightningAmbient = lightningAmbient
    
    this.lightningFlashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide
    })
    const flashGeometry = new THREE.SphereGeometry(400, 16, 16)
    this.lightningFlash = new THREE.Mesh(flashGeometry, this.lightningFlashMaterial)
    this.scene.add(this.lightningFlash)
  }

  createTornado() {
    this.tornadoGroup = new THREE.Group()
    this.scene.add(this.tornadoGroup)
    
    const particleCount = 5000
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    
    this.tornadoParticles = []
    
    for (let i = 0; i < particleCount; i++) {
      const height = Math.random()
      const angle = Math.random() * Math.PI * 2
      const radius = 2 + height * height * 15
      
      const particle = {
        angle: angle,
        height: height * 60,
        radius: radius + (Math.random() - 0.5) * 3,
        speed: 1.5 + Math.random() * 2,
        riseSpeed: 0.5 + Math.random() * 1,
        size: 0.3 + Math.random() * 0.8
      }
      
      this.tornadoParticles.push(particle)
      
      positions[i * 3] = 0
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = 0
      
      const gray = 0.3 + Math.random() * 0.3
      colors[i * 3] = gray
      colors[i * 3 + 1] = gray * 0.95
      colors[i * 3 + 2] = gray * 0.9
      
      sizes[i] = particle.size
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    
    const material = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
    
    this.tornadoPoints = new THREE.Points(geometry, material)
    this.tornadoGroup.add(this.tornadoPoints)
    
    const debrisCount = 500
    const debrisGeometry = new THREE.BufferGeometry()
    const debrisPositions = new Float32Array(debrisCount * 3)
    
    this.debrisParticles = []
    
    for (let i = 0; i < debrisCount; i++) {
      const height = Math.random() * 0.7
      const angle = Math.random() * Math.PI * 2
      const radius = 1 + height * height * 12
      
      const particle = {
        angle: angle,
        height: height * 40,
        radius: radius + (Math.random() - 0.5) * 2,
        speed: 2 + Math.random() * 3,
        riseSpeed: 1 + Math.random() * 2,
        size: 0.1 + Math.random() * 0.3,
        type: Math.floor(Math.random() * 3)
      }
      
      this.debrisParticles.push(particle)
      debrisPositions[i * 3] = 0
      debrisPositions[i * 3 + 1] = 0
      debrisPositions[i * 3 + 2] = 0
    }
    
    debrisGeometry.setAttribute('position', new THREE.BufferAttribute(debrisPositions, 3))
    
    const debrisMaterial = new THREE.PointsMaterial({
      color: 0x665544,
      size: 0.3,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false
    })
    
    this.debrisPoints = new THREE.Points(debrisGeometry, debrisMaterial)
    this.tornadoGroup.add(this.debrisPoints)
    
    const funnelGeometry = new THREE.ConeGeometry(15, 60, 32, 16, true)
    const funnelMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying float vHeight;
        varying float vNoise;
        
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        void main() {
          vHeight = position.y / 60.0;
          
          float noise = snoise(vec3(position.xz * 0.1, uTime * 0.5)) * (1.0 - vHeight) * 3.0;
          float noise2 = snoise(vec3(position.xz * 0.3, uTime * 1.0)) * (1.0 - vHeight) * 1.0;
          vNoise = noise + noise2;
          
          vec3 pos = position;
          pos.xz += normalize(pos.xz + 0.01) * vNoise * 0.5;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        varying float vHeight;
        varying float vNoise;
        
        void main() {
          float alpha = (1.0 - vHeight) * 0.4;
          alpha += vNoise * 0.1;
          alpha = clamp(alpha, 0.0, 0.6);
          alpha *= uIntensity;
          
          vec3 color = vec3(0.25, 0.25, 0.3);
          color += vNoise * 0.05;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    
    this.tornadoFunnel = new THREE.Mesh(funnelGeometry, funnelMaterial)
    this.tornadoFunnel.position.y = 30
    this.tornadoGroup.add(this.tornadoFunnel)
    
    this.tornadoGroup.position.set(-40, 0, -20)
    this.tornadoGroup.visible = false
  }

  setupFog() {
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0)
  }

  update(deltaTime) {
    this.updateRain(deltaTime)
    this.updateLightning(deltaTime)
    this.updateTornado(deltaTime)
    this.updateFog(deltaTime)
  }

  updateRain(deltaTime) {
    const positions = this.rain.geometry.attributes.position.array
    
    const windX = this.currentWeather === 'storm' || this.currentWeather === 'tornado' ? -20 : -8
    const speedMul = this.currentWeather === 'storm' || this.currentWeather === 'tornado' ? 1.5 : 1
    
    for (let i = 0; i < this.rainCount; i++) {
      const i3 = i * 3
      
      positions[i3] += windX * deltaTime
      positions[i3 + 1] -= this.rainSpeed * speedMul * deltaTime
      positions[i3 + 2] += Math.sin(i * 0.1) * 2 * deltaTime
      
      if (positions[i3 + 1] < -5) {
        positions[i3] = this.camera.position.x + (Math.random() - 0.5) * this.rainArea.x
        positions[i3 + 1] = this.camera.position.y + this.rainArea.y * 0.5 + Math.random() * 20
        positions[i3 + 2] = this.camera.position.z + (Math.random() - 0.5) * this.rainArea.z
      }
      
      if (positions[i3] < this.camera.position.x - this.rainArea.x / 2) {
        positions[i3] += this.rainArea.x
      }
      if (positions[i3] > this.camera.position.x + this.rainArea.x / 2) {
        positions[i3] -= this.rainArea.x
      }
      if (positions[i3 + 2] < this.camera.position.z - this.rainArea.z / 2) {
        positions[i3 + 2] += this.rainArea.z
      }
      if (positions[i3 + 2] > this.camera.position.z + this.rainArea.z / 2) {
        positions[i3 + 2] -= this.rainArea.z
      }
    }
    
    this.rain.geometry.attributes.position.needsUpdate = true
  }

  updateLightning(deltaTime) {
    if (this.currentWeather !== 'storm' && this.currentWeather !== 'tornado') {
      this.lightningIntensity = Math.max(0, this.lightningIntensity - deltaTime * 3)
      this.updateLightningUniforms()
      return
    }
    
    this.lightningTimer += deltaTime
    
    if (this.lightningTimer >= this.nextLightningTime && !this.lightningActive) {
      this.triggerLightning()
    }
    
    if (this.lightningActive) {
      this.lightningDuration -= deltaTime
      
      if (this.lightningDuration > 0) {
        const flicker = 0.6 + Math.random() * 0.4
        this.lightningIntensity = flicker
      } else {
        this.lightningIntensity = Math.max(0, this.lightningIntensity - deltaTime * 10)
        if (this.lightningIntensity <= 0.01) {
          this.lightningActive = false
          this.lightningTimer = 0
          this.nextLightningTime = this.currentWeather === 'tornado' 
            ? 0.5 + Math.random() * 1.5 
            : 1.5 + Math.random() * 3
        }
      }
    }
    
    this.updateLightningUniforms()
  }

  triggerLightning() {
    this.lightningActive = true
    this.lightningDuration = 0.1 + Math.random() * 0.2
    this.lightningIntensity = 1
    
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 30
    this.lightningLight.position.x = Math.cos(angle) * distance
    this.lightningLight.position.z = -20 + Math.sin(angle) * distance
    this.lightningLight.position.y = 30 + Math.random() * 40
  }

  updateLightningUniforms() {
    this.lightningLight.intensity = this.lightningIntensity * 50
    this.lightningAmbient.intensity = this.lightningIntensity * 0.8
    this.lightningFlashMaterial.opacity = this.lightningIntensity * 0.3
  }

  updateTornado(deltaTime) {
    if (this.tornadoIntensity !== this.targetTornadoIntensity) {
      this.tornadoIntensity += (this.targetTornadoIntensity - this.tornadoIntensity) * deltaTime * 0.5
      
      this.tornadoPoints.material.opacity = this.tornadoIntensity * 0.8
      this.debrisPoints.material.opacity = this.tornadoIntensity * 0.9
      this.tornadoFunnel.material.uniforms.uIntensity.value = this.tornadoIntensity
      
      this.tornadoGroup.visible = this.tornadoIntensity > 0.01
    }
    
    if (this.tornadoIntensity <= 0.01) return
    
    const positions = this.tornadoPoints.geometry.attributes.position.array
    const debrisPositions = this.debrisPoints.geometry.attributes.position.array
    
    for (let i = 0; i < this.tornadoParticles.length; i++) {
      const p = this.tornadoParticles[i]
      
      p.angle += p.speed * deltaTime
      p.height += p.riseSpeed * deltaTime
      
      if (p.height > 60) {
        p.height = 0
        p.radius = 2 + Math.random() * 5
      }
      
      const heightRatio = p.height / 60
      const currentRadius = p.radius * (1 + heightRatio * heightRatio * 2)
      
      const x = Math.cos(p.angle) * currentRadius
      const z = Math.sin(p.angle) * currentRadius
      
      positions[i * 3] = x
      positions[i * 3 + 1] = p.height
      positions[i * 3 + 2] = z
    }
    
    this.tornadoPoints.geometry.attributes.position.needsUpdate = true
    
    for (let i = 0; i < this.debrisParticles.length; i++) {
      const p = this.debrisParticles[i]
      
      p.angle += p.speed * deltaTime
      p.height += p.riseSpeed * deltaTime
      
      if (p.height > 40) {
        p.height = 0
        p.radius = 1 + Math.random() * 3
      }
      
      const heightRatio = p.height / 40
      const currentRadius = p.radius * (1 + heightRatio * heightRatio * 1.5)
      
      const wobble = Math.sin(p.angle * 3 + p.height * 0.2) * 0.5
      
      const x = Math.cos(p.angle) * (currentRadius + wobble)
      const z = Math.sin(p.angle) * (currentRadius + wobble)
      
      debrisPositions[i * 3] = x
      debrisPositions[i * 3 + 1] = p.height
      debrisPositions[i * 3 + 2] = z
    }
    
    this.debrisPoints.geometry.attributes.position.needsUpdate = true
    
    this.tornadoFunnel.material.uniforms.uTime.value += deltaTime
    
    this.tornadoGroup.position.x += Math.sin(Date.now() * 0.0003) * 5 * deltaTime
  }

  updateFog(deltaTime) {
    const fog = this.scene.fog
    
    if (Math.abs(this.fogDensity - this.targetFogDensity) > 0.0001) {
      this.fogDensity += (this.targetFogDensity - this.fogDensity) * deltaTime * 0.5
      fog.density = this.fogDensity
    }
  }

  setWeather(weatherType) {
    this.currentWeather = weatherType
    
    switch (weatherType) {
      case 'clear':
        this.rain.material.opacity = 0
        this.targetFogDensity = 0
        this.scene.fog.color.setHex(0x87ceeb)
        this.targetTornadoIntensity = 0
        break
        
      case 'fog':
        this.rain.material.opacity = 0
        this.targetFogDensity = 0.02
        this.scene.fog.color.setHex(0xc8c8c8)
        this.targetTornadoIntensity = 0
        break
        
      case 'rain':
        this.rain.material.opacity = 0.7
        this.targetFogDensity = 0.008
        this.scene.fog.color.setHex(0x666666)
        this.targetTornadoIntensity = 0
        break
        
      case 'storm':
        this.rain.material.opacity = 1.0
        this.targetFogDensity = 0.012
        this.scene.fog.color.setHex(0x444455)
        this.lightningTimer = 0
        this.nextLightningTime = 0.5 + Math.random() * 1.5
        this.targetTornadoIntensity = 0
        break
        
      case 'tornado':
        this.rain.material.opacity = 0.8
        this.targetFogDensity = 0.015
        this.scene.fog.color.setHex(0x3a3a4a)
        this.lightningTimer = 0
        this.nextLightningTime = 0.3 + Math.random() * 0.8
        this.targetTornadoIntensity = 1
        break
    }
  }
}
