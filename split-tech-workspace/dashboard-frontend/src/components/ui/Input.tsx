import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
  suffix?: ReactNode
}

export default function Input({ label, error, hint, icon, suffix, className, id, ...props }: InputProps) {
  const inputId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined)
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 end-3 flex items-center pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'input-field',
            !!icon && 'pe-10',
            !!suffix && 'ps-10',
            error && 'border-red-400 focus:ring-red-200 focus:border-red-400',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-slate-400">
            {suffix}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
