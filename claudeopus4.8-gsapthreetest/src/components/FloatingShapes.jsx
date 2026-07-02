import { useMemo } from 'react'
import { Float } from '@react-three/drei'
import { centerline } from '../curve.js'

const ITEMS = [
  { z: 0, side: 1, color: '#7f77dd', type: 'ico' },
  { z: -13, side: -1, color: '#1d9e75', type: 'oct' },
  { z: -26, side: 1, color: '#d4537e', type: 'dodec' },
  { z: -39, side: -1, color: '#d85a30', type: 'ico' },
  { z: -52, side: 1, color: '#378add', type: 'oct' },
]

function Geometry({ type }) {
  if (type === 'oct') return <octahedronGeometry args={[0.85, 0]} />
  if (type === 'dodec') return <dodecahedronGeometry args={[0.75, 0]} />
  return <icosahedronGeometry args={[0.8, 0]} />
}

/**
 * 沿隧道两侧偏置的漂浮多面体，飞行时从相机旁掠过。
 * 漂浮来自 drei 的 <Float>（内部自跑 useFrame），与滚动驱动各自独立。
 */
export default function FloatingShapes() {
  const placed = useMemo(
    () =>
      ITEMS.map((it) => {
        const c = centerline(it.z)
        return { ...it, position: [c[0] + it.side * 3, c[1] + 0.4, it.z] }
      }),
    [],
  )

  return (
    <>
      {placed.map((s, i) => (
        <Float key={i} speed={2} rotationIntensity={1.2} floatIntensity={1.6}>
          <mesh position={s.position}>
            <Geometry type={s.type} />
            <meshStandardMaterial
              color={s.color}
              emissive={s.color}
              emissiveIntensity={0.5}
              metalness={0.35}
              roughness={0.25}
              flatShading
            />
          </mesh>
        </Float>
      ))}
    </>
  )
}
