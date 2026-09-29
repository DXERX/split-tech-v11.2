import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowLeft, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import SplitLogo from '../components/ui/SplitLogo'
import TechPanel from '../components/ui/TechPanel'
import { ThemeToggle, LangToggle } from '../components/ui/ThemeToggle'
import { useTurnstile } from '../hooks/useTurnstile'
import { useLanguage } from '../contexts/LanguageContext'

export default function Login() {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { turnstileRef, captchaToken, resetTurnstile, isEnabled: captchaEnabled } = useTurnstile()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (captchaEnabled && !captchaToken) {
      setError(lang === 'ar' ? 'يرجى إكمال التحقق أولاً' : 'Please complete the CAPTCHA first')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email, password,
        options: captchaToken ? { captchaToken } : undefined,
      })
      if (error) throw error
      navigate('/dashboard')
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : ''
      if (/email.*not.*confirmed|not.*verified|email.*confirm/i.test(raw)) {
        setError(lang === 'ar'
          ? 'يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد (وصندوق الـ Spam).'
          : 'Please verify your email first. Check your inbox (and Spam folder).')
      } else if (/invalid.*credentials|invalid.*login/i.test(raw)) {
        setError(lang === 'ar'
          ? 'بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة المرور.'
          : 'Invalid credentials. Check your email and password.')
      } else {
        setError(raw || (lang === 'ar' ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred'))
      }
      if (captchaEnabled) resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError(lang === 'ar' ? 'أدخل بريدك الإلكتروني أولاً' : 'Enter your email first')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error') }
      setError(lang === 'ar'
        ? '✓ تم إرسال رابط إعادة التعيين. تحقق من بريدك الإلكتروني.'
        : '✓ Password reset link sent. Check your inbox.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    if (!email) { setError(lang === 'ar' ? 'أدخل بريدك الإلكتروني أولاً' : 'Enter your email first'); return }
    setError('')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) setError(error.message)
    else setError(lang === 'ar' ? 'تم إعادة إرسال رسالة التأكيد.' : 'Verification email resent.')
  }

  const isAr = lang === 'ar'

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: Tech visualization (always left) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[52%] flex-shrink-0">
        <TechPanel className="w-full h-full min-h-screen" />
      </div>

      {/* ── Right panel: Form (always right, direction follows language) ── */}
      <div
        className="flex-1 flex items-center justify-center p-6 min-h-screen"
        dir={isAr ? 'rtl' : 'ltr'}
        style={{ background: 'var(--bg-page)' }}
      >
        <div className="w-full max-w-sm">

          {/* Toggles top-right */}
          <div className="flex justify-end gap-1 mb-6">
            <ThemeToggle />
            <LangToggle />
          </div>

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link to="/">
              <SplitLogo size={40} variant="full" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-base)' }}>
              {t('login.title')}
            </h1>
            <p className="text-sm mb-7" style={{ color: 'var(--text-muted)' }}>
              {t('login.subtitle')}
            </p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 mb-5 border text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#ef4444' }}
              >
                <div>{error}</div>
                {/يرجى تأكيد|verify|Please verify/i.test(error) && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="mt-2 text-brand-600 dark:text-brand-400 font-semibold hover:underline text-xs"
                  >
                    {isAr ? 'إعادة إرسال رسالة التأكيد' : 'Resend verification email'}
                  </button>
                )}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label={t('login.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.sa"
                required
                icon={<Mail size={16} />}
              />
              <Input
                label={t('login.password')}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                icon={<Lock size={16} />}
              />

              {captchaEnabled && (
                <div ref={turnstileRef} className="flex justify-center min-h-[65px]" />
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {t('login.btn')}
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </form>

            <div className="flex items-center justify-between mt-5">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm transition-colors hover:text-brand-600"
                style={{ color: 'var(--text-muted)' }}
              >
                {t('login.forgot')}
              </button>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('login.noAccount')}{' '}
                <Link to="/signup" className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                  {t('login.signup')}
                </Link>
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-8 text-xs" style={{ color: 'var(--text-faint)' }}>
              <Shield size={11} />
              <span>{t('login.security')}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
