import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, ArrowLeft, Headphones, Zap, Loader2 } from 'lucide-react'
import { useMySubscription } from '../hooks/useStore'
import { formatSaudiDate } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'

export default function SubscriptionExpired() {
  const { signOut } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const navigate = useNavigate()
  const { data: subscription } = useMySubscription()
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  async function handleRenew() {
    if (!subscription?.id) return
    setPaying(true); setPayError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية' : 'Session expired')

      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subscription_id: subscription.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.payment_url) throw new Error(data.error || (isAr ? 'فشل إنشاء رابط الدفع' : 'Failed to create payment link'))
      window.location.href = data.payment_url
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
      setPaying(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ background: 'var(--bg-page)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div
          className="rounded-3xl border p-8 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
        >
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CreditCard className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'انتهت صلاحية اشتراكك' : 'Your subscription has expired'}
          </h1>

          {subscription?.end_date && (
            <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'انتهى في:' : 'Expired on:'}{' '}
              <span className="font-semibold" style={{ color: 'var(--text-soft)' }}>
                {formatSaudiDate(subscription.end_date)}
              </span>
            </p>
          )}

          {subscription?.monthly_amount && (
            <p className="font-bold text-lg text-brand-700 dark:text-brand-400 mb-1">
              {subscription.monthly_amount} {isAr ? 'ر.س / شهر' : 'SAR / month'}
            </p>
          )}

          <p className="text-sm mb-6" style={{ color: 'var(--text-faint)' }}>
            {isAr
              ? 'جدّد اشتراكك الآن لاستئناف خدمة التدقيق الذكي بدون انقطاع'
              : 'Renew now to resume AI auditing without interruption'}
          </p>

          {payError && (
            <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 mb-4">
              {payError}
            </p>
          )}

          <div className="space-y-3">
            <button
              onClick={handleRenew}
              disabled={paying || !subscription?.id}
              className="flex items-center justify-center gap-2 w-full bg-brand-700 text-white font-semibold py-3.5 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {paying
                ? <><Loader2 size={18} className="animate-spin" /> {isAr ? 'جارٍ التحويل لبوابة الدفع…' : 'Redirecting to payment…'}</>
                : <><Zap size={18} /> {isAr ? 'تجديد الاشتراك الآن' : 'Renew subscription now'}</>
              }
            </button>

            <button
              onClick={() => navigate('/dashboard/billing')}
              className="flex items-center justify-center gap-2 w-full font-semibold py-3.5 rounded-2xl transition-colors"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-soft)' }}
            >
              <CreditCard size={18} />
              {isAr ? 'استكشاف الباقات' : 'Explore plans'}
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center justify-center gap-2 w-full font-semibold py-3.5 rounded-2xl transition-colors"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-soft)' }}
            >
              <Headphones size={18} />
              {isAr ? 'الدخول بالوضع المحدود' : 'Enter in limited mode'}
            </button>
          </div>

          <p className="text-xs mt-4" style={{ color: 'var(--text-faint)' }}>
            {isAr
              ? 'الدفع عبر بوابة موثر — فيزا · ماستركارد · مدى · STC Pay'
              : 'Payments via Moyasar — Visa · Mastercard · Mada · STC Pay'}
          </p>

          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>
              {isAr ? 'للتواصل المباشر' : 'Direct contact'}
            </p>
            <a href="mailto:info@splittech.sa" className="text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline">
              info@splittech.sa
            </a>
            <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
              {isAr ? 'أوقات الدعم: 9 صباحاً — 5 مساءً (أيام الأسبوع)' : 'Support hours: 9 AM — 5 PM (weekdays)'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 px-2">
          <button
            onClick={signOut}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-faint)' }}
          >
            {isAr ? 'تسجيل الخروج' : 'Sign out'}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1 text-xs transition-colors hover:text-brand-700"
            style={{ color: 'var(--text-faint)' }}
          >
            <ArrowLeft size={12} />
            {isAr ? 'الصفحة الرئيسية' : 'Home'}
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
