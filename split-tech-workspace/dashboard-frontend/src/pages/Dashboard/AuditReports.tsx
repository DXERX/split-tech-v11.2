import { useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Loader, BarChart3, Filter, Brain, FileText, Sparkles, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { useMyStore } from '../../hooks/useStore'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { useLanguage } from '../../contexts/LanguageContext'
import AuditCard from '../../components/AuditCard'
import { generateTxtReport } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { downloadAuditReportPDF } from '../../components/reports/AuditReportPDF'
import SubscriptionGate from '../../components/ui/SubscriptionGate'

const NeuralBackground = lazy(() => import('../../components/ui/NeuralBackground'))

type FilterPeriod = 'today' | 'week' | 'month' | 'all'

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? 'https://split-intelligence.vercel.app'

interface StoreAnalysis {
  store_name: string
  analysis: string
  score_avg: number
  total_audits: number
  pass: number
  warn: number
  fail: number
  generated_at: string
}

function AuditReportsInner() {
  const { data: store } = useMyStore()
  const { profile } = useAuth()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  const filterLabels: Record<FilterPeriod, string> = {
    today: t('audits.filter.today'),
    week:  t('audits.filter.week'),
    month: t('audits.filter.month'),
    all:   t('audits.filter.all'),
  }

  const [filter, setFilter] = useState<FilterPeriod>('today')
  const { data: logs = [], isLoading } = useAuditLogs(store?.id, filter, 100)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<StoreAnalysis | null>(null)
  const [aiError, setAiError] = useState('')
  const [aiExpanded, setAiExpanded] = useState(true)

  async function runAiAnalysis() {
    setAiLoading(true)
    setAiError('')
    setAiResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'غير مسجل الدخول' : 'Not logged in')
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/analyze-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (isAr ? 'فشل التحليل' : 'Analysis failed'))
      setAiResult(data)
      setAiExpanded(true)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setAiLoading(false)
    }
  }

  function downloadTxt() {
    if (!store || !logs.length) return
    const text = generateTxtReport(store.name, logs)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${store.name}-${filterLabels[filter]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadPDF() {
    if (!store || !logs.length || !profile) return
    setPdfLoading(true)
    try {
      const { data: exportRow, error } = await supabase
        .rpc('register_report_export', {
          p_store_id:     store.id,
          p_generated_by: profile.id,
          p_report_type:  'audit_summary',
          p_format:       'pdf',
          p_date_from:    null,
          p_date_to:      null,
          p_metadata:     { filter, log_count: logs.length },
        })

      const qrToken = exportRow?.qr_token ?? null
      const verificationUrl = qrToken
        ? `${DASHBOARD_URL}/verify/${qrToken}`
        : DASHBOARD_URL

      if (error) console.warn('register_report_export failed:', error.message)

      await downloadAuditReportPDF({
        storeName:       store.name,
        merchantName:    profile.full_name ?? (isAr ? 'التاجر' : 'Merchant'),
        reportPeriod:    filterLabels[filter],
        generatedAt:     new Date().toLocaleString(isAr ? 'ar-SA' : 'en-US', { timeZone: 'Asia/Riyadh' }),
        qrToken:         qrToken ?? '',
        verificationUrl,
        logs,
      })
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="page-container space-y-6">
      {/* Neural Background hero */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 rounded-2xl overflow-hidden">
        <Suspense fallback={null}>
          <NeuralBackground height={200} className="absolute inset-0" />
        </Suspense>
        <div className="relative z-10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-5 h-5 text-brand-400" />
              <span className="text-brand-400 text-xs font-semibold uppercase tracking-widest">AI Analysis Engine</span>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-brand-400" />
              {t('audits.title')}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">{t('audits.subtitle')}</p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              onClick={runAiAnalysis}
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {aiLoading ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {t('audits.runAi')}
            </button>
            {logs.length > 0 && (
              <>
                <button
                  onClick={downloadPDF}
                  disabled={pdfLoading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-60"
                >
                  {pdfLoading ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
                  {t('audits.downloadPdf')}
                </button>
                <button onClick={downloadTxt} className="btn-secondary flex items-center gap-2">
                  <Download size={16} />
                  {t('audits.downloadTxt')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-muted)' }}>
        {(Object.entries(filterLabels) as [FilterPeriod, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              filter === key ? 'text-brand-700 dark:text-brand-400 shadow-sm' : ''
            }`}
            style={filter === key
              ? { background: 'var(--bg-card)', color: undefined }
              : { color: 'var(--text-muted)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border shadow-card p-4 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-3xl font-bold" style={{ color: 'var(--text-base)' }}>{logs.length}</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'إجمالي الجولات' : 'Total rounds'}
            </p>
          </div>
          <div className="rounded-2xl border shadow-card p-4 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-3xl font-bold" style={{ color: 'var(--text-base)' }}>{logs.filter((l) => l.observations?.length > 0).length}</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'جولات مفصّلة' : 'Detailed rounds'}
            </p>
          </div>
          <div className="rounded-2xl border shadow-card p-4 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-3xl font-bold" style={{ color: 'var(--text-base)' }}>
              {logs.length > 0 ? Math.round(logs.reduce((s, l) => s + (l.confidence_score || 0), 0) / logs.length * 100) : 0}%
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'متوسط الثقة' : 'Avg. confidence'}
            </p>
          </div>
        </div>
      )}

      {/* AI Analysis Result */}
      <AnimatePresence>
        {aiError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-2xl p-4 flex items-center gap-3 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            {aiError}
          </motion.div>
        )}
        {aiResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-brand-900 to-slate-900 rounded-2xl border border-brand-700/40 overflow-hidden">
            <button
              onClick={() => setAiExpanded(v => !v)}
              className="w-full flex items-center justify-between p-5 text-white"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-600/30 flex items-center justify-center">
                  <Brain size={18} className="text-brand-300" />
                </div>
                <div className={isAr ? 'text-right' : 'text-left'}>
                  <p className="font-bold text-white text-sm">
                    {isAr ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'} — {aiResult.store_name}
                  </p>
                  <p className="text-brand-300 text-xs mt-0.5">
                    {aiResult.total_audits} {isAr ? 'جولة' : 'rounds'} · {isAr ? 'متوسط' : 'avg'} {aiResult.score_avg}% · {aiResult.pass} {isAr ? 'ناجح' : 'pass'} / {aiResult.warn} {isAr ? 'تحذير' : 'warn'} / {aiResult.fail} {isAr ? 'فاشل' : 'fail'}
                  </p>
                </div>
              </div>
              {aiExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
            {aiExpanded && (
              <div className="px-5 pb-6 border-t border-brand-700/30 pt-4">
                <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-[inherit]" dir={isAr ? 'rtl' : 'ltr'}>
                  {aiResult.analysis}
                </div>
                <p className="text-slate-500 text-xs mt-4">
                  {new Date(aiResult.generated_at).toLocaleString(isAr ? 'ar-SA' : 'en-US', { timeZone: 'Asia/Riyadh' })}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border shadow-card p-12 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Filter className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
          <p className="font-semibold mb-1" style={{ color: 'var(--text-soft)' }}>
            {t('audits.noLogs')}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'جرّب فلتراً آخر أو تأكد من تشغيل المحرك' : 'Try another filter or ensure the engine is running'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log, i) => (
            <motion.div key={log.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <AuditCard log={log} index={i} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AuditReports() {
  return (
    <SubscriptionGate feature="audits">
      <AuditReportsInner />
    </SubscriptionGate>
  )
}
