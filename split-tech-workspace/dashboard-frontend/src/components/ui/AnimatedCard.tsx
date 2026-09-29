// AnimatedCard — spring hover with 3D tilt + stagger children
// Drop-in replacement wrapper for any card element

import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

interface Props {
  children: React.ReactNode
  className?: string
  delay?: number       // stagger delay (seconds)
  tilt?: boolean       // enable 3D tilt on hover
  glow?: boolean       // kept for API compat, ignored
  onClick?: () => void
}

const springConfig = { stiffness: 300, damping: 28, mass: 0.8 }

export default function AnimatedCard({
  children,
  className = '',
  delay = 0,
  tilt = true,
  glow = false,
  onClick,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), springConfig)
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), springConfig)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tilt || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    x.set(px)
    y.set(py)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ scale: 1.015 }}
      style={tilt ? { rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1000 } : {}}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </motion.div>
  )
}

// Stagger container — wraps a list of AnimatedCards
export function StaggerContainer({
  children,
  className = '',
  staggerDelay = 0.07,
}: {
  children: React.ReactNode
  className?: string
  staggerDelay?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
    >
      {children}
    </motion.div>
  )
}

// Stagger item (use inside StaggerContainer)
export function StaggerItem({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18, scale: 0.96 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}
