import SplitLogo from './SplitLogo'

interface LoadingSpinnerProps {
  full?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const SIZE_PX = { sm: 20, md: 32, lg: 48 } as const

export default function LoadingSpinner({ full, size = 'md', label }: LoadingSpinnerProps) {
  const px = SIZE_PX[size]

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div className="animate-pulse-slow">
        <SplitLogo size={px} variant="mark" />
      </div>
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  )

  if (full) {
    return (
      <div className="fixed inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse-slow">
            <SplitLogo size={56} variant="mark" />
          </div>
          <p className="text-slate-500 font-medium">جاري التحميل…</p>
        </div>
      </div>
    )
  }

  return spinner
}
