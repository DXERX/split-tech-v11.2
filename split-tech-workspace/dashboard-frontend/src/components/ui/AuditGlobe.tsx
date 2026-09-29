// AuditGlobe — Real-time 3D globe showing active-store pulses
// Uses React Three Fiber + Drei
import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sphere, Line } from '@react-three/drei'
import * as THREE from 'three'

// ── Lat/lng → 3D cartesian ────────────────────────────────────────────────────
function latLngToVec3(lat: number, lng: number, r = 1.42): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
     (r * Math.cos(phi)),
     (r * Math.sin(phi) * Math.sin(theta)),
  )
}

// Approximate Saudi / Gulf city coords (for demo pulses)
const DEFAULT_LOCATIONS = [
  { lat: 24.7, lng: 46.7 },   // Riyadh
  { lat: 21.5, lng: 39.2 },   // Jeddah
  { lat: 26.4, lng: 50.1 },   // Dammam
  { lat: 21.4, lng: 39.8 },   // Mecca
  { lat: 24.5, lng: 39.6 },   // Medina
  { lat: 25.3, lng: 51.5 },   // Doha
  { lat: 25.2, lng: 55.3 },   // Dubai
]

// ── Single pulsing store dot ──────────────────────────────────────────────────
function StorePulse({ position, color = '#AECC1E', delay = 0 }: {
  position: THREE.Vector3
  color?: string
  delay?: number
}) {
  const ringRef = useRef<THREE.Mesh>(null!)
  const dotRef  = useRef<THREE.Mesh>(null!)
  const clock   = useRef(delay)

  useFrame((_, delta) => {
    clock.current += delta
    const t   = (clock.current % 2.5) / 2.5   // 0→1 over 2.5 s
    const scale = 1 + t * 3
    const opacity = Math.max(0, 1 - t * 1.4)
    if (ringRef.current) {
      ringRef.current.scale.setScalar(scale)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
    }
  })

  return (
    <group position={position}>
      {/* Core dot */}
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Expanding ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.03, 0.05, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ── Globe wireframe ───────────────────────────────────────────────────────────
function GlobeWireframe() {
  const groupRef = useRef<THREE.Group>(null!)
  useFrame((_, delta) => { groupRef.current.rotation.y += delta * 0.08 })

  // Lat lines
  const latLines = useMemo(() => {
    const lines: THREE.Vector3[][] = []
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = []
      for (let lng = 0; lng <= 360; lng += 4) {
        pts.push(latLngToVec3(lat, lng - 180))
      }
      lines.push(pts)
    }
    // Lng lines
    for (let lng = 0; lng < 360; lng += 30) {
      const pts: THREE.Vector3[] = []
      for (let lat = -90; lat <= 90; lat += 4) {
        pts.push(latLngToVec3(lat, lng - 180))
      }
      lines.push(pts)
    }
    return lines
  }, [])

  // Store pulses (rotated with globe)
  const pulseDots = useMemo(
    () => DEFAULT_LOCATIONS.map((loc, i) => ({
      pos: latLngToVec3(loc.lat, loc.lng),
      delay: i * 0.4,
      color: i % 2 === 0 ? '#AECC1E' : '#006C35',
    })),
    [],
  )

  return (
    <group ref={groupRef}>
      {/* Transparent globe surface */}
      <Sphere args={[1.4, 36, 36]}>
        <meshStandardMaterial
          color="#001a0d"
          transparent
          opacity={0.55}
          roughness={0.8}
          metalness={0.1}
          wireframe={false}
        />
      </Sphere>

      {/* Wireframe lat/lng grid */}
      {latLines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#006C35"
          lineWidth={0.4}
          transparent
          opacity={0.35}
        />
      ))}

      {/* Store pulse dots */}
      {pulseDots.map((d, i) => (
        <StorePulse key={i} position={d.pos} color={d.color} delay={d.delay} />
      ))}
    </group>
  )
}

// ── Ambient stars ─────────────────────────────────────────────────────────────
function Stars() {
  const count = 280
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 4.5 + Math.random() * 2
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      arr[i * 3]     = r * Math.sin(p) * Math.cos(t)
      arr[i * 3 + 1] = r * Math.sin(p) * Math.sin(t)
      arr[i * 3 + 2] = r * Math.cos(p)
    }
    return arr
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#ffffff" sizeAttenuation transparent opacity={0.6} />
    </points>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ storeCount }: { storeCount: number }) {
  const boost = Math.min(Math.max(storeCount, 1), 30) / 30
  return (
    <>
      <ambientLight intensity={0.2 + boost * 0.15} />
      <pointLight position={[5, 5, 5]} intensity={2.5} color="#006C35" />
      <pointLight position={[-4, -3, -4]} intensity={1.2} color="#AECC1E" />
      <Stars />
      <GlobeWireframe />
    </>
  )
}

// ── Public component ──────────────────────────────────────────────────────────
interface AuditGlobeProps {
  storeCount?: number
  height?: number
  className?: string
}

export default function AuditGlobe({ storeCount = 7, height = 340, className = '' }: AuditGlobeProps) {
  return (
    <div style={{ height }} className={`w-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <Scene storeCount={storeCount} />
      </Canvas>
    </div>
  )
}
