import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download, Wifi, WifiOff, Clock, ArrowLeft, AlertCircle, Loader,
  ShieldAlert, LifeBuoy, KeyRound, Sparkles, Settings2, CreditCard,
  PhoneCall, Monitor, CheckCircle2, XCircle, TrendingUp, GitBranch,
  ChevronRight, BarChart2, MapPin, Users, Timer, Zap, ScanLine,
  AlertTriangle, Lightbulb, Target, DoorOpen, Camera, Video,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMyStore, useAllMySubscriptions, useStoreApiKey, useMyVoiceAgent } from '../../hooks/useStore'
import { useAuditLogs, useRealtimeAuditLogs } from '../../hooks/useAuditLogs'
import { useBranchComparison, useMyStores } from '../../hooks/useBranches'
import AuditCard from '../../components/AuditCard'
import Badge from '../../components/ui/Badge'
import { formatRelative, generateTxtReport, formatSaudiDate, statusLabel, tierLabel } from '../../lib/utils'
import type { AnalyticsLog } from '../../types'

function severityVariant(severity?: string | null): 'warning' | 'expired' | 'pending' | 'info' {
  if (severity === 'critical') return 'expired'
  if (severity === 'high') return 'warning'
  if (severity === 'medium') return 'pending'
  return 'info'
}

// ── Sparkline (7-day score trend) ─────────────────────────────────────────────
interface SparkPoint { date: string; avg: number | null }

function Sparkline({ points }: { points: SparkPoint[] }) {
  const valid = points.filter(p => p.avg !== null)
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center h-14" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
        — بيانات غير كافية —
      </div>
    )
  }
  const W = 200, H = 56
  const minV = Math.min(...valid.map(p => p.avg!))
  const maxV = Math.max(...valid.map(p => p.avg!))
  const range = maxV - minV || 1
  const xs = valid.map((_, i) => (i / (valid.length - 1)) * W)
  const ys = valid.map(p => H - ((p.avg! - minV) / range) * (H - 10) - 5)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fill = `${path} L${W},${H} L0,${H} Z`
  const last = valid[valid.length - 1].avg!
  const color = last >= 75 ? '#16a34a' : last >= 50 ? '#d97706' : '#dc2626'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={color} />
    </svg>
  )
}

