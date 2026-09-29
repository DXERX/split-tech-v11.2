import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Eye, EyeOff, CheckCircle, Cpu, Key, Wifi, AlertCircle,
  Terminal, Camera, Network, ShieldCheck, UserRound, Lock,
  RefreshCw, Gauge, Zap, HelpCircle, X, ShieldX, Send,
  ListChecks, Clock, Plus, Trash2, Download, GitBranch, MapPin, Layers,
  Webhook, FlaskConical, ShieldAlert, CheckCheck, XCircle, RotateCcw,
} from 'lucide-react'
import { useMyStore, useMySubscription, useStoreApiKey } from '../../hooks/useStore'
import { useBranchGroups, useUpdateBranch } from '../../hooks/useBranches'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatSaudiDate } from '../../lib/utils'
import { buildActivationToken, buildActivationUrl, getVerificationMeta, hasVerificationPayload } from '../../lib/storeWorkflow'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import SubscriptionGate from '../../components/ui/SubscriptionGate'

// ── RTSP Guide Modal ──────────────────────────────────────────────────────────
function RtspGuideModal({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="rounded-2xl shadow-xl w-full max-w-lg p-6"
          style={{ background: 'var(--bg-card)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
              <Camera className="w-5 h-5 text-brand-700" />
              {isAr ? 'كيف أحصل على رابط RTSP؟' : 'How to get the RTSP URL?'}
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-faint)' }}>
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4 text-sm text-slate-700">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 font-mono text-xs text-brand-800 break-all">
              rtsp://username:password@IP_ADDRESS:554/stream_path
            </div>

            <div className="space-y-3">
              {[
                {
                  step: '1',
                  title: isAr ? 'ابحث عن IP الكاميرا' : 'Find the camera IP',
                  desc:  isAr
                    ? 'افتح برنامج الكاميرا (مثل Hikvision iVMS أو Dahua Config Tool) أو افحص الـ Router لمعرفة عنوان IP الكاميرا على الشبكة المحلية.'
                    : 'Open your camera software (e.g. Hikvision iVMS or Dahua Config Tool) or check your router to find the camera\'s IP on the local network.',
                },
                {
                  step: '2',
                  title: isAr ? 'تأكد من اسم المستخدم وكلمة المرور' : 'Verify username and password',
                  desc:  isAr
                    ? 'الإعداد الافتراضي عادةً: username = admin | password = admin أو 12345. غيّرها إن لم تغيّر بعد.'
                    : 'Defaults are usually username = admin, password = admin or 12345. Change them if you haven\'t already.',
                },
                {
                  step: '3',
                  title: isAr ? 'حدد مسار البث (stream path)' : 'Determine the stream path',
                  desc:  isAr
                    ? 'للكاميرات Hikvision: /Streaming/Channels/101\nللكاميرات Dahua: /cam/realmonitor?channel=1&subtype=0\nللكاميرات عامة: /stream1 أو /live'
                    : 'Hikvision: /Streaming/Channels/101\nDahua: /cam/realmonitor?channel=1&subtype=0\nGeneric: /stream1 or /live',
                },
                {
                  step: '4',
                  title: isAr ? 'اختبر الرابط' : 'Test the URL',
                  desc:  isAr
                    ? 'افتح VLC → Media → Open Network Stream → الصق الرابط كاملاً للتحقق من أنه يعمل قبل الحفظ.'
                    : 'Open VLC → Media → Open Network Stream → paste the full URL to verify it works before saving.',
                },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{title}</p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-5 whitespace-pre-line">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
              <strong>{isAr ? 'مثال كامل:' : 'Full example:'}</strong><br />
              <code className="font-mono">rtsp://admin:Admin@1234@192.168.1.64:554/Streaming/Channels/101</code>
            </div>
          </div>

          <Button onClick={onClose} variant="secondary" size="sm" className="mt-5 w-full">{isAr ? 'فهمت' : 'Got it'}</Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Custom Audit Questions ────────────────────────────────────────────────────
function AuditQuestionsSection({ store, isAr }: { store: any; isAr: boolean }) {
  const approved   = !!store.custom_questions_approved
  const current    = (store.custom_questions as string[])       || []
  const pending    = (store.pending_custom_questions as string[]) || []
  const hasPending = pending.length > 0

  const [inputs, setInputs] = useState<string[]>(hasPending ? pending : [''])
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [err,    setErr]      = useState('')

  async function handleSubmit() {
    const cleaned = inputs.map(q => q.trim()).filter(Boolean)
    if (!cleaned.length) return setErr(isAr ? 'أضف سؤالاً واحداً على الأقل' : 'Add at least one question')
    setSaving(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_URL}/v1/store/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
        body: JSON.stringify({ questions: cleaned }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="w-5 h-5 text-brand-700" />
        <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'أسئلة التدقيق المخصصة' : 'Custom Audit Questions'}
        </h3>
        {approved && current.length > 0 && <Badge variant="active"  label={isAr ? 'معتمدة' : 'Approved'} />}
        {hasPending                         && <Badge variant="pending" label={isAr ? 'في انتظار الموافقة' : 'Pending'} />}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'أضف أسئلة يستخدمها الذكاء الاصطناعي عند تحليل متجرك (حتى 5 أسئلة). تُرسل للاعتماد قبل التطبيق.'
          : 'Add questions the AI uses when auditing your store (up to 5). Submitted for admin approval before going live.'}
      </p>

      {/* Approved set */}
      {approved && current.length > 0 && (
        <div className="mb-4 rounded-xl p-3 bg-emerald-50 border border-emerald-100 space-y-1.5">
          <p className="text-xs font-semibold text-emerald-700">{isAr ? 'الأسئلة المعتمدة حالياً:' : 'Currently active questions:'}</p>
          {current.map((q, i) => (
            <div key={i} className="flex gap-2 text-sm text-emerald-700"><span className="font-bold">{i + 1}.</span><span>{q}</span></div>
          ))}
        </div>
      )}

      {/* Pending set */}
      {hasPending && (
        <div className="mb-4 rounded-xl p-3 bg-amber-50 border border-amber-100 space-y-1.5">
          <p className="text-xs font-semibold text-amber-700">{isAr ? 'في انتظار اعتماد الإدارة:' : 'Waiting for admin approval:'}</p>
          {pending.map((q, i) => (
            <div key={i} className="flex gap-2 text-sm text-amber-700"><span className="font-bold">{i + 1}.</span><span>{q}</span></div>
          ))}
        </div>
      )}

      {/* Input form — shown when no pending */}
      {!hasPending && (
        <div className="space-y-3">
          {inputs.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={q}
                onChange={e => { const c = [...inputs]; c[i] = e.target.value; setInputs(c) }}
                placeholder={isAr ? `السؤال ${i + 1}` : `Question ${i + 1}`}
                className="input-field flex-1 text-sm" maxLength={200}
                dir={isAr ? 'rtl' : 'ltr'}
              />
              {inputs.length > 1 && (
                <button onClick={() => setInputs(inputs.filter((_, x) => x !== i))} className="p-2 text-red-400 hover:text-red-600 rounded-lg">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {inputs.length < 5 && (
            <button onClick={() => setInputs([...inputs, ''])} className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 font-medium">
              <Plus size={14} />{isAr ? 'إضافة سؤال' : 'Add question'}
            </button>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button onClick={handleSubmit} loading={saving} size="sm" className="flex items-center gap-2">
            {saved ? <CheckCircle size={14} /> : <Send size={14} />}
            {saved ? (isAr ? 'تم الإرسال ✓' : 'Sent ✓') : (isAr ? 'إرسال للاعتماد' : 'Submit for Approval')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Working Hours ─────────────────────────────────────────────────────────────
function WorkingHoursSection({ store, isAr }: { store: any; isAr: boolean }) {
  const hasApproved = !!store.working_hours_approved
  const current     = store.working_hours         as { start: number; end: number } | null
  const pending     = store.pending_working_hours as { start: number; end: number } | null

  const [startH,          setStartH]          = useState<number>(current?.start ?? 9)
  const [endH,            setEndH]            = useState<number>(current?.end   ?? 22)
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [err,             setErr]             = useState('')
  const [requestingChange, setRequestingChange] = useState(false)

  function fmt(h: number) {
    const p = h < 12 ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM')
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${String(h12).padStart(2, '0')}:00 ${p}`
  }

  async function handleSubmit() {
    if (startH === endH) return setErr(isAr ? 'وقت الفتح والإغلاق لا يمكن أن يتطابقا' : 'Open and close time cannot be the same')
    setSaving(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_URL}/v1/store/working-hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
        body: JSON.stringify({ start: startH, end: endH }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSaved(true)
      setRequestingChange(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  // Show the form when: no approved hours yet, OR merchant clicked "request change"
  const showForm = (!hasApproved && !pending) || requestingChange

  return (
    <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5 text-brand-700" />
        <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'ساعات العمل' : 'Working Hours'}
        </h3>
        {hasApproved && !pending && <Badge variant="active"  label={isAr ? 'مقفلة ✓' : 'Locked ✓'} />}
        {!!pending                && <Badge variant="pending" label={isAr ? 'في انتظار الموافقة' : 'Pending'} />}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'حدد وقت فتح وإغلاق المتجر (توقيت السعودية). سيتوقف المحرك تلقائياً خارج هذا الوقت.'
          : 'Set store open/close hours (KSA time). Engine stops automatically outside these hours.'}
      </p>

      {/* Currently approved hours */}
      {hasApproved && current && !pending && (
        <div className="mb-4 rounded-xl p-3 bg-emerald-50 border border-emerald-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Lock size={15} className="text-emerald-700 flex-shrink-0" />
            <div className="text-sm text-emerald-700">
              <p className="font-semibold">{fmt(current.start)} — {fmt(current.end)}</p>
              <p className="text-xs text-emerald-500 mt-0.5">
                {isAr ? 'الأوقات المعتمدة حالياً' : 'Currently active hours'}
              </p>
            </div>
          </div>
          {!requestingChange && (
            <button
              onClick={() => { setStartH(current.start); setEndH(current.end); setRequestingChange(true) }}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              {isAr ? 'طلب تعديل' : 'Request Change'}
            </button>
          )}
        </div>
      )}

      {/* Pending change notice */}
      {!!pending && (
        <div className="mb-4 rounded-xl p-3 bg-amber-50 border border-amber-100 text-sm text-amber-700">
          <p className="font-semibold mb-1">{isAr ? 'طلب تعديل معلق:' : 'Pending change request:'}</p>
          <p>{isAr ? `من ${fmt(pending.start)} إلى ${fmt(pending.end)}` : `${fmt(pending.start)} → ${fmt(pending.end)}`}</p>
          <p className="text-xs text-amber-600 mt-1">
            {isAr
              ? 'الأوقات الحالية تبقى نشطة حتى اعتماد الطلب.'
              : 'Current hours remain active until request is approved.'}
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="space-y-4">
          {requestingChange && (
            <p className="text-xs text-brand-700 bg-brand-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Send size={12} />
              {isAr ? 'سيُرسل الطلب للإدارة — الأوقات الحالية تبقى نشطة حتى الاعتماد.' : 'Request will be sent to admin — current hours stay active until approved.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: isAr ? 'وقت الفتح' : 'Open',  val: startH, set: setStartH },
              { label: isAr ? 'وقت الإغلاق' : 'Close', val: endH,   set: setEndH },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <select value={val} onChange={e => set(Number(e.target.value))} className="input-field text-sm w-full">
                  {hours.map(h => <option key={h} value={h}>{fmt(h)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {startH !== endH && (
            <p className="text-xs text-brand-700 bg-brand-50 rounded-lg px-3 py-2">
              {startH < endH
                ? (isAr ? `⏱ المحرك يعمل من ${fmt(startH)} حتى ${fmt(endH)} يومياً` : `⏱ Engine runs ${fmt(startH)} → ${fmt(endH)} daily`)
                : (isAr ? `⏱ دوام ليلي: ${fmt(startH)} ← ${fmt(endH)} (بين ليلتين)` : `⏱ Overnight: ${fmt(startH)} → ${fmt(endH)}`)}
            </p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} loading={saving} size="sm" className="flex items-center gap-2">
              {saved ? <CheckCircle size={14} /> : <Send size={14} />}
              {saved ? (isAr ? 'تم الإرسال ✓' : 'Sent ✓') : (isAr ? 'إرسال للاعتماد' : 'Submit for Approval')}
            </Button>
            {requestingChange && (
              <Button onClick={() => { setRequestingChange(false); setErr('') }} variant="secondary" size="sm">
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Saudi cities list ─────────────────────────────────────────────────────────
const SA_CITIES_AR = [
  'الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام',
  'الخبر', 'الظهران', 'الأحساء', 'الطائف', 'تبوك',
  'بريدة', 'حائل', 'القصيم', 'أبها', 'خميس مشيط',
  'نجران', 'جيزان', 'ينبع', 'القطيف', 'الجبيل',
]
const SA_CITIES_EN = [
  'Riyadh', 'Jeddah', 'Mecca', 'Madinah', 'Dammam',
  'Khobar', 'Dhahran', 'Al-Ahsa', 'Taif', 'Tabuk',
  'Buraidah', 'Hail', 'Al-Qassim', 'Abha', 'Khamis Mushait',
  'Najran', 'Jazan', 'Yanbu', 'Qatif', 'Jubail',
]

// ── Branch Info Section ───────────────────────────────────────────────────────
function BranchInfoSection({ store, isAr }: { store: any; isAr: boolean }) {
  const { data: groups = [] } = useBranchGroups()
  const updateBranch = useUpdateBranch()

  const [branchName,  setBranchName]  = useState<string>(store.branch_name  || '')
  const [city,        setCity]        = useState<string>(store.city         || '')
  const [branchOrder, setBranchOrder] = useState<number>(store.branch_order ?? 1)
  const [groupId,     setGroupId]     = useState<string>(store.branch_group_id || '')
  const [saved,       setSaved]       = useState(false)
  const [err,         setErr]         = useState('')

  const cityList = isAr ? SA_CITIES_AR : SA_CITIES_EN

  async function handleSave() {
    setErr('')
    try {
      await updateBranch.mutateAsync({
        storeId: store.id,
        branch_name:     branchName.trim()  || undefined,
        city:            city.trim()        || undefined,
        branch_order:    branchOrder,
        branch_group_id: groupId            || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setErr(e.message || (isAr ? 'تعذر الحفظ' : 'Failed to save'))
    }
  }

  const dirty = branchName !== (store.branch_name || '')
    || city !== (store.city || '')
    || branchOrder !== (store.branch_order ?? 1)
    || groupId !== (store.branch_group_id || '')

  return (
    <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <GitBranch className="w-5 h-5 text-brand-700" />
        <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'بيانات الفرع' : 'Branch Info'}
        </h3>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'خصّص اسم الفرع ومدينته لعرضه في صفحة مقارنة الفروع.'
          : 'Customize branch name and city to display in the Branch Comparison page.'}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Branch name */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'اسم الفرع' : 'Branch Name'}
          </label>
          <div className="relative">
            <GitBranch size={15} className="absolute top-3 start-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              placeholder={isAr ? 'مثال: فرع الملز' : 'e.g. Al-Malaz Branch'}
              maxLength={80}
              className="input-field w-full ps-9 text-sm"
              dir={isAr ? 'rtl' : 'ltr'}
            />
          </div>
        </div>

        {/* City */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'المدينة' : 'City'}
          </label>
          <div className="relative">
            <MapPin size={15} className="absolute top-3 start-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="input-field w-full ps-9 text-sm"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <option value="">{isAr ? 'اختر المدينة' : 'Select city'}</option>
              {cityList.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Branch order */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'ترتيب الفرع' : 'Branch Order'}
          </label>
          <input
            type="number"
            min={1}
            max={99}
            value={branchOrder}
            onChange={e => setBranchOrder(Math.max(1, Number(e.target.value)))}
            className="input-field w-full text-sm"
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'الترتيب في قائمة مقارنة الفروع' : 'Display order in branch comparison'}
          </p>
        </div>

        {/* Group (shown only if groups exist) */}
        {groups.length > 0 && (
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'المجموعة / السلسلة' : 'Group / Chain'}
            </label>
            <div className="relative">
              <Layers size={15} className="absolute top-3 start-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className="input-field w-full ps-9 text-sm"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <option value="">{isAr ? 'بدون مجموعة' : 'No group'}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="flex items-center gap-3 mt-4">
        <Button
          onClick={handleSave}
          loading={updateBranch.isPending}
          disabled={!dirty && !saved}
          size="sm"
          className="flex items-center gap-2"
        >
          {saved ? <CheckCircle size={14} /> : <GitBranch size={14} />}
          {saved
            ? (isAr ? 'تم الحفظ ✓' : 'Saved ✓')
            : (isAr ? 'حفظ بيانات الفرع' : 'Save Branch Info')}
        </Button>
        {(store.branch_name || store.city) && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'الحالي:' : 'Current:'}{' '}
            <span className="font-semibold" style={{ color: 'var(--text-base)' }}>
              {[store.branch_name, store.city].filter(Boolean).join(' — ')}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// ── Step label helper ─────────────────────────────────────────────────────────
function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-full bg-brand-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>{title}</p>
    </div>
  )
}

// ── Compact speed test (embedded inside InstallGuide) ─────────────────────────
function SpeedTestMini({ isAr }: { isAr: boolean }) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<null | { mbps: number; ms: number; ok: boolean }>(null)

  async function run() {
    setLoading(true); setResult(null); setProgress(20)
    const urls = [
      `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/speed-test/1mb.bin`,
      'https://speed.cloudflare.com/__down?bytes=1048576',
    ]
    try {
      let r: { mbps: number; ms: number } | null = null
      for (const url of urls) {
        try {
          const t0 = performance.now()
          const resp = await fetch(url, { cache: 'no-store' })
          if (!resp.ok) continue
          const buf = await resp.arrayBuffer()
          const elapsed = (performance.now() - t0) / 1000
          r = {
            mbps: Math.round((buf.byteLength * 8) / (elapsed * 1e6) * 10) / 10,
            ms: Math.round(elapsed * 1000),
          }
          break
        } catch { /* try next */ }
      }
      setProgress(100)
      setResult(r ? { ...r, ok: r.mbps >= 2 } : { mbps: 0, ms: 0, ok: false })
    } finally {
      setTimeout(() => setLoading(false), 300)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
        style={{ borderColor: 'var(--border)', color: 'var(--text-base)' }}
      >
        <Zap size={14} className={loading ? 'animate-pulse text-brand-600' : 'text-brand-600'} />
        {isAr ? 'اختبار الشبكة' : 'Test network'}
      </button>

      {loading && (
        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden min-w-[80px]">
          <motion.div
            className="h-full bg-brand-600 rounded-full"
            initial={{ width: '20%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}

      {result && !loading && (
        <div className={`flex items-center gap-2 text-sm ${result.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
          {result.ok
            ? <CheckCircle size={14} />
            : <AlertCircle size={14} />}
          <span className="font-semibold">{result.mbps} Mbps</span>
          <span className="text-xs opacity-70">{result.ms} ms</span>
          <span className="text-xs">
            {result.ok
              ? (isAr ? '✓ الاتصال كافٍ' : '✓ Sufficient')
              : (isAr ? '⚠ أقل من 2 Mbps' : '⚠ Below 2 Mbps minimum')}
          </span>
        </div>
      )}

      {!result && !loading && (
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          {isAr ? 'الحد الأدنى: 2 Mbps رفع' : 'Minimum required: 2 Mbps upload'}
        </p>
      )}
    </div>
  )
}

// ── Camera brand config ────────────────────────────────────────────────────────
type CamBrand = 'hikvision' | 'dahua' | 'tapo' | 'generic'

const CAM_INFO: Record<CamBrand, {
  label: string; labelAr: string;
  rtsp: string;
  tips: string; tipsAr: string
}> = {
  hikvision: {
    label: 'Hikvision', labelAr: 'هيكفيجن',
    rtsp: 'rtsp://admin:Password123@192.168.1.64:554/Streaming/Channels/101',
    tips:   'Main stream: /Channels/101  •  Sub stream: /Channels/102  •  Default login: admin / 12345  •  Port: 554',
    tipsAr: 'البث الرئيسي: /Channels/101 — الفرعي: /Channels/102 — الافتراضي: admin / 12345 — المنفذ: 554',
  },
  dahua: {
    label: 'Dahua', labelAr: 'داهوا',
    rtsp: 'rtsp://admin:Admin123@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0',
    tips:   'subtype=0 (main stream)  •  subtype=1 (sub stream)  •  Default: admin / admin  •  Port: 554',
    tipsAr: 'subtype=0 رئيسي — subtype=1 فرعي — الافتراضي: admin / admin — المنفذ: 554',
  },
  tapo: {
    label: 'TP-Link / Tapo', labelAr: 'TP-Link / Tapo',
    rtsp: 'rtsp://admin:Password123@192.168.1.100:554/stream1',
    tips:   'Use Tapo app credentials  •  /stream1 = HD  •  /stream2 = SD  •  Enable RTSP in Tapo app first',
    tipsAr: 'استخدم بيانات تطبيق Tapo — /stream1 جودة عالية — /stream2 عادية — فعّل RTSP في التطبيق أولاً',
  },
  generic: {
    label: 'Generic / Other', labelAr: 'كاميرا عامة',
    rtsp: 'rtsp://admin:PASSWORD@192.168.1.100:554/live',
    tips:   'Common paths: /live  /stream  /h264  /video  /ch1  •  Check your camera manual for the exact RTSP path',
    tipsAr: 'مسارات شائعة: /live أو /stream أو /h264 — راجع دليل الكاميرا للمسار الصحيح',
  },
}

// ── Installation Guide (wizard) ───────────────────────────────────────────────
function InstallGuide({ store, apiKey, isAr }: { store: any; apiKey: any; isAr: boolean }) {
  const [cam, setCam] = useState<CamBrand>('hikvision')
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const info = CAM_INFO[cam]
  const apiKeyVal = apiKey?.license_key || 'ST-XXXX-XXXX-XXXX-XXXX'
  const storeId   = store?.id || 'your-store-id'

  const script = isAr
    ? `# 1. تثبيت المتطلبات
sudo apt update && sudo apt install python3-pip ffmpeg -y

# 2. تثبيت محرك ذكاء سبلت
pip install split-intelligence-engine

# 3. إعداد متغيرات البيئة
export SPLIT_API_KEY="${apiKeyVal}"
export SPLIT_STORE_ID="${storeId}"
export SPLIT_RTSP_URL="${info.rtsp}"

# 4. تشغيل المحرك
split-engine start`
    : `# 1. Install prerequisites
sudo apt update && sudo apt install python3-pip ffmpeg -y

# 2. Install SPLIT Intelligence engine
pip install split-intelligence-engine

# 3. Configure environment variables
export SPLIT_API_KEY="${apiKeyVal}"
export SPLIT_STORE_ID="${storeId}"
export SPLIT_RTSP_URL="${info.rtsp}"

# 4. Start the engine
split-engine start`

  const brands = Object.entries(CAM_INFO) as [CamBrand, typeof CAM_INFO[CamBrand]][]

  return (
    <div className="rounded-2xl border shadow-card overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <Terminal className="w-5 h-5 text-brand-700" />
        <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'دليل التثبيت' : 'Installation Guide'}
        </h3>
      </div>

      <div className="p-5 space-y-7">

        {/* ── Step 1: Network test ── */}
        <div>
          <StepLabel n={1} title={isAr ? 'اختبار سرعة الشبكة' : 'Network speed test'} />
          <SpeedTestMini isAr={isAr} />
        </div>

        {/* ── Step 2: Camera type ── */}
        <div>
          <StepLabel n={2} title={isAr ? 'اختر نوع كاميرتك' : 'Select your camera type'} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {brands.map(([id, c]) => (
              <button
                key={id}
                onClick={() => setCam(id)}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  cam === id
                    ? 'bg-brand-700 text-white border-brand-700 shadow-md'
                    : 'hover:border-brand-400 hover:bg-brand-50'
                }`}
                style={cam !== id ? { borderColor: 'var(--border)', color: 'var(--text-base)' } : {}}
              >
                {isAr ? c.labelAr : c.label}
              </button>
            ))}
          </div>

          {/* RTSP template */}
          <div className="bg-slate-900 rounded-xl p-4 relative mb-3">
            <p className="text-[10px] text-slate-500 mb-1.5 font-semibold tracking-wider uppercase">RTSP URL</p>
            <code className="text-green-400 text-xs font-mono break-all leading-5">{info.rtsp}</code>
            <button
              onClick={() => copy(info.rtsp, 'rtsp')}
              className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors"
            >
              {copied === 'rtsp'
                ? <CheckCircle size={14} className="text-brand-400" />
                : <Copy size={14} />}
            </button>
          </div>

          {/* Brand tips */}
          <div className="bg-amber-50 border border-amber-100 dark:bg-amber-900/10 dark:border-amber-800/30 rounded-xl p-3 text-xs leading-5"
            style={{ color: 'var(--text-muted)' }}>
            💡 {isAr ? info.tipsAr : info.tips}
          </div>
        </div>

        {/* ── Step 3: Download ── */}
        <div>
          <StepLabel n={3} title={isAr ? 'تحميل التطبيق' : 'Download the app'} />

          {/* App header row */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/logo-full.png" alt="SplitTech" style={{ height: '32px', objectFit: 'contain' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'تطبيق ذكاء سبلت' : 'SPLIT Intelligence'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {isAr ? 'الإصدار 2.0.0' : 'Version 2.0.0'}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Linux x64 */}
            <button
              onClick={() => window.open('https://storage.googleapis.com/splittech-releases/SPLIT-Intelligence-2.0.0-amd64.deb', '_blank')}
              className="flex items-center gap-3 p-3.5 rounded-xl border hover:border-brand-400 hover:bg-brand-50 transition-all group"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <svg className="w-5 h-5 text-slate-600 group-hover:text-brand-700" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.504 0c-.155 0-.315.008-.48.021C7.309.332 3.946 3.93 3.938 8.026c-.023 5.992 4.904 8.808 4.904 8.808s-1.6 1.348-3.168 2.808C3.894 20.882 0 24 0 24h24S20.106 20.882 18.326 19.642c-1.568-1.46-3.168-2.808-3.168-2.808s4.927-2.816 4.904-8.808C20.054 3.93 16.691.332 12.984.021 12.82.008 12.66 0 12.504 0z"/>
                </svg>
              </div>
              <div className={isAr ? 'text-right' : 'text-left'}>
                <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>Linux</p>
                <p className="text-xs text-slate-400">Ubuntu / Debian — x64 (.deb)</p>
              </div>
              <Download size={15} className="ms-auto text-slate-400 group-hover:text-brand-600 transition-colors" />
            </button>

            {/* Raspberry Pi ARM64 */}
            <button
              onClick={() => window.open('https://storage.googleapis.com/splittech-releases/SPLIT-Intelligence-2.0.0-arm64.deb', '_blank')}
              className="flex items-center gap-3 p-3.5 rounded-xl border hover:border-brand-400 hover:bg-brand-50 transition-all group"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <Cpu className="w-5 h-5 text-slate-600 group-hover:text-brand-700" />
              </div>
              <div className={isAr ? 'text-right' : 'text-left'}>
                <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>Raspberry Pi</p>
                <p className="text-xs text-slate-400">Pi 4 / Pi 5 — ARM64 (.deb)</p>
              </div>
              <Download size={15} className="ms-auto text-slate-400 group-hover:text-brand-600 transition-colors" />
            </button>
          </div>
        </div>

        {/* ── Step 4: Install script ── */}
        <div>
          <StepLabel n={4} title={isAr ? 'التثبيت والتشغيل' : 'Install & run'} />
          <div className="bg-slate-900 rounded-xl p-4 relative">
            <button
              onClick={() => copy(script, 'script')}
              className="absolute top-3 left-3 text-slate-400 hover:text-white transition-colors"
            >
              {copied === 'script'
                ? <CheckCircle size={15} className="text-brand-400" />
                : <Copy size={15} />}
            </button>
            <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap overflow-x-auto pt-1">
              {script}
            </pre>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t flex items-center gap-2"
        style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p className="text-xs text-slate-400">
          {isAr
            ? 'مشفر بـ AES-256 · مرخص لهذا المتجر فقط · © 2026 سبلت تيك AI'
            : 'AES-256 encrypted · Licensed to this store only · © 2026 SplitTech AI'}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function StoreSetupInner() {
  const { data: store } = useMyStore()
  const { data: subscription } = useMySubscription()
  const { data: apiKey } = useStoreApiKey(store?.id)
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const [copied, setCopied] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')
  const [showRtspGuide, setShowRtspGuide] = useState(false)
  const [showChangeRequest, setShowChangeRequest] = useState(false)
  const [changeRequestNote, setChangeRequestNote] = useState('')
  const [changeRequestLoading, setChangeRequestLoading] = useState(false)
  const [changeRequestSuccess, setChangeRequestSuccess] = useState(false)
  const [cameraForm, setCameraForm] = useState({
    rtspUrl: '',
    cameraIp: '',
    cameraUsername: '',
    cameraPassword: '',
  })

  useEffect(() => {
    if (!store) return
    setCameraForm({
      rtspUrl: store.rtsp_url || '',
      cameraIp: store.camera_ip || '',
      cameraUsername: store.camera_username || '',
      cameraPassword: store.rtsp_password_encrypted || '',
    })
  }, [store])

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!store) return null

  const verificationMeta = getVerificationMeta(store.verification_status, lang)
  const activationToken = buildActivationToken(store.id, apiKey?.license_key)
  const activationLink = buildActivationUrl(store.id, apiKey?.license_key)
  const needsFreshApproval = store.store_status !== 'active'
    || store.verification_status !== 'verified'
    || !apiKey?.activated_at

  const requestButtonLabel = store.verification_status === 'under_review'
    ? (isAr ? 'الطلب مرسل وبانتظار الاعتماد' : 'Request submitted, awaiting approval')
    : needsFreshApproval
      ? (isAr ? 'إرسال للاعتماد قبل التفعيل' : 'Submit for approval')
      : (isAr ? 'إرسال التحديث للمراجعة' : 'Submit update for review')

  const permanentlyActivated = store.store_status === 'active' && store.verification_status === 'verified'
  const requestPending = ['pending', 'under_review'].includes(store.verification_status || 'pending')

  const canSubmitVerification = hasVerificationPayload({
    rtsp_url: cameraForm.rtspUrl,
    camera_ip: cameraForm.cameraIp,
    camera_username: cameraForm.cameraUsername,
    rtsp_password_encrypted: cameraForm.cameraPassword,
  })

  async function submitVerification() {
    if (!store) return
    setRequestError('')
    setRequestSuccess('')
    setRequestLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please log in first')

      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/license-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          store_id: store.id,
          rtsp_url: cameraForm.rtspUrl,
          camera_ip: cameraForm.cameraIp,
          camera_username: cameraForm.cameraUsername,
          camera_password: cameraForm.cameraPassword,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || (isAr ? 'تعذر إرسال الطلب' : 'Failed to submit request'))
      setRequestSuccess(json.message || (isAr ? 'تم إرسال الطلب بنجاح. المراجعة خلال 1-24 ساعة.' : 'Request submitted successfully. Review takes 1-24 hours.'))
      window.location.reload()
    } catch (e: any) {
      setRequestError(e.message || (isAr ? 'تعذر إرسال الطلب' : 'Failed to submit request'))
    } finally {
      setRequestLoading(false)
    }
  }

  // Fields are locked once store is active & approved
  const fieldsLocked = permanentlyActivated

  async function submitChangeRequest() {
    if (!store || !changeRequestNote.trim()) return
    setChangeRequestLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'يرجى تسجيل الدخول' : 'Please log in')
      const { error } = await supabase.from('support_tickets').insert({
        user_id: session.user.id,
        store_id: store.id,
        title: isAr
          ? `طلب تعديل إعدادات الكاميرا — ${store.name}`
          : `Camera settings change request — ${store.name}`,
        description: isAr
          ? `طلب تعديل بيانات RTSP والكاميرا:\n\n${changeRequestNote}\n\nالإعدادات الحالية:\nIP: ${cameraForm.cameraIp}\nUsername: ${cameraForm.cameraUsername}\nRTSP: ${cameraForm.rtspUrl}`
          : `Request to modify RTSP/camera details:\n\n${changeRequestNote}\n\nCurrent settings:\nIP: ${cameraForm.cameraIp}\nUsername: ${cameraForm.cameraUsername}\nRTSP: ${cameraForm.rtspUrl}`,
        category: 'technical',
        priority: 'high',
      })
      if (error) throw error
      setChangeRequestSuccess(true)
      setShowChangeRequest(false)
      setChangeRequestNote('')
    } catch (e: any) {
      setRequestError(e.message || (isAr ? 'تعذر إرسال الطلب' : 'Failed to submit request'))
    } finally {
      setChangeRequestLoading(false)
    }
  }

  return (
    <div className="page-container space-y-6">
      {showRtspGuide && <RtspGuideModal onClose={() => setShowRtspGuide(false)} />}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Cpu className="w-6 h-6 text-brand-700" />
          {isAr ? 'إعداد الجهاز والترخيص' : 'Device Setup & Licensing'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'تجهيز العميل، التحقق من الكاميرا، ومعلومات التفعيل الشهري' : 'Client setup, camera verification, and monthly activation info'}
        </p>
      </div>

      <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>{isAr ? 'حالة المتجر' : 'Store status'}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={store.store_status === 'active' ? 'active' : store.store_status === 'pending' ? 'pending' : 'suspended'}
              label={
                store.store_status === 'active'
                  ? (isAr ? 'نشط' : 'Active')
                  : store.store_status === 'pending'
                    ? (isAr ? 'بانتظار الموافقة' : 'Pending approval')
                    : (isAr ? 'موقوف' : 'Suspended')
              }
            />
            <Badge variant={verificationMeta.variant} label={verificationMeta.label} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-slate-400 text-xs">{isAr ? 'اسم المتجر' : 'Store name'}</p>
            <p className="font-semibold text-slate-800">{store.name}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">{isAr ? 'معرف المتجر' : 'Store ID'}</p>
            <div className="flex items-center gap-1">
              <p className="font-mono text-xs text-slate-700 truncate">{store.id.slice(0, 20)}…</p>
              <button onClick={() => copy(store.id, 'store_id')} className="text-brand-600 hover:text-brand-800">
                {copied === 'store_id' ? <CheckCircle size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs">{isAr ? 'نوع الشبكة' : 'Network type'}</p>
            <p className="font-semibold text-slate-800">{isAr ? 'شبكة واحدة / عميل واحد' : 'Single network / single client'}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">{isAr ? 'التجديد' : 'Renewal'}</p>
            <p className="font-semibold text-slate-800">
              {subscription?.auto_renew
                ? (isAr ? 'تلقائي شهرياً' : 'Monthly auto-renew')
                : (isAr ? 'يدوي' : 'Manual')}
            </p>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800">
          <p className="font-semibold mb-1">{verificationMeta.label}</p>
          <p className="text-xs leading-6 text-blue-700">{verificationMeta.description}</p>
        </div>
      </div>

      {/* ── Branch Info ── */}
      <BranchInfoSection store={store} isAr={isAr} />

      <div className="rounded-2xl border shadow-card p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-700" />
            <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'بيانات الكاميرا والتحقق قبل التفعيل' : 'Camera data & pre-activation verification'}
            </h3>
          </div>
          <button
            onClick={() => setShowRtspGuide(true)}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium"
          >
            <HelpCircle size={14} />
            {isAr ? 'كيف أحصل على رابط RTSP؟' : 'How do I get the RTSP URL?'}
          </button>
        </div>

        {fieldsLocked ? (
          /* ── LOCKED STATE ── */
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-sm text-emerald-700">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                {isAr
                  ? 'إعدادات الكاميرا مقفلة — المتجر نشط ومعتمد. لتعديل هذه البيانات، أرسل طلب تعديل للإدارة.'
                  : 'Camera settings are locked — store is active and approved. To modify, send a change request to admin.'}
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { label: isAr ? 'IP الكاميرا' : 'Camera IP',         value: cameraForm.cameraIp || '—',       icon: <Network size={14} /> },
                { label: isAr ? 'اسم المستخدم' : 'Username',          value: cameraForm.cameraUsername || '—', icon: <UserRound size={14} /> },
                { label: isAr ? 'رابط RTSP' : 'RTSP URL',             value: cameraForm.rtspUrl || '—',        icon: <Camera size={14} />, full: true },
                { label: isAr ? 'كلمة المرور' : 'Password',           value: '••••••••',                       icon: <Lock size={14} /> },
              ].map(({ label, value, icon, full }) => (
                <div key={label} className={`${full ? 'md:col-span-2' : ''} bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5`}>
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">{icon} {label}</p>
                  <p className="text-sm font-medium text-slate-600 font-mono truncate">{value}</p>
                </div>
              ))}
            </div>

            {changeRequestSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle size={14} />
                {isAr
                  ? 'تم إرسال طلب التعديل للإدارة — سيتم مراجعته وإشعارك.'
                  : 'Change request submitted — you will be notified after review.'}
              </div>
            ) : (
              <div>
                {showChangeRequest ? (
                  <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                      <ShieldX size={14} /> {isAr ? 'طلب تعديل إعدادات الكاميرا' : 'Camera settings change request'}
                    </p>
                    <textarea
                      value={changeRequestNote}
                      onChange={e => setChangeRequestNote(e.target.value)}
                      placeholder={isAr
                        ? 'اشرح ما تريد تعديله (مثال: تغيير IP الكاميرا إلى 192.168.1.120 بسبب تغيير الجهاز)...'
                        : 'Describe what to change (e.g. update camera IP to 192.168.1.120 because of device replacement)...'}
                      rows={3}
                      className="w-full text-sm rounded-xl border border-amber-200 dark:border-amber-800/40 p-3 outline-none focus:border-brand-400 resize-none"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-base)' }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={changeRequestLoading}
                        disabled={!changeRequestNote.trim()}
                        onClick={submitChangeRequest}>
                        <Send size={13} /> {isAr ? 'إرسال للإدارة' : 'Send to admin'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setShowChangeRequest(false)}>
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setShowChangeRequest(true)}>
                    <ShieldX size={13} /> {isAr ? 'طلب تعديل الإعدادات' : 'Request settings change'}
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── EDITABLE STATE ── */
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label={isAr ? 'عنوان IP للكاميرا' : 'Camera IP address'}
              value={cameraForm.cameraIp}
              onChange={(e) => setCameraForm((prev) => ({ ...prev, cameraIp: e.target.value }))}
              placeholder="192.168.1.100"
              icon={<Network size={16} />}
            />
            <Input
              label={isAr ? 'اسم مستخدم الكاميرا' : 'Camera username'}
              value={cameraForm.cameraUsername}
              onChange={(e) => setCameraForm((prev) => ({ ...prev, cameraUsername: e.target.value }))}
              placeholder="admin"
              icon={<UserRound size={16} />}
            />
            <div className="md:col-span-2">
              <Input
                label={isAr ? 'رابط RTSP' : 'RTSP URL'}
                value={cameraForm.rtspUrl}
                onChange={(e) => setCameraForm((prev) => ({ ...prev, rtspUrl: e.target.value }))}
                placeholder="rtsp://username:password@192.168.1.100:554/stream"
                icon={<Camera size={16} />}
              />
            </div>
            <Input
              label={isAr ? 'كلمة مرور الكاميرا' : 'Camera password'}
              type="password"
              value={cameraForm.cameraPassword}
              onChange={(e) => setCameraForm((prev) => ({ ...prev, cameraPassword: e.target.value }))}
              placeholder="••••••••"
              icon={<Lock size={16} />}
            />
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600 flex items-center">
              <div>
                <p className="font-semibold text-slate-800">{isAr ? 'جاهزية التفعيل' : 'Activation readiness'}</p>
                <p className="text-xs mt-1 leading-6">
                  {isAr
                    ? 'لن يتم تفعيل الرخصة أو إعادة إصدارها إلا بعد موافقة الـ Owner وفريق الـ IT على بيانات الكاميرا والشبكة.'
                    : 'The license will not be activated or re-issued until the Owner and IT team approve the camera and network details.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {(store.verification_notes || store.rejection_reason) && (
          <div className={`mt-4 rounded-xl p-3 text-sm ${store.rejection_reason ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
            <p className="font-semibold mb-1">{isAr ? 'ملاحظات فريق التشغيل' : 'Operations team notes'}</p>
            <p>{store.rejection_reason || store.verification_notes}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {requestPending ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 px-5 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 select-none"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <Lock className="w-4 h-4 text-amber-600" />
              </motion.div>
              <div>
                <p className="text-sm font-bold text-amber-800">{isAr ? 'التحقق جارٍ…' : 'Verification in progress…'}</p>
                <p className="text-xs text-amber-600">
                  {isAr ? 'الطلب قيد المراجعة — لا يمكن إعادة الإرسال' : 'Request under review — cannot resubmit'}
                </p>
              </div>
              <motion.div
                className="w-2 h-2 rounded-full bg-amber-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            </motion.div>
          ) : (
            <motion.div
              animate={{ boxShadow: ['0 0 0 rgba(0,108,53,0.0)', '0 0 22px rgba(0,108,53,0.28)', '0 0 0 rgba(0,108,53,0.0)'] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="rounded-xl"
            >
              <Button onClick={submitVerification} disabled={!canSubmitVerification || permanentlyActivated} loading={requestLoading}>
                <RefreshCw size={15} />
                <span className="ms-1">{requestButtonLabel}</span>
              </Button>
            </motion.div>
          )}
          <p className="text-xs text-slate-400">
            {store.verification_requested_at
              ? (isAr
                  ? `آخر إرسال: ${formatSaudiDate(store.verification_requested_at)} — بانتظار اعتماد الـ Owner والـ IT`
                  : `Last submitted: ${formatSaudiDate(store.verification_requested_at)} — awaiting Owner & IT approval`)
              : (isAr ? 'لم يتم إرسال الطلب بعد' : 'Request not submitted yet')}
          </p>
        </div>
        {requestSuccess && <p className="mt-2 text-xs text-emerald-700">{requestSuccess}</p>}
        {requestError && <p className="mt-2 text-xs text-red-600">{requestError}</p>}
      </div>

      {store.store_status === 'active' && apiKey ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-brand-200 dark:border-brand-800/40 shadow-card p-5" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-brand-700" />
            <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'مفتاح الترخيص والتفعيل' : 'License Key & Activation'}
            </h3>
            {apiKey.activated_at
              ? <Badge variant="active"  label={isAr ? 'مفعّل' : 'Activated'} />
              : <Badge variant="pending" label={isAr ? 'جاهز للتفعيل' : 'Ready to activate'} />}
          </div>

          <div className="space-y-3">
            <div className="bg-brand-50 rounded-xl p-4 border border-brand-100">
              <p className="text-xs text-brand-600 mb-2 font-semibold">{isAr ? 'رمز الترخيص' : 'License key'}</p>
              <div className="flex items-center gap-2">
                <code className="font-mono text-lg font-bold text-brand-800 tracking-widest flex-1">
                  {showKey ? apiKey.license_key : apiKey.license_key.replace(/[A-Z0-9]/g, '•')}
                </code>
                <button onClick={() => setShowKey(!showKey)} className="p-2 text-brand-500 hover:text-brand-700">
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button onClick={() => copy(apiKey.license_key, 'license')} className="p-2 text-brand-500 hover:text-brand-700 transition-colors">
                  {copied === 'license' ? <CheckCircle size={16} className="text-brand-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {activationToken && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1 font-semibold">{isAr ? 'صيغة التفعيل السريعة' : 'Quick activation token'}</p>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-slate-700 break-all flex-1">{activationToken}</code>
                  <button onClick={() => copy(activationToken, 'activation-token')} className="text-brand-600 hover:text-brand-800">
                    {copied === 'activation-token' ? <CheckCircle size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {activationLink && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1 font-semibold">{isAr ? 'رابط `client_side`' : 'Client-side activation URL'}</p>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-slate-700 break-all flex-1">{activationLink}</code>
                  <button onClick={() => copy(activationLink, 'activation-link')} className="text-brand-600 hover:text-brand-800">
                    {copied === 'activation-link' ? <CheckCircle size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {(apiKey.expires_at || subscription?.end_date) && (
            <p className="text-xs text-slate-400 mt-3">
              {isAr ? 'تنتهي الرخصة الحالية:' : 'Current license expires:'}{' '}
              <span className="font-semibold">{formatSaudiDate(apiKey.expires_at || subscription?.end_date || '')}</span>
            </p>
          )}
          <p className="text-xs text-brand-600 mt-1">
            {subscription?.auto_renew
              ? (isAr ? 'التجديد الشهري التلقائي مفعّل.' : 'Monthly auto-renewal is enabled.')
              : (isAr ? 'التجديد اليدوي فقط.' : 'Manual renewal only.')}
            {apiKey.activated_at
              ? (isAr ? ` • تم التفعيل في ${formatSaudiDate(apiKey.activated_at)}` : ` • Activated on ${formatSaudiDate(apiKey.activated_at)}`)
              : (isAr ? ' • بانتظار ربطه بتطبيق العميل' : ' • Waiting to be linked to the client app')}
          </p>
        </motion.div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">{isAr ? 'جاري مراجعة طلبك' : 'Your request is being reviewed'}</p>
            <p className="text-sm text-amber-600 mt-1">
              {isAr
                ? 'سيتم إنشاء مفتاح الترخيص الشهري تلقائياً بعد اعتماد فريق الإدارة والـ IT.'
                : 'The monthly license key will be generated automatically after admin and IT approval.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Connection status ── */}
      <div className="rounded-2xl border shadow-card p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Wifi className="w-4 h-4 text-brand-700" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'حالة الاتصال' : 'Connection status'}
          </h3>
        </div>
        {store.last_heartbeat ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse-slow flex-shrink-0" />
            <span className="text-brand-700 font-medium">{isAr ? 'الجهاز متصل' : 'Device connected'}</span>
            <span className="text-slate-400 text-xs">
              — {isAr ? 'آخر إشارة:' : 'last signal:'}{' '}
              {new Date(store.last_heartbeat).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="w-2 h-2 bg-slate-300 rounded-full flex-shrink-0" />
            {isAr ? 'لم يتم استلام أي إشارة بعد' : 'No signal received yet'}
          </div>
        )}
      </div>

      {/* ── Custom Audit Questions ── */}
      {store.store_status === 'active' && <AuditQuestionsSection store={store} isAr={isAr} />}

      {/* ── Working Hours ── */}
      {store.store_status === 'active' && <WorkingHoursSection store={store} isAr={isAr} />}

      {/* ── Webhook & Integrations ── */}
      {store.store_status === 'active' && <WebhookSection isAr={isAr} />}

      {/* ── Installation Guide (wizard) ── */}
      {store.store_status === 'active' && (
        <InstallGuide store={store} apiKey={apiKey} isAr={isAr} />
      )}
    </div>
  )
}

// ── Webhook Section ──────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL

const WEBHOOK_EVENTS = ['audit_complete', 'audit_fail', 'audit_warning'] as const
type WebhookEvent = typeof WEBHOOK_EVENTS[number]

interface WebhookSettings {
  webhook_url:     string | null
  webhook_secret:  string | null
  webhook_events:  WebhookEvent[]
  webhook_enabled: boolean
}

interface WebhookDelivery {
  id:              string
  event:           string
  response_status: number | null
  response_body:   string | null
  success:         boolean
  duration_ms:     number | null
  created_at:      string
}

async function authFetch(url: string, token: string, options?: RequestInit) {
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers ?? {}) } })
}

function WebhookSection({ isAr }: { isAr: boolean }) {
  const { t } = useLanguage()
  const qc    = useQueryClient()

  const [token, setToken] = useState<string | null>(null)
  const [form,  setForm]  = useState<WebhookSettings>({
    webhook_url: '', webhook_secret: '', webhook_events: ['audit_complete'], webhook_enabled: false,
  })
  const [dirty,      setDirty]      = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; status: number | null; ms: number | null } | null>(null)
  const [testing,    setTesting]    = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Get auth token
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null))
  }, [])

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<WebhookSettings>({
    queryKey: ['webhook-settings'],
    enabled:  !!token,
    queryFn:  async () => {
      const r = await authFetch(`${API}/v1/webhook-settings`, token!)
      return r.json()
    },
  })

  // Fetch delivery log
  const { data: deliveriesData, refetch: refetchDeliveries } = useQuery<{ deliveries: WebhookDelivery[] }>({
    queryKey: ['webhook-deliveries'],
    enabled:  !!token,
    queryFn:  async () => {
      const r = await authFetch(`${API}/v1/webhook-deliveries`, token!)
      return r.json()
    },
  })

  // Sync settings to form
  useEffect(() => {
    if (settings) {
      setForm({
        webhook_url:     settings.webhook_url     ?? '',
        webhook_secret:  settings.webhook_secret  ?? '',
        webhook_events:  settings.webhook_events  ?? ['audit_complete'],
        webhook_enabled: settings.webhook_enabled ?? false,
      })
      setDirty(false)
    }
  }, [settings])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/v1/webhook-settings`, token!, {
        method: 'PATCH',
        body: JSON.stringify({
          webhook_url:     form.webhook_url     || null,
          webhook_secret:  form.webhook_secret  || null,
          webhook_events:  form.webhook_events,
          webhook_enabled: form.webhook_enabled,
        }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhook-settings'] })
      setDirty(false)
    },
  })

  // Test webhook
  async function testWebhook() {
    if (!token) return
    setTesting(true)
    setTestResult(null)
    try {
      const r    = await authFetch(`${API}/v1/webhook-settings/test`, token!, { method: 'POST' })
      const data = await r.json()
      setTestResult({ success: data.success, status: data.response_status, ms: data.duration_ms })
      refetchDeliveries()
    } catch { setTestResult({ success: false, status: null, ms: null }) }
    finally   { setTesting(false) }
  }

  // Generate random secret
  function generateSecret() {
    const arr = new Uint8Array(24)
    crypto.getRandomValues(arr)
    const secret = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
    setForm(f => ({ ...f, webhook_secret: secret }))
    setDirty(true)
  }

  function update(patch: Partial<WebhookSettings>) {
    setForm(f => ({ ...f, ...patch }))
    setDirty(true)
  }

  function toggleEvent(ev: WebhookEvent) {
    setForm(f => {
      const evs = f.webhook_events.includes(ev)
        ? f.webhook_events.filter(e => e !== ev)
        : [...f.webhook_events, ev]
      return { ...f, webhook_events: evs }
    })
    setDirty(true)
  }

  const deliveries = deliveriesData?.deliveries ?? []

  const eventLabel = (ev: string) => {
    const map: Record<string, string> = {
      audit_complete: isAr ? 'اكتمال التدقيق' : 'Audit Complete',
      audit_fail:     isAr ? 'تدقيق فاشل'     : 'Audit Fail',
      audit_warning:  isAr ? 'تدقيق تحذير'    : 'Audit Warning',
      test:           isAr ? 'اختبار'          : 'Test',
    }
    return map[ev] ?? ev
  }

  if (isLoading) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-5 space-y-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-50 dark:bg-brand-950">
            <Webhook size={18} className="text-brand-700 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
              {t('webhook.title')}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('webhook.subtitle')}
            </p>
          </div>
        </div>
        {/* Enable toggle */}
        <button
          onClick={() => update({ webhook_enabled: !form.webhook_enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.webhook_enabled ? 'bg-brand-700' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.webhook_enabled ? (isAr ? '-translate-x-6' : 'translate-x-6') : (isAr ? '-translate-x-1' : 'translate-x-1')}`} />
        </button>
      </div>

      {/* URL */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          {t('webhook.url')}
        </label>
        <input
          type="url"
          value={form.webhook_url ?? ''}
          onChange={e => update({ webhook_url: e.target.value })}
          placeholder={t('webhook.urlPlaceholder')}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-1 transition-all"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-base)' }}
          dir="ltr"
        />
      </div>

      {/* Secret */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          {t('webhook.secret')}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showSecret ? 'text' : 'password'}
              value={form.webhook_secret ?? ''}
              onChange={e => update({ webhook_secret: e.target.value })}
              placeholder={t('webhook.secretPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-1 transition-all pr-9"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-base)' }}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              className="absolute inset-y-0 end-2.5 flex items-center"
              style={{ color: 'var(--text-muted)' }}
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={generateSecret}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900"
          >
            {t('webhook.generate')}
          </button>
        </div>
        {form.webhook_secret && (
          <p className="text-[10px] mt-1.5 font-mono" style={{ color: 'var(--text-muted)' }} dir="ltr">
            X-SplitTech-Signature: sha256=&lt;hmac&gt;
          </p>
        )}
      </div>

      {/* Events */}
      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
          {t('webhook.events')}
        </label>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map(ev => {
            const active = form.webhook_events.includes(ev)
            return (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                style={{
                  background:   active ? 'var(--bg-muted)' : 'transparent',
                  borderColor:  active ? 'var(--border-mid)' : 'var(--border)',
                  color:        active ? 'var(--text-base)' : 'var(--text-muted)',
                }}
              >
                {eventLabel(ev)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 transition-colors"
        >
          {saveMutation.isPending
            ? <RefreshCw size={13} className="animate-spin" />
            : <CheckCircle size={13} />}
          {t('webhook.save')}
        </button>
        <button
          onClick={testWebhook}
          disabled={!form.webhook_url || testing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}
        >
          {testing ? <RefreshCw size={13} className="animate-spin" /> : <FlaskConical size={13} />}
          {t('webhook.test')}
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: testResult.success ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
            color:      testResult.success ? '#16a34a' : '#dc2626',
          }}
        >
          {testResult.success ? <CheckCheck size={13} /> : <XCircle size={13} />}
          {testResult.success ? t('webhook.testSuccess') : t('webhook.testFail')}
          {testResult.status  && <span className="ms-auto opacity-70">HTTP {testResult.status}</span>}
          {testResult.ms      && <span className="opacity-70">{testResult.ms}ms</span>}
        </motion.div>
      )}

      {saveMutation.isError && (
        <p className="text-xs text-red-500">{String(saveMutation.error)}</p>
      )}

      {/* Delivery log */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {t('webhook.deliveries')}
          </p>
          <button onClick={() => refetchDeliveries()} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>
            <RotateCcw size={12} />
          </button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
            {t('webhook.noDeliveries')}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {deliveries.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg"
                style={{ background: 'var(--bg-subtle)' }}>
                {d.success
                  ? <CheckCircle size={12} style={{ color: '#16a34a', flexShrink: 0 }} />
                  : <XCircle    size={12} style={{ color: '#dc2626', flexShrink: 0 }} />}
                <span className="font-medium truncate" style={{ color: 'var(--text-base)' }}>
                  {eventLabel(d.event)}
                </span>
                {d.response_status && (
                  <span className="ms-auto font-mono px-1.5 py-0.5 rounded text-[10px]"
                    style={{
                      background: d.success ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                      color:      d.success ? '#16a34a' : '#dc2626',
                    }}>
                    {d.response_status}
                  </span>
                )}
                {d.duration_ms && (
                  <span style={{ color: 'var(--text-muted)' }}>{d.duration_ms}ms</span>
                )}
                <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                  {new Date(d.created_at).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function StoreSetup() {
  return (
    <SubscriptionGate feature="setup">
      <StoreSetupInner />
    </SubscriptionGate>
  )
}
