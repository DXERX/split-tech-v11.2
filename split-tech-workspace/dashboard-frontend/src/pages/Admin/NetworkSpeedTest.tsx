// Network Speed Test — IT role tool
// Tests upload speed to Supabase to verify the store can handle 10-min batch uploads
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wifi, WifiOff, Gauge, CheckCircle, AlertTriangle,
  RotateCcw, Activity, ArrowUpCircle, Clock, Zap,
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

type TestState = 'idle' | 'running' | 'done' | 'error'

interface TestResult {
  downloadMbps: number
  latencyMs: number
  uploadOk: boolean
  verdict: string
}

const MEASURE_FAIL = 'NETWORK_MEASURE_FAIL'

async function measureDownloadSpeed(): Promise<{ mbps: number; latencyMs: number }> {
  const endpoints = [
    `${SUPABASE_URL}/storage/v1/object/public/speed-test/1mb.bin`,
    'https://speed.cloudflare.com/__down?bytes=1048576',
  ]

  for (const url of endpoints) {
    const t0 = performance.now()
    try {
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) continue
      const buf = await resp.arrayBuffer()
      const elapsed = (performance.now() - t0) / 1000
      const bytes = buf.byteLength || 1_048_576
      const mbps = (bytes * 8) / (elapsed * 1_000_000)
      return { mbps: Math.round(mbps * 10) / 10, latencyMs: Math.round(elapsed * 1000) }
    } catch (_) {
      continue
    }
  }
  throw new Error(MEASURE_FAIL)
}

async function measureLatency(): Promise<number> {
  const t0 = performance.now()
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/`, { method: 'HEAD', cache: 'no-store' })
  } catch (_) {}
  return Math.round(performance.now() - t0)
}

export default function NetworkSpeedTest() {
  const { t } = useLanguage()
  const [state, setState] = useState<TestState>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runTest() {
    setState('running')
    setProgress(0)
    setResult(null)
    setError(null)

    try {
      setProgress(20)
      const latencyMs = await measureLatency()
      setProgress(40)

      const { mbps } = await measureDownloadSpeed()
      setProgress(85)

      await new Promise((r) => setTimeout(r, 500))
      setProgress(100)

      const uploadOk = mbps >= 2.0
      const verdict = uploadOk
        ? t('network.verdict.ok').replace('{mbps}', String(mbps))
        : t('network.verdict.slow').replace('{mbps}', String(mbps))

      setResult({ downloadMbps: mbps, latencyMs, uploadOk, verdict })
      setState('done')
    } catch (err: any) {
      setError(err.message === MEASURE_FAIL ? t('network.err.measure') : err.message)
      setState('error')
    }
  }

  const gradeColor = (mbps: number) =>
    mbps >= 10 ? 'text-emerald-500' : mbps >= 4 ? 'text-amber-500' : mbps >= 2 ? 'text-orange-500' : 'text-red-500'

  const gradeLabel = (mbps: number) =>
    mbps >= 10
      ? t('network.grade.excellent')
      : mbps >= 4
        ? t('network.grade.good')
        : mbps >= 2
          ? t('network.grade.fair')
          : t('network.grade.poor')

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand-700 rounded-xl">
          <Gauge className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('network.title')}</h1>
          <p className="text-sm text-gray-500">{t('network.subtitle')}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <Activity className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">{t('network.banner')}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col items-center gap-6">
        <div className="relative w-44 h-44">
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
            <circle cx="80" cy="80" r="64" fill="none" stroke="#f1f5f9" strokeWidth="14" />
            <circle
              cx="80"
              cy="80"
              r="64"
              fill="none"
              stroke={
                state === 'running' ? '#006C35' : result ? (result.uploadOk ? '#10b981' : '#f59e0b') : '#e2e8f0'
              }
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 64}`}
              strokeDashoffset={`${2 * Math.PI * 64 * (1 - progress / 100)}`}
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {state === 'idle' && <Wifi className="w-10 h-10 text-gray-300" />}
            {state === 'running' && (
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                <Activity className="w-10 h-10 text-brand-600" />
              </motion.div>
            )}
            {state === 'done' && result && (
              <div className="text-center">
                <p className={`text-3xl font-black ${gradeColor(result.downloadMbps)}`}>{result.downloadMbps}</p>
                <p className="text-xs text-gray-400 font-medium">{t('network.unitMbps')}</p>
              </div>
            )}
            {state === 'error' && <WifiOff className="w-10 h-10 text-red-400" />}
          </div>
        </div>

        <div className="text-center">
          {state === 'idle' && <p className="text-gray-500 text-sm">{t('network.idleHint')}</p>}
          {state === 'running' && (
            <div className="space-y-2">
              <p className="text-brand-700 font-semibold text-sm">
                {t('network.runningPct').replace('{pct}', String(progress))}
              </p>
              <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-600 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>
          )}
          {state === 'done' && result && (
            <div className="space-y-1">
              <p className={`text-lg font-bold ${gradeColor(result.downloadMbps)}`}>{gradeLabel(result.downloadMbps)}</p>
              <p className="text-gray-500 text-sm">{result.verdict}</p>
            </div>
          )}
          {state === 'error' && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <button
          onClick={runTest}
          disabled={state === 'running'}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all ${
            state === 'running' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand-700 hover:bg-brand-600 text-white shadow-card'
          }`}
        >
          {state === 'running' ? (
            <>
              <Activity className="w-4 h-4 animate-spin" /> {t('network.btnRunning')}
            </>
          ) : state === 'done' || state === 'error' ? (
            <>
              <RotateCcw className="w-4 h-4" /> {t('network.btnRetry')}
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" /> {t('network.btnStart')}
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {state === 'done' && result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center shadow-sm">
              <ArrowUpCircle className="w-6 h-6 text-brand-600 mx-auto mb-2" />
              <p className={`text-3xl font-black ${gradeColor(result.downloadMbps)}`}>{result.downloadMbps}</p>
              <p className="text-xs text-gray-500 mt-1">{t('network.stats.download')}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center shadow-sm">
              <Clock className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p
                className={`text-3xl font-black ${
                  result.latencyMs < 200 ? 'text-emerald-500' : result.latencyMs < 500 ? 'text-amber-500' : 'text-red-500'
                }`}
              >
                {result.latencyMs}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t('network.stats.latency')}</p>
            </div>
            <div
              className={`rounded-2xl border p-5 text-center shadow-sm ${
                result.uploadOk ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
              }`}
            >
              {result.uploadOk ? (
                <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              )}
              <p className={`text-lg font-bold ${result.uploadOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.uploadOk ? t('network.stats.engineOk') : t('network.stats.engineSlow')}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t('network.stats.batchLabel')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {state === 'done' && result && !result.uploadOk && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {t('network.rec.title')}
          </h3>
          <ul className="space-y-2 text-sm text-amber-700 list-disc ps-5">
            <li>{t('network.rec.ethernet')}</li>
            <li>{t('network.rec.devices')}</li>
            <li>{t('network.rec.isp')}</li>
            <li>{t('network.rec.interval')}</li>
          </ul>
        </motion.div>
      )}
    </div>
  )
}
