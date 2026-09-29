import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import {
  Play, CheckCircle, AlertTriangle, XCircle, ChevronRight,
  Brain, TrendingUp, TrendingDown, Minus, ArrowRight,
  Camera, Star, Zap, Shield,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'

const API = import.meta.env.VITE_API_URL

// ── Types ─────────────────────────────────────────────────────
interface Scenario {
  id: number
  store_type: string
  name_ar: string
  name_en: string
  icon: string
  score: number
  status: 'pass' | 'warning' | 'fail'
}

interface AnalysisResult extends Scenario {
  confidence_score: number
  summary_ar: string
  summary_en: string
  observations_ar: string[]
  issues_ar: string[]
  recommendations_ar: string[]
  ai_reasoning: string
  trend: 'up' | 'down' | 'stable'
  analyzed_at: string
}

// ── Status config ─────────────────────────────────────────────
const STATUS = {
  pass:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    labelAr: 'ممتاز',   labelEn: 'Pass',    Icon: CheckCircle },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   labelAr: 'تحذير',   labelEn: 'Warning', Icon: AlertTriangle },
  fail:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    labelAr: 'إخفاق',   labelEn: 'Fail',    Icon: XCircle },
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, stable: Minus }

// ── Score ring ────────────────────────────────────────────────
function ScoreRing({ score, status, size = 140, isAr = true }: { score: number; status: 'pass'|'warning'|'fail'; size?: number; isAr?: boolean }) {
  const [display, setDisplay] = useState(0)
  const r = (size / 2) - 12
  const circ = 2 * Math.PI * r
  const fill = circ - (circ * display) / 100
  const sc = STATUS[status]

  useEffect(() => {
    let frame = 0
    const total = 60
    const timer = setInterval(() => {
      frame++
      setDisplay(Math.round((score * frame) / total))
      if (frame >= total) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [score])

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={sc.color} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.016s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tabular-nums" style={{ color: sc.color }}>{display}%</span>
        <span className="text-[11px] font-bold mt-0.5" style={{ color: sc.color }}>
          {isAr ? sc.labelAr : sc.labelEn}
        </span>
      </div>
    </div>
  )
}

// ── Typing animation ──────────────────────────────────────────
function TypedText({ text, speed = 18 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    let i = 0
    const t = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text, speed])
  return <span>{displayed}<span className="animate-pulse">|</span></span>
}

// ── Analysis progress ─────────────────────────────────────────
const STEPS_AR = [
  'الاتصال بكاميرات المتجر…',
  'استخراج 10 فريمات عالية الدقة…',
  'تشغيل نموذج الذكاء الاصطناعي…',
  'تحليل زي الموظفين…',
  'فحص ترتيب المنتجات…',
  'تقييم نظافة المتجر…',
  'توليد التقرير…',
]
const STEPS_EN = [
  'Connecting to store cameras…',
  'Extracting 10 high-res frames…',
  'Running AI model…',
  'Analyzing staff uniforms…',
  'Checking product arrangement…',
  'Evaluating store cleanliness…',
  'Generating report…',
]

function AnalysisProgress({ onDone, isAr }: { onDone: () => void; isAr: boolean }) {
  const [step, setStep] = useState(0)
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const stepDuration = 340
    const STEPS = isAr ? STEPS_AR : STEPS_EN
    const stepTimer = setInterval(() => {
      setStep(s => {
        if (s >= STEPS.length - 1) { clearInterval(stepTimer); return s }
        return s + 1
      })
    }, stepDuration)

    const pctTimer = setInterval(() => {
      setPct(p => {
        if (p >= 100) { clearInterval(pctTimer); setTimeout(onDone, 300); return 100 }
        return Math.min(100, p + 3)
      })
    }, 80)

    return () => { clearInterval(stepTimer); clearInterval(pctTimer) }
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-6"
    >
      {/* Animated brain */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: 'var(--primary)' }} />
        <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'var(--primary-10)' }}>
          <Brain size={36} style={{ color: 'var(--primary)' }} />
        </div>
      </div>

      {/* Current step */}
      <div className="h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            {(isAr ? STEPS_AR : STEPS_EN)[step]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
          <span>{isAr ? 'التحليل جارٍ…' : 'Analyzing…'}</span>
          <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{pct}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--primary)', width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs text-start">
        {(isAr ? STEPS_AR : STEPS_EN).map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {i < step ? (
              <CheckCircle size={13} className="shrink-0" style={{ color: '#22c55e' }} />
            ) : i === step ? (
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            ) : (
              <div className="w-3 h-3 rounded-full border shrink-0" style={{ borderColor: 'var(--border)' }} />
            )}
            <span style={{ color: i <= step ? 'var(--text)' : 'var(--text-muted)', opacity: i > step ? 0.4 : 1 }}>{s}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Results panel ─────────────────────────────────────────────
function Results({ data, isAr, onReset }: { data: AnalysisResult; isAr: boolean; onReset: () => void }) {
  const sc = STATUS[data.status]
  const TrendIcon = TREND_ICON[data.trend]
  const trendColor = data.trend === 'up' ? '#22c55e' : data.trend === 'down' ? '#ef4444' : '#6b7280'
  const trendLabel = isAr
    ? (data.trend === 'up' ? 'متحسن' : data.trend === 'down' ? 'متراجع' : 'مستقر')
    : (data.trend === 'up' ? 'Improving' : data.trend === 'down' ? 'Declining' : 'Stable')

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Score header */}
      <div className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl border" style={{ borderColor: sc.color + '40', background: sc.bg }}>
        <ScoreRing score={data.score} status={data.status} isAr={isAr} />
        <div className="flex-1 text-center sm:text-start">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
            <sc.Icon size={16} style={{ color: sc.color }} />
            <span className="font-bold text-sm" style={{ color: sc.color }}>{isAr ? sc.labelAr : sc.labelEn}</span>
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'var(--surface)', color: trendColor }}>
              <TrendIcon size={11} />{trendLabel}
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
            <TypedText text={isAr ? data.summary_ar : data.summary_en} />
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'دقة التحليل' : 'Accuracy'}: {Math.round(data.confidence_score * 100)}% · {new Date(data.analyzed_at).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Observations */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Camera size={14} style={{ color: 'var(--primary)' }} />
            {isAr ? 'ما رصده الذكاء الاصطناعي' : 'AI Observations'}
          </h3>
          <ul className="space-y-2">
            {data.observations_ar.map((obs, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <CheckCircle size={12} className="shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
                {obs}
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Issues */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
            {isAr ? 'المشكلات المرصودة' : 'Detected Issues'}
          </h3>
          {data.issues_ar.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{isAr ? 'لا توجد مشكلات ✅' : 'No issues found ✅'}</p>
          ) : (
            <ul className="space-y-2">
              {data.issues_ar.map((issue, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-2 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <XCircle size={12} className="shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                  {issue}
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Star size={14} style={{ color: '#f59e0b' }} />
          {isAr ? 'توصيات الذكاء الاصطناعي' : 'AI Recommendations'}
        </h3>
        <ul className="space-y-2">
          {data.recommendations_ar.map((rec, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronRight size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
              {rec}
            </motion.li>
          ))}
        </ul>
      </div>

      {/* AI reasoning */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'منطق التحليل' : 'AI Reasoning'}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{data.ai_reasoning}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/early-access"
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          <Zap size={15} />
          {isAr ? 'جرّب على متجرك — مجاناً 14 يوم' : 'Try on Your Store — 14 Days Free'}
          <ArrowRight size={14} />
        </Link>
        <button
          onClick={onReset}
          className="px-5 py-3.5 rounded-xl font-medium text-sm border transition-all hover:opacity-80"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          {isAr ? 'تحليل متجر آخر' : 'Analyze Another Store'}
        </button>
      </div>
    </motion.div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function Demo() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [phase, setPhase] = useState<'select' | 'analyzing' | 'result'>('select')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const heroRef = useRef(null)
  const heroInView = useInView(heroRef, { once: true })

  // Fetch scenarios on mount
  useEffect(() => {
    fetch(`${API}/v1/demo/scenarios`)
      .then(r => r.json())
      .then(setScenarios)
      .catch(() => {})
  }, [])

  async function runAnalysis() {
    if (!selected) return
    setPhase('analyzing')
    setError(null)
    try {
      const res = await fetch(`${API}/v1/demo/analyze?scenario=${selected}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطأ في التحليل')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
      setPhase('select')
    }
  }

  function reset() {
    setPhase('select')
    setSelected(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-80)' }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SplitLogo size={28} />
            <span className="font-bold text-base hidden sm:block" style={{ color: 'var(--text)' }}>
              {isAr ? 'سبلت تيك AI' : 'SplitTech AI'}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
            <Link
              to="/early-access"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              {isAr ? 'تجربة مجانية' : 'Free Trial'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} className="py-12 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto space-y-4"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
            style={{ borderColor: 'var(--primary-30)', color: 'var(--primary)', background: 'var(--primary-10)' }}>
            <Brain size={12} /> {isAr ? 'ديمو مباشر — ذكاء اصطناعي حقيقي' : 'Live Demo — Real AI'}
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--text)' }}>
            {isAr ? 'شوف الذكاء الاصطناعي يحلل متجراً الآن' : 'Watch AI Analyze a Store Right Now'}
          </h1>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            {isAr
              ? 'اختر نوع المتجر وشوف التقرير الكامل — نفس ما يصله أصحاب المتاجر يومياً.'
              : 'Choose a store type and see the full report — exactly what store owners receive daily.'}
          </p>
        </motion.div>
      </section>

      {/* Demo area */}
      <section className="max-w-3xl mx-auto px-4 pb-20">

        <AnimatePresence mode="wait">
          {/* SELECT PHASE */}
          {phase === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {error && (
                <div className="p-3 rounded-lg text-sm text-red-600 bg-red-50 dark:bg-red-900/20">{error}</div>
              )}

              <p className="text-sm font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                {isAr ? '① اختر المتجر للتحليل' : '① Select a store to analyze'}
              </p>

              {/* Scenario cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(scenarios.length ? scenarios : [
                  { id: 1, icon: '🥐', name_ar: 'مخبز', name_en: 'Bakery',     score: 84, status: 'pass'    as const, store_type: 'bakery' },
                  { id: 2, icon: '🍽️', name_ar: 'مطعم', name_en: 'Restaurant', score: 61, status: 'warning' as const, store_type: 'restaurant' },
                  { id: 3, icon: '👕', name_ar: 'متجر ملابس', name_en: 'Clothing', score: 39, status: 'fail' as const, store_type: 'clothing' },
                ]).map((sc) => {
                  const st = STATUS[sc.status]
                  const isSelected = selected === sc.id
                  return (
                    <motion.button
                      key={sc.id}
                      onClick={() => setSelected(sc.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all text-center"
                      style={{
                        borderColor: isSelected ? st.color : 'var(--border)',
                        background: isSelected ? st.bg : 'var(--surface)',
                      }}
                    >
                      <span className="text-4xl">{sc.icon}</span>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                          {isAr ? sc.name_ar : sc.name_en}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {isAr ? 'نتيجة متوقعة' : 'Expected score'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                        style={{ background: st.bg, color: st.color }}>
                        <st.Icon size={12} />
                        {sc.score}% — {isAr ? st.labelAr : st.labelEn}
                      </div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: st.color }}
                        >
                          <CheckCircle size={14} className="text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  )
                })}
              </div>

              {/* Analyze button */}
              <motion.button
                onClick={runAnalysis}
                disabled={!selected}
                whileHover={selected ? { scale: 1.02 } : {}}
                whileTap={selected ? { scale: 0.98 } : {}}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-base text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--primary)' }}
              >
                <Play size={18} />
                {isAr ? '② تشغيل التحليل بالذكاء الاصطناعي' : '② Run AI Analysis'}
              </motion.button>

              {/* Trust bar */}
              <div className="flex items-center justify-center gap-6 flex-wrap pt-2">
                {[
                  { icon: <Shield size={13} />, label: isAr ? 'بيانات آمنة' : 'Secure' },
                  { icon: <Zap size={13} />,    label: isAr ? 'تحليل فوري' : 'Instant' },
                  { icon: <Brain size={13} />,  label: isAr ? 'Gemini AI' : 'Gemini AI' },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {icon} {label}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ANALYZING PHASE */}
          {phase === 'analyzing' && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl border p-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <AnalysisProgress onDone={() => setPhase('result')} isAr={isAr} />
              </div>
            </motion.div>
          )}

          {/* RESULT PHASE */}
          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Results data={result} isAr={isAr} onReset={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Bottom CTA */}
      {phase === 'select' && (
        <section className="border-t py-10 text-center px-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'جاهز تبدأ مع متجرك الحقيقي؟' : 'Ready to start with your real store?'}
          </p>
          <Link
            to="/early-access"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary)' }}
          >
            {isAr ? 'ابدأ تجربتك المجانية — 14 يوم' : 'Start Free Trial — 14 Days'}
            <ArrowRight size={15} />
          </Link>
        </section>
      )}

      {/* Footer */}
      <footer className="py-5 text-center text-xs border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} {isAr ? 'سبلت تيك AI' : 'SplitTech AI'} — 🇸🇦 {isAr ? 'بيانات تبقى داخل المملكة' : 'Data stays inside Saudi Arabia'}
      </footer>
    </div>
  )
}
