import { useQuery } from '@tanstack/react-query'
import React, { lazy, Suspense } from 'react'
import { Store, CreditCard, Activity, TrendingUp, Clock, CheckCircle, AlertCircle, Headphones, Users, Timer } from 'lucide-react'
import AnimatedCard from '../../components/ui/AnimatedCard'
import { supabase } from '../../lib/supabase'
import { fetchProfilesMap } from '../../lib/adminData'
import { formatRelative, statusLabel, tierLabel } from '../../lib/utils'
import { useLanguage } from '../../contexts/LanguageContext'

const AuditGlobe = lazy(() => import('../../components/ui/AuditGlobe'))

function riyadhTodayMidnightIso(): string {
  const today = new Date()
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), -3, 0, 0),
  ).toISOString()
}

export default function AdminHome() {
  const { t, lang } = useLanguage()

  const { data: staffPulse } = useQuery({
    queryKey: ['admin-staff-pulse'],
    queryFn: async () => {
      const start = riyadhTodayMidnightIso()
      const { data: rows, error } = await supabase
        .from('daily_attendance_view')
        .select('user_id, last_active_at, active_seconds, idle_seconds, check_in_at')
        .gte('check_in_at', start)
      if (error) throw error
      const list = rows ?? []
      const onlineCutoff = Date.now() - 90_000
      const onlineUsers = new Set(
        list.filter((r) => new Date(r.last_active_at).getTime() >= onlineCutoff).map((r) => r.user_id),
      )
      const sessionsToday = new Set(list.map((r) => r.user_id)).size
      const activeSec = list.reduce((s, r) => s + (Number(r.active_seconds) || 0), 0)
      const idleSec = list.reduce((s, r) => s + (Number(r.idle_seconds) || 0), 0)
      return {
        online: onlineUsers.size,
        sessions: sessionsToday,
        activeH: activeSec / 3600,
        idleH: idleSec / 3600,
      }
    },
    refetchInterval: 30_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [storesRes, subsRes, logsRes, ticketsRes, emergencyRes, speedRes, activationRes] = await Promise.all([
        supabase.from('stores').select('id, store_status, verification_status, verification_requested_at, reviewed_at', { count: 'exact' }),
        supabase.from('subscriptions').select('id, status, tier', { count: 'exact' }),
        supabase.from('analytics_logs').select('id', { count: 'exact' }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('support_tickets').select('id, status', { count: 'exact' }),
        supabase.from('emergency_broadcasts').select('id, is_active, expires_at', { count: 'exact' }),
        supabase.from('network_speed_tests').select('id, upload_ok, created_at', { count: 'exact' }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('activation_request_attempts').select('id, action, created_at', { count: 'exact' }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ])

      if (storesRes.error) console.error('[admin-stats] stores:', storesRes.error)
      if (subsRes.error) console.error('[admin-stats] subs:', subsRes.error)
      if (logsRes.error) console.error('[admin-stats] logs:', logsRes.error)
      if (ticketsRes.error) console.error('[admin-stats] tickets:', ticketsRes.error)
      if (emergencyRes.error) console.error('[admin-stats] emergency:', emergencyRes.error)
      if (speedRes.error) console.error('[admin-stats] speed-tests:', speedRes.error)
      if (activationRes.error) console.error('[admin-stats] activation-attempts:', activationRes.error)

      const verificationQueue = (storesRes.data || []).filter((store: any) => {
        const requestedAt = store.verification_requested_at ? new Date(store.verification_requested_at).getTime() : 0
        const reviewedAt = store.reviewed_at ? new Date(store.reviewed_at).getTime() : 0

        return store.store_status === 'pending'
          || ['pending', 'under_review', 'rejected'].includes(store.verification_status || 'pending')
          || (requestedAt > 0 && reviewedAt < requestedAt)
      })

      return {
        totalStores: storesRes.count ?? storesRes.data?.length ?? 0,
        activeStores: storesRes.data?.filter((s) => s.store_status === 'active').length ?? 0,
        pendingStores: verificationQueue.length,
        activeSubscriptions: subsRes.data?.filter((s) => s.status === 'active').length ?? 0,
        pendingSubscriptions: subsRes.data?.filter((s: any) => s.status === 'pending' || s.status === 'trialing').length ?? 0,
        activeTickets: ticketsRes.data?.filter((ticket: any) => ['open', 'in_progress'].includes(ticket.status)).length ?? 0,
        todayAudits: logsRes.count ?? 0,
        activeEmergencies: emergencyRes.data?.filter((item: any) => item.is_active && new Date(item.expires_at).getTime() > Date.now()).length ?? 0,
        todaySpeedTests: speedRes.count ?? 0,
        todayActivationAttempts: activationRes.count ?? 0,
      }
    },
    refetchInterval: 60_000,
  })

  const { data: queue = { tickets: [], subscriptions: [], verifications: [] } } = useQuery({
    queryKey: ['admin-queue'],
    queryFn: async () => {
      const [ticketsRes, subsRes, verificationRes] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('id, user_id, title, priority, status, created_at')
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('subscriptions')
          .select('id, user_id, tier, status, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('stores')
          .select('id, user_id, name, store_status, verification_status, verification_requested_at, reviewed_at, created_at')
          .order('verification_requested_at', { ascending: false, nullsFirst: false })
          .limit(12),
      ])

      if (ticketsRes.error) throw ticketsRes.error
      if (subsRes.error) throw subsRes.error
      if (verificationRes.error) throw verificationRes.error

      const actionableVerifications = (verificationRes.data || []).filter((store: any) => {
        const requestedAt = store.verification_requested_at ? new Date(store.verification_requested_at).getTime() : 0
        const reviewedAt = store.reviewed_at ? new Date(store.reviewed_at).getTime() : 0

        return store.store_status === 'pending'
          || ['pending', 'under_review', 'rejected'].includes(store.verification_status || 'pending')
          || (requestedAt > 0 && reviewedAt < requestedAt)
      }).slice(0, 5)

      const profilesMap = await fetchProfilesMap([
        ...(ticketsRes.data || []).map((ticket) => ticket.user_id),
        ...(subsRes.data || []).map((sub) => sub.user_id),
        ...actionableVerifications.map((store: any) => store.user_id),
      ])

      return {
        tickets: (ticketsRes.data || []).map((ticket) => ({
          ...ticket,
          profile: profilesMap[ticket.user_id] ?? null,
        })),
        subscriptions: (subsRes.data || []).map((sub) => ({
          ...sub,
          profile: profilesMap[sub.user_id] ?? null,
        })),
        verifications: actionableVerifications.map((store: any) => ({
          ...store,
          profile: profilesMap[store.user_id] ?? null,
        })),
      }
    },
    refetchInterval: 30_000,
  })

  const { data: recentLogs } = useQuery({
    queryKey: ['recent-audits-admin'],
    queryFn: async () => {
      const { data } = await supabase
        .from('analytics_logs')
        .select('id, store_id, summary, created_at, stores(name)')
        .order('created_at', { ascending: false })
        .limit(5)
      return data
    },
    refetchInterval: 30_000,
  })

  const fmtHours = (h: number) => (Number.isFinite(h) ? h.toFixed(1) : '0')

  const statCards = [
    { label: t('admin.dash.staffOnline'), value: staffPulse?.online ?? '—', icon: Users, color: 'text-emerald-700 bg-emerald-100' },
    { label: t('admin.dash.staffToday'), value: staffPulse?.sessions ?? '—', icon: Activity, color: 'text-sky-700 bg-sky-100' },
    { label: t('admin.dash.activeTime'), value: staffPulse ? `${fmtHours(staffPulse.activeH)}h` : '—', icon: Timer, color: 'text-brand-700 bg-brand-100' },
    { label: t('admin.dash.idleTime'), value: staffPulse ? `${fmtHours(staffPulse.idleH)}h` : '—', icon: Clock, color: 'text-slate-600 bg-slate-100' },
    { label: 'Total Stores',       value: stats?.totalStores ?? '—',              icon: Store,      color: 'text-brand-700 bg-brand-100' },
    { label: 'Active Stores',      value: stats?.activeStores ?? '—',             icon: CheckCircle,color: 'text-brand-700 bg-brand-100' },
    { label: 'Pending Approval',   value: stats?.pendingStores ?? '—',            icon: Clock,      color: stats?.pendingStores ? 'text-amber-700 bg-amber-100' : 'text-slate-400 bg-slate-100' },
    { label: 'Pending Subs',       value: stats?.pendingSubscriptions ?? '—',     icon: CreditCard, color: stats?.pendingSubscriptions ? 'text-amber-700 bg-amber-100' : 'text-blue-700 bg-blue-100' },
    { label: 'Active Tickets',     value: stats?.activeTickets ?? '—',            icon: Headphones, color: stats?.activeTickets ? 'text-red-700 bg-red-100' : 'text-slate-400 bg-slate-100' },
    { label: 'Emergency Broadcasts',value: stats?.activeEmergencies ?? '—',      icon: AlertCircle,color: stats?.activeEmergencies ? 'text-red-700 bg-red-100' : 'text-slate-400 bg-slate-100' },
    { label: "Today's Speed Tests", value: stats?.todaySpeedTests ?? '—',        icon: TrendingUp, color: 'text-blue-700 bg-blue-100' },
    { label: 'Activation Attempts',value: stats?.todayActivationAttempts ?? '—', icon: Activity,   color: 'text-purple-700 bg-purple-100' },
    { label: "Today's Audits",     value: stats?.todayAudits ?? '—',             icon: Activity,   color: 'text-purple-700 bg-purple-100' },
  ]

  return (
    <div className="page-container space-y-6">
      {/* 3D Audit Globe hero */}
      <div className="relative bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 rounded-2xl overflow-hidden">
        <Suspense fallback={null}>
          <AuditGlobe storeCount={stats?.activeStores ?? 7} height={300} className="absolute inset-0" />
        </Suspense>
        <div className="relative z-10 p-6">
          <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-1">{t('admin.dash.heroBadge')}</p>
          <h1 className="text-2xl font-bold text-white">{t('admin.dash.heroTitle')}</h1>
          <p className="text-slate-400 text-sm">{stats?.activeStores ?? 0} {t('admin.dash.heroStores')}</p>
        </div>
      </div>

      <div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('admin.dash.overviewHint')}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }, i) => (
          <AnimatedCard
            key={label}
            delay={i * 0.07}
            className="rounded-2xl border shadow-card p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' } as React.CSSProperties}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon size={20} />
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-base)' }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </AnimatedCard>
        ))}
      </div>

      {/* Pending alert */}
      {stats?.pendingStores && stats.pendingStores > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">
              {stats.pendingStores} {stats.pendingStores === 1 ? 'store needs' : 'stores need'} your approval
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Go to "Store Approvals" to review pending requests</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Headphones className="w-5 h-5 text-red-600" />
            <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>Active Tickets</h3>
          </div>
          {!queue.tickets.length ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>No active tickets right now</p>
          ) : (
            <div className="space-y-3">
              {queue.tickets.map((ticket: any) => (
                <div key={ticket.id} className="flex items-center justify-between py-2 last:border-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>{ticket.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ticket.profile?.company_name || ticket.profile?.full_name || '—'} • {statusLabel(ticket.status, 'en')}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{formatRelative(ticket.created_at, 'en')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>Recent Subscription Requests</h3>
          </div>
          {!queue.subscriptions.length ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>No pending subscription requests</p>
          ) : (
            <div className="space-y-3">
              {queue.subscriptions.map((subscription: any) => (
                <div key={subscription.id} className="flex items-center justify-between py-2 last:border-0 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>{subscription.profile?.company_name || subscription.profile?.full_name || '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tierLabel(subscription.tier, 'en')} • {statusLabel(subscription.status, 'en')}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{formatRelative(subscription.created_at, 'en')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-brand-700" />
            <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>Verification & Activation Queue</h3>
          </div>
          {!queue.verifications.length ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>No pending verification requests</p>
          ) : (
            <div className="space-y-3">
              {queue.verifications.map((store: any) => (
                <div key={store.id} className="flex items-center justify-between py-2 last:border-0 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>{store.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{store.profile?.company_name || store.profile?.full_name || '—'} • {statusLabel(store.store_status === 'pending' ? 'pending' : 'active', lang)}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{store.verification_requested_at ? formatRelative(store.verification_requested_at, 'en') : formatRelative(store.created_at, 'en')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent audits */}
      <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>Recent Audit Rounds</h3>
        </div>
        {!recentLogs?.length ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>No audit rounds yet</p>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between py-2 last:border-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>{log.stores?.name || '—'}</p>
                  <p className="text-xs line-clamp-1" style={{ color: 'var(--text-muted)' }}>{log.summary || 'Audit round'}</p>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{formatRelative(log.created_at, 'en')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
