import { cn } from '../../lib/utils'

type BadgeVariant = 'active' | 'pending' | 'suspended' | 'expired' | 'warning' | 'info'

const variants: Record<BadgeVariant, string> = {
  active: 'bg-brand-100 text-brand-700',
  pending: 'bg-amber-100 text-amber-700',
  suspended: 'bg-slate-100 text-slate-600',
  expired: 'bg-red-100 text-red-600',
  warning: 'bg-orange-100 text-orange-700',
  info: 'bg-blue-100 text-blue-700',
}

const dots: Record<BadgeVariant, string> = {
  active: 'bg-brand-500',
  pending: 'bg-amber-500',
  suspended: 'bg-slate-400',
  expired: 'bg-red-500',
  warning: 'bg-orange-500',
  info: 'bg-blue-500',
}

interface BadgeProps {
  variant: BadgeVariant
  label: string
  dot?: boolean
  className?: string
}

export default function Badge({ variant, label, dot = true, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', variants[variant], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dots[variant])} />}
      {label}
    </span>
  )
}
