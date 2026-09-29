import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Phone, PhoneIncoming, PhoneMissed, PhoneForwarded, PhoneOff,
  Sparkles, Clock, Lock, Loader, CheckCircle, MessageSquare,
  Brain, Save, ArrowLeft, BarChart3,
} from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMyVoiceAgent, useUpdateVoicePersona, useVoiceCalls } from '../../hooks/useStore'
import { voiceTierLabel, formatSaudiDate } from '../../lib/utils'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

type Tab = 'overview' | 'calls' | 'training'

export default function VoiceAgent() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data, isLoading } = useMyVoiceAgent()
  const [tab, setTab] = useState<Tab>('overview')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-6 h-6 animate-spin text-brand-700" />
      </div>
    )
  }

  const agent = data?.agent
  const subscription = data?.subscription
  const subActive = subscription && ['active', 'trialing'].includes(subscription.status)

  // ── Locked state ─ user has no Voice Agent subscription ─────────────────
  if (!subscription || !subActive) {
    return <LockedState lang={lang} />
  }

  // ── Active state ─ tabs for overview / calls / training ─────────────────
  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Phone className="w-6 h-6 text-brand-700" />
          {isAr ? 'الوكيل الصوتي الذكي' : 'Smart Voice Agent'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'إدارة سجل المكالمات وتدريب وكيلك الذكي للرد الآلي'
            : 'Manage call logs and train your AI agent for automated responses'}
        </p>
      </header>

      {/* ── Subscription card ───────────────────────────── */}
      <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'الباقة الحالية' : 'Current plan'}
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
              {voiceTierLabel(subscription.tier, lang)}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge variant="active" label={isAr ? 'نشط' : 'Active'} />
              {subscription.end_date && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'ينتهي في' : 'Expires'}: <strong>{formatSaudiDate(subscription.end_date)}</strong>
                </span>
              )}
              {subscription.monthly_amount && (
                <span className="text-xs font-semibold text-brand-700 dark:text-brand-400">
                  {subscription.monthly_amount} {isAr ? 'ر.س/شهر' : 'SAR/mo'}
                </span>
              )}
            </div>
          </div>
          <Link to="/dashboard/billing" className="text-sm font-semibold text-brand-700 hover:underline">
            {isAr ? 'ترقية الباقة ←' : 'Upgrade plan →'}
          </Link>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {([
          { key: 'overview', icon: BarChart3,    labelAr: 'نظرة عامة', labelEn: 'Overview' },
          { key: 'calls',    icon: PhoneIncoming, labelAr: 'سجل المكالمات', labelEn: 'Call logs' },
          { key: 'training', icon: Brain,         labelAr: 'تدريب الوكيل',  labelEn: 'AI Training' },
        ] as const).map(({ key, icon: Icon, labelAr, labelEn }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors ${
              tab === key
                ? 'border-brand-700 text-brand-700 dark:text-brand-400'
                : 'border-transparent'
            }`}
            style={tab !== key ? { color: 'var(--text-muted)' } : {}}
          >
            <Icon size={15} />
            {isAr ? labelAr : labelEn}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab agent={agent} />}
      {tab === 'calls'     && <CallsTab />}
      {tab === 'training'  && <TrainingTab agent={agent} />}
    </div>
  )
}

// ── Locked state ──────────────────────────────────────────────────────────────
function LockedState({ lang }: { lang: 'ar' | 'en' }) {
  const isAr = lang === 'ar'
  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Phone className="w-6 h-6 text-brand-700" />
          {isAr ? 'الوكيل الصوتي الذكي' : 'Smart Voice Agent'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'مساعد ذكي يرد على مكالمات عملائك تلقائياً بالعربية الخليجية'
            : 'An AI assistant that answers your customers\' calls automatically in Gulf Arabic'}
        </p>
      </header>

      {/* Locked banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border-2 border-dashed border-brand-300 dark:border-brand-700 p-8 text-center"
        style={{ background: 'var(--bg-subtle)' }}
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-brand-700 dark:text-brand-400" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'الميزة مقفلة' : 'Feature locked'}
        </h2>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'اشترك في باقة الوكيل الصوتي للاستفادة من الرد التلقائي بالذكاء الاصطناعي على مكالمات عملائك.'
            : 'Subscribe to a Voice Agent plan to enable AI-powered automated responses for your customer calls.'}
        </p>
        <Link to="/dashboard/billing" className="btn-primary inline-flex">
          <Sparkles size={16} />
          {isAr ? 'استعرض الباقات' : 'View plans'}
          <ArrowLeft size={14} />
        </Link>
      </motion.div>

      {/* Feature preview grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: PhoneIncoming,
            titleAr: 'رد فوري 24/7',  titleEn: 'Instant 24/7 response',
            descAr: 'لا تفوت مكالمة عميل واحدة — الوكيل يرد فوراً.',
            descEn: 'Never miss a customer call — the agent answers instantly.',
          },
          {
            icon: Brain,
            titleAr: 'شخصية مخصصة',  titleEn: 'Custom persona',
            descAr: 'درّب الوكيل بأسلوبك وبيانات منشأتك (Pro و Enterprise).',
            descEn: 'Train the agent with your tone and business data (Pro & Enterprise).',
          },
          {
            icon: MessageSquare,
            titleAr: 'تحليل المحادثات',  titleEn: 'Conversation analytics',
            descAr: 'استعرض النصوص ومستوى رضا العملاء عبر سجل المكالمات.',
            descEn: 'Review transcripts and customer sentiment in the call log.',
          },
        ].map(({ icon: Icon, titleAr, titleEn, descAr, descEn }) => (
          <div
            key={titleEn}
            className="rounded-2xl border p-5 opacity-75"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-brand-700 dark:text-brand-400" />
            </div>
            <p className="font-bold mb-1" style={{ color: 'var(--text-base)' }}>{isAr ? titleAr : titleEn}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{isAr ? descAr : descEn}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────
import type { VoiceAgent as VoiceAgentType } from '../../types'

function OverviewTab({ agent }: { agent: VoiceAgentType | null | undefined }) {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data: callsData } = useVoiceCalls(50)
  const calls = callsData?.calls ?? []

  const completed   = calls.filter((c) => c.status === 'completed').length
  const missed      = calls.filter((c) => c.status === 'missed').length
  const transferred = calls.filter((c) => c.status === 'transferred').length
  const totalDuration = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0)
  const avgDuration   = calls.length ? Math.round(totalDuration / calls.length) : 0

  if (!agent) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <Loader className="w-6 h-6 animate-spin text-brand-700 mx-auto" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: PhoneIncoming,  value: completed,   labelAr: 'مكالمات منتهية',   labelEn: 'Completed',   color: 'text-green-600 dark:text-green-400' },
          { icon: PhoneMissed,    value: missed,      labelAr: 'مكالمات فائتة',    labelEn: 'Missed',      color: 'text-red-600 dark:text-red-400' },
          { icon: PhoneForwarded, value: transferred, labelAr: 'محوّلة لموظف',     labelEn: 'Transferred', color: 'text-amber-600 dark:text-amber-400' },
          { icon: Clock,          value: `${avgDuration}s`, labelAr: 'متوسط المدة',  labelEn: 'Avg duration', color: 'text-brand-700 dark:text-brand-400' },
        ].map(({ icon: Icon, value, labelAr, labelEn, color }) => (
          <div
            key={labelEn}
            className="rounded-2xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <Icon className={`w-5 h-5 mb-2 ${color}`} />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-base)' }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{isAr ? labelAr : labelEn}</p>
          </div>
        ))}
      </div>

      {/* Agent summary */}
      <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h3 className="font-bold mb-4" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'إعدادات الوكيل الحالية' : 'Current agent setup'}
        </h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <Row label={isAr ? 'اسم الشخصية' : 'Persona name'} value={agent.persona_name} />
          <Row label={isAr ? 'رقم المنشأة' : 'Business phone'} value={agent.business_phone || '—'} />
          <Row label={isAr ? 'ساعات العمل' : 'Business hours'} value={`${agent.business_hours_start}:00 — ${agent.business_hours_end}:00`} />
          <Row label={isAr ? 'حالة الوكيل' : 'Agent status'} value={agent.status} />
          <div className="md:col-span-2">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isAr ? 'رسالة الترحيب' : 'Greeting'}</p>
            <p className="text-sm rounded-xl border px-3 py-2" style={{ color: 'var(--text-base)', background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              {agent.greeting}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>{value}</p>
    </div>
  )
}

// ── Calls tab ────────────────────────────────────────────────────────────────
function CallsTab() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data, isLoading } = useVoiceCalls(100)
  const calls = data?.calls ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader className="w-5 h-5 animate-spin text-brand-700" />
      </div>
    )
  }

  if (!calls.length) {
    return (
      <div className="rounded-2xl border p-10 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center mb-4">
          <PhoneOff className="w-7 h-7 text-brand-700 dark:text-brand-400" />
        </div>
        <h3 className="font-bold mb-1" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'لا توجد مكالمات بعد' : 'No calls yet'}
        </h3>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'سيظهر هنا سجل المكالمات بمجرد ربط خط هاتفك بالوكيل الصوتي. سيتواصل معك فريق الإعداد لإتمام التهيئة.'
            : 'Call history will appear here once your phone line is connected to the Voice Agent. Our setup team will reach out to complete the configuration.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <table className="w-full text-sm">
        <thead style={{ background: 'var(--bg-subtle)' }}>
          <tr>
            <Th>{isAr ? 'المتصل' : 'Caller'}</Th>
            <Th>{isAr ? 'الحالة' : 'Status'}</Th>
            <Th>{isAr ? 'المشاعر' : 'Sentiment'}</Th>
            <Th>{isAr ? 'المدة' : 'Duration'}</Th>
            <Th>{isAr ? 'البداية' : 'Started'}</Th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <Td>{c.caller_phone || '—'}</Td>
              <Td><Badge variant={callStatusVariant(c.status)} label={c.status} /></Td>
              <Td>{c.sentiment || '—'}</Td>
              <Td>{c.duration_seconds}s</Td>
              <Td>{formatSaudiDate(c.started_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-start px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3" style={{ color: 'var(--text-base)' }}>{children}</td>
}
function callStatusVariant(status: string): 'active' | 'pending' | 'expired' | 'info' {
  if (status === 'completed') return 'active'
  if (status === 'missed') return 'expired'
  if (status === 'transferred') return 'pending'
  return 'info'
}

// ── Training tab ─────────────────────────────────────────────────────────────
function TrainingTab({ agent }: { agent: VoiceAgentType | null | undefined }) {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const update = useUpdateVoicePersona()

  const [form, setForm] = useState({
    persona_name: '',
    persona_description: '',
    greeting: '',
    business_phone: '',
    business_hours_start: 8,
    business_hours_end: 22,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!agent) return
    setForm({
      persona_name:         agent.persona_name,
      persona_description:  agent.persona_description ?? '',
      greeting:             agent.greeting,
      business_phone:       agent.business_phone ?? '',
      business_hours_start: agent.business_hours_start,
      business_hours_end:   agent.business_hours_end,
    })
  }, [agent])

  if (!agent) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <Loader className="w-6 h-6 animate-spin text-brand-700 mx-auto" />
      </div>
    )
  }

  async function handleSave() {
    setError('')
    setSaved(false)
    try {
      await update.mutateAsync(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : (isAr ? 'تعذر حفظ الإعدادات' : 'Failed to save settings'))
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div>
        <h3 className="font-bold mb-1" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'تدريب الوكيل الصوتي' : 'Train the Voice Agent'}
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'حدّد شخصية الوكيل ورسالة الترحيب وساعات العمل ليناسب أسلوب منشأتك.'
            : 'Define the agent\'s persona, greeting, and business hours to match your brand voice.'}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label={isAr ? 'اسم الشخصية' : 'Persona name'}
          value={form.persona_name}
          onChange={(e) => setForm((p) => ({ ...p, persona_name: e.target.value }))}
          placeholder={isAr ? 'مساعد فرع الرياض' : 'Riyadh Branch Assistant'}
        />
        <Input
          label={isAr ? 'رقم المنشأة' : 'Business phone'}
          value={form.business_phone}
          onChange={(e) => setForm((p) => ({ ...p, business_phone: e.target.value }))}
          placeholder="9665XXXXXXXX"
        />
        <div className="md:col-span-2">
          <label className="label">{isAr ? 'وصف الشخصية' : 'Persona description'}</label>
          <textarea
            value={form.persona_description}
            onChange={(e) => setForm((p) => ({ ...p, persona_description: e.target.value }))}
            rows={3}
            className="input-field resize-none"
            placeholder={isAr
              ? 'نبرة مهنية ودودة، تجيب على الاستفسارات بالعربية الخليجية…'
              : 'Friendly professional tone, answers in Gulf Arabic…'}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">{isAr ? 'رسالة الترحيب' : 'Greeting message'}</label>
          <textarea
            value={form.greeting}
            onChange={(e) => setForm((p) => ({ ...p, greeting: e.target.value }))}
            rows={2}
            className="input-field resize-none"
          />
        </div>
        <Input
          label={isAr ? 'ساعة البدء' : 'Hours start'}
          type="number"
          value={String(form.business_hours_start)}
          onChange={(e) => setForm((p) => ({ ...p, business_hours_start: parseInt(e.target.value || '0', 10) }))}
        />
        <Input
          label={isAr ? 'ساعة الإغلاق' : 'Hours end'}
          type="number"
          value={String(form.business_hours_end)}
          onChange={(e) => setForm((p) => ({ ...p, business_hours_end: parseInt(e.target.value || '0', 10) }))}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm px-3 py-2 flex items-center gap-2">
          <CheckCircle size={14} />
          {isAr ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully'}
        </div>
      )}

      <Button onClick={handleSave} loading={update.isPending} size="lg">
        <Save size={16} />
        {isAr ? 'حفظ التدريب' : 'Save training'}
      </Button>
    </div>
  )
}
