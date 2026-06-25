import * as THREE from 'three'
import { Ocean } from './Ocean.js'
import { WeatherSystem } from './WeatherSystem.js'

class App {
  constructor() {
    this.canvas = document.getElementById('scene')
    this.currentWeather = 'clear'
    
    this.init()
    this.initUI()
    this.setWeather('clear')
    this.animate()
  }

  init() {
    this.scene = new THREE.Scene()
    
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 10, 30)
    this.camera.lookAt(0, 0, 0)
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.5
    
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    this.scene.add(this.ambientLight)
    
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
    this.sunLight.position.set(50, 80, 50)
    this.sunLight.castShadow = true
    this.scene.add(this.sunLight)
    
    this.ocean = new Ocean(this.scene)
    this.weather = new WeatherSystem(this.scene, this.camera)
    
    this.clock = new THREE.Clock()
    this.mouse = { x: 0, y: 0 }
    this.cameraAngle = 0
    
    window.addEventListener('resize', () => this.onResize())
    window.addEventListener('mousemove', (e) => this.onMouseMove(e))
  }

  initUI() {
    const buttons = document.querySelectorAll('.weather-btn')
    const weatherNames = {
      clear: '晴朗',
      fog: '大雾',
      rain: '暴雨',
      storm: '雷暴',
      tornado: '龙卷风'
    }
    
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const weather = btn.dataset.weather
        
        buttons.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        
        this.setWeather(weather)
        
        document.getElementById('current-weather').textContent = weatherNames[weather]
      })
    })
    
    this.fpsCounter = document.getElementById('fps')
    this.frameCount = 0
    this.lastFpsTime = performance.now()
  }

  setWeather(weatherType) {
    this.currentWeather = weatherType
    this.ocean.setWeather(weatherType)
    this.weather.setWeather(weatherType)
    
    switch (weatherType) {
      case 'clear':
        this.ambientLight.intensity = 0.8
        this.sunLight.intensity = 1.2
        this.sunLight.position.set(50, 80, 50)
        this.sunLight.color.setHex(0xffffff)
        this.ambientLight.color.setHex(0xffffff)
        this.renderer.toneMappingExposure = 1.5
        break
        
      case 'fog':
        this.ambientLight.intensity = 0.6
        this.sunLight.intensity = 0.5
        this.sunLight.position.set(30, 50, 40)
        this.sunLight.color.setHex(0xdddddd)
        this.ambientLight.color.setHex(0xcccccc)
        this.renderer.toneMappingExposure = 1.3
        break
        
      case 'rain':
        this.ambientLight.intensity = 0.5
        this.sunLight.intensity = 0.4
        this.sunLight.position.set(20, 40, 30)
        this.sunLight.color.setHex(0x999999)
        this.ambientLight.color.setHex(0x888888)
        this.renderer.toneMappingExposure = 1.2
        break
        
      case 'storm':
        this.ambientLight.intensity = 0.3
        this.sunLight.intensity = 0.2
        this.sunLight.position.set(10, 30, 20)
        this.sunLight.color.setHex(0x666677)
        this.ambientLight.color.setHex(0x555566)
        this.renderer.toneMappingExposure = 1.1
        break
        
      case 'tornado':
        this.ambientLight.intensity = 0.2
        this.sunLight.intensity = 0.15
        this.sunLight.position.set(10, 25, 15)
        this.sunLight.color.setHex(0x555566)
        this.ambientLight.color.setHex(0x444455)
        this.renderer.toneMappingExposure = 1.0
        break
    }
  }

  onMouseMove(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  updateFPS() {
    this.frameCount++
    const now = performance.now()
    
    if (now - this.lastFpsTime >= 1000) {
      this.fpsCounter.textContent = this.frameCount
      this.frameCount = 0
      this.lastFpsTime = now
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate())
    
    const deltaTime = Math.min(this.clock.getDelta(), 0.1)
    const elapsedTime = this.clock.getElapsedTime()
    
    this.cameraAngle += deltaTime * 0.03
    const radius = 30 + Math.sin(elapsedTime * 0.1) * 5
    
    this.camera.position.x = Math.sin(this.cameraAngle + this.mouse.x * 0.3) * radius
    this.camera.position.z = Math.cos(this.cameraAngle + this.mouse.x * 0.3) * radius
    this.camera.position.y = 10 + this.mouse.y * -5 + Math.sin(elapsedTime * 0.2) * 2
    
    this.camera.lookAt(0, 2, 0)
    
    this.ocean.update(deltaTime)
    this.weather.update(deltaTime)
    
    this.renderer.render(this.scene, this.camera)
    
    this.updateFPS()
  }
}

const app = new App()
