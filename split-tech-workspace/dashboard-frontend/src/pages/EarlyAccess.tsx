import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Zap, Shield,
  Star, Users, TrendingDown, Gift,
} from 'lucide-react'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'

const ease = [0.22, 1, 0.36, 1]

const TOTAL_SLOTS  = 50
const TAKEN_SLOTS  = 23   // hardcoded — update manually as signups grow

// ── Business types ───────────────────────────────────────────
const BUSINESS_TYPES = {
  ar: [
    { value: 'retail',      label: 'محلات التجزئة (بقالة، هايبر، إكسسوارات)' },
    { value: 'barber',      label: 'صالونات حلاقة ومنتجعات' },
    { value: 'restaurant',  label: 'مطاعم وكافيهات' },
    { value: 'pharmacy',    label: 'صيدليات' },
    { value: 'logistics',   label: 'لوجستيات ومستودعات' },
    { value: 'laundry',     label: 'مغاسل' },
    { value: 'other',       label: 'أخرى' },
  ],
  en: [
    { value: 'retail',      label: 'Retail (grocery, hypermarket, accessories)' },
    { value: 'barber',      label: 'Barbershops & salons' },
    { value: 'restaurant',  label: 'Restaurants & cafes' },
    { value: 'pharmacy',    label: 'Pharmacies' },
    { value: 'logistics',   label: 'Logistics & warehouses' },
    { value: 'laundry',     label: 'Laundry' },
    { value: 'other',       label: 'Other' },
  ],
}

const CITIES = {
  ar: ['جدة', 'الرياض', 'الدمام / الخبر', 'مكة المكرمة', 'المدينة المنورة', 'الطائف', 'أبها', 'تبوك', 'أخرى'],
  en: ['Jeddah', 'Riyadh', 'Dammam / Khobar', 'Mecca', 'Medina', 'Taif', 'Abha', 'Tabuk', 'Other'],
}

// ── Reveal ───────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-30px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: delay / 1000, ease }}
      className={className}>
      {children}
    </motion.div>
  )
}

