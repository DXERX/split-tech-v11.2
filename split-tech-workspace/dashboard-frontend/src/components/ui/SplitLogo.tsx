import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  size?: number
  className?: string
  variant?: 'mark' | 'full' | 'full-white'
}

/** Pure-SVG mark — zero PNG, zero white-background issues */
function SplitMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <rect x="34" y="6"  width="48" height="38" rx="13" fill="#AECC1E" transform="rotate(15 58 25)" />
      <rect x="18" y="56" width="48" height="38" rx="13" fill="#AECC1E" transform="rotate(15 42 75)" />
    </svg>
  )
}

export default function SplitLogo({ size = 32, className = '', variant = 'mark' }: Props) {
  const { isDark } = useTheme()

  /* ── Mark only ── */
  if (variant === 'mark') {
    return (
      <span className={className} style={{ display: 'inline-flex' }} aria-label="SPLIT Intelligence">
        <SplitMark size={size} />
      </span>
    )
  }

  /* ── Full & Full-white ── */
  const isWhite    = variant === 'full-white'
  const textColor  = isWhite ? '#ffffff'        : isDark ? '#EDF2F7' : '#0B1120'
  const subColor   = isWhite ? 'rgba(255,255,255,0.60)' : isDark ? '#7A9AB8' : '#64748B'
  const wordSize   = Math.max(12, Math.round(size * 0.52))
  const subSize    = Math.max(8,  Math.round(size * 0.26))

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ height: size }}
      aria-label="SPLIT Intelligence"
    >
      <SplitMark size={size} />
      <div style={{ lineHeight: 1, userSelect: 'none' }}>
        <div style={{
          fontSize: wordSize,
          fontWeight: 900,
          color: textColor,
          letterSpacing: '-0.03em',
          fontFamily: 'inherit',
        }}>
          SPLIT
        </div>
        <div style={{
          fontSize: subSize,
          color: subColor,
          fontWeight: 500,
          marginTop: 2,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Intelligence
        </div>
      </div>
    </div>
  )
}
