import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CreditCard, Eye, Phone, CheckCircle, Lock, Zap, Loader2,
  Camera, BarChart3, Shield, Users, Headphones, Globe,
  Store, FileText, Briefcase, X,
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAllMySubscriptions, useMyStore, useMyVoiceAgent } from '../../hooks/useStore'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { tierLabel, voiceTierLabel, statusLabel, formatSaudiDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'

type Cycle = 'monthly' | 'annual'

/* ── Vision (camera) tiers ─────────────────────────────────────────── */
const VISION_TIERS = [
  {
    key: 'basic', price: 1, annual: 1,
    featuresAr: ['كاميرا واحدة', 'رقابة 12 ساعة يومياً', '6 جولات تدقيق/يوم', 'تقارير PDF قابلة للتحميل', 'دعم عبر التذاكر'],
    featuresEn: ['1 camera', '12 hrs monitoring/day', '6 audits/day', 'Downloadable PDF reports', 'Ticket support'],
  },
  {
    key: 'pro', price: 219, annual: 1999, popular: true,
    featuresAr: ['حتى 3 كاميرات', 'رقابة 18 ساعة يومياً', '9 جولات تدقيق/يوم', 'تحليل AI تفصيلي', 'أسئلة تدقيق مخصصة لنشاطك', 'دعم ذو أولوية'],
    featuresEn: ['Up to 3 cameras', '18 hrs monitoring/day', '9 audits/day', 'Detailed AI analysis', 'Custom audit questions', 'Priority support'],
  },
  {
    key: 'enterprise', price: 269, annual: 2499,
    featuresAr: ['حتى 6 كاميرات', 'رقابة 24/7 مستمرة', 'جولات تدقيق غير محدودة', 'تقارير فورية لحظية', 'مدير حساب مخصص', 'SLA 99.9% مضمون'],
    featuresEn: ['Up to 6 cameras', '24/7 continuous monitoring', 'Unlimited audits', 'Real-time instant reports', 'Dedicated account manager', 'Guaranteed 99.9% SLA'],
  },
]

/* ── Voice Agent tiers ──────────────────────────────────────────────── */
const VOICE_TIERS = [
  {
    key: 'voice_basic', price: 199, annual: 1799,
    featuresAr: ['فرع واحد', 'رد صوتي ذكي على مكالمات عملائك', 'خلال ساعات العمل', 'تقارير أسبوعية'],
    featuresEn: ['Single branch', 'AI voice response for customer calls', 'During business hours', 'Weekly reports'],
  },
  {
    key: 'voice_pro', price: 299, annual: 2699, popular: true,
    featuresAr: ['فرع واحد', 'فهم لغة طبيعي متقدم', 'شخصية صوتية مخصصة لعلامتك', 'تقارير يومية تفصيلية', 'دعم ذو أولوية'],
    featuresEn: ['Single branch', 'Advanced natural language understanding', 'Custom brand voice persona', 'Daily detailed reports', 'Priority support'],
  },
  {
    key: 'voice_enterprise', price: 499, annual: 4499,
    featuresAr: ['متعدد الفروع', 'Dialogflow CX كامل الإمكانيات', 'إدارة خطوط متعددة في آنٍ واحد', 'معالجة ذات أولوية قصوى', 'مدير حساب مخصص'],
    featuresEn: ['Multi-branch', 'Full Dialogflow CX capabilities', 'Simultaneous multi-line management', 'Top-priority processing', 'Dedicated account manager'],
  },
]

export default function Billing() {
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: allSubs } = useAllMySubscriptions()
  const subscription      = allSubs?.vision ?? null     // Vision subscription
  const { data: store } = useMyStore()
  const { data: voiceData } = useMyVoiceAgent()
  const voiceSubscription = allSubs?.voice ?? voiceData?.subscription ?? null
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [activeTab, setActiveTab] = useState<'vision' | 'voice'>('vision')

  const [orgModalTier, setOrgModalTier] = useState<string | null>(null)
  const [orgForm, setOrgForm] = useState({ storeName: '', commercialRegistration: '', branchActivity: '' })
  const [orgSubmitting, setOrgSubmitting] = useState(false)
  const [orgError, setOrgError] = useState('')

  const [voiceModalTier, setVoiceModalTier] = useState<string | null>(null)
  const [voiceForm, setVoiceForm] = useState({ personaName: '', businessPhone: '', greeting: '' })
  const [voiceSubmitting, setVoiceSubmitting] = useState(false)
  const [voiceError, setVoiceError] = useState('')

  const hasActiveSub      = subscription?.status === 'active'
  const hasActiveVoiceSub = voiceSubscription?.status === 'active'
  const currentTier       = subscription?.tier || null
  const currentVoiceTier  = voiceSubscription?.tier || null

  function openOrgModal(tierKey: string) {
    setOrgError('')
    setOrgForm({ storeName: '', commercialRegistration: '', branchActivity: '' })
    setOrgModalTier(tierKey)
  }

  // Initiate payment for an existing subscription (returning customer / upgrade flow)
  async function initiatePayment(tierKey: string) {
    setPaying(true); setPayError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية' : 'Session expired')

      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          subscription_id: subscription?.id,
          tier: tierKey,
          cycle,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.invoice_url) throw new Error(data.error || (isAr ? 'فشل إنشاء رابط الدفع' : 'Failed to create payment link'))
      window.location.href = data.invoice_url
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
      setPaying(false)
    }
  }

  // Plan selection entry point — branches on tier type:
  //   • Vision tier  → org-profile modal (if no store) OR straight to payment
  //   • Voice  tier  → voice-profile modal (if no voice agent) OR straight to payment
  function handleSelectPlan(tierKey: string) {
    const isVoice = tierKey.startsWith('voice_')
    if (isVoice) {
      if (!voiceData?.agent || !voiceSubscription) {
        setVoiceError('')
        setVoiceForm({ personaName: '', businessPhone: '', greeting: '' })
        setVoiceModalTier(tierKey)
        return
      }
      // Returning voice customer (upgrade / re-pay): initiate against existing voice sub
      initiateVoicePayment(tierKey)
      return
    }
    if (!store) {
      openOrgModal(tierKey)
      return
    }
    initiatePayment(tierKey)
  }

  // Voice payment for an existing voice subscription (upgrade or re-pay)
  async function initiateVoicePayment(tierKey: string) {
    setPaying(true); setPayError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية' : 'Session expired')
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          subscription_id: voiceSubscription?.id,
          tier: tierKey,
          cycle,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.invoice_url) throw new Error(data.error || (isAr ? 'فشل إنشاء رابط الدفع' : 'Failed to create payment link'))
      window.location.href = data.invoice_url
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
      setPaying(false)
    }
  }

  // Voice profile modal submit — first-time voice subscription path.
  async function submitVoiceProfile() {
    if (!voiceModalTier) return
    if (!voiceForm.personaName.trim()) {
      setVoiceError(isAr ? 'اسم الوكيل الصوتي مطلوب' : 'Agent persona name is required')
      return
    }
    setVoiceSubmitting(true)
    setVoiceError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية — أعد تسجيل الدخول' : 'Session expired — please log in again')

      const onbRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/voice-agent/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tier: voiceModalTier,
          persona_name: voiceForm.personaName.trim(),
          business_phone: voiceForm.businessPhone.trim() || null,
          greeting: voiceForm.greeting.trim() || null,
        }),
      })
      const onbData = await onbRes.json()
      if (!onbRes.ok)
        throw new Error(onbData.error || (isAr ? 'تعذر إنشاء اشتراك الوكيل الصوتي' : 'Failed to create voice subscription'))

      await qc.refetchQueries({ queryKey: ['my-voice-agent'] })

      const payRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          subscription_id: onbData.subscription_id,
          tier: voiceModalTier,
          cycle,
        }),
      })
      const payData = await payRes.json()
      if (!payRes.ok || !payData.invoice_url)
        throw new Error(payData.error || (isAr ? 'فشل إنشاء رابط الدفع' : 'Failed to create payment link'))

      window.location.href = payData.invoice_url
    } catch (err: unknown) {
      setVoiceError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
      setVoiceSubmitting(false)
    }
  }

  // Modal submit: create subscription + store via /v1/onboarding, then redirect
  // to Moyasar via /v1/payment/initiate. No admin notification fires here —
  // that only happens later, from /v1/license-request after camera setup.
  async function submitOrgProfile() {
    if (!orgModalTier) return
    if (!orgForm.storeName.trim()) {
      setOrgError(isAr ? 'اسم المنشأة مطلوب' : 'Business name is required')
      return
    }
    if (!orgForm.commercialRegistration.trim()) {
      setOrgError(isAr ? 'رقم السجل التجاري مطلوب' : 'Commercial registration number is required')
      return
    }
    setOrgSubmitting(true)
    setOrgError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية — أعد تسجيل الدخول' : 'Session expired — please log in again')

      const onbRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tier: orgModalTier,
          store_name: orgForm.storeName.trim(),
          commercial_registration: orgForm.commercialRegistration.trim(),
          branch_activity: orgForm.branchActivity.trim() || null,
        }),
      })
      const onbData = await onbRes.json()
      if (!onbRes.ok && onbData.code !== 'ALREADY_SUBSCRIBED')
        throw new Error(onbData.error || (isAr ? 'تعذر إنشاء الاشتراك' : 'Failed to create subscription'))

      // Refresh caches so the rest of the dashboard reflects the new subscription
      await Promise.all([
        qc.refetchQueries({ queryKey: ['my-store'] }),
        qc.refetchQueries({ queryKey: ['my-subscription'] }),
      ])

      // If the user already had a pending/active subscription, the API does not
      // return a subscription_id — fall back to fetching it via PostgREST.
      let subscriptionId: string | null = onbData.subscription_id ?? null
      if (!subscriptionId && user) {
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .in('status', ['pending', 'active'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        subscriptionId = existing?.id ?? null
      }
      if (!subscriptionId)
        throw new Error(isAr ? 'تعذر تحديد رقم الاشتراك' : 'Could not resolve subscription id')
      const payRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          tier: orgModalTier,
          cycle,
        }),
      })
      const payData = await payRes.json()
      if (!payRes.ok || !payData.invoice_url)
        throw new Error(payData.error || (isAr ? 'فشل إنشاء رابط الدفع' : 'Failed to create payment link'))

      window.location.href = payData.invoice_url
    } catch (err: unknown) {
      setOrgError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'))
      setOrgSubmitting(false)
    }
  }

  return (
    <div className="page-container space-y-8 pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <CreditCard className="w-6 h-6 text-brand-700" />
          {t('billing.title')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('billing.subtitle')}
        </p>
      </div>

      {/* ── Current Plan Card ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('billing.currentPlan')}
        </h2>

        {hasActiveSub ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xl font-bold" style={{ color: 'var(--text-base)' }}>
                {tierLabel(currentTier || 'basic', lang)}
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Badge variant="active" label={statusLabel(subscription.status, lang)} />
                {subscription.end_date && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('billing.endDate')}: <strong>{formatSaudiDate(subscription.end_date)}</strong>
                  </span>
                )}
                {subscription.monthly_amount && (
                  <span className="text-xs font-semibold text-brand-700">
                    {subscription.monthly_amount} {isAr ? 'ر.س/شهر' : 'SAR/mo'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-bold" style={{ color: 'var(--text-base)' }}>{t('billing.noPlan')}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('billing.noPlanSub')}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Guided Tour Banner (only if no subscription) ─ */}
      {!hasActiveSub && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border-2 border-dashed border-brand-300 dark:border-brand-700 p-6"
          style={{ background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-950 flex items-center justify-center flex-shrink-0">
              <Eye className="w-6 h-6 text-brand-700 dark:text-brand-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-base)' }}>
                {t('billing.guidedTitle')}
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                {t('billing.guidedSub')}
              </p>
              <div className="space-y-2 mb-4">
                {[t('billing.guidedTip1'), t('billing.guidedTip2'), t('billing.guidedTip3')].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-soft)' }}>
                    <CheckCircle size={14} className="text-brand-600 flex-shrink-0" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Service Tabs ────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setActiveTab('vision')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            activeTab === 'vision'
              ? 'bg-brand-700 text-white border-brand-700'
              : 'border-transparent'
          }`}
          style={activeTab !== 'vision' ? { color: 'var(--text-muted)', background: 'var(--bg-muted)' } : {}}
        >
          <Camera size={16} />
          {t('billing.visionTitle')}
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            activeTab === 'voice'
              ? 'bg-brand-700 text-white border-brand-700'
              : 'border-transparent'
          }`}
          style={activeTab !== 'voice' ? { color: 'var(--text-muted)', background: 'var(--bg-muted)' } : {}}
        >
          <Phone size={16} />
          {t('billing.voiceTitle')}
        </button>
      </div>

      {/* ── Billing Cycle Toggle ────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--bg-muted)' }}>
        <button
          onClick={() => setCycle('monthly')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            cycle === 'monthly' ? 'shadow-sm' : ''
          }`}
          style={cycle === 'monthly'
            ? { background: 'var(--bg-card)', color: 'var(--text-base)' }
            : { color: 'var(--text-faint)' }}
        >
          {t('billing.monthly')}
        </button>
        <button
          onClick={() => setCycle('annual')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${
            cycle === 'annual' ? 'shadow-sm' : ''
          }`}
          style={cycle === 'annual'
            ? { background: 'var(--bg-card)', color: 'var(--text-base)' }
            : { color: 'var(--text-faint)' }}
        >
          {t('billing.annual')}
          <span className="text-[10px] bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">
            {t('billing.save15')}
          </span>
        </button>
      </div>

      {/* ── Pending payment banner (plan chosen but not paid yet) ── */}
      {!hasActiveSub && subscription?.status === 'pending' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 p-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'var(--bg-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
                {isAr ? 'اشتراك غير مكتمل — لم يتم الدفع بعد' : 'Incomplete subscription — payment not made yet'}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {isAr
                  ? `تم اختيار ${tierLabel(subscription.tier, lang)} لكن الخدمات مقفلة حتى إتمام الدفع`
                  : `${tierLabel(subscription.tier, lang)} selected — services locked until payment`}
              </p>
            </div>
          </div>
          <Button onClick={() => initiatePayment(subscription.tier)} loading={paying} size="sm">
            {isAr ? 'أكمل الدفع الآن' : 'Complete payment now'}
          </Button>
        </motion.div>
      )}

      {/* ── Error ───────────────────────────────────────── */}
      {payError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl p-3">
          {payError}
        </div>
      )}

      {/* ── Plan Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(activeTab === 'vision' ? VISION_TIERS : VOICE_TIERS).map((tier, i) => {
          const isCurrent = activeTab === 'vision'
            ? currentTier === tier.key
            : currentVoiceTier === tier.key
          const price = cycle === 'annual' ? tier.annual : tier.price
          const features = isAr ? tier.featuresAr : tier.featuresEn
          const label = activeTab === 'vision'
            ? tierLabel(tier.key, lang)
            : voiceTierLabel(tier.key, lang)

          return (
            <motion.div
              key={tier.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`rounded-2xl border-2 p-6 flex flex-col transition-all ${
                isCurrent
                  ? 'border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900'
                  : tier.popular
                    ? 'border-brand-300 dark:border-brand-700'
                    : ''
              }`}
              style={{
                background: 'var(--bg-card)',
                borderColor: isCurrent ? undefined : tier.popular ? undefined : 'var(--border)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg" style={{ color: 'var(--text-base)' }}>{label}</h3>
                {isCurrent && (
                  <span className="text-[10px] bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-400 px-2 py-0.5 rounded-full font-bold">
                    {t('billing.currentBadge')}
                  </span>
                )}
                {tier.popular && !isCurrent && (
                  <span className="text-[10px] bg-brand-600 text-white px-2 py-0.5 rounded-full font-bold">
                    {t('billing.popularBadge')}
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mb-5">
                <span className="text-3xl font-black text-brand-700 dark:text-brand-400">{price}</span>
                <span className="text-sm ms-1" style={{ color: 'var(--text-muted)' }}>
                  {cycle === 'annual' ? (isAr ? 'ر.س/سنة' : 'SAR/yr') : (isAr ? 'ر.س/شهر' : 'SAR/mo')}
                </span>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-soft)' }}>
                    <CheckCircle size={14} className="text-brand-600 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div
                  className="w-full py-3 rounded-xl text-center text-sm font-semibold border"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                  {t('billing.currentBadge')}
                </div>
              ) : (
                <Button
                  onClick={() => handleSelectPlan(tier.key)}
                  loading={paying}
                  className="w-full"
                  size="lg"
                  variant={tier.popular ? 'primary' : 'secondary'}
                >
                  {t('billing.selectPlan')}
                </Button>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Payment methods note ─────────────────────────── */}
      <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
        {isAr
          ? 'الدفع عبر بوابة موثر — فيزا · ماستركارد · مدى · STC Pay'
          : 'Payments via Moyasar — Visa · Mastercard · Mada · STC Pay'}
      </p>

      {/* ── Organisation profile modal (first-time subscribers only) ── */}
      <AnimatePresence>
        {orgModalTier && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => !orgSubmitting && setOrgModalTier(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border shadow-xl p-6"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
                    {isAr ? 'بيانات المنشأة' : 'Organisation profile'}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {isAr
                      ? 'نحتاج هذه البيانات قبل توجيهك لصفحة الدفع'
                      : 'We need these details before redirecting you to the payment page'}
                  </p>
                </div>
                <button
                  onClick={() => !orgSubmitting && setOrgModalTier(null)}
                  disabled={orgSubmitting}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-faint)' }}
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <Input
                  label={isAr ? 'اسم المنشأة / الفرع' : 'Business / branch name'}
                  type="text"
                  value={orgForm.storeName}
                  onChange={(e) => setOrgForm((p) => ({ ...p, storeName: e.target.value }))}
                  placeholder={isAr ? 'مثال: فرع الرياض — طريق الملك عبدالله' : 'e.g. Riyadh Branch — King Abdullah Rd'}
                  icon={<Store size={16} />}
                />
                <Input
                  label={isAr ? 'رقم السجل التجاري *' : 'Commercial registration *'}
                  type="text"
                  value={orgForm.commercialRegistration}
                  onChange={(e) => setOrgForm((p) => ({ ...p, commercialRegistration: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="1010xxxxxx"
                  maxLength={10}
                  required
                  icon={<FileText size={16} />}
                  hint={isAr ? 'سيتحقق منه فريق الـ IT يدوياً' : 'Our IT team will verify this manually'}
                />
                <Input
                  label={isAr ? 'نشاط الفرع (اختياري)' : 'Branch activity (optional)'}
                  type="text"
                  value={orgForm.branchActivity}
                  onChange={(e) => setOrgForm((p) => ({ ...p, branchActivity: e.target.value }))}
                  placeholder={isAr ? 'مثال: مطعم / كافيه / صيدلية' : 'e.g. Restaurant / Café / Pharmacy'}
                  icon={<Briefcase size={16} />}
                />
              </div>

              {orgError && (
                <div className="mt-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl p-3">
                  {orgError}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button
                  onClick={submitOrgProfile}
                  loading={orgSubmitting}
                  disabled={!orgForm.storeName.trim() || !orgForm.commercialRegistration.trim()}
                  className="flex-1"
                  size="lg"
                >
                  {isAr ? 'متابعة إلى الدفع' : 'Continue to payment'}
                </Button>
                <Button
                  onClick={() => setOrgModalTier(null)}
                  disabled={orgSubmitting}
                  variant="secondary"
                  size="lg"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>

              <p className="mt-3 text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>
                {isAr
                  ? 'إعداد الكاميرا وتفاصيل التشغيل تتم بعد إتمام الدفع'
                  : 'Camera setup and technical details happen after payment'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Voice Agent profile modal (first-time voice subscribers only) ── */}
      <AnimatePresence>
        {voiceModalTier && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => !voiceSubmitting && setVoiceModalTier(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border shadow-xl p-6"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
                    <Phone className="w-5 h-5 text-brand-700" />
                    {isAr ? 'إعداد الوكيل الصوتي' : 'Voice Agent setup'}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {isAr
                      ? 'هذه البيانات تستخدم لتدريب وكيلك الذكي على الرد على عملائك'
                      : 'This information is used to train your AI agent to respond to customers'}
                  </p>
                </div>
                <button
                  onClick={() => !voiceSubmitting && setVoiceModalTier(null)}
                  disabled={voiceSubmitting}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-faint)' }}
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <Input
                  label={isAr ? 'اسم الشخصية' : 'Persona name'}
                  type="text"
                  value={voiceForm.personaName}
                  onChange={(e) => setVoiceForm((p) => ({ ...p, personaName: e.target.value }))}
                  placeholder={isAr ? 'مساعد فرع الرياض' : 'Riyadh Branch Assistant'}
                  icon={<Phone size={16} />}
                />
                <Input
                  label={isAr ? 'رقم الهاتف للمنشأة (اختياري)' : 'Business phone (optional)'}
                  type="text"
                  value={voiceForm.businessPhone}
                  onChange={(e) => setVoiceForm((p) => ({ ...p, businessPhone: e.target.value }))}
                  placeholder="9665XXXXXXXX"
                />
                <div>
                  <label className="label">{isAr ? 'رسالة الترحيب (اختياري)' : 'Greeting message (optional)'}</label>
                  <textarea
                    value={voiceForm.greeting}
                    onChange={(e) => setVoiceForm((p) => ({ ...p, greeting: e.target.value }))}
                    rows={2}
                    className="input-field resize-none"
                    placeholder={isAr
                      ? 'مرحباً، أنا المساعد الذكي. كيف يمكنني مساعدتك؟'
                      : 'Hello, I\'m the smart assistant. How can I help you?'}
                  />
                </div>
              </div>

              {voiceError && (
                <div className="mt-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-xl p-3">
                  {voiceError}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button
                  onClick={submitVoiceProfile}
                  loading={voiceSubmitting}
                  disabled={!voiceForm.personaName.trim()}
                  className="flex-1"
                  size="lg"
                >
                  {isAr ? 'متابعة إلى الدفع' : 'Continue to payment'}
                </Button>
                <Button
                  onClick={() => setVoiceModalTier(null)}
                  disabled={voiceSubmitting}
                  variant="secondary"
                  size="lg"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>

              <p className="mt-3 text-[11px] text-center" style={{ color: 'var(--text-faint)' }}>
                {isAr
                  ? 'يمكنك تعديل التدريب لاحقاً من صفحة الوكيل الصوتي'
                  : 'You can fine-tune the training later from the Voice Agent page'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
