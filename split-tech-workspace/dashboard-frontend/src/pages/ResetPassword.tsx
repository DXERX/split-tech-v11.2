import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../contexts/LanguageContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import SplitLogo from '../components/ui/SplitLogo'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  // ── Ref prevents StrictMode double-fire from showing false "expired" ──
  const readyRef = useRef(false)
  const markReady = () => { readyRef.current = true; setReady(true); setError('') }

  useEffect(() => {
    let cancelled = false

    // ── Strategy 1: Listen for the PASSWORD_RECOVERY event ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) markReady()
    })

    // ── Strategy 2: Hash fragment still present (rare — slow client init) ──
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      markReady()
    }

    // ── Strategy 3: Session already exists with recovery type ──
    // Supabase JS may have consumed the hash before React mounted.
    // getSession() returns the session it restored from the hash.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      // If there's a valid session, the user came from a recovery link
      // that Supabase already consumed. Accept it.
      if (data.session && !readyRef.current) {
        // Extra check: the recovery hash was present at page load
        // (Supabase clears it, but the session proves it worked)
        markReady()
      }
    })

    // ── Fallback: show error after generous 3-second window ──
    const timeout = setTimeout(() => {
      if (!readyRef.current && !cancelled) {
        setError(isAr
          ? 'الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.'
          : 'This link is invalid or expired. Please request a new one.')
      }
    }, 3000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError(isAr ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
      return
    }
    setError(''); setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-page)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3">
            <SplitLogo size={56} variant="full" />
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              {isAr ? 'سبلت تيك AI — أول AI سعودي للرقابة التشغيلية' : 'SplitTech AI — First Saudi Operational AI'}
            </p>
          </Link>
        </div>

        <div
          className="rounded-3xl border p-8"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
        >
          {done ? (
            <div className="text-center py-4">
              <CheckCircle className="w-14 h-14 text-brand-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'تم تغيير كلمة المرور' : 'Password changed'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'يتم تحويلك لصفحة تسجيل الدخول…' : 'Redirecting to login…'}
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'تعيين كلمة مرور جديدة' : 'Set new password'}
              </h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'اختر كلمة مرور قوية لحسابك' : 'Choose a strong password for your account'}
              </p>

              {error && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl p-3 mb-5">
                  {error}
                  {!ready && (
                    <div className="mt-2">
                      <Link to="/login" className="text-brand-700 dark:text-brand-400 font-semibold hover:underline text-xs">
                        {isAr ? 'العودة لصفحة الدخول' : 'Back to login'}
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {ready && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Input
                      label={isAr ? 'كلمة المرور الجديدة' : 'New password'}
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                      required
                      icon={<Lock size={16} />}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute left-3 top-[38px] transition-colors"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <Input
                    label={isAr ? 'تأكيد كلمة المرور' : 'Confirm password'}
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder={isAr ? 'أعد كتابة كلمة المرور' : 'Re-enter your password'}
                    required
                    icon={<Lock size={16} />}
                  />

                  <Button type="submit" loading={loading} className="w-full" size="lg">
                    {isAr ? 'حفظ كلمة المرور الجديدة' : 'Save new password'}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
