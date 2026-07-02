import { useMemo } from 'react'
import { centerline } from '../curve.js'

const COLORS = ['#7f77dd', '#1d9e75', '#378add', '#d4537e', '#d85a30', '#5dcaa5']

/**
 * 沿中心线密集排布的一串光环（与相机共用中心线，相机从每个环的轴心穿过）。
 * 环面朝 ±Z，相机看 -Z 正对环面 —— 经典“穿越光环”效果。
 * emissive + toneMapped=false 让环自发光、鲜亮，配合 fog 从远处雾里浮现。
 */
export default function Tunnel() {
  const rings = useMemo(() => {
    const out = []
    const N = 48
    const zA = 8
    const zB = -64
    for (let i = 0; i < N; i++) {
      const z = zA + (zB - zA) * (i / (N - 1))
      const c = centerline(z)
      out.push({
        key: i,
        position: [c[0], c[1], z],
        color: COLORS[i % COLORS.length],
        scale: 1.7 + (i % 4) * 0.2,
        roll: i * 0.5,
      })
    }
    return out
  }, [])

  return (
    <group>
      {rings.map((r) => (
        <mesh key={r.key} position={r.position} rotation={[0, 0, r.roll]} scale={r.scale}>
          <torusGeometry args={[1.1, 0.05, 16, 64]} />
          <meshStandardMaterial color={r.color} emissive={r.color} emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
