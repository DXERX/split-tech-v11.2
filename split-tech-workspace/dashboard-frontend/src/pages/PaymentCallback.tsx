import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguage } from '../contexts/LanguageContext'
import Button from '../components/ui/Button'

type Status = 'loading' | 'success' | 'failed'

const LOADING_STEPS_AR = [
  'جارٍ التحقق من الدفع…',
  'جارٍ تفعيل حسابك…',
  'جارٍ تحديث الاشتراك…',
]
const LOADING_STEPS_EN = [
  'Verifying payment…',
  'Activating your branch account…',
  'Updating subscription…',
]

export default function PaymentCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const [status, setStatus] = useState<Status>('loading')
  const [loadingStep, setLoadingStep] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const steps = isAr ? LOADING_STEPS_AR : LOADING_STEPS_EN
    const interval = setInterval(() => {
      setLoadingStep(s => (s + 1 < steps.length ? s + 1 : s))
    }, 1800)
    return () => clearInterval(interval)
  }, [isAr])

  useEffect(() => {
    const moyasarStatus    = searchParams.get('status')
    const moyasarId        = searchParams.get('id')
    const subscriptionId   = searchParams.get('subscription_id')

    if (moyasarStatus === 'paid' && moyasarId) {
      confirmPayment(moyasarId, subscriptionId)
    } else if (moyasarStatus === 'paid') {
      handleSuccess()
    } else if (moyasarStatus === 'failed' || moyasarStatus === 'canceled') {
      setStatus('failed')
      setErrorMsg(isAr
        ? 'تعذّر إتمام عملية الدفع. يمكنك المحاولة مجدداً.'
        : 'Payment could not be completed. Please try again.')
    } else if (moyasarId) {
      confirmPayment(moyasarId, subscriptionId)
    } else {
      setStatus('failed')
      setErrorMsg(isAr ? 'بيانات الدفع غير مكتملة.' : 'Incomplete payment data.')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmPayment(paymentId: string, subscriptionId: string | null) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login', { replace: true }); return }

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/payment/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ payment_id: paymentId, subscription_id: subscriptionId }),
        }
      )
      const data = await res.json()
      if (data.status === 'paid' || data.activated) {
        await handleSuccess()
      } else {
        setStatus('failed')
        setErrorMsg(isAr
          ? 'لم يتم تأكيد الدفع من بوابة موثر. يمكنك المحاولة مجدداً.'
          : 'Payment not confirmed by Moyasar gateway. Please try again.')
      }
    } catch {
      // Network or server error — show failure so user doesn't assume success
      setStatus('failed')
      setErrorMsg(isAr
        ? 'تعذّر الاتصال بالخادم. إذا تمّت العملية فسيُفعَّل حسابك تلقائياً خلال دقائق.'
        : 'Could not reach the server. If payment went through, your account will activate automatically within minutes.')
    }
  }

  async function handleSuccess() {
    sessionStorage.removeItem('checkout_state')
    try {
      // Refresh JWT so AuthContext picks up any role/claim changes
      await supabase.auth.refreshSession()
      // Invalidate all subscription-related caches so dashboard reads fresh data
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['my-subscription'] }),
        qc.invalidateQueries({ queryKey: ['my-subscriptions-all'] }),
        qc.invalidateQueries({ queryKey: ['my-store'] }),
        qc.invalidateQueries({ queryKey: ['my-voice-agent'] }),
        qc.invalidateQueries({ queryKey: ['store-api-key'] }),
      ])
      await Promise.all([
        qc.refetchQueries({ queryKey: ['my-subscription'] }),
        qc.refetchQueries({ queryKey: ['my-subscriptions-all'] }),
        qc.refetchQueries({ queryKey: ['my-store'] }),
      ])
    } catch {
      // Non-fatal — navigate regardless
    }
    setStatus('success')
    setTimeout(() => navigate('/dashboard', { replace: true }), 2500)
  }

  const loadingSteps = isAr ? LOADING_STEPS_AR : LOADING_STEPS_EN

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-page)' }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-3xl shadow-card border p-10 text-center w-full max-w-md"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* ── Loading ── */}
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-brand-50 dark:bg-brand-950/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-8 h-8 text-brand-700 animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'جارٍ معالجة الدفع' : 'Processing payment'}
            </h2>
            <motion.p
              key={loadingStep}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              {loadingSteps[loadingStep]}
            </motion.p>
            <div className="flex justify-center gap-1.5 mt-4">
              {loadingSteps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    i <= loadingStep ? 'bg-brand-600 w-6' : 'w-3'
                  }`}
                  style={i > loadingStep ? { background: 'var(--border)' } : {}}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Success ── */}
        {status === 'success' && (
          <>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 bg-green-100 dark:bg-green-950/40 rounded-2xl flex items-center justify-center mx-auto mb-5"
            >
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </motion.div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'تم الدفع بنجاح!' : 'Payment successful!'}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {isAr
                ? 'شكراً لاشتراكك في سبلت إنتلجنس — تم تفعيل باقتك.'
                : 'Thank you for subscribing to SPLIT Intelligence — your plan is now active.'}
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate('/dashboard/store-setup', { replace: true })} className="w-full" size="lg">
                {isAr ? 'إعداد الكاميرا الآن' : 'Set up camera now'}
              </Button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full text-sm py-2 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {isAr ? 'الذهاب للوحة التحكم' : 'Go to dashboard'}
              </button>
            </div>
          </>
        )}

        {/* ── Failed ── */}
        {status === 'failed' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'فشل الدفع' : 'Payment failed'}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{errorMsg}</p>
            <div className="space-y-2">
              <Button onClick={() => navigate('/dashboard/billing', { replace: true })} className="w-full" size="lg">
                <RefreshCw size={16} />
                {isAr ? 'إعادة المحاولة' : 'Try again'}
              </Button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                className="w-full text-sm py-2 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {isAr ? 'تخطي — سأدفع لاحقاً' : 'Skip — pay later'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
