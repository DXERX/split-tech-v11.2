import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, CreditCard, Sparkles } from 'lucide-react'
import { useAllMySubscriptions } from '../../hooks/useStore'
import { useLanguage } from '../../contexts/LanguageContext'
import type { SubscriptionService } from '../../types'

interface Props {
  children: React.ReactNode
  /** Which service must be active. 'any' = either voice or vision. Default: 'any' */
  service?: SubscriptionService | 'any'
  feature?: 'audits' | 'control' | 'diagnostic' | 'setup' | 'voice' | 'general'
}

export default function SubscriptionGate({ children, service = 'any', feature = 'general' }: Props) {
  const { data, isLoading } = useAllMySubscriptions()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  if (isLoading) return <>{children}</>

  const visionActive = data?.vision?.status === 'active'
  const voiceActive  = data?.voice?.status  === 'active'

  const isActive =
    service === 'vision' ? visionActive :
    service === 'voice'  ? voiceActive  :
    visionActive || voiceActive // 'any'

  if (isActive) return <>{children}</>

  const featureLabels: Record<string, { ar: string; en: string }> = {
    audits:     { ar: 'سجل التدقيق والتحليل بالذكاء الاصطناعي', en: 'AI Audit Log & Analysis' },
    control:    { ar: 'التحكم بإعدادات التشغيل', en: 'Operations Control Settings' },
    diagnostic: { ar: 'أدوات التشخيص والفحص', en: 'Diagnostics & Testing Tools' },
    setup:      { ar: 'إعداد الجهاز والكاميرا', en: 'Device & Camera Setup' },
    voice:      { ar: 'الوكيل الصوتي الذكي', en: 'AI Voice Agent' },
    general:    { ar: 'خدمات الذكاء الاصطناعي', en: 'AI-Powered Services' },
  }

  const label = featureLabels[feature] || featureLabels.general

  return (
    <div className="page-container">
      <div className="relative">
        <div className="pointer-events-none select-none blur-[6px] opacity-30 max-h-[50vh] overflow-hidden" aria-hidden>
          {children}
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            className="w-full max-w-md mx-auto text-center rounded-3xl border p-8"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-raised)' }}
          >
            <div className="w-16 h-16 bg-brand-100 dark:bg-brand-950/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Lock className="w-8 h-8 text-brand-700 dark:text-brand-400" />
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
              {t('gate.title')}
            </h2>
            <p className="text-sm mb-1 font-semibold" style={{ color: 'var(--text-soft)' }}>
              {isAr ? label.ar : label.en}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {t('gate.description')}
            </p>
            <div className="space-y-3">
              <Link
                to="/dashboard/billing"
                className="flex items-center justify-center gap-2 w-full bg-brand-700 text-white font-semibold py-3.5 rounded-2xl hover:bg-brand-800 transition-colors"
              >
                <CreditCard size={18} />
                {t('gate.cta')}
              </Link>
              <Link
                to="/dashboard"
                className="flex items-center justify-center gap-2 w-full font-semibold py-3 rounded-2xl transition-colors"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-soft)' }}
              >
                <Sparkles size={16} />
                {t('gate.explore')}
              </Link>
            </div>
            <p className="text-xs mt-5" style={{ color: 'var(--text-faint)' }}>
              {t('gate.tip')}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
