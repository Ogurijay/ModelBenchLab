import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene.jsx'
import Overlay from './components/Overlay.jsx'

export default function App() {
  return (
    <>
      {/* WebGL 层固定铺满视口，frameloop 默认 'always' —— GSAP/​useFrame 改相机会自动每帧渲染 */}
      <Canvas
        className="webgl"
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 60, near: 0.1, far: 200, position: [0, 0, 12] }}
      >
        <Scene />
      </Canvas>

      {/* 滚动内容层（DOM）—— 它撑出滚动高度，ScrollTrigger 监听它 */}
      <Overlay />
    </>
  )
}
