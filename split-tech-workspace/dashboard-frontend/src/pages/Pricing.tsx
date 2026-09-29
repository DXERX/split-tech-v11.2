import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, X, ArrowLeft, ArrowRight, Zap, Shield, Camera,
  ChevronDown, TrendingUp, Users, Clock, Star, Phone,
} from 'lucide-react'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useLanguage } from '../contexts/LanguageContext'

const ease = [0.22, 1, 0.36, 1]

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-30px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: delay / 1000, ease }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Pricing data ─────────────────────────────────────────────
const PLANS = {
  ar: [
    {
      id: 'basic',
      name: 'الأساسية',
      price_mo: 199,
      price_yr: 1990,
      cameras: 'كاميرا واحدة',
      hours: '12 ساعة / يوم',
      color: 'default',
      badge: '',
      features: [
        'كاميرا واحدة (RTSP)',
        'مراقبة 12 ساعة يومياً',
        '6 جولات تدقيق / يوم',
        'تنبيهات أمان فورية',
        'تقارير PDF أسبوعية',
        'لوحة تحكم أساسية',
        'دعم فني بالتذاكر',
      ],
    },
    {
      id: 'pro',
      name: 'الاحترافية',
      price_mo: 399,
      price_yr: 3990,
      cameras: 'حتى 3 كاميرات',
      hours: '18 ساعة / يوم',
      color: 'brand',
      badge: 'الأكثر طلباً',
      features: [
        'حتى 3 كاميرات (RTSP)',
        'مراقبة 18 ساعة يومياً',
        '9 جولات تدقيق / يوم',
        'تحليل ذكاء اصطناعي متقدم',
        'أسئلة تدقيق مخصصة',
        'تقارير PDF يومية',
        'لوحة تحكم متقدمة',
        'دعم فني ذو أولوية',
        'تنبيهات واتساب/بريد',
      ],
    },
    {
      id: 'enterprise',
      name: 'المؤسسية',
      price_mo: 799,
      price_yr: 7990,
      cameras: 'حتى 6 كاميرات',
      hours: '24 ساعة متواصلة',
      color: 'amber',
      badge: '24/7',
      features: [
        'حتى 6 كاميرات (RTSP)',
        'مراقبة 24/7 متواصلة',
        'جولات تدقيق غير محدودة',
        'تحليل متعدد الكاميرات',
        'تقارير فورية لحظية',
        'مدير حساب مخصص',
        'API مخصص للتكامل',
        'SLA مضمون 99.9%',
        'دعم هاتفي مباشر',
      ],
    },
  ],
  en: [
    {
      id: 'basic',
      name: 'Basic',
      price_mo: 199,
      price_yr: 1990,
      cameras: '1 camera',
      hours: '12 hrs / day',
      color: 'default',
      badge: '',
      features: [
        '1 camera (RTSP)',
        '12h daily monitoring',
        '6 audit rounds / day',
        'Instant safety alerts',
        'Weekly PDF reports',
        'Basic dashboard',
        'Ticket support',
      ],
    },
    {
      id: 'pro',
      name: 'Professional',
      price_mo: 399,
      price_yr: 3990,
      cameras: 'Up to 3 cameras',
      hours: '18 hrs / day',
      color: 'brand',
      badge: 'Most popular',
      features: [
        'Up to 3 cameras (RTSP)',
        '18h daily monitoring',
        '9 audit rounds / day',
        'Advanced AI analysis',
        'Custom audit questions',
        'Daily PDF reports',
        'Advanced dashboard',
        'Priority support',
        'WhatsApp / Email alerts',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price_mo: 799,
      price_yr: 7990,
      cameras: 'Up to 6 cameras',
      hours: '24/7 monitoring',
      color: 'amber',
      badge: '24/7',
      features: [
        'Up to 6 cameras (RTSP)',
        '24/7 continuous monitoring',
        'Unlimited audit rounds',
        'Multi-camera analysis',
        'Real-time instant reports',
        'Dedicated account manager',
        'Custom API integration',
        '99.9% SLA guaranteed',
        'Direct phone support',
      ],
    },
  ],
}

// ── Comparison table rows ────────────────────────────────────
const COMPARE_ROWS = {
  ar: [
    { label: 'الكاميرات', basic: 'كاميرا واحدة', pro: 'حتى 3', enterprise: 'حتى 6' },
    { label: 'ساعات المراقبة', basic: '12 ساعة', pro: '18 ساعة', enterprise: '24/7' },
    { label: 'جولات التدقيق يومياً', basic: '6', pro: '9', enterprise: 'غير محدودة' },
    { label: 'أسئلة مخصصة', basic: false, pro: true, enterprise: true },
    { label: 'تقارير PDF', basic: 'أسبوعية', pro: 'يومية', enterprise: 'فورية' },
    { label: 'تنبيهات واتساب', basic: false, pro: true, enterprise: true },
    { label: 'API مخصص', basic: false, pro: false, enterprise: true },
    { label: 'مدير حساب', basic: false, pro: false, enterprise: true },
    { label: 'SLA مضمون', basic: false, pro: false, enterprise: '99.9%' },
    { label: 'دعم فني', basic: 'تذاكر', pro: 'أولوية', enterprise: 'هاتفي مباشر' },
  ],
  en: [
    { label: 'Cameras', basic: '1 camera', pro: 'Up to 3', enterprise: 'Up to 6' },
    { label: 'Monitoring hours', basic: '12 hrs', pro: '18 hrs', enterprise: '24/7' },
    { label: 'Daily audit rounds', basic: '6', pro: '9', enterprise: 'Unlimited' },
    { label: 'Custom questions', basic: false, pro: true, enterprise: true },
    { label: 'PDF reports', basic: 'Weekly', pro: 'Daily', enterprise: 'Real-time' },
    { label: 'WhatsApp alerts', basic: false, pro: true, enterprise: true },
    { label: 'Custom API', basic: false, pro: false, enterprise: true },
    { label: 'Account manager', basic: false, pro: false, enterprise: true },
    { label: 'SLA guarantee', basic: false, pro: false, enterprise: '99.9%' },
    { label: 'Support', basic: 'Tickets', pro: 'Priority', enterprise: 'Direct phone' },
  ],
}

// ── FAQ data ─────────────────────────────────────────────────
const FAQ_DATA = {
  ar: [
    { q: 'هل يمكنني تغيير الباقة في أي وقت؟', a: 'نعم، يمكنك الترقية أو تخفيض الباقة في أي وقت من لوحة التحكم. التغييرات تُطبَّق فوراً مع تسوية فرق السعر.' },
    { q: 'ما هي الكاميرات المدعومة؟', a: 'ندعم أي كاميرا IP تبث بروتوكول RTSP، بما فيها Hikvision وDahua وEZVIZ وغيرها. لا نحتاج أجهزة خاصة.' },
    { q: 'أين تُخزَّن بياناتي؟', a: 'جميع البيانات تُعالج وتُخزَّن على خوادم Google Cloud في الدمام (me-central2) داخل المملكة العربية السعودية، متوافقة مع نظام حماية البيانات الشخصية (PDPL).' },
    { q: 'هل يرى أي إنسان تسجيلات الكاميرا؟', a: 'لا. الصور تُرسَل مباشرةً إلى نموذج الذكاء الاصطناعي وتُحذَف فوراً بعد التحليل. لا يطّلع عليها أي موظف في سبلت تيك AI.' },
    { q: 'ما مدة التجربة المجانية؟', a: 'نوفّر فترة تجريبية مجانية. تواصل معنا عبر info@splittech.sa للحصول على تفاصيل العرض الخاص بك.' },
    { q: 'كيف يتم الدفع؟', a: 'ندعم جميع بطاقات الائتمان والخصم السعودية عبر منصة Moyasar المعتمدة محلياً، مع إمكانية الفاتورة السنوية.' },
  ],
  en: [
    { q: 'Can I change my plan at any time?', a: 'Yes, you can upgrade or downgrade at any time from the dashboard. Changes apply immediately with prorated billing.' },
    { q: 'Which cameras are supported?', a: 'Any IP camera that streams via RTSP protocol is supported, including Hikvision, Dahua, EZVIZ, and others. No special hardware needed.' },
    { q: 'Where is my data stored?', a: 'All data is processed and stored on Google Cloud servers in Dammam (me-central2) within Saudi Arabia, compliant with PDPL.' },
    { q: 'Does anyone see my camera recordings?', a: 'No. Images are sent directly to the AI model and deleted immediately after analysis. No SplitTech AI employee ever sees them.' },
    { q: 'Is there a free trial?', a: 'Yes, we offer a free trial period. Contact us at info@splittech.sa for your personalized offer.' },
    { q: 'What payment methods are accepted?', a: 'We support all Saudi credit and debit cards via Moyasar, a locally certified payment platform, with annual invoice option.' },
  ],
}

// ── ROI Calculator ───────────────────────────────────────────
function ROICalculator({ isAr }: { isAr: boolean }) {
  const [supervisors, setSupervisors] = useState(2)
  const [salaryK, setSalaryK] = useState(5)
  const [plan, setPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro')

  const planPrice = { basic: 199, pro: 399, enterprise: 799 }[plan]
  const monthlyCost = supervisors * salaryK * 1000
  const savings = monthlyCost - planPrice
  const savingsPct = Math.round((savings / monthlyCost) * 100)
  const annualSavings = savings * 12

  return (
    <div className="rounded-2xl border p-6 sm:p-8" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'احسب وفّرك الشهري' : 'Calculate your monthly savings'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {isAr ? 'بالمقارنة مع المشرف البشري' : 'vs. manual supervision'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Supervisors */}
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'عدد المشرفين الحاليين' : 'Current supervisors'}
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => setSupervisors(Math.max(1, supervisors - 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-lg transition-colors hover:bg-[var(--bg-muted)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>−</button>
            <span className="flex-1 text-center font-bold text-xl num" style={{ color: 'var(--text-base)' }}>{supervisors}</span>
            <button onClick={() => setSupervisors(Math.min(10, supervisors + 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-lg transition-colors hover:bg-[var(--bg-muted)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>+</button>
          </div>
        </div>

        {/* Salary */}
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'راتب المشرف (ألف ر.س)' : 'Supervisor salary (K SAR)'}
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => setSalaryK(Math.max(2, salaryK - 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-lg transition-colors hover:bg-[var(--bg-muted)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>−</button>
            <span className="flex-1 text-center font-bold text-xl num" style={{ color: 'var(--text-base)' }}>{salaryK}K</span>
            <button onClick={() => setSalaryK(Math.min(20, salaryK + 1))}
              className="w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-lg transition-colors hover:bg-[var(--bg-muted)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>+</button>
          </div>
        </div>

        {/* Plan */}
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'الباقة المقارنة' : 'Compare with plan'}
          </label>
          <select
            value={plan}
            onChange={e => setPlan(e.target.value as any)}
            className="w-full h-8 rounded-lg border px-2 text-sm font-semibold outline-none"
            style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-base)' }}
          >
            <option value="basic">{isAr ? 'الأساسية — 199 ر.س' : 'Basic — 199 SAR'}</option>
            <option value="pro">{isAr ? 'الاحترافية — 399 ر.س' : 'Pro — 399 SAR'}</option>
            <option value="enterprise">{isAr ? 'المؤسسية — 799 ر.س' : 'Enterprise — 799 SAR'}</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg-muted)' }}>
          <p className="text-[10px] mb-1" style={{ color: 'var(--text-faint)' }}>
            {isAr ? 'تكلفة المشرفين' : 'Supervisor cost'}
          </p>
          <p className="text-xl font-extrabold num" style={{ color: 'var(--text-base)' }}>
            {(monthlyCost / 1000).toFixed(1)}K
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {isAr ? 'ر.س / شهر' : 'SAR/mo'}
          </p>
        </div>
        <div className="rounded-xl p-4 text-center bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-900">
          <p className="text-[10px] mb-1 text-brand-700">{isAr ? 'سعر الباقة' : 'Plan price'}</p>
          <p className="text-xl font-extrabold num text-brand-700">{planPrice}</p>
          <p className="text-[10px] mt-0.5 text-brand-600">{isAr ? 'ر.س / شهر' : 'SAR/mo'}</p>
        </div>
        <div className="rounded-xl p-4 text-center bg-lime/10 border border-lime/20">
          <p className="text-[10px] mb-1 text-lime-700 dark:text-lime font-semibold">
            {isAr ? '🎉 توفير شهري' : '🎉 Monthly savings'}
          </p>
          <p className="text-xl font-extrabold num text-lime-700 dark:text-lime">
            {savings > 0 ? `${(savings / 1000).toFixed(1)}K` : '—'}
          </p>
          <p className="text-[10px] mt-0.5 text-lime-600 dark:text-lime/80">
            {savings > 0 ? `${savingsPct}% ${isAr ? 'أقل' : 'less'}` : (isAr ? 'ر.س / شهر' : 'SAR/mo')}
          </p>
        </div>
      </div>

      {savings > 0 && (
        <motion.div
          key={annualSavings}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-xl px-4 py-3 flex items-center justify-between border border-lime/25"
          style={{ background: 'rgba(101,163,13,0.06)' }}
        >
          <span className="text-sm font-semibold text-lime-700 dark:text-lime">
            {isAr
              ? `💰 توفيرك السنوي: ${annualSavings.toLocaleString('ar-SA')} ر.س`
              : `💰 Annual savings: ${annualSavings.toLocaleString()} SAR`}
          </span>
          <Link to="/signup" className="text-xs font-bold bg-lime text-lime-900 px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
            {isAr ? 'ابدأ الآن' : 'Start now'}
          </Link>
        </motion.div>
      )}
    </div>
  )
}

// ── FAQ Item ─────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-start gap-4"
      >
        <span className="font-semibold text-sm" style={{ color: 'var(--text-base)' }}>{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <p className="text-sm leading-relaxed pb-4" style={{ color: 'var(--text-muted)' }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Cell helper ──────────────────────────────────────────────
function Cell({ v, isPop, isAmber }: { v: string | boolean; isPop?: boolean; isAmber?: boolean }) {
  if (v === true) return (
    <td className="py-3 px-4 text-center">
      <CheckCircle2 className={`w-4 h-4 mx-auto ${isPop ? 'text-brand-700' : isAmber ? 'text-amber-500' : 'text-lime-600 dark:text-lime'}`} />
    </td>
  )
  if (v === false) return (
    <td className="py-3 px-4 text-center">
      <X className="w-4 h-4 mx-auto text-gray-300 dark:text-gray-700" />
    </td>
  )
  return (
    <td className="py-3 px-4 text-center text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{v as string}</td>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function Pricing() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const Arrow = isAr ? ArrowLeft : ArrowRight
  const [annual, setAnnual] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const plans = isAr ? PLANS.ar : PLANS.en
  const compareRows = isAr ? COMPARE_ROWS.ar : COMPARE_ROWS.en
  const faq = isAr ? FAQ_DATA.ar : FAQ_DATA.en

  const savingsLabel = isAr ? 'وفّر شهرين' : 'Save 2 months'

  return (
    <div className="min-h-screen" dir={isAr ? 'rtl' : 'ltr'} style={{ background: 'var(--bg-page)' }}>

      {/* ── NAV ── */}
      <motion.header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'backdrop-blur-sm border-b' : 'bg-transparent'}`}
        style={scrolled ? { background: 'var(--bg-card)', borderColor: 'var(--border)' } : {}}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <div className="page-wrap h-16 flex items-center justify-between">
          <Link to="/">
            <SplitLogo size={32} variant="full" />
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle compact />
            <LangToggle compact />
            <Link to="/login" className="hidden sm:flex btn-ghost btn-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'تسجيل الدخول' : 'Sign in'}
            </Link>
            <Link to="/signup" className="btn-primary btn-sm">
              {isAr ? 'ابدأ مجاناً' : 'Start free'} <Arrow className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ── HERO ── */}
      <section className="pt-32 pb-16 text-center relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-20 dark:opacity-10" style={{ backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(to right, var(--border) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg-page)] to-transparent" />

        <div className="page-wrap max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-lime/40 bg-lime/8 text-brand-800 dark:text-brand-400 text-[11px] font-bold mb-5 tracking-wide">
              <span className="text-base">🇸🇦</span>
              {isAr ? 'أول AI سعودي للرقابة التشغيلية' : 'First Saudi AI for operational monitoring'}
            </div>

            <h1 className="text-display mb-4" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'اختر الباقة المناسبة' : 'Choose your plan'}
            </h1>
            <p className="text-[17px] leading-relaxed mb-8 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              {isAr
                ? 'كل الباقات تشمل: خوادم سعودية 100%، PDPL متوافق، لا تدخل بشري، تقارير AI فورية.'
                : 'All plans include: 100% Saudi servers, PDPL compliant, zero human bias, instant AI reports.'}
            </p>

            {/* Annual toggle */}
            <div className="inline-flex items-center gap-3 rounded-full border p-1.5 mb-2" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${!annual ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
                style={{ color: annual ? 'var(--text-faint)' : 'var(--text-base)' }}
              >
                {isAr ? 'شهري' : 'Monthly'}
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${annual ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
                style={{ color: !annual ? 'var(--text-faint)' : 'var(--text-base)' }}
              >
                {isAr ? 'سنوي' : 'Annual'}
                <span className="text-[10px] bg-lime text-lime-900 px-1.5 py-0.5 rounded-full font-bold">{savingsLabel}</span>
              </button>
            </div>
            {annual && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                {isAr ? '✦ الاشتراك السنوي = 10 أشهر بسعر 12' : '✦ Annual = 10 months at the price of 12'}
              </p>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── PRICING CARDS ── */}
      <section className="pb-16">
        <div className="page-wrap">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {plans.map((plan, i) => {
              const isPop = plan.color === 'brand'
              const isAmber = plan.color === 'amber'
              const displayPrice = annual ? Math.round(plan.price_yr / 12) : plan.price_mo
              const totalPrice = annual ? plan.price_yr : plan.price_mo
              return (
                <Reveal key={plan.id} delay={i * 80}>
                  <motion.div
                    className={`relative flex flex-col h-full rounded-2xl overflow-hidden border-2 ${
                      isPop ? 'border-brand-700 shadow-xl shadow-brand-100 dark:shadow-brand-950/50' :
                      isAmber ? 'border-amber-300 dark:border-amber-600' :
                      'border-transparent'
                    }`}
                    style={{
                      background: 'var(--bg-card)',
                      boxShadow: !isPop && !isAmber ? '0 0 0 1px var(--border)' : undefined,
                    }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  >
                    {/* Popular badge */}
                    {plan.badge && (
                      <div className={`py-1.5 text-center ${isPop ? 'bg-brand-700' : 'bg-amber-400'}`}>
                        <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                          {plan.badge}
                        </span>
                      </div>
                    )}

                    <div className="p-6 flex-1 flex flex-col">
                      {/* Plan name */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-bold tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>
                            {isAr ? `الباقة ${plan.name}` : plan.name}
                          </p>
                          <p className={`text-xs font-semibold ${isPop ? 'text-brand-600' : 'text-amber-500'}`}>
                            {plan.cameras} · {plan.hours}
                          </p>
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isPop ? 'bg-brand-700' : isAmber ? 'bg-amber-400' : 'bg-[var(--bg-muted)]'}`}>
                          <Camera className={`w-4 h-4 ${isPop || isAmber ? 'text-white' : ''}`} style={{ color: !isPop && !isAmber ? 'var(--text-muted)' : undefined }} />
                        </div>
                      </div>

                      {/* Price */}
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${plan.id}-${annual}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                          className="mb-5"
                        >
                          <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-[42px] font-extrabold leading-none num" style={{ color: 'var(--text-base)' }}>
                              {displayPrice}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--text-faint)' }}>
                              {isAr ? 'ر.س / شهر' : 'SAR/mo'}
                            </span>
                          </div>
                          {annual && (
                            <p className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                              {isAr ? `${totalPrice.toLocaleString('ar-SA')} ر.س / سنوياً` : `${totalPrice.toLocaleString()} SAR / year`}
                              <span className="ms-2 text-lime-600 dark:text-lime font-bold">
                                {isAr ? '(شهران مجاناً ✦)' : '(2 months free ✦)'}
                              </span>
                            </p>
                          )}
                          {!annual && (
                            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                              {isAr ? `أو ${Math.round(plan.price_yr / 12)} ر.س/شهر بالسنوي` : `or ${Math.round(plan.price_yr / 12)} SAR/mo billed annually`}
                            </p>
                          )}
                        </motion.div>
                      </AnimatePresence>

                      <div className="h-px mb-5" style={{ background: 'var(--border)' }} />

                      {/* Features */}
                      <ul className="space-y-2.5 flex-1">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${isPop ? 'text-brand-700' : isAmber ? 'text-amber-500' : 'text-[var(--border-mid)]'}`} />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <Link
                        to="/signup"
                        className={`mt-7 block text-center py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                          isPop ? 'bg-brand-700 text-white hover:bg-brand-800' :
                          isAmber ? 'bg-amber-400 text-white hover:bg-amber-500' :
                          'hover:bg-[var(--bg-muted)]'
                        }`}
                        style={!isPop && !isAmber ? { background: 'var(--bg-subtle)', color: 'var(--text-base)' } : {}}
                      >
                        {isAr ? 'ابدأ الآن' : 'Get started'}
                      </Link>
                    </div>
                  </motion.div>
                </Reveal>
              )
            })}
          </div>

          {/* All plans note */}
          <Reveal delay={240}>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8">
              {(isAr
                ? ['🇸🇦 خوادم سعودية 100%', '🔒 PDPL متوافق', '🤖 لا تدخل بشري', '📊 تقارير AI فورية', '💳 إلغاء في أي وقت']
                : ['🇸🇦 100% Saudi servers', '🔒 PDPL compliant', '🤖 Zero human bias', '📊 Instant AI reports', '💳 Cancel anytime']
              ).map(s => (
                <span key={s} className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>{s}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── ROI CALCULATOR ── */}
      <section className="py-16 border-t" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <div className="page-wrap max-w-3xl mx-auto">
          <Reveal>
            <div className="text-center mb-8">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">
                {isAr ? 'حاسبة العائد' : 'ROI Calculator'}
              </p>
              <h2 className="text-display-sm mb-3" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'كم ستوفّر مع سبلت تيك AI؟' : 'How much will you save with SplitTech AI?'}
              </h2>
              <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'قارن تكلفة المشرفين البشريين مقابل منصتنا الذكية' : 'Compare human supervisor costs vs. our AI platform'}
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <ROICalculator isAr={isAr} />
          </Reveal>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="py-16 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="page-wrap">
          <Reveal>
            <div className="text-center mb-8">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">
                {isAr ? 'مقارنة تفصيلية' : 'Detailed comparison'}
              </p>
              <h2 className="text-display-sm" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'كل ما تحتاج معرفته' : 'Everything you need to know'}
              </h2>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                    <th className="py-4 px-5 text-start text-xs font-bold tracking-wide" style={{ color: 'var(--text-faint)', width: '35%' }}>
                      {isAr ? 'الميزة' : 'Feature'}
                    </th>
                    <th className="py-4 px-4 text-center text-xs font-bold tracking-wide" style={{ color: 'var(--text-faint)' }}>
                      {isAr ? 'الأساسية' : 'Basic'}
                    </th>
                    <th className="py-4 px-4 text-center text-xs font-bold tracking-wide text-brand-700 bg-brand-50 dark:bg-brand-950/40">
                      {isAr ? 'الاحترافية' : 'Pro'}
                    </th>
                    <th className="py-4 px-4 text-center text-xs font-bold tracking-wide" style={{ color: 'var(--text-faint)' }}>
                      {isAr ? 'المؤسسية' : 'Enterprise'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                      <td className="py-3 px-5 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{row.label}</td>
                      <Cell v={row.basic} />
                      <Cell v={row.pro} isPop />
                      <Cell v={row.enterprise} isAmber />
                    </tr>
                  ))}
                  {/* Price row */}
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <td className="py-4 px-5 text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                      {isAr ? 'السعر الشهري' : 'Monthly price'}
                    </td>
                    {plans.map((p, i) => (
                      <td key={p.id} className={`py-4 px-4 text-center ${i === 1 ? 'bg-brand-50 dark:bg-brand-950/40' : ''}`}>
                        <span className="text-lg font-extrabold num" style={{ color: 'var(--text-base)' }}>{p.price_mo}</span>
                        <span className="text-xs ms-1" style={{ color: 'var(--text-faint)' }}>{isAr ? 'ر.س' : 'SAR'}</span>
                      </td>
                    ))}
                  </tr>
                  {/* CTA row */}
                  <tr style={{ background: 'var(--bg-subtle)' }}>
                    <td className="py-4 px-5" />
                    {plans.map((p, i) => {
                      const isPop = p.color === 'brand'
                      const isAmber = p.color === 'amber'
                      return (
                        <td key={p.id} className={`py-4 px-4 text-center ${i === 1 ? 'bg-brand-50 dark:bg-brand-950/40' : ''}`}>
                          <Link
                            to="/signup"
                            className={`inline-block px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                              isPop ? 'bg-brand-700 text-white hover:bg-brand-800' :
                              isAmber ? 'bg-amber-400 text-white hover:bg-amber-500' :
                              'bg-[var(--bg-card)] border hover:bg-[var(--bg-muted)]'
                            }`}
                            style={!isPop && !isAmber ? { borderColor: 'var(--border)', color: 'var(--text-base)' } : {}}
                          >
                            {isAr ? 'ابدأ' : 'Start'}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 border-t" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <div className="page-wrap max-w-2xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <p className="text-[11px] font-bold text-brand-700 tracking-[0.2em] uppercase mb-3">FAQ</p>
              <h2 className="text-display-sm" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'أسئلة شائعة' : 'Frequently asked questions'}
              </h2>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="px-6 py-2">
                {faq.map((item) => (
                  <FAQItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-ink relative overflow-hidden">
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:64px_64px] pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(101,163,13,0.1) 0%, transparent 60%)' }} />
        <div className="page-wrap text-center relative max-w-2xl mx-auto">
          <Reveal>
            <div className="flex justify-center mb-6">
              <SplitLogo size={40} variant="full-white" />
            </div>
            <h2 className="text-display text-white mb-4">
              {isAr ? 'ابدأ اليوم — بدون تعقيد' : 'Start today — no complexity'}
            </h2>
            <p className="text-slate-400 text-[16px] mb-8 leading-relaxed">
              {isAr
                ? 'وصّل كاميراتك الموجودة، وفّعّل الباقة، وابدأ استقبال تقارير AI خلال ساعات.'
                : 'Connect your existing cameras, activate your plan, and start receiving AI reports within hours.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup" className="btn-lime btn-lg inline-flex">
                {isAr ? 'ابدأ مجاناً' : 'Start free'} <Arrow className="w-4 h-4" />
              </Link>
              <a href="mailto:info@splittech.sa" className="btn-outline btn-lg inline-flex" style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>
                {isAr ? 'تواصل معنا' : 'Contact us'}
              </a>
            </div>
            <p className="text-slate-600 text-xs mt-6">
              {isAr ? '🇸🇦 خوادم سعودية 100% · PDPL متوافق · info@splittech.sa' : '🇸🇦 100% Saudi servers · PDPL compliant · info@splittech.sa'}
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
