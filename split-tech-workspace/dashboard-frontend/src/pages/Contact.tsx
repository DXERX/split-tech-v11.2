import { useState, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Phone, Mail, MapPin, Send, CheckCircle,
  MessageSquare, Clock, ArrowRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../contexts/LanguageContext'
import SplitLogo from '../components/ui/SplitLogo'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'

// ── Types ─────────────────────────────────────────────────────
interface FormData {
  full_name: string
  company: string
  phone: string
  email: string
  subject: string
  message: string
}

const SUBJECTS_AR = [
  'استفسار عام',
  'طلب عرض تجريبي',
  'استفسار عن الأسعار',
  'دعم تقني',
  'شراكة تجارية',
  'أخرى',
]

const SUBJECTS_EN = [
  'General Inquiry',
  'Demo Request',
  'Pricing Inquiry',
  'Technical Support',
  'Business Partnership',
  'Other',
]

// ── Success screen ────────────────────────────────────────────
function SuccessScreen({ isAr }: { isAr: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center text-center py-12 px-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'var(--primary-10)' }}
      >
        <CheckCircle size={40} style={{ color: 'var(--primary)' }} />
      </motion.div>
      <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
        {isAr ? 'تم إرسال رسالتك!' : 'Message Sent!'}
      </h3>
      <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'شكراً لتواصلك معنا. سيقوم فريقنا بالرد عليك خلال 24 ساعة عمل.'
          : 'Thank you for reaching out. Our team will get back to you within 24 business hours.'}
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm text-white transition-opacity hover:opacity-90"
        style={{ background: 'var(--primary)' }}
      >
        {isAr ? 'العودة للرئيسية' : 'Back to Home'} <ArrowRight size={14} />
      </Link>
    </motion.div>
  )
}

// ── Contact card ──────────────────────────────────────────────
function InfoCard({ icon, titleAr, titleEn, valueAr, valueEn, href, isAr }: {
  icon: React.ReactNode; titleAr: string; titleEn: string
  valueAr: string; valueEn: string; href?: string; isAr: boolean
}) {
  const content = (
    <div
      className="flex items-start gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--primary-10)', color: 'var(--primary)' }}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
          {isAr ? titleAr : titleEn}
        </p>
        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
          {isAr ? valueAr : valueEn}
        </p>
      </div>
    </div>
  )
  return href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : <div>{content}</div>
}

