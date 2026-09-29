import { useEffect, useRef, useState } from 'react'

interface Props {
  to: number
  duration?: number   // ms
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}

export default function CountUp({ to, duration = 1200, decimals = 0, suffix = '', prefix = '', className = '' }: Props) {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    startRef.current = start
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (to - from) * eased)
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [to, duration])

  const display = value.toFixed(decimals)
  return (
    <span className={className}>
      {prefix}{display}{suffix}
    </span>
  )
}
