// NeuralBackground — animated 3D particle network for AI Analysis pages
// Nodes connected by dynamic lines, particles flow along edges
import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const NODE_COUNT  = 55
const EDGE_DIST   = 1.8   // max distance to draw connection line

// ── Node positions (fixed random) ────────────────────────────────────────────
function useNodes() {
  return useMemo(() => {
    const positions: THREE.Vector3[] = []
    for (let i = 0; i < NODE_COUNT; i++) {
      positions.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 4,
        ),
      )
    }
    return positions
  }, [])
}

// ── Edges (pairs within EDGE_DIST) ──────────────────────────────────────────
function useEdges(nodes: THREE.Vector3[]) {
  return useMemo(() => {
    const edges: [number, number][] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].distanceTo(nodes[j]) < EDGE_DIST) {
          edges.push([i, j])
        }
      }
    }
    return edges
  }, [nodes])
}

// ── Node dots ─────────────────────────────────────────────────────────────────
function Nodes({ nodes }: { nodes: THREE.Vector3[] }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(nodes.length * 3)
    nodes.forEach((n, i) => { arr[i * 3] = n.x; arr[i * 3 + 1] = n.y; arr[i * 3 + 2] = n.z })
    return arr
  }, [nodes])

  const ref = useRef<THREE.Points>(null!)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.getElapsedTime() * 0.012
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color="#006C35" sizeAttenuation transparent opacity={0.9} />
    </points>
  )
}

// ── Connection lines ──────────────────────────────────────────────────────────
function Edges({ nodes, edges }: { nodes: THREE.Vector3[]; edges: [number, number][] }) {
  const ref = useRef<THREE.LineSegments>(null!)

  const posArr = useMemo(() => {
    const arr = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], i) => {
      arr[i * 6]     = nodes[a].x; arr[i * 6 + 1] = nodes[a].y; arr[i * 6 + 2] = nodes[a].z
      arr[i * 6 + 3] = nodes[b].x; arr[i * 6 + 4] = nodes[b].y; arr[i * 6 + 5] = nodes[b].z
    })
    return arr
  }, [nodes, edges])

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.getElapsedTime() * 0.012
  })

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[posArr, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#006C35" transparent opacity={0.18} />
    </lineSegments>
  )
}

// ── Travelling data particles along random edges ──────────────────────────────
interface Traveller { edgeIdx: number; t: number; speed: number }

function Travellers({ nodes, edges }: { nodes: THREE.Vector3[]; edges: [number, number][] }) {
  const count = Math.min(40, edges.length)

  const travellers = useMemo<Traveller[]>(() => {
    const list: Traveller[] = []
    const step = Math.max(1, Math.floor(edges.length / count))
    for (let i = 0; i < count; i++) {
      list.push({ edgeIdx: i * step, t: Math.random(), speed: 0.18 + Math.random() * 0.25 })
    }
    return list
  }, [edges.length, count])

  const posArr = useMemo(() => new Float32Array(count * 3), [count])
  const ref    = useRef<THREE.Points>(null!)
  const rotY   = useRef(0)

  useFrame((state, delta) => {
    rotY.current = state.clock.getElapsedTime() * 0.012
    travellers.forEach((tr, i) => {
      tr.t = (tr.t + tr.speed * delta) % 1
      const [a, b] = edges[tr.edgeIdx]
      const pos = nodes[a].clone().lerp(nodes[b], tr.t)
      posArr[i * 3]     = pos.x
      posArr[i * 3 + 1] = pos.y
      posArr[i * 3 + 2] = pos.z
    })
    if (ref.current) {
      ref.current.rotation.y = rotY.current
      ;(ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[posArr, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#AECC1E" sizeAttenuation transparent opacity={0.95} />
    </points>
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
  const nodes = useNodes()
  const edges = useEdges(nodes)
  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 3, 3]} intensity={1.5} color="#006C35" />
      <Edges  nodes={nodes} edges={edges} />
      <Nodes  nodes={nodes} />
      <Travellers nodes={nodes} edges={edges} />
    </>
  )
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props {
  height?: number
  className?: string
}

export default function NeuralBackground({ height = 260, className = '' }: Props) {
  return (
    <div style={{ height }} className={`w-full pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
