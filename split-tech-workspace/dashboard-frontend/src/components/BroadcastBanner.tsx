import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, Info, Wrench, Sparkles, Zap } from 'lucide-react'

const typeConfig: Record<string, { icon: typeof Info; classes: string }> = {
  info:        { icon: Info,          classes: 'bg-blue-50 border-blue-200 text-blue-800' },
  warning:     { icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-amber-800' },
  maintenance: { icon: Wrench,        classes: 'bg-slate-50 border-slate-200 text-slate-700' },
  feature:     { icon: Sparkles,      classes: 'bg-purple-50 border-purple-200 text-purple-800' },
  urgent:      { icon: Zap,           classes: 'bg-red-50 border-red-200 text-red-800' },
}

export default function BroadcastBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data: broadcasts = [] } = useQuery({
    queryKey: ['active-broadcasts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(3)
      return data || []
    },
    refetchInterval: 60_000,
  })

  const visible = (broadcasts as any[]).filter((b) => !dismissed.has(b.id))

  if (!visible.length) return null

  return (
    <div className="space-y-2 px-4 sm:px-6 pt-4">
      <AnimatePresence>
        {visible.map((b) => {
          const config = typeConfig[b.type] || typeConfig.info
          const Icon = config.icon
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${config.classes}`}
            >
              <Icon size={16} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{b.title}</p>
                <p className="text-xs mt-0.5 opacity-80">{b.message}</p>
              </div>
              <button
                onClick={() => setDismissed((s) => new Set([...s, b.id]))}
                className="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