// ── Success screen ───────────────────────────────────────────
function SuccessScreen({ isAr, name }: { isAr: boolean; name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease }}
      className="text-center py-12 px-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 rounded-full bg-lime/15 border-2 border-lime/30 flex items-center justify-center mx-auto mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-lime" />
      </motion.div>

      <h2 className="text-2xl font-extrabold mb-3" style={{ color: 'var(--text-base)' }}>
        {isAr ? `شكراً ${name}! 🎉` : `Thank you, ${name}! 🎉`}
      </h2>
      <p className="text-[15px] leading-relaxed mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'استلمنا طلبك بنجاح. سيتواصل معك فريق سبلت تيك AI خلال 24 ساعة لتفعيل تجربتك المجانية.'
          : 'Your request was received. The SplitTech AI team will contact you within 24 hours to activate your free trial.'}
      </p>

      <div className="rounded-2xl border p-5 max-w-sm mx-auto mb-8 text-start" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        {(isAr
          ? ['✅ تجربة مجانية كاملة 14 يوم', '✅ خصم 50% لأول 3 أشهر بعد التجربة', '✅ إعداد مجاني من قِبل فريقنا', '✅ لا بطاقة ائتمانية مطلوبة']
          : ['✅ Full 14-day free trial', '✅ 50% discount for first 3 months', '✅ Free setup by our team', '✅ No credit card required']
        ).map(s => (
          <p key={s} className="text-sm py-1.5 border-b last:border-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>{s}</p>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/" className="btn-primary btn-lg inline-flex">
          {isAr ? 'العودة للرئيسية' : 'Back to home'}
        </Link>
        <a href="https://wa.me/966500000000" target="_blank" rel="noreferrer"
          className="btn-outline btn-lg inline-flex items-center gap-2">
          <span>💬</span>
          {isAr ? 'تواصل عبر واتساب' : 'WhatsApp us'}
        </a>
      </div>
    </motion.div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function EarlyAccess() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const Arrow = isAr ? ArrowLeft : ArrowRight

  const remaining = TOTAL_SLOTS - TAKEN_SLOTS
  const pctFull   = Math.round((TAKEN_SLOTS / TOTAL_SLOTS) * 100)

  const [form, setForm] = useState({
    full_name: '', store_name: '', business_type: '',
    phone: '', email: '', city: '', notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.full_name || !form.store_name || !form.business_type || !form.phone || !form.email || !form.city) {
      setError(isAr ? 'يرجى ملء جميع الحقول المطلوبة.' : 'Please fill in all required fields.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(isAr ? 'بريد إلكتروني غير صحيح.' : 'Invalid email address.')
      return
    }

    setLoading(true)
    try {
      const { error: dbErr } = await supabase.from('early_access_requests').insert({
        full_name:     form.full_name.trim(),
        store_name:    form.store_name.trim(),
        business_type: form.business_type,
        phone:         form.phone.trim(),
        email:         form.email.trim().toLowerCase(),
        city:          form.city,
        notes:         form.notes.trim() || null,
        lang,
        source: 'website',
      })
      if (dbErr) {
        if (dbErr.code === '23505') {
          setError(isAr ? 'هذا البريد الإلكتروني مسجّل بالفعل. سنتواصل معك قريباً!' : 'This email is already registered. We\'ll contact you soon!')
        } else {
          throw dbErr
        }
      } else {
        setDone(true)
        // Fire-and-forget email notification to super_owner + it_support
        fetch(`${import.meta.env.VITE_API_URL}/v1/notify-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'early_access_requests',
            record: {
              full_name:     form.full_name.trim(),
              store_name:    form.store_name.trim(),
              business_type: form.business_type,
              phone:         form.phone.trim(),
              email:         form.email.trim().toLowerCase(),
              city:          form.city,
              notes:         form.notes.trim() || null,
              created_at:    new Date().toISOString(),
            },
          }),
        }).catch(() => {/* silent — notification is best-effort */})
      }
    } catch (err: any) {
      setError(isAr ? 'حدث خطأ، يرجى المحاولة مرة أخرى.' : 'An error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
  const inputStyle = { background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-base)' }

  return (
    <div className="min-h-screen" dir={isAr ? 'rtl' : 'ltr'} style={{ background: 'var(--bg-page)' }}>

      {/* ── NAV ── */}
      <motion.header
        className="fixed top-0 inset-x-0 z-50 border-b backdrop-blur-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
      >
        <div className="page-wrap h-16 flex items-center justify-between">
          <Link to="/"><SplitLogo size={30} variant="full" /></Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle compact />
            <LangToggle compact />
            <Link to="/" className="hidden sm:flex btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'الرئيسية' : 'Home'}
            </Link>
          </div>
        </div>
      </motion.header>

      <main className="pt-24 pb-20">
        <div className="page-wrap max-w-5xl mx-auto">

          {done ? (
            <SuccessScreen isAr={isAr} name={form.full_name.split(' ')[0]} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">

              {/* ── LEFT — Benefits ── */}
              <div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease }}
                >
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[11px] font-bold mb-5 tracking-wide">
                    <Gift className="w-3.5 h-3.5" />
                    {isAr ? 'مبادرة الإطلاق المبكر — Early Access' : 'Early Access Launch Initiative'}
                  </div>

                  <h1 className="text-display mb-5 text-balance" style={{ color: 'var(--text-base)' }}>
                    {isAr
                      ? <>جرّب <span className="text-brand-700">سبلت تيك AI</span> مجاناً<br />لمدة 14 يوماً</>
                      : <>Try <span className="text-brand-700">SplitTech AI</span><br />free for 14 days</>}
                  </h1>

                  <p className="text-[16px] leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
                    {isAr
                      ? 'أول 50 متجر يحصل على: تجربة مجانية كاملة + خصم 50% لأول 3 أشهر بعد التجربة + إعداد مجاني من فريقنا.'
                      : 'First 50 stores get: full free trial + 50% off first 3 months + free setup by our team.'}
                  </p>

                  {/* Slots progress */}
                  <div className="rounded-2xl border p-5 mb-8" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-brand-700" />
                        <span className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                          {isAr ? `${TAKEN_SLOTS} متجر انضم` : `${TAKEN_SLOTS} stores joined`}
                        </span>
                      </div>
                      <span className={`text-sm font-bold ${remaining <= 10 ? 'text-red-500' : 'text-lime-600 dark:text-lime'}`}>
                        {isAr ? `${remaining} مكان متبقٍ` : `${remaining} spots left`}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                      <motion.div
                        className={`h-full rounded-full ${remaining <= 10 ? 'bg-red-500' : 'bg-lime'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pctFull}%` }}
                        transition={{ duration: 1.2, delay: 0.3, ease }}
                      />
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>
                      {isAr
                        ? `${pctFull}٪ من الأماكن محجوزة — من أصل ${TOTAL_SLOTS} متجر`
                        : `${pctFull}% of slots reserved — out of ${TOTAL_SLOTS} stores`}
                    </p>
                  </div>

                  {/* What you get */}
                  <div className="space-y-3 mb-8">
                    {(isAr ? [
                      { icon: Gift,        text: 'تجربة مجانية كاملة 14 يوم — بدون بطاقة ائتمانية' },
                      { icon: TrendingDown, text: 'خصم 50% على الباقة لأول 3 أشهر بعد التجربة' },
                      { icon: Zap,         text: 'إعداد الكاميرات والنظام مجاناً من فريقنا' },
                      { icon: Star,        text: 'أسئلة تدقيق مخصصة لنشاطك مجاناً' },
                      { icon: Clock,       text: 'دعم مباشر عبر واتساب طوال فترة التجربة' },
                      { icon: Shield,      text: 'خوادم سعودية 100% — بياناتك لا تغادر المملكة' },
                    ] : [
                      { icon: Gift,        text: 'Full 14-day free trial — no credit card' },
                      { icon: TrendingDown, text: '50% discount for first 3 months after trial' },
                      { icon: Zap,         text: 'Free camera & system setup by our team' },
                      { icon: Star,        text: 'Custom audit questions for your business' },
                      { icon: Clock,       text: 'Direct WhatsApp support during trial' },
                      { icon: Shield,      text: '100% Saudi servers — data stays in KSA' },
                    ]).map(({ icon: Ic, text }) => (
                      <div key={text} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Ic className="w-4 h-4 text-brand-700" />
                        </div>
                        <p className="text-sm leading-relaxed pt-1.5" style={{ color: 'var(--text-muted)' }}>{text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Saudi badge */}
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                    <span className="text-lg">🇸🇦</span>
                    <div>
                      <p className="text-xs font-bold" style={{ color: 'var(--text-base)' }}>
                        {isAr ? 'خوادم سعودية 100%' : '100% Saudi Servers'}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                        Google Cloud · Dammam · me-central2 · PDPL ✓
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* ── RIGHT — Form ── */}
              <motion.div
                className="rounded-2xl border shadow-lg overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                initial={{ opacity: 0, x: isAr ? -24 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.65, delay: 0.1, ease }}
              >
                {/* Form header */}
                <div className="px-6 py-4 border-b" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                  <p className="font-bold" style={{ color: 'var(--text-base)' }}>
                    {isAr ? 'سجّل للحصول على التجربة المجانية' : 'Register for free trial'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {isAr ? '⚡ سنتواصل معك خلال 24 ساعة' : '⚡ We\'ll contact you within 24 hours'}
                  </p>
                </div>

                <form onSubmit={submit} className="p-6 space-y-4">

                  {/* Full name */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'الاسم الكامل *' : 'Full name *'}
                    </label>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={set('full_name')}
                      placeholder={isAr ? 'محمد العتيبي' : 'Mohamed Al-Otaibi'}
                      className={inputClass}
                      style={inputStyle}
                      disabled={loading}
                      required
                    />
                  </div>

                  {/* Store name */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'اسم المتجر / النشاط *' : 'Store / Business name *'}
                    </label>
                    <input
                      type="text"
                      value={form.store_name}
                      onChange={set('store_name')}
                      placeholder={isAr ? 'صالون العناية — فرع جدة' : 'Elite Salon — Jeddah Branch'}
                      className={inputClass}
                      style={inputStyle}
                      disabled={loading}
                      required
                    />
                  </div>

                  {/* Business type */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'نوع النشاط *' : 'Business type *'}
                    </label>
                    <select
                      value={form.business_type}
                      onChange={set('business_type')}
                      className={inputClass}
                      style={inputStyle}
                      disabled={loading}
                      required
                    >
                      <option value="">{isAr ? '— اختر نوع النشاط —' : '— Select business type —'}</option>
                      {(isAr ? BUSINESS_TYPES.ar : BUSINESS_TYPES.en).map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Phone + City side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        {isAr ? 'رقم الجوال *' : 'Phone *'}
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={set('phone')}
                        placeholder="05xxxxxxxx"
                        dir="ltr"
                        className={inputClass}
                        style={inputStyle}
                        disabled={loading}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        {isAr ? 'المدينة *' : 'City *'}
                      </label>
                      <select
                        value={form.city}
                        onChange={set('city')}
                        className={inputClass}
                        style={inputStyle}
                        disabled={loading}
                        required
                      >
                        <option value="">{isAr ? '— المدينة —' : '— City —'}</option>
                        {(isAr ? CITIES.ar : CITIES.en).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'البريد الإلكتروني *' : 'Email *'}
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="name@business.com"
                      dir="ltr"
                      className={inputClass}
                      style={inputStyle}
                      disabled={loading}
                      required
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={set('notes')}
                      rows={2}
                      placeholder={isAr ? 'عدد الفروع، عدد الكاميرات الحالية، أي تفاصيل إضافية...' : 'Number of branches, existing cameras, any additional details...'}
                      className={`${inputClass} resize-none`}
                      style={inputStyle}
                      disabled={loading}
                    />
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2.5"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold text-sm bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        {isAr ? 'جارٍ الإرسال...' : 'Submitting...'}
                      </>
                    ) : (
                      <>
                        {isAr ? 'احجز مكانك الآن مجاناً' : 'Reserve your free spot now'}
                        <Arrow className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {isAr
                      ? 'لا بطاقة ائتمانية · لا التزام · يمكن الإلغاء في أي وقت'
                      : 'No credit card · No commitment · Cancel anytime'}
                  </p>
                </form>
              </motion.div>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-6" style={{ borderColor: 'var(--border)' }}>
        <div className="page-wrap flex flex-col sm:flex-row items-center justify-between gap-2">
          <SplitLogo size={24} variant="full" />
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {isAr ? '© 2026 سبلت تيك AI · info@splittech.sa' : '© 2026 SplitTech AI · info@splittech.sa'}
          </p>
          <div className="flex items-center gap-3">
            <Link to="/terms" className="text-xs hover:underline" style={{ color: 'var(--text-faint)' }}>
              {isAr ? 'الشروط' : 'Terms'}
            </Link>
            <Link to="/pricing" className="text-xs hover:underline" style={{ color: 'var(--text-faint)' }}>
              {isAr ? 'الأسعار' : 'Pricing'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