// ── Page ──────────────────────────────────────────────────────
export default function Contact() {
  const { lang, setLang } = useLanguage()
  const isAr = lang === 'ar'

  const [form, setForm] = useState<FormData>({
    full_name: '', company: '', phone: '', email: '', subject: '', message: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const heroRef = useRef(null)
  const heroInView = useInView(heroRef, { once: true })

  const subjects = isAr ? SUBJECTS_AR : SUBJECTS_EN

  function handle(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.phone || !form.email || !form.subject || !form.message) {
      setError(isAr ? 'يرجى ملء جميع الحقول المطلوبة.' : 'Please fill in all required fields.')
      return
    }
    setLoading(true)
    try {
      const { error: dbErr } = await supabase.from('contact_requests').insert({
        full_name: form.full_name,
        company: form.company || null,
        phone: form.phone,
        email: form.email,
        subject: form.subject,
        message: form.message,
        lang,
        source: 'website',
      })
      if (dbErr) {
        console.error(dbErr)
        setError(isAr ? 'حدث خطأ، يرجى المحاولة لاحقاً.' : 'An error occurred. Please try again.')
        return
      }
      setDone(true)
      // Fire-and-forget email notification to super_owner + it_support
      fetch(`${import.meta.env.VITE_API_URL}/v1/notify-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'contact_requests',
          record: {
            full_name: form.full_name,
            company:   form.company || null,
            phone:     form.phone,
            email:     form.email,
            subject:   form.subject,
            message:   form.message,
            created_at: new Date().toISOString(),
          },
        }),
      }).catch(() => {/* silent — notification is best-effort */})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-80)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <SplitLogo size={28} />
            <span className="font-bold text-base" style={{ color: 'var(--text)' }}>
              {isAr ? 'سبلت تيك AI' : 'SplitTech AI'}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
            <Link
              to="/early-access"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              {isAr ? 'تجربة مجانية' : 'Free Trial'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} className="py-14 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto space-y-4"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
            style={{ borderColor: 'var(--primary-30)', color: 'var(--primary)', background: 'var(--primary-10)' }}>
            <MessageSquare size={12} />
            {isAr ? 'تواصل معنا' : 'Get in Touch'}
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ color: 'var(--text)' }}>
            {isAr ? 'نحن هنا للمساعدة' : "We're Here to Help"}
          </h1>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            {isAr
              ? 'سواء كان لديك سؤال عن منتجاتنا أو تريد معرفة المزيد، فريقنا مستعد دائماً.'
              : 'Whether you have a question about our products or want to learn more, our team is always ready.'}
          </p>
        </motion.div>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* Left info */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div
            initial={{ opacity: 0, x: isAr ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
              {isAr ? 'معلومات التواصل' : 'Contact Information'}
            </h2>
            <div className="space-y-3">
              <InfoCard
                icon={<Phone size={16} />}
                titleAr="الهاتف" titleEn="Phone"
                valueAr="+966 50 000 0000" valueEn="+966 50 000 0000"
                href="tel:+966500000000"
                isAr={isAr}
              />
              <InfoCard
                icon={<Mail size={16} />}
                titleAr="البريد الإلكتروني" titleEn="Email"
                valueAr="hello@splittech.sa" valueEn="hello@splittech.sa"
                href="mailto:hello@splittech.sa"
                isAr={isAr}
              />
              <InfoCard
                icon={<MapPin size={16} />}
                titleAr="الموقع" titleEn="Location"
                valueAr="الرياض، المملكة العربية السعودية" valueEn="Riyadh, Saudi Arabia"
                isAr={isAr}
              />
              <InfoCard
                icon={<Clock size={16} />}
                titleAr="ساعات العمل" titleEn="Working Hours"
                valueAr="الأحد – الخميس، ٩ص – ٦م" valueEn="Sun – Thu, 9 AM – 6 PM"
                isAr={isAr}
              />
            </div>

            {/* WhatsApp CTA */}
            <a
              href="https://wa.me/966500000000"
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: '#25D366' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {isAr ? 'تواصل عبر واتساب' : 'Chat on WhatsApp'}
            </a>
          </motion.div>
        </div>

        {/* Right form */}
        <motion.div
          initial={{ opacity: 0, x: isAr ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="lg:col-span-3 rounded-2xl border p-6"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <AnimatePresence mode="wait">
            {done ? (
              <SuccessScreen key="success" isAr={isAr} />
            ) : (
              <motion.form
                key="form"
                onSubmit={submit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
                  {isAr ? 'أرسل لنا رسالة' : 'Send Us a Message'}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={isAr ? 'الاسم الكامل *' : 'Full Name *'} isAr={isAr}>
                    <input
                      name="full_name" value={form.full_name} onChange={handle}
                      placeholder={isAr ? 'محمد العلي' : 'John Doe'}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={isAr ? 'اسم الشركة / المتجر' : 'Company / Store'} isAr={isAr}>
                    <input
                      name="company" value={form.company} onChange={handle}
                      placeholder={isAr ? 'اختياري' : 'Optional'}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={isAr ? 'رقم الهاتف *' : 'Phone Number *'} isAr={isAr}>
                    <input
                      name="phone" value={form.phone} onChange={handle}
                      placeholder="05xxxxxxxx"
                      type="tel"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={isAr ? 'البريد الإلكتروني *' : 'Email *'} isAr={isAr}>
                    <input
                      name="email" value={form.email} onChange={handle}
                      placeholder="you@company.com"
                      type="email"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <Field label={isAr ? 'الموضوع *' : 'Subject *'} isAr={isAr}>
                  <select
                    name="subject" value={form.subject} onChange={handle}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">{isAr ? '-- اختر الموضوع --' : '-- Select subject --'}</option>
                    {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label={isAr ? 'الرسالة *' : 'Message *'} isAr={isAr}>
                  <textarea
                    name="message" value={form.message} onChange={handle}
                    rows={5}
                    placeholder={isAr ? 'اكتب رسالتك هنا...' : 'Write your message here...'}
                    className={inputCls + ' resize-none'}
                    style={inputStyle}
                  />
                </Field>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'var(--primary)' }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Send size={14} /> {isAr ? 'إرسال الرسالة' : 'Send Message'}</>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        © {new Date().getFullYear()} {isAr ? 'سبلت تيك AI' : 'SplitTech AI'} · {isAr ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
      </footer>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 transition-all'
const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }

function Field({ label, isAr, children }: { label: string; isAr: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