// ── Branch Mini Widget ────────────────────────────────────────────────────────
function BranchWidget({ isAr }: { isAr: boolean }) {
  const { data: branches = [], isLoading } = useBranchComparison()
  const { data: stores = [] } = useMyStores()

  if (isLoading || stores.length <= 1) return null

  const top3 = branches.slice(0, 3)
  const avg = branches.filter(b => b.score !== null).length
    ? Math.round(branches.filter(b => b.score !== null).reduce((s, b) => s + (b.score ?? 0), 0) / branches.filter(b => b.score !== null).length)
    : null

  function scoreColor(s: number | null) {
    if (s === null) return 'var(--text-muted)'
    if (s >= 75) return '#16a34a'
    if (s >= 50) return '#d97706'
    return '#dc2626'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-700 flex items-center justify-center">
            <GitBranch size={15} color="white" />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'مقارنة الفروع' : 'Branch Comparison'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {branches.length} {isAr ? 'فروع' : 'branches'}
              {avg !== null && ` · ${isAr ? 'متوسط' : 'avg'} ${avg}%`}
            </p>
          </div>
        </div>
        <Link
          to="/dashboard/branches"
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          {isAr ? 'عرض الكل' : 'View all'}
          <ChevronRight size={13} />
        </Link>
      </div>

      <div className="space-y-2.5">
        {top3.map((b, i) => (
          <div key={b.id} className="flex items-center gap-3">
            <span className="text-sm w-5 text-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-base)' }}>
                {b.branch_name || b.store_name}
              </p>
              {b.city && (
                <p className="text-[10px] flex items-center gap-0.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <MapPin size={9} />
                  {b.city}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Mini score bar */}
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${b.score ?? 0}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: scoreColor(b.score) }}
                />
              </div>
              <span className="text-xs font-bold w-8 text-end" style={{ color: scoreColor(b.score) }}>
                {b.score !== null ? `${b.score}%` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── 7-day trend card ──────────────────────────────────────────────────────────
function TrendCard({ storeId, isAr }: { storeId: string; isAr: boolean }) {
  const { data: sparkData = [], isLoading } = useQuery({
    queryKey: ['score-trend-7d', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('analytics_logs')
        .select('score, created_at')
        .eq('store_id', storeId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
      if (error) throw error

      // Group by day
      const byDay: Record<string, number[]> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000)
        byDay[d.toISOString().slice(0, 10)] = []
      }
      for (const row of data || []) {
        const day = row.created_at.slice(0, 10)
        if (byDay[day]) byDay[day].push(row.score)
      }
      return Object.entries(byDay).map(([date, scores]) => ({
        date,
        avg: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      }))
    },
    staleTime: 5 * 60_000,
  })

  const lastDay = sparkData.filter(p => p.avg !== null).pop()
  const prevDay = sparkData.filter(p => p.avg !== null).slice(-2, -1).pop()
  const trend = lastDay && prevDay
    ? lastDay.avg! - prevDay.avg!
    : null
  const color = lastDay?.avg !== undefined
    ? lastDay.avg! >= 75 ? '#16a34a' : lastDay.avg! >= 50 ? '#d97706' : '#dc2626'
    : 'var(--text-muted)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} color={color} />
          <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'الأداء (7 أيام)' : 'Performance (7d)'}
          </p>
        </div>
        {trend !== null && (
          <div className="flex items-center gap-1 text-xs font-bold"
               style={{ color: trend >= 0 ? '#16a34a' : '#dc2626' }}>
            {trend >= 0 ? <TrendingUp size={13} /> : <XCircle size={13} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="h-14 flex items-center justify-center">
          <Loader size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : (
        <Sparkline points={sparkData} />
      )}
      <div className="flex justify-between mt-2">
        {sparkData.map((p, i) => (
          <span key={i} className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {new Date(p.date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'short' })}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

// ── Audit Stats (today breakdown) ─────────────────────────────────────────────
function AuditStats({ logs, isLoading, isAr }: { logs: AnalyticsLog[]; isLoading: boolean; isAr: boolean }) {
  const pass = logs.filter(l => l.status === 'pass').length
  const warn = logs.filter(l => l.status === 'warning' || l.status === 'warn').length
  const fail = logs.filter(l => l.status === 'fail').length
  const avgScore = logs.length
    ? Math.round(logs.filter(l => l.score != null).reduce((s, l) => s + (l.score ?? 0), 0) / (logs.filter(l => l.score != null).length || 1))
    : null

  const stats = [
    { label: isAr ? 'ناجح' : 'Pass',    value: pass, icon: <CheckCircle2 size={14} />, color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    { label: isAr ? 'تحذير' : 'Warn',   value: warn, icon: <AlertCircle size={14} />,  color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
    { label: isAr ? 'فاشل' : 'Fail',    value: fail, icon: <XCircle size={14} />,      color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
    { label: isAr ? 'متوسط الدرجة' : 'Avg Score', value: avgScore !== null ? `${avgScore}%` : '—', icon: <Sparkles size={14} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="grid grid-cols-4 gap-3"
    >
      {stats.map((s, i) => (
        <div key={i} className="rounded-2xl border p-3.5 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex justify-center mb-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl"
              style={{ background: s.bg, color: s.color }}>
              {s.icon}
            </span>
          </div>
          <p className="text-xl font-black" style={{ color: isLoading ? 'var(--text-muted)' : s.color }}>
            {isLoading ? '—' : s.value}
          </p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
        </div>
      ))}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const { user, profile } = useAuth()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data: store, isLoading: storeLoading } = useMyStore()
  const { data: allSubs, isLoading: subsLoading } = useAllMySubscriptions()
  const { data: voiceData } = useMyVoiceAgent()
  const visionSub   = allSubs?.vision ?? null
  const voiceSub    = allSubs?.voice ?? voiceData?.subscription ?? null
  const visionActive = visionSub?.status === 'active' || visionSub?.status === 'trialing'
  const voiceActive  = voiceSub?.status  === 'active' || voiceSub?.status  === 'trialing'
  const { data: apiKey } = useStoreApiKey(store?.id)
  // Fetch up to 50 audits today for stats breakdown
  const { data: logs = [], isLoading: logsLoading } = useAuditLogs(store?.id, 'today', 50)
  const qc = useQueryClient()
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set())

  const { data: ops = { alerts: [], tickets: [] } } = useQuery({
    queryKey: ['merchant-ops', user?.id, store?.id],
    enabled: !!user?.id && !!store?.id,
    queryFn: async () => {
      const [alertsRes, ticketsRes] = await Promise.all([
        supabase
          .from('security_alerts')
          .select('id, alert_type, severity, message, created_at, resolved')
          .eq('store_id', store!.id)
          .eq('resolved', false)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('support_tickets')
          .select('id, title, status, priority, created_at')
          .eq('user_id', user!.id)
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      if (alertsRes.error) throw alertsRes.error
      if (ticketsRes.error) throw ticketsRes.error
      return { alerts: alertsRes.data || [], tickets: ticketsRes.data || [] }
    },
    refetchInterval: 30_000,
  })

  const isConnected = store?.last_heartbeat
    ? Date.now() - new Date(store.last_heartbeat).getTime() < 30 * 60 * 1000
    : false

  const handleNewLog = useCallback((log: AnalyticsLog) => {
    setNewLogIds((prev) => new Set([...prev, log.id]))
    qc.invalidateQueries({ queryKey: ['audit-logs', store?.id] })
    setTimeout(() => setNewLogIds((prev) => {
      const s = new Set(prev)
      s.delete(log.id)
      return s
    }), 3000)
  }, [store?.id, qc])

  useRealtimeAuditLogs(store?.id, handleNewLog)

  const tamperSignals = useMemo(() => {
    return (ops.alerts as any[]).filter((alert) => {
      const text = `${alert.alert_type || ''} ${alert.message || ''}`.toLowerCase()
      return ['critical', 'high'].includes(alert.severity || '')
        || /tamper|suspicious|camera|disconnect|cover|عبث|تلاعب|فصل|تعطيل/.test(text)
    })
  }, [ops.alerts])

  const latestLog = logs[0]
  const aiGuide = useMemo(() => {
    if (!isConnected) return { title: t('dash.aiOffTitle'), steps: [t('dash.aiOff1'), t('dash.aiOff2'), t('dash.aiOff3')] }
    if (tamperSignals.length > 0) return { title: t('dash.aiTamperTitle'), steps: [t('dash.aiTamper1'), t('dash.aiTamper2'), t('dash.aiTamper3')] }
    if (latestLog?.status === 'warning' || latestLog?.status === 'fail') {
      return {
        title: t('dash.aiWarnTitle'),
        steps: [
          `${t('dash.aiWarn1')} ${statusLabel(latestLog.status || 'warning', lang)}.`,
          t('dash.aiWarn2'),
          t('dash.aiWarn3'),
        ],
      }
    }
    return { title: t('dash.aiOkTitle'), steps: [t('dash.aiOk1'), t('dash.aiOk2'), t('dash.aiOk3')] }
  }, [isConnected, tamperSignals.length, latestLog, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── V11 tracking hooks — must live before ALL conditional returns (Rules of Hooks) ──
  const [selectedCamera, setSelectedCamera] = useState<string>('all')

  const rawTracking = useMemo(() => {
    if (!latestLog?.result) return null
    const r = latestLog.result as any
    return r?.tracking_data || null
  }, [latestLog])

  // Multi-camera: derived values (not hooks, safe anywhere after rawTracking)
  const isMultiCamera = rawTracking?.multi_camera === true
  const totalCameras  = rawTracking?.total_cameras || 1
  const cameraList = useMemo(() => {
    if (!isMultiCamera || !rawTracking?.cameras) return []
    return Object.entries(rawTracking.cameras).map(([id, data]: [string, any]) => ({
      id,
      name: data.camera_name || id,
    }))
  }, [isMultiCamera, rawTracking])

  const latestTracking = useMemo(() => {
    if (!rawTracking) return null
    if (!isMultiCamera) return rawTracking?.combined || rawTracking
    if (selectedCamera === 'all') return rawTracking.combined
    return rawTracking.cameras?.[selectedCamera] || rawTracking.combined
  }, [rawTracking, isMultiCamera, selectedCamera])

  const latestGemini = useMemo(() => {
    if (!latestLog?.result) return null
    const r = latestLog.result as any
    if (latestLog.summary && latestLog.score != null) {
      return {
        merchant_greeting:      r?.merchant_greeting      || '',
        store_efficiency_rating: latestLog.score,
        executive_summary_ar:   latestLog.summary,
        operational_defects:    r?.operational_defects    || [],
        growth_opportunities_ar: r?.growth_opportunities_ar || [],
        camera_specific_status: r?.camera_specific_status || [],
      }
    }
    return null
  }, [latestLog])

  const questionAnswers = useMemo(() => {
    if (!latestLog?.result) return []
    const r = latestLog.result as any
    return r?.question_answers || []
  }, [latestLog])

  function downloadReport() {
    if (!store || !logs.length) return
    const text = generateTxtReport(store.name, logs)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${store.name}-${new Date().toLocaleDateString('ar-SA')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (storeLoading || subsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-6 h-6 animate-spin text-brand-700" />
      </div>
    )
  }

  // ── No subscription at all → discovery mode ─────────────────────────────
  if (!store && !visionSub && !voiceSub) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-16 px-4">
          <div className="w-16 h-16 bg-brand-100 dark:bg-brand-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-brand-700 dark:text-brand-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>{t('dash.plg.title')}</h2>
          <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t('dash.plg.body')}</p>
          <p className="text-xs mb-8 rounded-xl p-3 border" style={{ color: 'var(--text-soft)', borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
            {t('billing.guidedTip1')} · {t('billing.guidedTip2')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/dashboard/billing" className="btn-primary inline-flex justify-center">
              {t('dash.choosePlanBtn')}
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link to="/dashboard/billing" className="btn-outline inline-flex justify-center">
              {t('dash.plg.ctaBilling')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Voice-only active subscription ─────────────────────────────────────
  if (!store && voiceActive && !visionActive) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-16 px-4">
          <div className="w-16 h-16 bg-brand-100 dark:bg-brand-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PhoneCall className="w-8 h-8 text-brand-700 dark:text-brand-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'اشتراك الوكيل الصوتي فعال' : 'Voice Agent Subscription Active'}
          </h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {isAr
              ? 'باقة الوكيل الصوتي مفعّلة. يمكنك إدارة الوكيل وتخصيص شخصيته من صفحة الوكيل الصوتي.'
              : 'Your voice agent subscription is active. Manage and customize it from the Voice Agent page.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/dashboard/voice-agent" className="btn-primary inline-flex justify-center gap-2">
              <PhoneCall size={16} />
              {isAr ? 'إدارة الوكيل الصوتي' : 'Manage Voice Agent'}
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link to="/dashboard/billing" className="btn-outline inline-flex justify-center">
              {isAr ? 'إضافة باقة الرؤية' : 'Add Vision Plan'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const subPaid = visionActive

  if (store && subPaid && (store.verification_status === 'draft' || !store.verification_status)) {
    return (
      <div className="page-container">
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-16 h-16 bg-brand-100 dark:bg-brand-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Settings2 className="w-8 h-8 text-brand-700 dark:text-brand-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>{t('dash.setupTechTitle')}</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{t('dash.setupTechSub')}</p>
          <Link to="/dashboard/store-setup" className="btn-primary">
            {t('dash.setupTechCta')}
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (store && visionSub && !subPaid && store.verification_status === 'draft') {
    return (
      <div className="page-container">
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>{t('dash.payIncompleteTitle')}</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{t('dash.payIncompleteSub')}</p>
          <Link to="/dashboard/billing" className="btn-primary">
            {t('dash.payIncompleteCta')}
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (store?.store_status === 'pending') {
    return (
      <div className="page-container">
        <div className="max-w-md mx-auto text-center py-20">
          <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }}
            className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </motion.div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>{t('dash.pendingTitle')}</h2>
          <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
            {(() => {
              const [before, after = ''] = t('dash.pendingActivation').split('{name}')
              return <>{before}<strong>{store.name}</strong>{after}</>
            })()}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('dash.pendingNote')}</p>
          <div className="mt-6 bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-4 border border-amber-100 dark:border-amber-800/40 text-sm text-amber-700 dark:text-amber-400">
            {t('dash.pendingContact')} <strong>info@splittech.sa</strong>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN DASHBOARD — Executive Business Dashboard ─────────────────────────
  return (
    <div className="page-container space-y-5">

      {/* ── Header row ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-base)' }}>
            {t('dash.greeting')} {profile?.full_name?.split(' ')[0] || t('dash.greetingNameFallback')} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{store?.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium ${
            isConnected ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400' : ''
          }`} style={!isConnected ? { background: 'var(--bg-muted)', color: 'var(--text-muted)' } : {}}>
            {isConnected
              ? <><Wifi size={15} /><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span></span></>
              : <WifiOff size={15} />}
            {isConnected ? t('dash.engineOn') : t('dash.engineOff')}
          </div>
          {store?.last_heartbeat && (
            <span className="text-xs hidden sm:block" style={{ color: 'var(--text-faint)' }}>
              {t('dash.lastActive')} {formatRelative(store.last_heartbeat, lang)}
            </span>
          )}
          <Link to="/dashboard/zone-config"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-soft)' }}>
            <ScanLine size={14} />
            {isAr ? 'إعداد المناطق' : 'Zone Config'}
          </Link>
          {/* Multi-camera indicator */}
          {isMultiCamera && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400">
              <Video size={14} />
              {totalCameras} {isAr ? 'كاميرات' : 'cameras'}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Camera Selector (multi-camera only) ── */}
      {isMultiCamera && cameraList.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCamera('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              selectedCamera === 'all'
                ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                : 'hover:bg-[var(--bg-subtle)]'
            }`}
            style={selectedCamera !== 'all' ? { borderColor: 'var(--border)', color: 'var(--text-soft)' } : {}}
          >
            <Users size={13} />
            {isAr ? 'جميع الكاميرات' : 'All Cameras'}
          </button>
          {cameraList.map((cam) => (
            <button
              key={cam.id}
              onClick={() => setSelectedCamera(cam.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                selectedCamera === cam.id
                  ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                  : 'hover:bg-[var(--bg-subtle)]'
              }`}
              style={selectedCamera !== cam.id ? { borderColor: 'var(--border)', color: 'var(--text-soft)' } : {}}
            >
              <Camera size={13} />
              {cam.name}
            </button>
          ))}
        </motion.div>
      )}

      {/* ── Camera Status Cards (from Gemini cross-camera analysis) ── */}
      {isMultiCamera && latestGemini?.camera_specific_status?.length > 0 && selectedCamera === 'all' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {latestGemini.camera_specific_status.map((cam: any) => (
            <button
              key={cam.camera_id}
              onClick={() => setSelectedCamera(cam.camera_id)}
              className="rounded-2xl border p-4 text-start transition-all hover:shadow-md"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  cam.status === 'critical' ? 'bg-red-100 dark:bg-red-950/40' :
                  cam.status === 'warning' ? 'bg-amber-100 dark:bg-amber-950/40' :
                  'bg-emerald-100 dark:bg-emerald-950/40'
                }`}>
                  <Camera size={15} className={
                    cam.status === 'critical' ? 'text-red-600 dark:text-red-400' :
                    cam.status === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: 'var(--text-base)' }}>
                    {cam.camera_name || cam.camera_id}
                  </p>
                  <span className={`text-[10px] font-semibold uppercase ${
                    cam.status === 'critical' ? 'text-red-600' :
                    cam.status === 'warning' ? 'text-amber-600' :
                    'text-emerald-600'
                  }`}>
                    {cam.status === 'critical' ? (isAr ? 'حرج' : 'Critical') :
                     cam.status === 'warning' ? (isAr ? 'تحذير' : 'Warning') :
                     (isAr ? 'طبيعي' : 'Normal')}
                  </span>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {cam.summary_ar || ''}
              </p>
            </button>
          ))}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 1: LIVE BUSINESS CARDS — بطاقات الأداء الحي
      ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── V11.2 Dynamic KPI Grid based on business type ── */}
      {latestTracking && (() => {
        const isVehicle = ['drive_thru', 'car_wash'].includes(
          (latestTracking as any).business_type || store?.store_type || 'retail'
        )
        if (isVehicle) {
          const td = latestTracking as any
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
              className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>إجمالي المركبات اليوم</p>
                <p className="text-2xl font-black" style={{ color: 'var(--primary)' }}>{td.total_vehicles ?? td.total_visitors ?? '—'}</p>
              </div>
              <div className="rounded-2xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>متوسط وقت الخدمة للمركبة</p>
                <p className="text-2xl font-black" style={{ color: 'var(--primary)' }}>{td.avg_vehicle_dwell_min ?? td.avg_dwell_min ?? '—'} <span className="text-sm font-normal">د</span></p>
              </div>
              <div className="rounded-2xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>تدفق المركبات المكتمل</p>
                <p className="text-2xl font-black" style={{ color: '#16a34a' }}>{td.completed_vehicles ?? td.zone_entries ?? '—'}</p>
              </div>
            </motion.div>
          )
        }
        // default: person-based KPIs already exist below
        return null
      })()}
      {visionActive && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Verified Footfall — إجمالي زوار اليوم */}
            <div className="rounded-2xl border shadow-card p-5 relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="absolute top-0 end-0 w-24 h-24 rounded-full opacity-[0.07]"
                style={{ background: '#16a34a', transform: 'translate(30%, -30%)' }} />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <DoorOpen size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? 'زوار اليوم' : 'Today\'s Visitors'}
                  </p>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {latestTracking?.daily_stats?.total_customers ?? '—'}
                  </p>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {isAr ? 'عد حقيقي من خط الباب — بدون تكرار' : 'Verified door count — no duplicates'}
              </p>
            </div>

            {/* Average Dwell Time — متوسط وقت الخدمة */}
            <div className="rounded-2xl border shadow-card p-5 relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="absolute top-0 end-0 w-24 h-24 rounded-full opacity-[0.07]"
                style={{ background: '#3b82f6', transform: 'translate(30%, -30%)' }} />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                  <Timer size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? 'متوسط وقت الخدمة' : 'Avg Service Time'}
                  </p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400">
                    {(() => {
                      const zones = latestTracking?.zones || {}
                      const dwells = Object.values(zones).map((z: any) => z?.avg_dwell_seconds || 0).filter(Boolean)
                      if (dwells.length === 0) return '—'
                      const avg = (dwells as number[]).reduce((a, b) => a + b, 0) / dwells.length
                      return `${Math.round(avg / 60)}${isAr ? ' د' : 'm'}`
                    })()}
                  </p>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {isAr ? 'متوسط الوقت في منطقة الخدمة' : 'Average time in service zone'}
              </p>
            </div>

            {/* Peak Traffic Hour — ساعة الذروة */}
            <div className="rounded-2xl border shadow-card p-5 relative overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="absolute top-0 end-0 w-24 h-24 rounded-full opacity-[0.07]"
                style={{ background: '#f59e0b', transform: 'translate(30%, -30%)' }} />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                  <Zap size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? 'ساعة الذروة' : 'Peak Hour'}
                  </p>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-400">
                    {latestTracking?.daily_stats?.peak_hour || '—'}
                  </p>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {isAr
                  ? `ذروة: ${latestTracking?.daily_stats?.peak_customers ?? '—'} زبون في وقت واحد`
                  : `Peak: ${latestTracking?.daily_stats?.peak_customers ?? '—'} simultaneous customers`}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Efficiency Score Ring ── */}
      {visionActive && latestLog?.score != null && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border shadow-card p-6"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Score Ring */}
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-subtle)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none"
                  stroke={latestLog.score >= 75 ? '#16a34a' : latestLog.score >= 50 ? '#d97706' : '#dc2626'}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(latestLog.score / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black" style={{ color: 'var(--text-base)' }}>{latestLog.score}%</span>
                <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'كفاءة التشغيل' : 'Efficiency'}
                </span>
              </div>
            </div>
            {/* Greeting + Summary */}
            <div className="flex-1 text-center sm:text-start">
              {latestGemini?.merchant_greeting && (
                <p className="text-sm font-bold mb-2" style={{ color: 'var(--primary)' }}>
                  {latestGemini.merchant_greeting}
                </p>
              )}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                {latestGemini?.executive_summary_ar || latestLog.summary || (isAr ? 'لا يوجد ملخص' : 'No summary')}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant={latestLog.status === 'pass' ? 'info' : latestLog.status === 'fail' ? 'expired' : 'warning'}
                  label={statusLabel(latestLog.status || 'pass', lang)} />
                <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  {formatRelative(latestLog.created_at, lang)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 2: LIVE ISSUES & COMPLIANCE RADAR — رادار العيوب
      ══════════════════════════════════════════════════════════════════════════ */}
      {visionActive && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="rounded-2xl border shadow-card p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'رادار العيوب والمخالفات' : 'Issues & Compliance Radar'}
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'عيوب التشغيل المكتشفة في آخر دورة' : 'Operational defects from last cycle'}
              </p>
            </div>
          </div>

          {(() => {
            const defects = latestGemini?.operational_defects || []
            const alerts = (ops.alerts as any[]).filter(a =>
              ['critical', 'high'].includes(a.severity || '')
            )

            if (defects.length === 0 && alerts.length === 0 && tamperSignals.length === 0) {
              return (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {isAr ? 'لا توجد مخالفات — التشغيل سلس' : 'No issues — operations running smoothly'}
                  </p>
                </div>
              )
            }

            return (
              <div className="space-y-2.5">
                {/* Gemini operational defects */}
                {defects.map((d: any, i: number) => (
                  <div key={`defect-${i}`}
                    className={`rounded-xl p-3.5 border ${
                      d.type === 'Violation'
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/40'
                        : d.type === 'Revenue Warning'
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40'
                          : 'bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/40'
                    }`}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {d.type === 'Violation' ? '🔴' : d.type === 'Revenue Warning' ? '⚠️' : d.type === 'Leakage' ? '🚨' : '🔶'}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            d.type === 'Violation' ? 'text-red-600'
                            : d.type === 'Revenue Warning' ? 'text-amber-600'
                            : d.type === 'Leakage' ? 'text-red-500'
                            : 'text-orange-600'
                          }`}>
                            {d.type === 'Violation' ? (isAr ? 'مخالفة' : 'Violation')
                              : d.type === 'Revenue Warning' ? (isAr ? 'تحذير إيرادات' : 'Revenue Warning')
                              : d.type === 'Leakage' ? (isAr ? 'تسريب عملاء' : 'Customer Leakage')
                              : (isAr ? 'اختناق' : 'Bottleneck')}
                          </span>
                          {d.affected_area && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                              📍 {d.affected_area}
                            </span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                          {d.description_ar || d.description || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Security alerts */}
                {tamperSignals.slice(0, 3).map((alert: any) => (
                  <div key={alert.id} className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={severityVariant(alert.severity)} label={alert.severity || 'alert'} />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {formatRelative(alert.created_at, lang)}
                          </span>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-soft)' }}>{alert.message || alert.alert_type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 3: GROWTH OPPORTUNITIES — فرص النمو
      ══════════════════════════════════════════════════════════════════════════ */}
      {visionActive && latestGemini?.growth_opportunities_ar && latestGemini.growth_opportunities_ar.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="rounded-2xl border shadow-card p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center">
              <Lightbulb size={16} className="text-brand-700 dark:text-brand-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'فرص النمو وزيادة الأرباح' : 'Growth Opportunities'}
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'توصيات ذكية مبنية على بيانات متجرك' : 'AI recommendations based on your store data'}
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            {latestGemini.growth_opportunities_ar.map((opp: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-subtle)' }}>
                <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-brand-700 dark:text-brand-400">{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>{opp}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 4: AI DAILY BUSINESS REPORT — التقرير التنفيذي
      ══════════════════════════════════════════════════════════════════════════ */}
      {visionActive && latestLog && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          className="rounded-2xl border shadow-card overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-brand-700 to-brand-600 p-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-brand-200" />
              <span className="text-brand-200 text-xs font-semibold uppercase tracking-wide">
                {isAr ? 'التقرير التنفيذي الذكي' : 'AI Executive Report'}
              </span>
            </div>
            <p className="font-bold text-lg">
              {isAr ? 'تحليل أداء منشأتك' : 'Business Performance Analysis'}
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* AI Reasoning */}
            {latestLog.ai_reasoning && (
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                  {latestLog.ai_reasoning}
                </p>
              </div>
            )}

            {/* Observations */}
            {latestLog.observations && Array.isArray(latestLog.observations) && latestLog.observations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الملاحظات' : 'Observations'}
                </p>
                {(latestLog.observations as any[]).map((obs: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-soft)' }}>
                    <span className="flex-shrink-0 mt-0.5">
                      {obs.type === 'positive' ? '✅' : obs.type === 'negative' ? '❌' : '📋'}
                    </span>
                    <span>{obs.text || obs.answer || obs.question || JSON.stringify(obs)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Question Answers */}
            {questionAnswers.length > 0 && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'إجابات أسئلتك' : 'Your Question Answers'}
                </p>
                {questionAnswers.map((qa: any, i: number) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-base)' }}>
                      {qa.question}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                      {qa.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer: download + view all */}
          <div className="px-5 py-3 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              {logs.length > 0 && (
                <button onClick={downloadReport} className="flex items-center gap-1.5 text-xs text-brand-700 font-semibold hover:underline">
                  <Download size={13} />
                  {isAr ? 'تحميل التقرير' : 'Download Report'}
                </button>
              )}
            </div>
            <Link to="/dashboard/audits" className="text-xs font-semibold hover:text-brand-700 transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'عرض كل التقارير' : 'View all reports'} →
            </Link>
          </div>
        </motion.div>
      )}

      {/* ── Trend + Branch side by side ── */}
      {visionActive && store?.id && (
        <div className="grid lg:grid-cols-2 gap-4">
          <TrendCard storeId={store.id} isAr={isAr} />
          <BranchWidget isAr={isAr} />
        </div>
      )}

      {/* ── Zone Config CTA (if no zones configured) ── */}
      {store?.store_status === 'active' && !store.rtsp_url && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">{t('dash.setupRequired')}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t('dash.setupRequiredSub')}</p>
              <div className="flex gap-2 mt-2">
                <Link to="/dashboard/store-setup" className="inline-flex items-center gap-1 text-xs text-amber-700 font-bold hover:underline">
                  {t('dash.goSetup')} <ArrowLeft size={12} />
                </Link>
                <Link to="/dashboard/zone-config" className="inline-flex items-center gap-1 text-xs text-brand-700 font-bold hover:underline">
                  <ScanLine size={12} />
                  {isAr ? 'إعداد المناطق' : 'Setup Zones'}
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── No data state ── */}
      {visionActive && logs.length === 0 && !logsLoading && (
        <div className="rounded-2xl border shadow-card p-10 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 bg-brand-50 dark:bg-brand-950/30 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Clock className="w-6 h-6 text-brand-400" />
          </div>
          <p className="font-semibold mb-1" style={{ color: 'var(--text-soft)' }}>{t('dash.noAudits')}</p>
          {!isConnected && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('dash.noAuditsSub')}</p>}
          <div className="flex gap-3 justify-center mt-4">
            {!store?.rtsp_url && (
              <Link to="/dashboard/store-setup" className="inline-flex items-center gap-1.5 text-sm text-brand-700 font-semibold hover:underline">
                {t('dash.setupCamera')} <ArrowLeft size={14} />
              </Link>
            )}
            <Link to="/dashboard/zone-config" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
              style={{ color: 'var(--text-soft)' }}>
              <ScanLine size={14} />
              {isAr ? 'إعداد مناطق الكاميرا' : 'Configure camera zones'}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
