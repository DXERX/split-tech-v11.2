import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'lime' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base = `inline-flex items-center justify-center gap-2 font-semibold rounded-lg
    transition-all duration-200 select-none whitespace-nowrap
    disabled:opacity-40 disabled:pointer-events-none`

  const variants = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
    lime:    'bg-lime text-ink hover:bg-lime-dark active:bg-lime-dark font-bold',
    outline: 'bg-white text-ink border border-slate-300 hover:bg-slate-50 hover:border-slate-400',
    ghost:   'text-slate-600 hover:bg-slate-100 hover:text-ink',
    danger:  'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  }

  const sizes = {
    sm: 'px-3.5 py-2 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
  }

  return (
    <button
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
