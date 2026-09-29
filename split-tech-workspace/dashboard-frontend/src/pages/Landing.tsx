import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Camera, Shield, Zap, FileCheck, ShoppingCart,
  Utensils, Truck, Package, Server, Lock, Globe, CheckCircle2,
  TrendingUp, ArrowRight, MapPin, Brain, Eye, BarChart3, Cpu,
  Menu, X,
} from 'lucide-react'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useLanguage } from '../contexts/LanguageContext'
import type { TranslationKey } from '../i18n'

// ── Ease ────────────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1]

// ── Reveal on scroll (framer-motion) ────────────────────────
function Reveal({
  children, delay = 0, className = '', y = 18,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay: delay / 1000, ease }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Stagger container ────────────────────────────────────────
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
}

// ── Feature section ─────────────────────────────────────────
function Feature({ tag, title, body, bullets, visual, reverse }: {
  tag: string; title: string; body: string; bullets: string[]
  visual: React.ReactNode; reverse?: boolean
}) {
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <Reveal delay={60}>
        <div>
          <span className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase block mb-4">{tag}</span>
          <h3 className="text-display-sm mb-5 text-balance" style={{ color: 'var(--text-base)' }}>{title}</h3>
          <p className="text-[15px] leading-relaxed mb-7" style={{ color: 'var(--text-muted)' }}>{body}</p>
          <ul className="space-y-3">
            {bullets.map(b => (
              <li key={b} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-soft)' }}>
                <CheckCircle2 className="w-4 h-4 text-brand-700 flex-shrink-0 mt-0.5" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
      <Reveal delay={160}>
        <div className={`flex ${reverse ? 'lg:justify-start' : 'lg:justify-end'} justify-center`}>{visual}</div>
      </Reveal>
    </div>
  )
}

// ── Camera visual ───────────────────────────────────────────
function CameraCard({ isAr }: { isAr: boolean }) {
  const labels = isAr
    ? ['الطابق الأرضي', 'المداخل', 'الصندوق', 'المستودع']
    : ['Ground Floor', 'Entrance', 'Cashier', 'Storage']
  return (
    <div className="bg-ink rounded-2xl p-5 w-full max-w-[380px] border border-white/6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-xs font-semibold text-white/40 tracking-wide">{isAr ? 'مراقبة مباشرة' : 'Live monitoring'}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-lime animate-dot" />
          <span className="text-xs text-lime font-medium">{isAr ? 'متصل' : 'Live'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {labels.map((l, i) => (
          <div key={l} className="aspect-video rounded-xl bg-white/5 border border-white/8 flex flex-col items-center justify-center gap-1 relative overflow-hidden">
            <Camera className="w-5 h-5 text-white/25" />
            <span className="text-[8px] text-white/35">{l}</span>
            {i === 0 && <div className="absolute inset-x-0 top-1/2 h-px bg-lime/20" />}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/8 pt-4">
        <span className="text-xs text-white/35">{isAr ? '4 كاميرات نشطة' : '4 active cameras'}</span>
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-lime" />
          <span className="text-xs text-lime font-mono">RTSP ✓</span>
        </div>
      </div>
    </div>
  )
}

// ── Audit visual ────────────────────────────────────────────
function AuditCard({ isAr }: { isAr: boolean }) {
  const items = isAr
    ? [{ l: 'الترتيب العام', v: 92, c: 'bg-brand-600' }, { l: 'زي الموظفين', v: 100, c: 'bg-lime' }, { l: 'ترتيب المنتجات', v: 76, c: 'bg-amber-400' }]
    : [{ l: 'Overall order', v: 92, c: 'bg-brand-600' }, { l: 'Staff uniform', v: 100, c: 'bg-lime' }, { l: 'Product display', v: 76, c: 'bg-amber-400' }]
  return (
    <div className="rounded-2xl border shadow-high p-6 w-full max-w-[360px]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] mb-0.5 tracking-wide" style={{ color: 'var(--text-faint)' }}>{isAr ? 'آخر تدقيق' : 'Latest audit'}</p>
          <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>{isAr ? 'الفرع الرئيسي' : 'Main Branch'}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center">
          <FileCheck className="w-5 h-5 text-white" />
        </div>
      </div>
      {items.map(({ l, v, c }) => (
        <div key={l} className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-muted)' }}>{l}</span>
            <span className="font-bold num" style={{ color: 'var(--text-base)' }}>{v}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            <div className={`h-full ${c} rounded-full`} style={{ width: `${v}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-5 pt-4 border-t flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{isAr ? 'منذ 8 دقائق' : '8 minutes ago'}</span>
        <span className="badge badge-green">{isAr ? 'مكتمل' : 'Complete'}</span>
      </div>
    </div>
  )
}

// ── Schedule visual ─────────────────────────────────────────
function ScheduleCard({ isAr }: { isAr: boolean }) {
  const days = isAr ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu']
  const h = [55, 80, 40, 100, 70]
  return (
    <div className="rounded-2xl border shadow-high p-6 w-full max-w-[360px]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-5">
        <p className="font-bold" style={{ color: 'var(--text-base)' }}>{isAr ? 'جدول التدقيق' : 'Audit schedule'}</p>
        <span className="badge badge-lime text-[10px]">{isAr ? 'هذا الأسبوع' : 'This week'}</span>
      </div>
      <div className="flex items-end gap-1.5 h-20 mb-4">
        {days.map((d, i) => (
          <div key={d} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full rounded-md ${i === 3 ? 'bg-lime' : 'bg-brand-100'}`} style={{ height: `${h[i]}%` }} />
            <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div>
          <p className="text-xl font-extrabold num" style={{ color: 'var(--text-base)' }}>24</p>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{isAr ? 'تدقيقاً مكتملاً' : 'Audits completed'}</p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-lime num">87%</p>
          <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{isAr ? 'معدل الامتثال' : 'Compliance rate'}</p>
        </div>
      </div>
    </div>
  )
}

// ── AI Analysis Card (Hero visual) ──────────────────────────
function AIAnalysisCard({ isAr }: { isAr: boolean }) {
  const [active, setActive] = useState(0)
  const metrics = isAr
    ? [
        { label: 'نظافة المتجر', score: 94, status: 'pass' },
        { label: 'زي الموظفين', score: 100, status: 'pass' },
        { label: 'ترتيب الرفوف', score: 78, status: 'warning' },
        { label: 'منطقة الصندوق', score: 88, status: 'pass' },
      ]
    : [
        { label: 'Store cleanliness', score: 94, status: 'pass' },
        { label: 'Staff uniform', score: 100, status: 'pass' },
        { label: 'Shelf arrangement', score: 78, status: 'warning' },
        { label: 'Checkout area', score: 88, status: 'pass' },
      ]

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % metrics.length), 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="relative w-full max-w-[420px]">
      {/* Main card */}
      <div className="bg-ink rounded-2xl border border-white/8 overflow-hidden shadow-2xl">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            </div>
            <span className="text-xs font-mono text-white/30">
              {isAr ? 'سبلت AI — تحليل مباشر' : 'SplitTech AI — Live analysis'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-lime animate-dot" />
            <span className="text-[10px] text-lime font-medium">{isAr ? 'يعمل' : 'Active'}</span>
          </div>
        </div>

        {/* Camera grid */}
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {(isAr
            ? ['الطابق الأرضي', 'مدخل المتجر', 'الصندوق', 'المستودع']
            : ['Ground Floor', 'Store Entrance', 'Checkout', 'Storage']
          ).map((label, i) => (
            <div key={label} className="aspect-video rounded-lg bg-white/5 border border-white/6 flex flex-col items-center justify-center relative overflow-hidden">
              <Camera className="w-4 h-4 text-white/20" />
              <div className="absolute bottom-1.5 end-1.5 flex items-center gap-1 bg-black/40 rounded px-1 py-0.5">
                <span className="w-1 h-1 rounded-full bg-lime" />
                <span className="text-[7px] text-white/60">{label}</span>
              </div>
              {i === 0 && (
                <motion.div
                  className="absolute inset-0 border border-lime/30 rounded-lg"
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>
          ))}
        </div>

        {/* AI Metrics */}
        <div className="px-3 pb-3 space-y-2">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              animate={{ opacity: active === i ? 1 : 0.45 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-white/50">{m.label}</span>
                <span className={`font-bold num ${m.status === 'pass' ? 'text-lime' : 'text-amber-400'}`}>{m.score}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-white/8">
                <motion.div
                  className={`h-full rounded-full ${m.status === 'pass' ? 'bg-lime' : 'bg-amber-400'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${m.score}%` }}
                  transition={{ duration: 1, delay: i * 0.15, ease }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 pt-1 border-t border-white/6 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3 h-3 text-brand-400" />
            <span className="text-[9px] text-white/30">{isAr ? 'Gemini AI · me-central2' : 'Gemini AI · me-central2'}</span>
          </div>
          <span className="text-[9px] text-lime font-mono">
            {isAr ? 'آخر تحليل: منذ 3 د' : 'Last: 3 min ago'}
          </span>
        </div>
      </div>

      {/* Floating score badge */}
      <motion.div
        className="absolute -top-4 -start-5 rounded-xl px-3 py-2.5 border shadow-xl min-w-[110px]"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5, ease }}
      >
        <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-faint)' }}>{isAr ? 'معدل الامتثال' : 'Compliance'}</p>
        <p className="text-2xl font-extrabold num" style={{ color: 'var(--text-base)' }}>
          90<span className="text-sm" style={{ color: 'var(--text-faint)' }}>%</span>
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <TrendingUp className="w-3 h-3 text-brand-700" />
          <span className="text-[9px] text-brand-700 font-semibold">{isAr ? '+4% هذا الأسبوع' : '+4% this week'}</span>
        </div>
      </motion.div>

      {/* Floating alert badge */}
      <motion.div
        className="absolute -bottom-3 -end-4 rounded-xl px-3 py-2 border shadow-xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        initial={{ opacity: 0, scale: 0.8, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.5, ease }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-50 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-brand-700" />
          </div>
          <div>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--text-base)' }}>{isAr ? 'تقرير جاهز' : 'Report ready'}</p>
            <p className="text-[9px]" style={{ color: 'var(--text-faint)' }}>{isAr ? 'منذ 3 دقائق' : '3 minutes ago'}</p>
          </div>
        </div>
      </motion.div>

      {/* Saudi server badge */}
      <motion.div
        className="absolute top-3 -end-5 rounded-full px-2.5 py-1 border flex items-center gap-1.5 shadow-lg"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.4, duration: 0.5, ease }}
      >
        <span className="text-base leading-none">🇸🇦</span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{isAr ? 'خوادم سعودية' : 'Saudi Servers'}</span>
      </motion.div>
    </div>
  )
}

// ── Stats row ───────────────────────────────────────────────
function StatNumber({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = value / 40
    const timer = setInterval(() => {
      start += step
      if (start >= value) { setCount(value); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 30)
    return () => clearInterval(timer)
  }, [inView, value])

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl sm:text-4xl font-extrabold num mb-1" style={{ color: 'var(--text-base)' }}>
        {count}{suffix}
      </p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}

// ── Ticker ──────────────────────────────────────────────────
function Ticker({ isAr }: { isAr: boolean }) {
  const items = isAr
    ? ['٩٩٪ دقة في التحليل', 'خوادم سعودية 100%', 'PDPL متوافق', 'لا تدخل بشري', 'تقارير فورية', 'Hikvision · Dahua · EZVIZ', 'أول AI سعودي', 'بيانات داخل المملكة', 'تشفير AES-256']
    : ['99% analysis accuracy', '100% Saudi servers', 'PDPL compliant', 'No human bias', 'Instant reports', 'Hikvision · Dahua · EZVIZ', 'First Saudi AI', 'Data stays in KSA', 'AES-256 encryption']
  const all = [...items, ...items]
  return (
    <div className="border-y py-3 overflow-hidden" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
      <div className="flex gap-12 animate-ticker whitespace-nowrap">
        {all.map((s, i) => (
          <span key={i} className="flex-shrink-0 flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            <span className="w-1 h-1 rounded-full bg-lime flex-shrink-0" />{s}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────
export default function Landing() {
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'
  const Arrow = isAr ? ArrowLeft : ArrowRight
  const [scrolled, setScrolled] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Close mobile nav on route change / outside click
  useEffect(() => {
    document.body.style.overflow = mobileNav ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileNav])

  const tl = (k: TranslationKey) => t(k)

  return (
    <div className="min-h-screen overflow-x-hidden" dir={isAr ? 'rtl' : 'ltr'} style={{ background: 'var(--bg-page)' }}>

      {/* ── NAV ────────────────────────────────────── */}
      <motion.header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'backdrop-blur-sm border-b' : 'bg-transparent'}`}
        style={scrolled ? { background: 'var(--bg-card)', borderColor: 'var(--border)' } : {}}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <div className="page-wrap h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <SplitLogo size={34} variant="full" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {([['#features', 'land.nav.features'], ['#how', 'land.nav.how'], ['#pricing', 'land.nav.pricing']] as [string, TranslationKey][]).map(([h, k]) => (
              <a key={h} href={h} className="px-3.5 py-2 text-sm rounded-lg transition-colors font-medium hover:bg-[var(--bg-muted)]" style={{ color: 'var(--text-muted)' }}>{tl(k)}</a>
            ))}
            <Link to="/demo"
              className="px-3 py-1.5 text-sm rounded-lg font-semibold border transition-all hover:opacity-90 flex items-center gap-1"
              style={{ borderColor: 'var(--primary-30)', color: 'var(--primary)', background: 'var(--primary-10)' }}>
              ▶ {isAr ? 'ديمو مباشر' : 'Live Demo'}
            </Link>
            <Link to="/compare" className="px-3.5 py-2 text-sm rounded-lg transition-colors font-medium hover:bg-[var(--bg-muted)]" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'مقارنة' : 'Compare'}
            </Link>
            <Link to="/contact" className="px-3.5 py-2 text-sm rounded-lg transition-colors font-medium hover:bg-[var(--bg-muted)]" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'تواصل معنا' : 'Contact'}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle compact />
            <LangToggle compact />
            <Link to="/login" className="hidden sm:flex btn-ghost btn-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{tl('land.nav.login')}</Link>
            <Link to="/signup" className="hidden md:flex btn-primary btn-sm">
              {tl('land.nav.start')} <Arrow className="w-3.5 h-3.5" />
            </Link>
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileNav(v => !v)}
              className="md:hidden p-2 rounded-lg border transition-colors"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              aria-label="Toggle menu"
            >
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile nav drawer */}
      <AnimatePresence>
        {mobileNav && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileNav(false)}
            />
            {/* Drawer */}
            <motion.div
              key="mobile-nav-drawer"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease }}
              className="fixed top-16 inset-x-0 z-50 md:hidden mx-3 rounded-2xl border shadow-xl overflow-hidden"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <nav className="flex flex-col p-3 gap-1">
                {([['#features', 'land.nav.features'], ['#how', 'land.nav.how'], ['#pricing', 'land.nav.pricing']] as [string, TranslationKey][]).map(([h, k]) => (
                  <a key={h} href={h} onClick={() => setMobileNav(false)}
                    className="px-4 py-3 text-sm rounded-xl font-medium transition-colors hover:bg-[var(--bg-muted)]"
                    style={{ color: 'var(--text-muted)' }}>
                    {tl(k)}
                  </a>
                ))}
                <Link to="/demo" onClick={() => setMobileNav(false)}
                  className="px-4 py-3 text-sm rounded-xl font-semibold transition-colors flex items-center gap-2"
                  style={{ color: 'var(--primary)', background: 'var(--primary-10)' }}>
                  ▶ {isAr ? 'ديمو مباشر' : 'Live Demo'}
                </Link>
                <Link to="/compare" onClick={() => setMobileNav(false)}
                  className="px-4 py-3 text-sm rounded-xl font-medium transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'مقارنة' : 'Compare'}
                </Link>
                <Link to="/contact" onClick={() => setMobileNav(false)}
                  className="px-4 py-3 text-sm rounded-xl font-medium transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'تواصل معنا' : 'Contact'}
                </Link>
                <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                <Link to="/login" onClick={() => setMobileNav(false)}
                  className="px-4 py-3 text-sm rounded-xl font-semibold transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: 'var(--text-muted)' }}>
                  {tl('land.nav.login')}
                </Link>
                <Link to="/signup" onClick={() => setMobileNav(false)}
                  className="px-4 py-3 text-sm rounded-xl font-bold text-white text-center transition-opacity hover:opacity-90"
                  style={{ background: 'var(--primary)' }}>
                  {tl('land.nav.start')}
                </Link>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── HERO ──────────────────────────────────── */}
      <section className="pt-32 pb-20 sm:pt-40 sm:pb-28 relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 -z-10 opacity-30 dark:opacity-10" style={{ backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(to right, var(--border) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg-page)] via-[var(--bg-page)] to-transparent" />

        {/* Glow */}
        <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[600px] h-[400px] -z-10 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(ellipse, var(--brand-500) 0%, transparent 70%)' }} />

        <div className="page-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-14 lg:gap-10 items-center">

            {/* Left / Text */}
            <div className="max-w-2xl">
              <motion.div
                className="mb-5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
              >
                <SplitLogo size={42} variant="full" />
              </motion.div>

              {/* "أول AI سعودي" badge */}
              <motion.div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-4 border"
                style={{ background: 'rgba(21,128,61,0.08)', borderColor: 'rgba(21,128,61,0.25)' }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1, ease }}
              >
                <span className="text-base leading-none">🇸🇦</span>
                <span className="text-[11px] font-bold text-brand-800 dark:text-brand-400 tracking-wide">
                  {isAr ? 'أول نظام AI سعودي للرقابة التشغيلية' : 'First Saudi AI for operational monitoring'}
                </span>
              </motion.div>

              {/* Live badge */}
              <motion.div
                className="flex items-center gap-2 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15, ease }}
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-lime/40 bg-lime/8 text-brand-800 dark:text-brand-400 text-[11px] font-bold tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime animate-dot" />
                  {tl('land.hero.badge')}
                </div>
              </motion.div>

              {/* H1 */}
              <motion.h1
                className="text-display mb-6 text-balance"
                style={{ color: 'var(--text-base)' }}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.2, ease }}
              >
                {tl('land.hero.h1a')}{' '}
                <span className="text-brand-700">{tl('land.hero.h1b')}</span><br />
                {tl('land.hero.h1c')}
              </motion.h1>

              {/* Sub */}
              <motion.p
                className="text-[17px] leading-relaxed mb-10 max-w-xl"
                style={{ color: 'var(--text-muted)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.3, ease }}
              >
                {tl('land.hero.sub')}
              </motion.p>

              {/* CTAs */}
              <motion.div
                className="flex flex-col sm:flex-row gap-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease }}
              >
                <Link to="/early-access" className="btn-lime btn-lg">
                  {isAr ? 'جرّب مجاناً 14 يوماً' : 'Try free for 14 days'} <Arrow className="w-4 h-4" />
                </Link>
                <a href="#how" className="btn-outline btn-lg">{tl('land.hero.how')}</a>
              </motion.div>

              {/* Early access urgency pill */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6, ease }}
                className="flex items-center gap-2 mt-1"
              >
                <Link to="/early-access" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-full hover:opacity-80 transition-opacity">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-dot" />
                  {isAr ? '27 مكان متبقٍ فقط — خصم 50% للأوائل' : 'Only 27 spots left — 50% off for early birds'}
                </Link>
              </motion.div>

              {/* Trust badges */}
              <motion.div
                className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.55, ease }}
              >
                {([['land.hero.pdpl', Shield], ['land.hero.nobias', Lock], ['land.hero.instant', Zap]] as [TranslationKey, React.ElementType][]).map(([k, Ic]) => (
                  <div key={k} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                    <Ic className="w-3.5 h-3.5 text-brand-700" />
                    {tl(k)}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                  <MapPin className="w-3.5 h-3.5 text-brand-700" />
                  {isAr ? 'خوادم الدمام · me-central2' : 'Dammam servers · me-central2'}
                </div>
              </motion.div>
            </div>

            {/* Right / Visual */}
            <motion.div
              className="flex justify-center lg:justify-end pt-4 lg:pt-0"
              initial={{ opacity: 0, x: isAr ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease }}
            >
              <AIAnalysisCard isAr={isAr} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────── */}
      <section className="py-14 border-y" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <div className="page-wrap">
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {[
              { value: 99, suffix: '%', ar: 'دقة التحليل', en: 'Analysis accuracy' },
              { value: 10, suffix: isAr ? ' د' : ' min', ar: 'تقرير كل 10 دقائق', en: 'Report every 10 min' },
              { value: 24, suffix: '/7', ar: 'مراقبة متواصلة', en: 'Continuous monitoring' },
              { value: 100, suffix: '%', ar: 'بيانات داخل المملكة', en: 'Data stays in KSA' },
            ].map((s, i) => (
              <motion.div key={i} variants={staggerItem} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold num mb-1" style={{ color: 'var(--text-base)' }}>
                  <StatInner value={s.value} suffix={s.suffix} />
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{isAr ? s.ar : s.en}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── TICKER ────────────────────────────────── */}
      <Ticker isAr={isAr} />

      {/* ── CLIENTS ───────────────────────────────── */}
      <section className="py-16" style={{ background: 'var(--bg-subtle)' }}>
        <div className="page-wrap">
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-center mb-8" style={{ color: 'var(--text-faint)' }}>{tl('land.clients.title')}</p>
          </Reveal>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px rounded-2xl overflow-hidden border" style={{ background: 'var(--border)', borderColor: 'var(--border)' }}>
            {[
              { name: 'Google Cloud', desc: tl('land.clients.cloud'), icon: Globe },
              { name: 'Hikvision', desc: tl('land.clients.cameras'), icon: Camera },
              { name: 'Dahua', desc: tl('land.clients.cameras'), icon: Camera },
              { name: 'Raspberry Pi', desc: tl('land.clients.local'), icon: Server },
              { name: 'Intel', desc: tl('land.clients.edge'), icon: Server },
            ].map(({ name, desc, icon: Ic }, i) => (
              <Reveal key={name} delay={i * 60}>
                <div className="px-5 py-6 flex flex-col items-center text-center gap-2.5 h-full" style={{ background: 'var(--bg-card)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-muted)' }}>
                    <Ic className="w-[18px] h-[18px]" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>{name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────── */}
      <section id="features" className="section-gap border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="page-wrap">
          <Reveal>
            <div className="mb-16">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">{tl('land.feat.label')}</p>
              <h2 className="text-display-sm mb-4 max-w-lg" style={{ color: 'var(--text-base)' }}>{tl('land.feat.title')}</h2>
              <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>{tl('land.feat.sub')}</p>
            </div>
          </Reveal>

          <div className="space-y-24 lg:space-y-32">
            <Feature
              tag={tl('land.feat1.tag')}
              title={tl('land.feat1.title')}
              body={tl('land.feat1.body')}
              bullets={[tl('land.feat1.b1'), tl('land.feat1.b2'), tl('land.feat1.b3')]}
              visual={<CameraCard isAr={isAr} />}
            />
            <Feature
              tag={tl('land.feat2.tag')}
              title={tl('land.feat2.title')}
              body={tl('land.feat2.body')}
              bullets={[tl('land.feat2.b1'), tl('land.feat2.b2'), tl('land.feat2.b3')]}
              visual={<AuditCard isAr={isAr} />}
              reverse
            />
            <Feature
              tag={tl('land.feat3.tag')}
              title={tl('land.feat3.title')}
              body={tl('land.feat3.body')}
              bullets={[tl('land.feat3.b1'), tl('land.feat3.b2'), tl('land.feat3.b3')]}
              visual={<ScheduleCard isAr={isAr} />}
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────── */}
      <section id="how" className="section-gap border-y" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <div className="page-wrap">
          <Reveal>
            <div className="text-center mb-14 max-w-xl mx-auto">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">{tl('land.how.label')}</p>
              <h2 className="text-display-sm mb-3" style={{ color: 'var(--text-base)' }}>{tl('land.how.title')}</h2>
              <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>{tl('land.how.sub')}</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border" style={{ background: 'var(--border)', borderColor: 'var(--border)' }}>
            {([
              ['01', 'land.how.s1.t', 'land.how.s1.b', Eye],
              ['02', 'land.how.s2.t', 'land.how.s2.b', Brain],
              ['03', 'land.how.s3.t', 'land.how.s3.b', BarChart3],
              ['04', 'land.how.s4.t', 'land.how.s4.b', Zap],
            ] as [string, TranslationKey, TranslationKey, React.ElementType][]).map(([n, tk, dk, Ic], i) => (
              <Reveal key={n} delay={i * 80}>
                <div className="p-7 h-full group" style={{ background: 'var(--bg-card)' }}>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-xs font-bold tracking-widest" style={{ color: 'var(--border-mid)' }}>{n}</span>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors group-hover:bg-brand-700" style={{ background: 'var(--bg-muted)' }}>
                      <Ic className="w-4 h-4 transition-colors group-hover:text-white" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </div>
                  <h3 className="font-bold mb-2.5" style={{ color: 'var(--text-base)' }}>{tl(tk)}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{tl(dk)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── INDUSTRIES ────────────────────────────── */}
      <section className="section-gap">
        <div className="page-wrap">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">{isAr ? 'القطاعات' : 'Industries'}</p>
              <h2 className="text-display-sm" style={{ color: 'var(--text-base)' }}>{isAr ? 'لكل نشاط، أسئلة مخصصة' : 'Custom questions for every business'}</h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: ShoppingCart, ar: { t: 'تجزئة', d: 'ترتيب رفوف، عروض، نظافة ممرات المنتجات' }, en: { t: 'Retail', d: 'Shelf order, promotions, aisle cleanliness' } },
              { icon: Utensils, ar: { t: 'مطاعم', d: 'نظافة المطبخ، زي الموظفين، خدمة الطاولات' }, en: { t: 'Restaurants', d: 'Kitchen hygiene, staff uniform, table service' } },
              { icon: Truck, ar: { t: 'لوجستيات', d: 'تنظيم مستودعات، سلامة مهنية، نظام الشحن' }, en: { t: 'Logistics', d: 'Warehouse organization, safety, shipping' } },
              { icon: Package, ar: { t: 'مغاسل', d: 'ترتيب ملابس، آليات التسليم، النظافة العامة' }, en: { t: 'Laundry', d: 'Clothing order, delivery process, cleanliness' } },
            ].map(({ icon: Ic, ar, en: enData }, i) => {
              const item = isAr ? ar : enData
              return (
                <Reveal key={item.t} delay={i * 70}>
                  <motion.div
                    className="card p-6 h-full cursor-default"
                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: 'var(--bg-muted)' }}>
                      <Ic className="w-[18px] h-[18px]" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <p className="font-bold mb-1.5" style={{ color: 'var(--text-base)' }}>{item.t}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.d}</p>
                  </motion.div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────── */}
      <section id="pricing" className="section-gap border-y" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <div className="page-wrap">
          <Reveal>
            <div className="text-center mb-14 max-w-xl mx-auto">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">{tl('land.price.label')}</p>
              <h2 className="text-display-sm mb-3" style={{ color: 'var(--text-base)' }}>{tl('land.price.title')}</h2>
              <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>{tl('land.price.sub')}</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                ar: { t: 'الأساسية', cameras: 'كاميرا واحدة', hours: '12 ساعة / يوم', f: ['كاميرا واحدة', 'مراقبة 12 ساعة يومياً', '6 جولات تدقيق يومياً', 'تنبيهات أمان فورية', 'تقارير أسبوعية PDF', 'دعم فني بالتذاكر'] },
                en: { t: 'Basic', cameras: '1 camera', hours: '12 hrs / day', f: ['1 camera', '12h daily monitoring', '6 audit rounds/day', 'Instant safety alerts', 'Weekly PDF reports', 'Ticket support'] },
                p: 199, annual: 1990, pop: false, badge: '',
              },
              {
                ar: { t: 'الاحترافية', cameras: 'حتى 3 كاميرات', hours: '18 ساعة / يوم', f: ['حتى 3 كاميرات', 'مراقبة 18 ساعة يومياً', '9 جولات تدقيق يومياً', 'تحليل ذكاء اصطناعي متقدم', 'أسئلة تدقيق مخصصة', 'تقارير يومية PDF', 'دعم فني أولوية', 'لوحة تحكم متقدمة'] },
                en: { t: 'Pro', cameras: 'Up to 3 cameras', hours: '18 hrs / day', f: ['Up to 3 cameras', '18h daily monitoring', '9 audit rounds/day', 'Advanced AI analysis', 'Custom audit questions', 'Daily PDF reports', 'Priority support', 'Advanced dashboard'] },
                p: 399, annual: 3990, pop: true, badge: isAr ? 'الأكثر طلباً' : 'Most popular',
              },
              {
                ar: { t: 'المؤسسية', cameras: 'حتى 6 كاميرات', hours: '24 ساعة متواصلة', f: ['حتى 6 كاميرات', 'مراقبة 24 ساعة متواصلة', 'جولات تدقيق غير محدودة', 'تحليل متعدد الكاميرات', 'تقارير فورية لحظية', 'مدير حساب مخصص', 'API مخصص للتكامل', 'SLA مضمون 99.9%'] },
                en: { t: 'Enterprise', cameras: 'Up to 6 cameras', hours: '24/7 monitoring', f: ['Up to 6 cameras', '24/7 continuous monitoring', 'Unlimited audit rounds', 'Multi-camera analysis', 'Real-time instant reports', 'Dedicated account manager', 'Custom API integration', '99.9% SLA guaranteed'] },
                p: 799, annual: 7990, pop: false, badge: '24/7',
              },
            ].map(({ ar, en: enData, p, annual, pop, badge }, i) => {
              const plan = isAr ? ar : enData
              return (
                <Reveal key={plan.t} delay={i * 80}>
                  <motion.div
                    className={`relative flex flex-col h-full rounded-xl overflow-hidden border transition-colors duration-200 ${pop ? 'border-brand-700 shadow-lg' : i === 2 ? 'border-amber-300' : ''}`}
                    style={{ background: 'var(--bg-card)', borderColor: pop ? undefined : i === 2 ? undefined : 'var(--border)' }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                  >
                    {badge && <div className={`py-1.5 text-center ${pop ? 'bg-brand-700' : 'bg-amber-400'}`}><span className="text-[10px] font-bold text-white tracking-widest uppercase">{badge}</span></div>}
                    <div className="p-6 flex-1 flex flex-col">
                      <p className="text-xs font-semibold mb-1 tracking-wide" style={{ color: 'var(--text-faint)' }}>{isAr ? `الباقة ${plan.t}` : plan.t}</p>
                      <p className="text-[11px] text-brand-600 font-semibold mb-3">{plan.cameras} · {plan.hours}</p>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-[38px] font-extrabold leading-none num" style={{ color: 'var(--text-base)' }}>{p}</span>
                        <span className="text-sm" style={{ color: 'var(--text-faint)' }}>{isAr ? 'ر.س / شهر' : 'SAR/mo'}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-5">
                        <span className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 font-bold px-2 py-0.5 rounded-full">{annual} {isAr ? 'ر.س / سنوياً' : 'SAR/yr'}</span>
                      </div>
                      <div className="h-px mb-5" style={{ background: 'var(--border)' }} />
                      <ul className="space-y-2.5 flex-1">
                        {plan.f.map(item => (
                          <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${pop ? 'text-brand-700' : i === 2 ? 'text-amber-500' : 'text-[var(--border-mid)]'}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <Link to="/signup" className={`mt-8 block text-center py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${pop ? 'bg-brand-700 text-white hover:bg-brand-800' : i === 2 ? 'bg-amber-400 text-white hover:bg-amber-500' : 'hover:bg-[var(--bg-muted)]'}`} style={!pop && i !== 2 ? { background: 'var(--bg-subtle)', color: 'var(--text-base)' } : {}}>
                        {tl('land.price.cta')}
                      </Link>
                    </div>
                  </motion.div>
                </Reveal>
              )
            })}
          </div>

          {/* Full pricing link */}
          <Reveal delay={260}>
            <div className="text-center mt-6">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
              >
                {isAr ? 'مقارنة كاملة بين الباقات + حاسبة الوفر' : 'Full plan comparison + savings calculator'}
                <Arrow className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Reveal>

          {/* Voice Agent pricing */}
          <Reveal>
            <div className="text-center mb-10 mt-16 max-w-xl mx-auto">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">{tl('land.voice.label')}</p>
              <h2 className="text-display-sm mb-3" style={{ color: 'var(--text-base)' }}>{tl('land.voice.title')}</h2>
              <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>{tl('land.voice.sub')}</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                ar: { t: 'الأساسية', tag: 'وكيل الهاتف', f: ['فرع واحد', 'رد صوتي ذكي قياسي', 'ساعات العمل', 'تقارير أسبوعية'] },
                en: { t: 'Basic', tag: 'Phone agent', f: ['Single branch', 'Standard AI voice response', 'Business hours', 'Weekly reports'] },
                p: 199, annual: 1799, pop: false,
              },
              {
                ar: { t: 'الاحترافية', tag: 'وكيل الهاتف', f: ['معالجة لغة طبيعية متقدمة', 'شخصية مخصصة للفرع', 'تقارير يومية', 'دعم أولوية'] },
                en: { t: 'Professional', tag: 'Phone agent', f: ['Advanced NLP', 'Custom branch persona', 'Daily reports', 'Priority support'] },
                p: 299, annual: 2699, pop: true,
              },
              {
                ar: { t: 'المؤسسات', tag: 'وكيل الهاتف', f: ['متعدد الفروع', 'تكامل Dialogflow CX كامل', 'إدارة خطوط متعددة', 'مدير حساب'] },
                en: { t: 'Enterprise', tag: 'Phone agent', f: ['Multi-branch', 'Full Dialogflow CX', 'Multi-line management', 'Account manager'] },
                p: 499, annual: 4499, pop: false,
              },
            ].map(({ ar, en: enData, p, annual, pop }, i) => {
              const plan = isAr ? ar : enData
              return (
                <Reveal key={`voice-${plan.t}`} delay={i * 80}>
                  <div className={`relative flex flex-col h-full rounded-xl overflow-hidden border transition-all duration-200 ${pop ? 'border-brand-700 shadow-lg' : 'hover:border-[var(--border-mid)]'}`} style={{ background: 'var(--bg-card)', borderColor: pop ? undefined : 'var(--border)' }}>
                    <div className="p-6 flex-1 flex flex-col">
                      <p className="text-xs font-semibold mb-1 tracking-wide" style={{ color: 'var(--text-faint)' }}>{plan.tag}</p>
                      <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-base)' }}>{plan.t}</p>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-[38px] font-extrabold leading-none num" style={{ color: 'var(--text-base)' }}>{p}</span>
                        <span className="text-sm" style={{ color: 'var(--text-faint)' }}>{tl('land.voice.sarMo')}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-5">
                        <span className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 font-bold px-2 py-0.5 rounded-full">{annual} {tl('land.voice.sarYr')}</span>
                      </div>
                      <div className="h-px mb-5" style={{ background: 'var(--border)' }} />
                      <ul className="space-y-2.5 flex-1">
                        {plan.f.map(item => (
                          <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${pop ? 'text-brand-700' : 'text-[var(--border-mid)]'}`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <Link to="/signup" className={`mt-8 block text-center py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${pop ? 'bg-brand-700 text-white hover:bg-brand-800' : 'hover:bg-[var(--bg-muted)]'}`} style={!pop ? { background: 'var(--bg-subtle)', color: 'var(--text-base)' } : {}}>
                        {tl('land.price.cta')}
                      </Link>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── PRIVACY & INFRA ───────────────────────── */}
      <section className="section-gap">
        <div className="page-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <Reveal>
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-4">{isAr ? 'البنية التحتية' : 'Infrastructure'}</p>
              <h2 className="text-display-sm mb-5" style={{ color: 'var(--text-base)' }}>{isAr ? 'بنية سحابية عالمية — بيانات سعودية' : 'World-class cloud — Saudi data'}</h2>
              <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'جميع بيانات التدقيق تُعالج وتُخزن في منطقة الدمام (me-central2) على Google Cloud — لا تغادر المملكة.' : 'All audit data is processed and stored in the Dammam region (me-central2) on Google Cloud — never leaves Saudi Arabia.'}
              </p>
              {/* Saudi server banner */}
              <div className="flex items-center gap-3 p-4 rounded-xl border mb-6" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                <span className="text-2xl">🇸🇦</span>
                <div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>{isAr ? 'خوادم سعودية 100%' : '100% Saudi Servers'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Google Cloud · Dammam · me-central2</p>
                </div>
                <div className="ms-auto">
                  <span className="badge badge-green">{isAr ? 'PDPL ✓' : 'PDPL ✓'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { t: 'Google Cloud', ar: 'إقامة بيانات في الدمام', en: 'Data residency in Dammam' },
                  { t: 'Raspberry Pi', ar: 'جهاز المعالجة المحلي', en: 'Local processing device' },
                  { t: 'Hikvision / Dahua', ar: 'أشهر كاميرات IP', en: 'Leading IP cameras' },
                  { t: 'PDPL', ar: 'متوافق مع نظام حماية البيانات', en: 'Data protection compliant' },
                ].map(({ t: name, ar: arDesc, en: enDesc }) => (
                  <div key={name} className="border rounded-lg p-4 hover:border-brand-200 transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <p className="font-bold text-sm mb-0.5" style={{ color: 'var(--text-base)' }}>{name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? arDesc : enDesc}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="bg-ink rounded-2xl p-7 border border-white/6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-lime/15 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-lime" />
                  </div>
                  <span className="font-bold text-white">{isAr ? 'ضمانات الخصوصية' : 'Privacy guarantees'}</span>
                </div>
                {(isAr
                  ? ['لا يطلع أي إنسان على تسجيلاتك', 'الصور تُحلل وتُحذف فورياً', 'تشفير كامل في النقل والتخزين', 'إقامة بيانات معتمدة داخل المملكة', 'سجل تدقيق كامل لكل عملية']
                  : ['No human sees your recordings', 'Images analyzed and deleted instantly', 'Full encryption in transit and storage', 'Certified data residency in Saudi Arabia', 'Complete audit trail for every operation']
                ).map(item => (
                  <div key={item} className="flex items-center gap-3 py-3 border-b border-white/6 last:border-0">
                    <CheckCircle2 className="w-4 h-4 text-lime flex-shrink-0" />
                    <span className="text-sm text-white/70">{item}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────── */}
      <section className="section-gap bg-ink relative overflow-hidden">
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:64px_64px] pointer-events-none" />
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(101,163,13,0.08) 0%, transparent 60%)' }} />
        <div className="page-wrap text-center relative">
          <Reveal>
            <div className="flex justify-center mb-8">
              <SplitLogo size={44} variant="full-white" />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-lime/30 bg-lime/8 mb-6">
              <span className="text-base">🇸🇦</span>
              <span className="text-[11px] font-bold text-lime tracking-wide">
                {isAr ? 'أول AI سعودي للرقابة التشغيلية' : 'First Saudi AI for operational monitoring'}
              </span>
            </div>

            <h2 className="text-display text-white mb-6 text-balance max-w-2xl mx-auto">
              {isAr ? 'متجرك يستحق رقابة' : 'Your business deserves monitoring'}{' '}
              <span className="text-lime">{isAr ? 'بلا تحيز.' : 'without bias.'}</span>
            </h2>
            <p className="text-slate-400 text-[17px] mb-10 max-w-lg mx-auto leading-relaxed">
              {tl('land.cta.sub')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/early-access" className="btn-lime btn-lg inline-flex">
                {isAr ? 'جرّب مجاناً 14 يوماً' : 'Try free for 14 days'} <Arrow className="w-4 h-4" />
              </Link>
              <a href="mailto:info@splittech.sa" className="btn-outline btn-lg inline-flex" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
                {tl('land.cta.demo')}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────── */}
      <footer className="bg-ink border-t border-white/8">
        <div className="page-wrap py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-white/8">
            <div>
              <div className="mb-4">
                <SplitLogo size={30} variant="full-white" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                {isAr ? 'أول نظام AI سعودي للرقابة التشغيلية على المتاجر — خوادم الدمام، بيانات داخل المملكة.' : 'First Saudi AI for retail operational monitoring — Dammam servers, data stays in KSA.'}
              </p>
              {/* Saudi server mini badge */}
              <div className="flex items-center gap-1.5 mt-4">
                <span className="text-sm">🇸🇦</span>
                <span className="text-[10px] text-slate-500">Google Cloud · me-central2 · Dammam</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-white mb-4 tracking-wide">{isAr ? 'الشركة' : 'Company'}</p>
              <ul className="space-y-2">
                {(isAr
                  ? ['سبلت تيك AI', 'السجل التجاري: 7053975251', 'جدة، المملكة العربية السعودية']
                  : ['SplitTech AI', 'CR: 7053975251', 'Jeddah, Saudi Arabia']
                ).map(l => <li key={l} className="text-xs text-slate-500">{l}</li>)}
                <li><a href="mailto:info@splittech.sa" className="text-xs text-slate-500 hover:text-white transition-colors">info@splittech.sa</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-white mb-4 tracking-wide">{isAr ? 'روابط' : 'Links'}</p>
              <ul className="space-y-2">
                {[
                  { to: '/terms', ar: 'الشروط والأحكام', en: 'Terms & Conditions' },
                  { to: '/demo',    ar: 'ديمو مباشر',  en: 'Live Demo' },
                  { to: '/contact', ar: 'تواصل معنا', en: 'Contact Us' },
                  { to: '/login', ar: 'تسجيل الدخول', en: 'Sign in' },
                  { to: '/signup', ar: 'إنشاء حساب', en: 'Create account' },
                ].map(({ to, ar, en: enL }) => (
                  <li key={to}><Link to={to} className="text-xs text-slate-500 hover:text-white transition-colors">{isAr ? ar : enL}</Link></li>
                ))}
                {[
                  { h: '#features', ar: 'المنصة', en: 'Platform' },
                  { h: '#pricing', ar: 'الأسعار', en: 'Pricing' },
                ].map(({ h, ar, en: enL }) => (
                  <li key={h}><a href={h} className="text-xs text-slate-500 hover:text-white transition-colors">{isAr ? ar : enL}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-xs text-slate-600">{tl('land.footer.rights')}</span>
            <Link to="/terms" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">{tl('land.footer.privacy')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Animated stat inner (used in STATS section) ─────────────
function StatInner({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref as any, { once: true })
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!inView) return
    let s = 0
    const step = value / 40
    const t = setInterval(() => {
      s += step
      if (s >= value) { setCount(value); clearInterval(t) }
      else setCount(Math.floor(s))
    }, 28)
    return () => clearInterval(t)
  }, [inView, value])
  return <span ref={ref}>{count}{suffix}</span>
}
