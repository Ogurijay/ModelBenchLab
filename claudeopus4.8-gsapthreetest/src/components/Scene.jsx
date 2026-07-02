import { useMemo } from 'react'
import { Stars } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Tunnel from './Tunnel.jsx'
import FloatingShapes from './FloatingShapes.jsx'
import { centerline, Z_START, Z_END } from '../curve.js'

gsap.registerPlugin(ScrollTrigger)

/**
 * 相机随滚动沿“中心线”飞行，并看向前方 ~12 个单位 —— 前方的光环始终在视野正中。
 *
 * R3F × GSAP 最佳实践：
 *  1. useThree() 拿 R3F 托管的 camera，绝不自己 new。
 *  2. 单一数据源：ScrollTrigger 只把滚动写进 0→1 的代理值 state.target；
 *     真正写 camera 只在 useFrame 里一处 —— 滚动与渲染解耦。
 *  3. 平滑交给渲染端：useFrame 每帧 lerp 追 target，与帧率无关。
 *  4. useGSAP() 托管生命周期：卸载 / HMR / StrictMode 自动 revert。
 */
function CameraFlight() {
  const { camera } = useThree()
  const state = useMemo(() => ({ progress: 0, target: 0 }), [])

  useGSAP(
    () => {
      gsap.to(state, {
        target: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '#scroll',
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
      requestAnimationFrame(() => ScrollTrigger.refresh())
    },
    { dependencies: [state] },
  )

  useFrame(() => {
    state.progress += (state.target - state.progress) * 0.08
    const p = state.progress
    const z = Z_START + (Z_END - Z_START) * p
    const c = centerline(z)
    camera.position.set(c[0], c[1], z)
    const l = centerline(z - 12)
    camera.lookAt(l[0], l[1], z - 12)
  })

  return null
}

export default function Scene() {
  return (
    <>
      <color attach="background" args={['#05060f']} />
      <fog attach="fog" args={['#05060f', 12, 60]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 8]} intensity={1} />
      <pointLight position={[0, 0, -2]} intensity={50} distance={42} color="#7f77dd" />
      <pointLight position={[0, 0, -26]} intensity={50} distance={42} color="#d4537e" />
      <pointLight position={[0, 0, -48]} intensity={50} distance={42} color="#378add" />

      <Stars radius={80} depth={60} count={4000} factor={4} saturation={0} fade speed={1} />

      <Tunnel />
      <FloatingShapes />

      <CameraFlight />
    </>
  )
}
