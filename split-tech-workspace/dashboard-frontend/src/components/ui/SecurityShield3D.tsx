// 3D Security Shield — React Three Fiber
// Rotating icosahedron + outer ring + pulse glow, brand green

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, Torus, Float } from '@react-three/drei'
import * as THREE from 'three'

function ShieldCore({ suspended }: { suspended: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame((_, delta) => {
    meshRef.current.rotation.y += delta * (suspended ? 1.2 : 0.4)
    meshRef.current.rotation.x += delta * (suspended ? 0.4 : 0.1)
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.1, 1]} />
      <MeshDistortMaterial
        color={suspended ? '#7f1d1d' : '#006C35'}
        emissive={suspended ? '#ef4444' : '#003d1e'}
        emissiveIntensity={suspended ? 1.8 : 0.6}
        roughness={0.1}
        metalness={0.9}
        distort={suspended ? 0.55 : 0.25}
        speed={suspended ? 5 : 2}
        wireframe={false}
      />
    </mesh>
  )
}

function OrbitRing({ radius, tilt, speed, color }: {
  radius: number; tilt: number; speed: number; color: string
}) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((_, delta) => { ref.current.rotation.z += delta * speed })
  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <Torus args={[radius, 0.018, 8, 80]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} transparent opacity={0.7} />
      </Torus>
    </mesh>
  )
}

function Particles({ suspended }: { suspended: boolean }) {
  const count = 60
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 1.8 + Math.random() * 0.6
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  const ref = useRef<THREE.Points>(null!)
  useFrame((_, delta) => { ref.current.rotation.y += delta * (suspended ? 0.25 : 0.08) })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={suspended ? 0.07 : 0.04}
        color={suspended ? '#ef4444' : '#AECC1E'}
        sizeAttenuation transparent opacity={0.8}
      />
    </points>
  )
}

function Scene({ suspended }: { suspended: boolean }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[4, 4, 4]}   intensity={2}   color={suspended ? '#ef4444' : '#006C35'} />
      <pointLight position={[-4, -2, -4]} intensity={1.5} color={suspended ? '#dc2626' : '#AECC1E'} />
      <spotLight  position={[0, 6, 0]}   intensity={1}   color="#ffffff" angle={0.4} />

      <Float speed={suspended ? 2.5 : 1.2} rotationIntensity={0.3} floatIntensity={0.5}>
        <ShieldCore suspended={suspended} />
      </Float>

      <OrbitRing radius={1.7} tilt={Math.PI / 4}  speed={suspended ? 1.4  : 0.6}  color={suspended ? '#ef4444' : '#006C35'} />
      <OrbitRing radius={1.9} tilt={-Math.PI / 5} speed={suspended ? -1.0 : -0.4} color={suspended ? '#dc2626' : '#AECC1E'} />
      <OrbitRing radius={2.1} tilt={Math.PI / 2}  speed={suspended ? 0.8  : 0.3}  color={suspended ? '#b91c1c' : '#047857'} />

      <Particles suspended={suspended} />
    </>
  )
}

interface Props {
  height?: number
  className?: string
  /** When true the shield glows red — use when a store is suspended */
  suspended?: boolean
}

export default function SecurityShield3D({ height = 280, className = '', suspended = false }: Props) {
  return (
    <div
      className={className}
      style={{ height, position: 'relative' }}
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene suspended={suspended} />
      </Canvas>
    </div>
  )
}
