import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, TrendingUp, Activity, Clock, ShieldAlert, Wallet,
  ServerCrash, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchStoresMap } from '../../lib/adminData'
import { formatUiDate } from '../../lib/utils'
import { useLanguage } from '../../contexts/LanguageContext'

function formatSar(amount: number, lang: 'ar' | 'en') {
  return new Intl.NumberFormat(lang === 'en' ? 'en-SA' : 'ar-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export default function AdminAnalytics() {
  const { t, lang } = useLanguage()

  const { data: logs = [] } = useQuery({
    queryKey: ['admin-all-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const storesMap = await fetchStoresMap((data || []).map((log) => log.store_id))

      return (data || []).map((log) => ({
        ...log,
        stores: log.store_id ? storesMap[log.store_id] ?? null : null,
      }))
    },
    refetchInterval: 60_000,
  })

  const { data: storeActivity = [] } = useQuery({
    queryKey: ['store-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, last_heartbeat, store_status')
        .eq('store_status', 'active')

      if (error) throw error
      return data || []
    },
    refetchInterval: 30_000,
  })

  const { data: finance = { subscriptions: [], alerts: [], systemLogs: [] } } = useQuery({
    queryKey: ['admin-revenue-risk'],
    queryFn: async () => {
      const [subsRes, alertsRes, systemLogsRes] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, status, tier, monthly_amount, auto_renew, end_date, store_id')
          .order('created_at', { ascending: false }),
        supabase
          .from('security_alerts')
          .select('id, store_id, alert_type, severity, message, created_at, resolved')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('system_logs')
          .select('id, store_id, level, event_type, message, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      if (subsRes.error) throw subsRes.error
      if (alertsRes.error) throw alertsRes.error
      if (systemLogsRes.error) throw systemLogsRes.error

      const storeIds = [...new Set([
        ...(alertsRes.data || []).map((item) => item.store_id),
        ...(systemLogsRes.data || []).map((item) => item.store_id),
      ].filter(Boolean))] as string[]

      const storesMap = await fetchStoresMap(storeIds)

      return {
        subscriptions: subsRes.data || [],
        alerts: (alertsRes.data || []).map((alert) => ({
          ...alert,
          storeName: alert.store_id ? storesMap[alert.store_id]?.name ?? null : null,
        })),
        systemLogs: (systemLogsRes.data || []).map((log) => ({
          ...log,
          storeName: log.store_id ? storesMap[log.store_id]?.name ?? null : null,
        })),
      }
    },
    refetchInterval: 60_000,
  })

  const totalToday = logs.filter((l: any) =>
    new Date(l.created_at).toDateString() === new Date().toDateString()
  ).length

  const topStores = useMemo(() => Object.entries(
    logs.reduce((acc: Record<string, number>, l: any) => {
      const name = l.stores?.name || ''
      const key = name || '__unknown__'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5), [logs])

  const activeRevenue = (finance.subscriptions as any[])
    .filter((sub) => ['active', 'trialing'].includes(sub.status))
    .reduce((sum, sub) => sum + Number(sub.monthly_amount || 0), 0)

  const pendingRevenue = (finance.subscriptions as any[])
    .filter((sub) => sub.status === 'pending')
    .reduce((sum, sub) => sum + Number(sub.monthly_amount || 0), 0)

  const atRiskRevenue = (finance.subscriptions as any[])
    .filter((sub) => ['expired', 'suspended', 'cancelled'].includes(sub.status) || sub.auto_renew === false)
    .reduce((sum, sub) => sum + Number(sub.monthly_amount || 0), 0)

  const criticalAlerts = (finance.alerts as any[]).filter((alert) => ['critical', 'high'].includes(alert.severity || ''))
  const tamperAlerts = criticalAlerts.filter((alert) => /tamper|عبث|تلاعب|cover|disconnect|camera/i.test(`${alert.alert_type || ''} ${alert.message || ''}`))
  const disconnectedStores = storeActivity.filter((store: any) => !store.last_heartbeat || Date.now() - new Date(store.last_heartbeat).getTime() > 30 * 60 * 1000)
  const errorLogs = (finance.systemLogs as any[]).filter((log) => ['error', 'critical'].includes((log.level || '').toLowerCase()))

  const continuityPlans = useMemo(
    () => [t('admin.analytics.continuity.p1'), t('admin.analytics.continuity.p2'), t('admin.analytics.continuity.p3')],
    [t, lang],
  )

  const kpi = useMemo(() => [
    { label: t('admin.analytics.kpi.today'), value: totalToday, icon: Activity, color: 'text-brand-700 bg-brand-100' },
    { label: t('admin.analytics.kpi.mrr'), value: formatSar(activeRevenue, lang), icon: Wallet, color: 'text-emerald-700 bg-emerald-100' },
    { label: t('admin.analytics.kpi.pending'), value: formatSar(pendingRevenue, lang), icon: TrendingUp, color: 'text-blue-700 bg-blue-100' },
    { label: t('admin.analytics.kpi.alerts'), value: criticalAlerts.length, icon: ShieldAlert, color: criticalAlerts.length ? 'text-red-700 bg-red-100' : 'text-slate-600 bg-slate-100' },
    { label: t('admin.analytics.kpi.offline'), value: disconnectedStores.length, icon: ServerCrash, color: disconnectedStores.length ? 'text-amber-700 bg-amber-100' : 'text-slate-600 bg-slate-100' },
    { label: t('admin.analytics.kpi.lastLog'), value: logs[0] ? formatUiDate(logs[0].created_at, lang) : '—', icon: Clock, color: 'text-slate-600 bg-slate-100' },
  ], [t, lang, totalToday, activeRevenue, pendingRevenue, criticalAlerts.length, disconnectedStores.length, logs])

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand-700" />
          {t('admin.analytics.title')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t('admin.analytics.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-6 gap-4">
        {kpi.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${color}`}>
              <Icon size={18} />
            </div>
            <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900">{t('admin.analytics.revenue.title')}</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-slate-500 mb-1">{t('admin.analytics.revenue.arr')}</p>
              <p className="font-bold text-emerald-700">{formatSar(activeRevenue * 12, lang)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs text-slate-500 mb-1">{t('admin.analytics.revenue.atRisk')}</p>
              <p className="font-bold text-amber-700">{formatSar(atRiskRevenue, lang)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-1">{t('admin.analytics.revenue.total')}</p>
              <p className="font-bold text-slate-900">{(finance.subscriptions as any[]).length}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {t('admin.analytics.revenue.note')}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-900">{t('admin.analytics.risk.title')}</h3>
          </div>
          <div className="space-y-3">
            {tamperAlerts.length === 0 ? (
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-sm text-brand-700">
                {t('admin.analytics.risk.none')}
              </div>
            ) : (
              tamperAlerts.slice(0, 4).map((alert: any) => (
                <div key={alert.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-800">{alert.storeName || t('admin.analytics.unknown')}</p>
                    <span className="text-[10px] text-slate-400">{formatUiDate(alert.created_at, lang)}</span>
                  </div>
                  <p className="text-xs text-slate-600">{alert.message || alert.alert_type}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-slate-900">{t('admin.analytics.continuity.title')}</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
            {continuityPlans.map((plan) => (
              <li key={plan}>{plan}</li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <strong>{t('admin.analytics.continuity.offline')}</strong> {disconnectedStores.length}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ServerCrash className="w-5 h-5 text-brand-700" />
            <h3 className="font-bold text-slate-900">{t('admin.analytics.faults.title')}</h3>
          </div>
          <div className="space-y-2">
            {errorLogs.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">{t('admin.analytics.faults.none')}</p>
            ) : (
              errorLogs.slice(0, 5).map((log: any) => (
                <div key={log.id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{log.storeName || t('admin.analytics.unknown')}</p>
                    <p className="text-xs text-slate-600">{log.message || log.event_type}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{formatUiDate(log.created_at, lang)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <h3 className="font-bold text-slate-900 mb-4">{t('admin.analytics.top.title')}</h3>
        <div className="space-y-3">
          {topStores.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">{t('admin.analytics.top.empty')}</p>
          ) : (
            topStores.map(([name, count]) => {
              const max = topStores[0][1] as number
              const pct = Math.round((count as number / max) * 100)
              const displayName = name === '__unknown__' ? t('admin.analytics.unknown') : name
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{displayName}</span>
                    <span className="text-sm font-bold text-brand-700">{count} {t('admin.analytics.top.rounds')}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <h3 className="font-bold text-slate-900 mb-4">{t('admin.analytics.conn.title')}</h3>
        <div className="space-y-2">
          {storeActivity.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">{t('admin.analytics.conn.empty')}</p>
          ) : (
            storeActivity.map((store: any) => {
              const connected = store.last_heartbeat && Date.now() - new Date(store.last_heartbeat).getTime() < 30 * 60 * 1000
              return (
                <div key={store.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <span className="text-sm font-medium text-slate-700">{store.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand-500 animate-pulse-slow' : 'bg-slate-300'}`} />
                    <span className={`text-xs font-medium ${connected ? 'text-brand-600' : 'text-slate-400'}`}>
                      {connected ? t('admin.analytics.conn.on') : t('admin.analytics.conn.off')}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <h3 className="font-bold text-slate-900 mb-4">{t('admin.analytics.logs.title')}</h3>
        <div className="space-y-2">
          {logs.slice(0, 20).map((log: any) => (
            <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 text-sm gap-3">
              <div>
                <span className="font-semibold text-slate-800">{log.stores?.name}</span>
                <span className="text-slate-400 mx-2">·</span>
                <span className="text-slate-600 text-xs line-clamp-1 inline">{log.summary || t('admin.analytics.defaultSummary')}</span>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">{formatUiDate(log.created_at, lang)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
