import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, User, Building, Phone, ArrowLeft, CheckCircle, Shield, RefreshCw, Tag } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import SplitLogo from '../components/ui/SplitLogo'
import TechPanel from '../components/ui/TechPanel'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useTurnstile } from '../hooks/useTurnstile'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'

type Step = 'account' | 'email-otp'

export default function Signup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  const [step, setStep]               = useState<Step>('account')
  const [form, setForm]               = useState({ fullName: '', company: '', email: '', password: '', phone: '' })
  const [referralCode, setReferralCode] = useState(() => searchParams.get('ref') ?? '')
  const [honeypot, setHoneypot]       = useState('')
  const [emailOtp, setEmailOtp]       = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  const formStartTime = useRef(Date.now())
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const { turnstileRef, captchaToken, resetTurnstile } = useTurnstile()

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current) }, [])

  function startCooldown(seconds = 60) {
    setOtpCooldown(seconds)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      setOtpCooldown(s => {
        if (s <= 1) { clearInterval(cooldownTimer.current!); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const api = import.meta.env.VITE_API_URL

  // ── Step 1: Create account ────────────────────────────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (honeypot) return
    if (Date.now() - formStartTime.current < 3000) {
      setError(isAr ? 'يرجى إكمال النموذج بشكل صحيح' : 'Please complete the form correctly')
      return
    }
    if (form.fullName.trim().length < 3) {
      setError(isAr ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(isAr ? 'البريد الإلكتروني غير صحيح' : 'Invalid email address')
      return
    }
    if (form.password.length < 8) {
      setError(isAr ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters')
      return
    }
    if (!captchaToken) {
      setError(isAr ? 'يرجى إتمام التحقق من البوت أولاً' : 'Please complete the bot check first')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${api}/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:         form.email.trim().toLowerCase(),
          password:      form.password,
          full_name:     form.fullName.trim(),
          company_name:  form.company.trim(),
          phone:         form.phone.trim() || undefined,
          captchaToken,
          referral_code: referralCode.trim().toUpperCase() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (isAr ? 'حدث خطأ غير متوقع' : 'Unexpected error'))

      if (data.access_token) {
        setAccessToken(data.access_token)
        if (data.refresh_token) setRefreshToken(data.refresh_token)
        startCooldown(60)
      }
      setStep('email-otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ غير متوقع' : 'Unexpected error'))
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Verify email OTP → dashboard ─────────────────────────────────
  async function handleEmailOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (emailOtp.length !== 6) {
      setError(isAr ? 'الرمز يجب أن يكون 6 أرقام' : 'Code must be 6 digits')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${api}/v1/otp/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code: emailOtp.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (isAr ? 'رمز غير صحيح' : 'Invalid code'))
      // Set session and go to dashboard
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isAr ? 'رمز غير صحيح' : 'Invalid code'))
    } finally {
      setLoading(false)
    }
  }

  async function resendEmailOtp() {
    if (otpCooldown > 0 || !accessToken) return
    setError('')
    try {
      const res = await fetch(`${api}/v1/otp/email/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      startCooldown(60)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isAr ? 'فشل الإرسال' : 'Send failed'))
    }
  }

  const stepNum: Record<Step, number> = { account: 1, 'email-otp': 2 }
  const stepTitle: Record<Step, { ar: string; en: string }> = {
    account:     { ar: 'إنشاء حساب',               en: 'Create account' },
    'email-otp': { ar: 'تحقق من بريدك الإلكتروني', en: 'Verify your email' },
  }
  const stepSub: Record<Step, { ar: string; en: string }> = {
    account:     { ar: 'أدخل بياناتك لبدء رحلتك مع سبلت', en: 'Enter your details to get started' },
    'email-otp': { ar: `أرسلنا رمز تحقق إلى ${form.email}`, en: `We sent a code to ${form.email}` },
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[40%] xl:w-[45%] flex-shrink-0">
        <TechPanel className="w-full h-full min-h-screen" />
      </div>

      <div
        className="flex-1 flex items-start justify-center p-6 pt-10 overflow-y-auto min-h-screen"
        dir={isAr ? 'rtl' : 'ltr'}
        style={{ background: 'var(--bg-page)' }}
      >
        <div className="w-full max-w-sm">
          <div className="flex justify-end gap-1 mb-5">
            <ThemeToggle />
            <LangToggle />
          </div>

          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
            <Link to="/"><SplitLogo size={36} variant="full" /></Link>
          </motion.div>

          {/* Step indicators — 2 steps */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map((n) => (
              <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    stepNum[step] > n
                      ? 'bg-brand-600 text-white'
                      : stepNum[step] === n
                        ? 'bg-brand-700 text-white ring-4 ring-brand-100 dark:ring-brand-950/40'
                        : 'text-[var(--text-faint)]'
                  }`}
                  style={stepNum[step] < n ? { background: 'var(--bg-muted)' } : {}}
                >
                  {stepNum[step] > n ? <CheckCircle size={14} /> : n}
                </div>
                {n < 2 && (
                  <div
                    className="flex-1 h-0.5 rounded transition-colors"
                    style={{ background: stepNum[step] > n ? 'var(--brand-600, #16a34a)' : 'var(--border)' }}
                  />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: isAr ? -18 : 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isAr ? 18 : -18 }}
              transition={{ duration: 0.22 }}
            >
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-base)' }}>
                {isAr ? stepTitle[step].ar : stepTitle[step].en}
              </h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {isAr ? stepSub[step].ar : stepSub[step].en}
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl p-3 mb-5 border text-sm flex items-start gap-2"
                  style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#ef4444' }}
                >
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  {error}
                </motion.div>
              )}

              {/* ── Step 1: Account form ── */}
              {step === 'account' && (
                <form onSubmit={handleSignup} className="space-y-4">
                  <input
                    type="text" name="website" value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
                    tabIndex={-1} autoComplete="off" aria-hidden="true"
                  />
                  <Input
                    label={t('signup.fullName')} type="text" value={form.fullName}
                    onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder={isAr ? 'محمد الأحمد' : 'John Smith'} required icon={<User size={16} />}
                  />
                  <Input
                    label={t('signup.company')} type="text" value={form.company}
                    onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder={isAr ? 'شركة النجاح للتجارة' : 'Acme Corp'} icon={<Building size={16} />}
                  />
                  <Input
                    label={t('signup.email')} type="email" value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="example@company.sa" required icon={<Mail size={16} />}
                  />
                  <Input
                    label={isAr ? 'رقم الجوال (اختياري)' : 'Phone number (optional)'} type="tel" value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+966 5x xxx xxxx" icon={<Phone size={16} />}
                  />
                  <Input
                    label={t('signup.password')} type="password" value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                    required icon={<Lock size={16} />}
                    hint={isAr ? 'يجب أن تكون 8 أحرف على الأقل' : 'Must be at least 8 characters'}
                  />

                  {/* Referral code — pre-filled from ?ref= URL param */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-soft)' }}>
                      {isAr ? 'كود الإحالة (اختياري)' : 'Referral code (optional)'}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 start-3 flex items-center pointer-events-none" style={{ color: 'var(--text-faint)' }}>
                        <Tag size={14} />
                      </span>
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder="SP-XXXXXX"
                        maxLength={12}
                        className="w-full rounded-xl border px-3 py-2.5 ps-9 text-sm font-mono tracking-widest transition focus:outline-none focus:ring-2"
                        style={{
                          background: 'var(--bg-input)',
                          borderColor: referralCode.trim() ? 'var(--brand-500, #22c55e)' : 'var(--border)',
                          color: 'var(--text-base)',
                        }}
                      />
                    </div>
                    {referralCode.trim() && (
                      <p className="text-xs mt-1 text-green-600 dark:text-green-400">
                        ✓ {isAr ? 'سيتم احتساب عمولة لمندوب المبيعات' : 'Sales rep commission will be recorded'}
                      </p>
                    )}
                  </div>

                  <div>
                    <div ref={turnstileRef} className="flex justify-center min-h-[65px]" />
                    {!captchaToken && (
                      <p className="text-center text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                        {isAr ? 'التحقق من البوت مطلوب' : 'Bot verification required'}
                      </p>
                    )}
                  </div>

                  <Button type="submit" loading={loading} className="w-full" size="lg">
                    {isAr ? 'إنشاء الحساب' : 'Create account'}
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </form>
              )}

              {/* ── Step 2: Email OTP → dashboard ── */}
              {step === 'email-otp' && (
                <form onSubmit={handleEmailOtp} className="space-y-4">
                  <div
                    className="rounded-xl p-3 text-sm text-center"
                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-soft)' }}
                  >
                    <Mail size={18} className="mx-auto mb-1 text-brand-600" />
                    {isAr ? 'تحقق من صندوق الوارد وأدخل رمز التحقق' : 'Check your inbox and enter the verification code'}
                  </div>
                  <Input
                    label={isAr ? 'رمز التحقق (6 أرقام)' : 'Verification code (6 digits)'}
                    type="text" inputMode="numeric" maxLength={6}
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000" icon={<Mail size={16} />}
                  />
                  <Button type="submit" loading={loading} disabled={emailOtp.length !== 6} className="w-full" size="lg">
                    {isAr ? 'تأكيد والدخول للحساب' : 'Confirm & enter dashboard'}
                  </Button>
                  <button
                    type="button" onClick={resendEmailOtp} disabled={otpCooldown > 0}
                    className="w-full flex items-center justify-center gap-2 text-sm py-2 transition-colors disabled:opacity-40"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <RefreshCw size={13} />
                    {otpCooldown > 0
                      ? (isAr ? `إعادة الإرسال خلال ${otpCooldown}s` : `Resend in ${otpCooldown}s`)
                      : (isAr ? 'إعادة إرسال الرمز' : 'Resend code')}
                  </button>
                </form>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-center gap-1.5 mt-6 text-xs" style={{ color: 'var(--text-faint)' }}>
            <Shield size={12} />
            <span>{t('login.security')}</span>
          </div>
          <p className="text-center text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
            {t('signup.hasAccount')}{' '}
            <Link to="/login" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">
              {t('signup.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
