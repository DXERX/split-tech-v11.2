import { useEffect, useRef } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'

interface Props { className?: string }

export default function TechPanel({ className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { t } = useLanguage()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number }[] = []

    function resize() {
      canvas!.width  = canvas!.offsetWidth
      canvas!.height = canvas!.offsetHeight
    }

    function init() {
      particles.length = 0
      const count = Math.floor((canvas!.width * canvas!.height) / 7000)
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 2 + 0.4,
          alpha: Math.random() * 0.6 + 0.2,
        })
      }
    }

    function draw() {
      const W = canvas!.width
      const H = canvas!.height
      ctx!.clearRect(0, 0, W, H)

      // Grid lines
      ctx!.strokeStyle = 'rgba(0,95,45,0.12)'
      ctx!.lineWidth = 0.5
      const GRID = 52
      for (let x = 0; x < W; x += GRID) {
        ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, H); ctx!.stroke()
      }
      for (let y = 0; y < H; y += GRID) {
        ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(W, y); ctx!.stroke()
      }

      // Particles + connections
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(174,204,30,${p.alpha})`
        ctx!.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const dx = p.x - particles[j].x
          const dy = p.y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 110) {
            ctx!.beginPath()
            ctx!.moveTo(p.x, p.y)
            ctx!.lineTo(particles[j].x, particles[j].y)
            ctx!.strokeStyle = `rgba(0,95,45,${0.2 * (1 - dist / 110)})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }

    const ro = new ResizeObserver(() => { resize(); init() })
    ro.observe(canvas)
    resize(); init(); draw()

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(135deg, #0B1120 0%, #001A0D 60%, #0B1120 100%)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,95,45,0.2) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 h-full flex flex-col items-center justify-center p-12 text-center">
        <img
          src="/logo-icon.png"
          alt="SPLIT"
          className="w-20 h-auto mb-8"
          style={{ filter: 'drop-shadow(0 0 24px rgba(174,204,30,0.55))' }}
          draggable={false}
        />
        <h2 className="text-white text-xl font-bold leading-snug mb-3">
          {t('tech.tagline')}
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          {t('tech.desc')}
        </p>

        <div className="mt-10 grid grid-cols-3 gap-6 w-full max-w-xs">
          {[
            { v: t('tech.stat1.v'), l: t('tech.stat1.l') },
            { v: t('tech.stat2.v'), l: t('tech.stat2.l') },
            { v: t('tech.stat3.v'), l: t('tech.stat3.l') },
          ].map(s => (
            <div key={s.l} className="text-center">
              <div className="text-xl font-bold" style={{ color: '#AECC1E' }}>{s.v}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
