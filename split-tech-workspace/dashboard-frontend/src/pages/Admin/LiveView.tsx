import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Activity, Wifi, AlertTriangle, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import { formatRelative } from '../../lib/utils'

function StatSkeleton() {
  return <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
}

function LogSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 animate-pulse">
      <div className="w-8 h-8 bg-slate-100 rounded-xl" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-slate-100 rounded w-1/3" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
      </div>
      <div className="h-3 bg-slate-100 rounded w-16" />
    </div>
  )
}

export default function LiveView() {
  const { lang, t } = useLanguage()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['live-stats'],
    queryFn: async () => {
      const now = Date.now()
      const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString()
      const twentyFourHAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()

      const [activeDevices, todayLogs, alerts, totalStores] = await Promise.all([
        supabase.from('engine_heartbeats').select('store_id', { count: 'exact', head: true }).gte('created_at', fiveMinAgo).eq('status', 'active'),
        supabase.from('analytics_logs').select('id', { count: 'exact', head: true }).gte('created_at', twentyFourHAgo),
        supabase.from('security_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
        supabase.from('stores').select('id', { count: 'exact', head: true }).eq('store_status', 'active'),
      ])
      return {
        activeDevices: activeDevices.count ?? 0,
        todayLogs: todayLogs.count ?? 0,
        activeAlerts: alerts.count ?? 0,
        totalActiveStores: totalStores.count ?? 0,
      }
    },
    refetchInterval: 15_000,
  })

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['global-live-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_logs')
        .select('id, summary, created_at, confidence_score, stores(name)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data || []
    },
    refetchInterval: 15_000,
  })

  const { data: heartbeats = [] } = useQuery({
    queryKey: ['live-heartbeats'],
    queryFn: async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('engine_heartbeats')
        .select('id, status, cpu_usage, memory_usage, created_at, stores(name)')
        .gte('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
        .limit(10)
      return data || []
    },
    refetchInterval: 15_000,
  })

  const statCards: {
    labelKey: TranslationKey
    value: number
    subKey: TranslationKey
    icon: typeof Wifi
    color: string
  }[] = [
    {
      labelKey: 'live.stat.devicesNow',
      value: stats?.activeDevices ?? 0,
      subKey: 'live.stat.devicesSub',
      icon: Wifi,
      color: 'text-brand-700 bg-brand-100',
    },
    {
      labelKey: 'live.stat.stores',
      value: stats?.totalActiveStores ?? 0,
      subKey: 'live.stat.storesSub',
      icon: Eye,
      color: 'text-blue-700 bg-blue-100',
    },
    {
      labelKey: 'live.stat.audits',
      value: stats?.todayLogs ?? 0,
      subKey: 'live.stat.auditsSub',
      icon: Activity,
      color: 'text-purple-700 bg-purple-100',
    },
    {
      labelKey: 'live.stat.alerts',
      value: stats?.activeAlerts ?? 0,
      subKey: 'live.stat.alertsSub',
      icon: AlertTriangle,
      color: stats?.activeAlerts ? 'text-red-700 bg-red-100' : 'text-slate-400 bg-slate-100',
    },
  ]

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-700" />
            {t('live.pageTitle')}
          </h1>
          <p className="text-slate-500 text-sm">{t('live.subtitle')}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-brand-600 font-semibold bg-brand-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          {t('live.badge')}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statCards.map(({ labelKey, value, subKey, icon: Icon, color }) => (
            <motion.div key={labelKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${color}`}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs font-medium text-slate-600">{t(labelKey)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t(subKey)}</p>
            </motion.div>
          ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Active devices */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">{t('live.devices.title')}</h3>
          </div>
          {heartbeats.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">{t('live.devices.empty')}</p>
          ) : (
            <div className="space-y-2">
              {(heartbeats as any[]).map((hb) => (
                <motion.div key={hb.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between py-2 px-3 bg-brand-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse-slow" />
                    <span className="text-sm font-medium text-slate-800">{(hb as any).stores?.name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {hb.cpu_usage != null && <span>CPU: {hb.cpu_usage.toFixed(0)}%</span>}
                    {hb.memory_usage != null && <span>RAM: {hb.memory_usage.toFixed(0)}%</span>}
                    <span className="text-slate-400">{formatRelative(hb.created_at, lang)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Latest audit logs */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">{t('live.audits.title')}</h3>
          </div>
          {logsLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => <LogSkeleton key={i} />)}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">{t('live.audits.empty')}</p>
          ) : (
            <div className="space-y-0 max-h-72 overflow-y-auto">
              {(logs as any[]).map((log, i) => (
                <motion.div key={log.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0"
                >
                  <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Eye size={14} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{log.stores?.name || '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{log.summary || t('live.audit.defaultSummary')}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5 text-end">
                    {formatRelative(log.created_at, lang)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
