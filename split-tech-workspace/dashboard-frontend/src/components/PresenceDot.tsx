import { isOnline } from '../hooks/usePresence'

interface Props {
  lastActiveAt: string | null | undefined
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Tiny status dot (green = online, slate = offline) based on last_active_at.
 */
export default function PresenceDot({ lastActiveAt, size = 'sm', className = '' }: Props) {
  const online = isOnline(lastActiveAt)
  const dim = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  const color = online ? 'bg-emerald-500' : 'bg-slate-300'
  const ring = online ? 'ring-emerald-200 animate-pulse' : 'ring-transparent'
  const title = online ? 'متصل' : 'غير متصل'
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block rounded-full ring-2 ${dim} ${color} ${ring} ${className}`}
    />
  )
}
