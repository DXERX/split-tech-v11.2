import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Monitor,
  AlertTriangle,
  Server,
  Activity,
  Wifi,
  WifiOff,
  Terminal,
  RefreshCw,
  Bug,
  Square,
  ShieldCheck,
  Clock,
  Radio,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRelative, tierLabel } from '../lib/utils'
import { fetchProfilesMap, fetchSubscriptionsMap } from '../lib/adminData'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import type { TranslationKey } from '../i18n'
import { getVerificationMeta, maskSecret } from '../lib/storeWorkflow'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'

const REMOTE_COMMANDS: {
  value: 'restart' | 'stop' | 'run'
  signal: 'RESTART' | 'STOP' | 'START'
  labelKey: TranslationKey
  icon: typeof RefreshCw
  color: string
}[] = [
  { value: 'restart', signal: 'RESTART', labelKey: 'it.remote.restart', icon: RefreshCw, color: 'text-amber-600' },
  { value: 'stop', signal: 'STOP', labelKey: 'it.remote.stop', icon: Square, color: 'text-red-600' },
  { value: 'run', signal: 'START', labelKey: 'it.remote.run', icon: Bug, color: 'text-blue-600' },
]

type ReviewMode = 'review' | 'approve' | 'reject'

export default function ITDashboard() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { lang, t } = useLanguage()
  const remoteCommands = REMOTE_COMMANDS
  const [cmdModal, setCmdModal] = useState<{ open: boolean; storeId: string | null; storeName: string }>({ open: false, storeId: null, storeName: '' })
  const [selectedCmd, setSelectedCmd] = useState('restart')
  const [reviewModal, setReviewModal] = useState<{ open: boolean; storeId: string | null; storeName: string; mode: ReviewMode }>({
    open: false,
    storeId: null,
    storeName: '',
    mode: 'review',
  })
  const [reviewNotes, setReviewNotes] = useState('')

  const { data: heartbeats = [] } = useQuery({
    queryKey: ['all-heartbeats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('engine_heartbeats')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    },
    refetchInterval: 15_000,
  })

  const { data: alerts = [] } = useQuery({
    queryKey: ['all-security-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('security_alerts')
        .select('*, stores(name)')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(50)
      return data || []
    },
    refetchInterval: 30_000,
  })

  const { data: sysLogs = [] } = useQuery({
    queryKey: ['system-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_logs')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    },
    refetchInterval: 30_000,
  })

  const { data: stores = [] } = useQuery({
    queryKey: ['stores-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('stores')
        .select('id, name, store_status, last_heartbeat, remote_command')
        .eq('store_status', 'active')
      return data || []
    },
    refetchInterval: 30_000,
  })

  // Broadcast stats
  const { data: broadcasts = [] } = useQuery({
    queryKey: ['broadcast-stats'],
    queryFn: async () => {
      // Columns must exist on the live DB (PostgREST returns 400 for unknown fields).
      // Older schemas omit kill_signal; use severity for kill-style UI when needed.
      const { data } = await supabase
        .from('emergency_broadcasts')
        .select('id, title, severity, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      return data || []
    },
    refetchInterval: 30_000,
  })

  // Rollback log — requires FK rollback_log.store_id → stores(id) (applied by splittech-api runMigrations)
  const { data: rollbackLogs = [] } = useQuery({
    queryKey: ['rollback-logs-recent'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rollback_log')
        .select('id, store_id, snapshot_id, reason, rolled_back_by, created_at, stores(name)')
        .order('created_at', { ascending: false })
        .limit(10)
      return data || []
    },
    refetchInterval: 30_000,
  })

  const { data: verificationRequests = [] } = useQuery({
    queryKey: ['verification-requests'],
    queryFn: async () => {
      const { data: requestStores, error } = await supabase
        .from('stores')
        .select('*')
        .order('verification_requested_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      const actionableStores = (requestStores || []).filter((store) => {
        const requestedAt = store.verification_requested_at ? new Date(store.verification_requested_at).getTime() : 0
        const reviewedAt = store.reviewed_at ? new Date(store.reviewed_at).getTime() : 0

        return store.store_status === 'pending'
          || ['pending', 'under_review', 'rejected'].includes(store.verification_status || 'pending')
          || (requestedAt > 0 && reviewedAt < requestedAt)
      })

      const [profilesMap, subscriptionsMap] = await Promise.all([
        fetchProfilesMap(actionableStores.map((store) => store.user_id)),
        fetchSubscriptionsMap(actionableStores.flatMap((store) => store.subscription_id ? [store.subscription_id] : [])),
      ])

      return actionableStores.map((store) => ({
        ...store,
        profile: profilesMap[store.user_id] ?? null,
        subscription: store.subscription_id ? subscriptionsMap[store.subscription_id] ?? null : null,
      }))
    },
    refetchInterval: 30_000,
  })

  const sendCommand = useMutation({
    mutationFn: async ({ storeId, command, signal }: { storeId: string; command: 'run' | 'stop' | 'restart'; signal: 'START' | 'STOP' | 'RESTART' }) => {
      const { error } = await supabase
        .from('stores')
        .update({ remote_command: command, admin_override_signal: signal })
        .eq('id', storeId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores-status'] })
      setCmdModal({ open: false, storeId: null, storeName: '' })
    },
  })

  const reviewRequest = useMutation({
    mutationFn: async ({ storeId, mode, notes }: { storeId: string; mode: ReviewMode; notes: string }) => {
      const timestamp = new Date().toISOString()

      if (mode === 'review') {
        const { error } = await supabase
          .from('stores')
          .update({
            verification_status: 'under_review',
            reviewed_by: user!.id,
            reviewed_at: timestamp,
            verification_notes: notes || t('it.review.noteInProgress'),
          })
          .eq('id', storeId)
        if (error) throw error
        return
      }

      if (mode === 'reject') {
        const fallbackReason = t('it.review.rejectDefault')
        const { error } = await supabase
          .from('stores')
          .update({
            store_status: 'inactive',
            verification_status: 'rejected',
            reviewed_by: user!.id,
            reviewed_at: timestamp,
            verification_notes: notes || fallbackReason,
            rejection_reason:    notes || fallbackReason,
          })
          .eq('id', storeId)
        if (error) throw error
        return
      }

      const { error: markError } = await supabase
        .from('stores')
        .update({
          store_status: 'pending',
          verification_status: 'verified',
          reviewed_by: user!.id,
          reviewed_at: timestamp,
          verification_notes: notes || t('it.review.approveDefault'),
          rejection_reason: null,
        })
        .eq('id', storeId)

      if (markError) throw markError

      const { data: { session } } = await supabase.auth.getSession()
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_SUPABASE_URL
      const r = await fetch(`${apiUrl}/v1/admin/approve-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId }),
      })
      const result = await r.json()
      if (!r.ok || result.error) throw new Error(result.error || t('it.err.license'))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores-status'] })
      qc.invalidateQueries({ queryKey: ['all-stores'] })
      qc.invalidateQueries({ queryKey: ['verification-requests'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setReviewModal({ open: false, storeId: null, storeName: '', mode: 'review' })
      setReviewNotes('')
    },
  })

  const connectedStores = stores.filter((s: any) =>
    s.last_heartbeat && Date.now() - new Date(s.last_heartbeat).getTime() < 30 * 60 * 1000,
  )

  const severityBadge = (sev: string) => {
    const map: Record<string, 'expired' | 'warning' | 'pending' | 'info'> = {
      critical: 'expired',
      high: 'warning',
      medium: 'pending',
      low: 'info',
    }
    return map[sev] || 'info'
  }

  const pendingLaunchCount = verificationRequests.filter((store: any) => store.verification_status !== 'verified').length

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Monitor className="w-6 h-6 text-brand-700" />
          {t('it.title')}
        </h1>
        <p className="text-slate-500 text-sm">
          {t('it.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { labelKey: 'it.kpi.connected' as TranslationKey, value: connectedStores.length, icon: Wifi, color: 'text-brand-700 bg-brand-100' },
          { labelKey: 'it.kpi.activation' as TranslationKey, value: pendingLaunchCount, icon: Clock, color: pendingLaunchCount > 0 ? 'text-amber-700 bg-amber-100' : 'text-slate-500 bg-slate-100' },
          { labelKey: 'it.kpi.alerts' as TranslationKey, value: alerts.length, icon: AlertTriangle, color: alerts.length > 0 ? 'text-red-700 bg-red-100' : 'text-slate-400 bg-slate-100' },
          { labelKey: 'it.kpi.disconnected' as TranslationKey, value: stores.length - connectedStores.length, icon: WifiOff, color: 'text-slate-500 bg-slate-100' },
        ].map(({ labelKey, value, icon: Icon, color }) => (
          <div key={labelKey} className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${color}`}>
              <Icon size={18} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{t(labelKey)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold text-slate-900">{t('it.verify.title')}</h3>
          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">{verificationRequests.length}</span>
        </div>

        {verificationRequests.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">{t('it.verify.empty')}</p>
        ) : (
          <div className="space-y-3">
            {verificationRequests.map((request: any) => {
              const verificationMeta = getVerificationMeta(request.verification_status, lang)
              return (
                <div key={request.id} className="rounded-2xl border border-slate-100 p-4 bg-slate-50/50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{request.name}</p>
                      <p className="text-xs text-slate-500">
                        {request.profile?.company_name || request.profile?.full_name || '—'} • {tierLabel(request.subscription?.tier || 'basic', lang)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={verificationMeta.variant} label={verificationMeta.label} />
                      <Badge
                        variant={request.store_status === 'pending' ? 'pending' : 'suspended'}
                        label={request.store_status === 'pending'
                          ? t('it.store.awaitingLaunch')
                          : t('it.store.suspended')}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3 text-xs">
                    <div><p className="text-slate-400 mb-1">{t('it.field.rtsp')}</p><p className="font-medium text-slate-700 break-all">{request.rtsp_url || '—'}</p></div>
                    <div><p className="text-slate-400 mb-1">{t('it.field.ip')}</p><p className="font-medium text-slate-700">{request.camera_ip || '—'}</p></div>
                    <div><p className="text-slate-400 mb-1">{t('it.field.username')}</p><p className="font-medium text-slate-700">{request.camera_username || '—'}</p></div>
                    <div><p className="text-slate-400 mb-1">{t('it.field.password')}</p><p className="font-medium text-slate-700">{maskSecret(request.rtsp_password_encrypted)}</p></div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {request.verification_notes || t('it.notes.none')}
                      {request.verification_requested_at ? ` • ${formatRelative(request.verification_requested_at, lang)}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setReviewNotes(request.verification_notes || '')
                          setReviewModal({ open: true, storeId: request.id, storeName: request.name, mode: 'review' })
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                      >
                        {t('it.btn.markReview')}
                      </button>
                      <button
                        onClick={() => {
                          setReviewNotes(request.verification_notes || '')
                          setReviewModal({ open: true, storeId: request.id, storeName: request.name, mode: 'approve' })
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-700 text-white hover:bg-brand-800 transition-colors"
                      >
                        {t('it.btn.approveLicense')}
                      </button>
                      <button
                        onClick={() => {
                          setReviewNotes(request.rejection_reason || request.verification_notes || '')
                          setReviewModal({ open: true, storeId: request.id, storeName: request.name, mode: 'reject' })
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                      >
                        {t('it.btn.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-red-700">{t('it.alerts.title')}</h3>
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{alerts.length}</span>
          </div>
          <div className="space-y-2">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={severityBadge(alert.severity)} label={alert.severity} />
                    <span className="text-xs text-slate-500">{alert.stores?.name}</span>
                  </div>
                  <p className="text-sm text-slate-700">{alert.message}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{formatRelative(alert.created_at, lang)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold text-slate-900">{t('it.stores.title')}</h3>
        </div>
        {stores.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">{t('it.stores.empty')}</p>
        ) : (
          <div className="space-y-2">
            {stores.map((s: any) => {
              const connected = s.last_heartbeat && Date.now() - new Date(s.last_heartbeat).getTime() < 30 * 60 * 1000
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-brand-500 animate-pulse-slow' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                      {s.remote_command && <p className="text-xs text-amber-600 font-mono">{t('it.stores.cmdLabel')} {s.remote_command}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${connected ? 'text-brand-600' : 'text-slate-400'}`}>
                      {connected ? t('it.status.connected') : t('it.status.disconnected')}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedCmd('restart')
                        setCmdModal({ open: true, storeId: s.id, storeName: s.name })
                      }}
                      className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      <Terminal size={12} />
                      {t('it.stores.command')}
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold text-slate-900">{t('it.heartbeat.title')}</h3>
        </div>
        {heartbeats.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">{t('it.heartbeat.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-start py-2 px-2 text-xs text-slate-400">{t('it.table.store')}</th>
                  <th className="text-start py-2 px-2 text-xs text-slate-400">{t('it.table.status')}</th>
                  <th className="text-start py-2 px-2 text-xs text-slate-400">{t('it.table.cpu')}</th>
                  <th className="text-start py-2 px-2 text-xs text-slate-400">{t('it.table.ram')}</th>
                  <th className="text-start py-2 px-2 text-xs text-slate-400">{t('it.table.time')}</th>
                </tr>
              </thead>
              <tbody>
                {heartbeats.slice(0, 20).map((hb: any) => (
                  <tr key={hb.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 px-2 font-medium">{hb.stores?.name || '—'}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs font-semibold ${hb.status === 'active' ? 'text-brand-600' : hb.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                        {hb.status === 'active'
                          ? t('it.hb.active')
                          : hb.status === 'error'
                            ? t('it.hb.error')
                            : t('it.hb.idle')}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-600">{hb.cpu_usage ? `${hb.cpu_usage.toFixed(1)}%` : '—'}</td>
                    <td className="py-2 px-2 text-slate-600">{hb.memory_usage ? `${hb.memory_usage.toFixed(1)}%` : '—'}</td>
                    <td className="py-2 px-2 text-xs text-slate-400">{formatRelative(hb.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Broadcasts & Rollback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Broadcasts */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-900">{t('it.broadcast.title')}</h3>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">{broadcasts.length}</span>
          </div>
          {broadcasts.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">{t('it.broadcast.empty')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {broadcasts.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{b.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        b.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        b.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{b.severity}</span>
                      {(b.severity === 'killswitch' || b.severity === 'critical') && (
                        <span className="text-[10px] font-bold text-red-600">KILL</span>
                      )}
                      <span className="text-[10px] text-slate-400">{formatRelative(b.created_at, lang)}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${b.is_active ? 'text-red-600' : 'text-slate-400'}`}>
                    {b.is_active ? t('it.broadcast.stateActive') : t('it.broadcast.stateExpired')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rollback Log */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-slate-900">{t('it.rollback.title')}</h3>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">{rollbackLogs.length}</span>
          </div>
          {rollbackLogs.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">{t('it.rollback.empty')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {rollbackLogs.map((r: any) => (
                <div key={r.id} className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{(r as any).stores?.name ?? r.store_id?.slice(0, 8)}</p>
                    <span className="text-[10px] text-slate-400">{formatRelative(r.created_at, lang)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.reason}</p>
                  {r.snapshot_id && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      snapshot: {String(r.snapshot_id).slice(0, 8)}…
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-slate-600" />
          <h3 className="font-bold text-slate-900">{t('it.logs.title')}</h3>
        </div>
        {sysLogs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">{t('it.logs.empty')}</p>
        ) : (
          <div className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto">
            {sysLogs.slice(0, 50).map((log: any) => (
              <div key={log.id} className="flex gap-3 mb-1 text-xs font-mono">
                <span className="text-slate-500 flex-shrink-0">{new Date(log.created_at).toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US')}</span>
                <span
                  className={`flex-shrink-0 uppercase font-bold ${
                    log.log_level === 'error' || log.log_level === 'critical'
                      ? 'text-red-400'
                      : log.log_level === 'warning'
                        ? 'text-yellow-400'
                        : log.log_level === 'info'
                          ? 'text-green-400'
                          : 'text-slate-500'
                  }`}
                >
                  [{log.log_level}]
                </span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={cmdModal.open}
        onClose={() => setCmdModal({ open: false, storeId: null, storeName: '' })}
        title={t('it.modal.cmdTitle').replace('{name}', cmdModal.storeName)}
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {remoteCommands.map(({ value, labelKey, icon: Icon, color }) => (
              <label
                key={value}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-colors ${
                  selectedCmd === value ? 'border-brand-400 bg-brand-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <input type="radio" name="cmd" value={value} checked={selectedCmd === value} onChange={() => setSelectedCmd(value)} className="sr-only" />
                <Icon size={16} className={color} />
                <span className="text-sm font-medium text-slate-800">{t(labelKey)}</span>
              </label>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            {t('it.modal.cmdHint')}
          </div>
          <Button
            className="w-full"
            loading={sendCommand.isPending}
            onClick={() => {
              const cmd = remoteCommands.find((item) => item.value === selectedCmd)
              if (cmdModal.storeId && cmd) {
                sendCommand.mutate({
                  storeId: cmdModal.storeId,
                  command: cmd.value as 'run' | 'stop' | 'restart',
                  signal: cmd.signal as 'START' | 'STOP' | 'RESTART',
                })
              }
            }}
          >
            {t('it.modal.sendCmd')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={reviewModal.open}
        onClose={() => setReviewModal({ open: false, storeId: null, storeName: '', mode: 'review' })}
        title={t('it.modal.reviewTitle').replace('{name}', reviewModal.storeName)}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {reviewModal.mode === 'approve'
              ? t('it.review.bodyApprove')
              : reviewModal.mode === 'reject'
                ? t('it.review.bodyReject')
                : t('it.review.bodyNotes')}
          </p>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={4}
            className="input-field"
            placeholder={t('it.review.notesPlaceholder')}
          />
          <Button
            className="w-full"
            variant={reviewModal.mode === 'reject' ? 'danger' : 'primary'}
            loading={reviewRequest.isPending}
            onClick={() => {
              if (reviewModal.storeId) {
                reviewRequest.mutate({
                  storeId: reviewModal.storeId,
                  mode: reviewModal.mode,
                  notes: reviewNotes,
                })
              }
            }}
          >
            {reviewModal.mode === 'approve'
              ? t('it.review.btnApprove')
              : reviewModal.mode === 'reject'
                ? t('it.review.btnReject')
                : t('it.review.btnSave')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
