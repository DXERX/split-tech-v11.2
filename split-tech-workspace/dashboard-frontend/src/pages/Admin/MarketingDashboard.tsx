import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { TrendingUp, Users, Store, BarChart3, Star, Activity, Megaphone, ArrowUpRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatUiDate } from '../../lib/utils'

const formatSar = (n: number, lang: 'ar' | 'en') =>
  new Intl.NumberFormat(lang === 'en' ? 'en-SA' : 'ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n)

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.FC<{ className?: string }>
  color: string; sub?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm"
    >
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  )
}

export default function MarketingDashboard() {
  const { lang, t, isRtl } = useLanguage()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['marketing-stats'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString()

      const [storesRes, subsRes, logsRes, newMerchantsRes, auditStatsRes, broadcastsRes] = await Promise.all([
        supabase.from('stores').select('id, store_status, verification_status, created_at', { count: 'exact' }),
        supabase.from('subscriptions').select('id, tier, status, monthly_amount, created_at'),
        supabase.from('analytics_logs').select('id, score, status, created_at').gte('created_at', thirtyDaysAgo),
        supabase.from('profiles').select('id, created_at').gte('created_at', thirtyDaysAgo),
        supabase.from('analytics_logs').select('score, status').not('score', 'is', null),
        supabase.from('broadcasts').select('id, title, type, created_at, is_active').order('created_at', { ascending: false }).limit(5),
      ])

      const subs = subsRes.data ?? []
      const stores = storesRes.data ?? []
      const logs = logsRes.data ?? []
      const newMerchants = newMerchantsRes.data ?? []
      const auditAll = auditStatsRes.data ?? []
      const broadcasts = broadcastsRes.data ?? []

      const activeSubs = subs.filter(s => s.status === 'active')
      const mrr = activeSubs.reduce((acc, s) => acc + (s.monthly_amount ?? 0), 0)

      const tierCounts = { basic: 0, pro: 0, enterprise: 0 }
      activeSubs.forEach(s => { tierCounts[s.tier as keyof typeof tierCounts]++ })

      const avgScore = auditAll.length
        ? Math.round(auditAll.reduce((a, l) => a + (l.score ?? 0), 0) / auditAll.length)
        : 0

      const passRate = auditAll.length
        ? Math.round((auditAll.filter(l => l.status === 'pass').length / auditAll.length) * 100)
        : 0

      const activeStores = stores.filter(s => s.store_status === 'active').length
      const pendingVerification = stores.filter(s =>
        ['pending', 'under_review'].includes(s.verification_status ?? '')
      ).length

      // Week-over-week new merchants
      const newThisWeek = newMerchants.filter(m => m.created_at >= sevenDaysAgo).length

      return {
        mrr, activeSubs: activeSubs.length, totalStores: stores.length,
        activeStores, pendingVerification, tierCounts,
        newMerchantsMonth: newMerchants.length, newThisWeek,
        audits30d: logs.length, avgScore, passRate, broadcasts,
      }
    },
    refetchInterval: 60_000,
  })

  const tiers = useMemo(
    () => [
      { label: t('mkt.overview.tierBasic'), key: 'basic' as const, color: 'bg-gray-400' },
      { label: t('mkt.overview.tierPro'), key: 'pro' as const, color: 'bg-brand-600' },
      { label: t('mkt.overview.tierEnt'), key: 'enterprise' as const, color: 'bg-amber-500' },
    ],
    [t],
  )
  const totalSubs = (stats?.activeSubs ?? 0) || 1

  const broadcastTypeLabel = useMemo(
    (): Record<string, string> => ({
      info: t('mkt.overview.bcInfo'),
      warning: t('mkt.overview.bcWarning'),
      maintenance: t('mkt.overview.bcMaintenance'),
      feature: t('mkt.overview.bcFeature'),
      urgent: t('mkt.overview.bcUrgent'),
    }),
    [t],
  )

  const broadcastTypeColor: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700', warning: 'bg-amber-100 text-amber-700',
    maintenance: 'bg-gray-100 text-gray-700', feature: 'bg-green-100 text-green-700',
    urgent: 'bg-red-100 text-red-700'
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  const subNewMerchants = t('mkt.overview.subNewMerchants').replace('{n}', String(stats?.newMerchantsMonth ?? 0))
  const subPendingVerify = t('mkt.overview.subPending').replace('{n}', String(stats?.pendingVerification ?? 0))

  return (
    <div className="space-y-6 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand-700 rounded-xl">
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('mkt.overview.title')}</h1>
          <p className="text-sm text-gray-500">{t('mkt.overview.subtitle')}</p>
        </div>
      </div>

      {/* Revenue & Growth */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={t('mkt.overview.mrr')}
          value={formatSar(stats?.mrr ?? 0, lang)}
          icon={TrendingUp}
          color="bg-brand-700"
        />
        <StatCard
          label={t('mkt.overview.activeSubs')}
          value={stats?.activeSubs ?? 0}
          icon={Star}
          color="bg-amber-500"
          sub={subNewMerchants}
        />
        <StatCard
          label={t('mkt.overview.activeStores')}
          value={stats?.activeStores ?? 0}
          icon={Store}
          color="bg-emerald-500"
          sub={subPendingVerify}
        />
        <StatCard
          label={t('mkt.overview.newThisWeek')}
          value={stats?.newThisWeek ?? 0}
          icon={Users}
          color="bg-purple-500"
        />
      </div>

      {/* AI Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-brand-700" />
            <h2 className="font-semibold text-gray-800">{t('mkt.overview.aiTitle')}</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.audits30d ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">{t('mkt.overview.audits')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-brand-700">{stats?.avgScore ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">{t('mkt.overview.avgScore')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{stats?.passRate ?? 0}%</p>
              <p className="text-xs text-gray-500 mt-1">{t('mkt.overview.passRate')}</p>
            </div>
          </div>
        </motion.div>

        {/* Tier Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-brand-700" />
            <h2 className="font-semibold text-gray-800">{t('mkt.overview.tiersTitle')}</h2>
          </div>
          <div className="space-y-3">
            {tiers.map(tier => {
              const count = stats?.tierCounts?.[tier.key as keyof typeof stats.tierCounts] ?? 0
              const pct = Math.round((count / totalSubs) * 100)
              return (
                <div key={tier.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{tier.label}</span>
                    <span className="font-medium text-gray-800">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${tier.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* Recent Broadcasts */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-brand-700" />
            <h2 className="font-semibold text-gray-800">{t('mkt.overview.broadcastsTitle')}</h2>
          </div>
          <a href="/admin/broadcasts" className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
            {t('mkt.overview.viewAll')} <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
        {(stats?.broadcasts ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('mkt.overview.noBroadcasts')}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {(stats?.broadcasts ?? []).map((b: any) => (
              <div key={b.id} className="py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
                  <p className="text-xs text-gray-400">{formatUiDate(b.created_at, lang)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ms-2 ${broadcastTypeColor[b.type] ?? 'bg-gray-100 text-gray-700'}`}>
                  {broadcastTypeLabel[b.type] ?? String(b.type)}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
