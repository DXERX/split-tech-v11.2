import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Zap, CheckCircle, AlertTriangle, Wifi } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import SubscriptionGate from '../../components/ui/SubscriptionGate'

function DiagnosticInner() {
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<null | { mbps: number; latencyMs: number; uploadOk: boolean }>(null)

  async function runTest() {
    setRunning(true)
    setProgress(5)
    setResult(null)

    const testUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/speed-test/1mb.bin`
    const fallback = 'https://speed.cloudflare.com/__down?bytes=1048576'

    async function test(url: string) {
      const start = performance.now()
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) throw new Error('speed fetch failed')
      const buf = await resp.arrayBuffer()
      const elapsed = (performance.now() - start) / 1000
      const mbps = ((buf.byteLength * 8) / (elapsed * 1_000_000))
      return { mbps: Math.round(mbps * 10) / 10, latencyMs: Math.round(elapsed * 1000) }
    }

    try {
      setProgress(35)
      let s
      try {
        s = await test(testUrl)
      } catch {
        s = await test(fallback)
      }
      setProgress(100)
      setResult({ mbps: s.mbps, latencyMs: s.latencyMs, uploadOk: s.mbps >= 2 })
    } catch {
      setProgress(100)
      setResult({ mbps: 0, latencyMs: 0, uploadOk: false })
    } finally {
      setTimeout(() => setRunning(false), 300)
    }
  }

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Gauge className="w-6 h-6 text-brand-700" />
          {t('diag.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {t('diag.subtitle')} ({t('diag.minimum')})
        </p>
      </div>

      <div
        className="rounded-2xl border shadow-card p-6 grid md:grid-cols-2 gap-6 items-center"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col items-center">
          <div className="relative w-44 h-44">
            <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
              <circle cx="80" cy="80" r="64" fill="none" stroke="var(--border)" strokeWidth="14" />
              <circle
                cx="80" cy="80" r="64" fill="none"
                stroke={result ? (result.uploadOk ? '#10b981' : '#f59e0b') : '#006C35'}
                strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 64}`}
                strokeDashoffset={`${2 * Math.PI * 64 * (1 - progress / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-black" style={{ color: 'var(--text-base)' }}>{result ? result.mbps : progress}</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{result ? 'Mbps' : '%'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <motion.button
            onClick={runTest}
            disabled={running}
            animate={{ boxShadow: running ? ['0 0 0 rgba(0,108,53,0)', '0 0 24px rgba(0,108,53,0.30)', '0 0 0 rgba(0,108,53,0)'] : ['0 0 0 rgba(0,108,53,0)', '0 0 20px rgba(0,108,53,0.20)', '0 0 0 rgba(0,108,53,0)'] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-700 text-white font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            <Zap size={16} />
            {running ? t('diag.running') : t('diag.runTest')}
          </motion.button>

          {result && (
            <div className={`rounded-xl border p-3 ${
              result.uploadOk
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
            }`}>
              <p className="font-semibold flex items-center gap-2">
                {result.uploadOk ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                {result.uploadOk ? t('diag.uploadCapable') : t('diag.uploadFail')}
              </p>
              <p className="text-xs mt-1">{t('diag.latency')}: {result.latencyMs} ms</p>
            </div>
          )}

          <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Wifi size={14} className="text-brand-600 dark:text-brand-400" />
            {isAr ? 'يوصى بسرعة 5+ Mbps لأفضل استقرار' : 'Recommended 5+ Mbps for optimal stability'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Diagnostic() {
  return (
    <SubscriptionGate feature="diagnostic">
      <DiagnosticInner />
    </SubscriptionGate>
  )
}
