import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Store, CheckCircle, XCircle, ChevronDown, ChevronUp, Send, ShieldCheck, Gauge, Clock, Play, Square, RotateCcw, Wifi, ListChecks, Lock } from 'lucide-react'
import { useAllStores, useApproveStore } from '../../hooks/useStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { formatSaudiDate, tierLabel } from '../../lib/utils'
import { getVerificationMeta, maskSecret } from '../../lib/storeWorkflow'
import { useLanguage } from '../../contexts/LanguageContext'

export default function StoreApprovals() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data: stores = [] } = useAllStores()
  const approveStore = useApproveStore()
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ open: boolean; storeId: string | null }>({ open: false, storeId: null })
  const [rejectReason, setRejectReason] = useState('')
  const [remoteModal, setRemoteModal] = useState<{ open: boolean; storeId: string | null; storeName: string }>({ open: false, storeId: null, storeName: '' })

  const { data: speedMap = {} } = useQuery({
    queryKey: ['latest-speed-tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('network_speed_tests')
        .select('store_id, download_mbps, latency_ms, upload_ok, created_at')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) {
        if ((error as any).code === '42P01') return {}
        throw error
      }
      const map: Record<string, any> = {}
      for (const row of (data || [])) {
        if (!map[row.store_id]) map[row.store_id] = row
      }
      return map
    },
    refetchInterval: 45_000,
  })

  const rejectStore = useMutation({
    mutationFn: async ({ storeId, reason }: { storeId: string; reason: string }) => {
      await supabase
        .from('stores')
        .update({
          store_status: 'inactive',
          verification_status: 'rejected',
          rejection_reason: reason,
          verification_notes: reason || 'تم رفض الطلب من لوحة الإدارة.',
        })
        .eq('id', storeId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-stores'] })
      qc.invalidateQueries({ queryKey: ['verification-requests'] })
      setRejectModal({ open: false, storeId: null })
      setRejectReason('')
    },
  })

  const sendRemoteCommand = useMutation({
    mutationFn: async ({ storeId, command }: { storeId: string; command: string }) => {
      await supabase.from('stores').update({ admin_override_signal: command }).eq('id', storeId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-stores'] })
      setRemoteModal({ open: false, storeId: null, storeName: '' })
    },
  })

  // ── Approve / reject custom audit questions ──────────────────────────────
  // NOTE: Uses direct API endpoints (bypasses PostgREST) to avoid schema-cache
  //       issues with new columns (custom_questions, working_hours, etc.)
  const approveQuestions = useMutation({
    mutationFn: async (storeId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_URL}/v1/admin/approve-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ store_id: storeId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'فشل اعتماد الأسئلة')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-stores'] }),
  })

  const rejectQuestions = useMutation({
    mutationFn: async (storeId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_URL}/v1/admin/reject-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ store_id: storeId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'فشل رفض الأسئلة')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-stores'] }),
  })

  // ── Approve working hours (locks them) ───────────────────────────────────
  const approveWorkingHours = useMutation({
    mutationFn: async (storeId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_URL}/v1/admin/approve-working-hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ store_id: storeId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'فشل اعتماد الأوقات')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-stores'] }),
  })

  const needsAttention = (store: any) => {
    const requestedAt = store.verification_requested_at ? new Date(store.verification_requested_at).getTime() : 0
    const reviewedAt = store.reviewed_at ? new Date(store.reviewed_at).getTime() : 0
    return store.store_status === 'pending'
      || ['pending', 'under_review', 'rejected'].includes(store.verification_status || 'pending')
      || (requestedAt > 0 && reviewedAt < requestedAt)
  }

  const pending = stores.filter((s: any) => needsAttention(s))
  const rest = stores.filter((s: any) => !needsAttention(s))

  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Store className="w-6 h-6 text-brand-700" />
          {isAr ? 'إدارة المتاجر' : 'Store Management'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? `${stores.length} متجر إجمالاً — ${pending.length} في انتظار الموافقة`
            : `${stores.length} stores total — ${pending.length} pending approval`}
        </p>
      </div>

      {/* Pending stores */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg w-fit mb-3 flex items-center gap-1.5">
            <Clock size={13} />
            {isAr ? `بانتظار الموافقة (${pending.length})` : `Awaiting Approval (${pending.length})`}
          </h2>
          <div className="space-y-3">
            {pending.map((store: any) => (
              <StoreCard
                key={store.id}
                store={store}
                speed={speedMap[store.id]}
                expanded={expandedId === store.id}
                onToggle={() => setExpandedId(expandedId === store.id ? null : store.id)}
                onApprove={() => approveStore.mutate(store.id)}
                onReject={() => setRejectModal({ open: true, storeId: store.id })}
                onRemote={() => setRemoteModal({ open: true, storeId: store.id, storeName: store.name })}
                onRemoteSpeed={() => sendRemoteCommand.mutate({ storeId: store.id, command: 'SPEED_TEST' })}
                onApproveQuestions={() => approveQuestions.mutate(store.id)}
                onRejectQuestions={() => rejectQuestions.mutate(store.id)}
                onApproveHours={() => approveWorkingHours.mutate(store.id)}
                approvingId={approveStore.isPending ? store.id : null}
                isAr={isAr}
                lang={lang}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other stores */}
      {rest.length > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'جميع المتاجر' : 'All Stores'}
          </h2>
          <div className="space-y-3">
            {rest.map((store: any) => (
              <StoreCard
                key={store.id}
                store={store}
                speed={speedMap[store.id]}
                expanded={expandedId === store.id}
                onToggle={() => setExpandedId(expandedId === store.id ? null : store.id)}
                onApprove={() => approveStore.mutate(store.id)}
                onReject={() => setRejectModal({ open: true, storeId: store.id })}
                onRemote={() => setRemoteModal({ open: true, storeId: store.id, storeName: store.name })}
                onRemoteSpeed={() => sendRemoteCommand.mutate({ storeId: store.id, command: 'SPEED_TEST' })}
                onApproveQuestions={() => approveQuestions.mutate(store.id)}
                onRejectQuestions={() => rejectQuestions.mutate(store.id)}
                onApproveHours={() => approveWorkingHours.mutate(store.id)}
                approvingId={approveStore.isPending ? store.id : null}
                isAr={isAr}
                lang={lang}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reject modal */}
      <Modal
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, storeId: null })}
        title={isAr ? 'رفض المتجر' : 'Reject Store'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'أدخل سبب الرفض (سيُرسل إلى التاجر)' : 'Enter rejection reason (will be sent to merchant)'}
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="input-field"
            placeholder={isAr ? 'سبب الرفض...' : 'Rejection reason...'}
          />
          <Button
            variant="danger"
            className="w-full"
            loading={rejectStore.isPending}
            onClick={() => rejectModal.storeId && rejectStore.mutate({ storeId: rejectModal.storeId, reason: rejectReason })}
          >
            {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
          </Button>
        </div>
      </Modal>

      {/* Remote command modal */}
      <Modal
        open={remoteModal.open}
        onClose={() => setRemoteModal({ open: false, storeId: null, storeName: '' })}
        title={isAr ? `أوامر عن بعد — ${remoteModal.storeName}` : `Remote Commands — ${remoteModal.storeName}`}
        size="sm"
      >
        <div className="space-y-3">
          {[
            { cmd: 'START',   labelAr: 'تشغيل المحرك',  labelEn: 'Start Engine',   cls: 'bg-brand-700 text-white hover:bg-brand-800', Icon: Play },
            { cmd: 'STOP',    labelAr: 'إيقاف المحرك',   labelEn: 'Stop Engine',    cls: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200', Icon: Square },
            { cmd: 'RESTART', labelAr: 'إعادة التشغيل',  labelEn: 'Restart',        cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200', Icon: RotateCcw },
          ].map(({ cmd, labelAr, labelEn, cls, Icon: Ic }) => (
            <button
              key={cmd}
              onClick={() => remoteModal.storeId && sendRemoteCommand.mutate({ storeId: remoteModal.storeId, command: cmd })}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${cls}`}
            >
              <Ic size={14} />
              {isAr ? labelAr : labelEn}
            </button>
          ))}
          <button
            onClick={() => remoteModal.storeId && sendRemoteCommand.mutate({ storeId: remoteModal.storeId, command: 'SPEED_TEST' })}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all"
          >
            <Wifi size={14} />
            {isAr ? 'اختبار السرعة عن بعد' : 'Remote Speed Test'}
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
            {isAr ? 'سيتم تطبيق الأمر في الدورة التالية' : 'Command will be applied in the next cycle'}
          </p>
        </div>
      </Modal>
    </div>
  )
}

function StoreCard({ store, speed, expanded, onToggle, onApprove, onReject, onRemote, onRemoteSpeed, onApproveQuestions, onRejectQuestions, onApproveHours, approvingId, isAr, lang }: any) {
  const subscription = Array.isArray(store.subscriptions) ? store.subscriptions[0] : store.subscriptions
  const profile = store.profiles
  const verificationMeta = getVerificationMeta(store.verification_status, lang)
  const hasVerificationPayload = Boolean(store.rtsp_url && store.camera_ip && store.camera_username && store.rtsp_password_encrypted)
  const readyForActivation = hasVerificationPayload && store.verification_status === 'verified'

  const storeStatusLabel = (status: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      active:   { ar: 'نشط',     en: 'Active' },
      pending:  { ar: 'بانتظار', en: 'Pending' },
      inactive: { ar: 'موقوف',   en: 'Inactive' },
    }
    return isAr ? (map[status]?.ar || status) : (map[status]?.en || status)
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 font-bold text-sm">
            {store.name[0]}
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{store.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{profile?.full_name} • {profile?.company_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={store.store_status === 'active' ? 'active' : store.store_status === 'pending' ? 'pending' : 'suspended'}
            label={storeStatusLabel(store.store_status)}
          />
          <Badge variant={verificationMeta.variant} label={verificationMeta.label} />
          {expanded
            ? <ChevronUp size={16} style={{ color: 'var(--text-faint)' }} />
            : <ChevronDown size={16} style={{ color: 'var(--text-faint)' }} />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div layout initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-2 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'الباقة' : 'Plan'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{tierLabel(subscription?.tier || 'basic', lang)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'الهاتف' : 'Phone'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{profile?.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'تاريخ الطلب' : 'Request Date'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{formatSaudiDate(store.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'IP الكاميرا' : 'Camera IP'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{store.camera_ip || '—'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'اسم المستخدم' : 'Username'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{store.camera_username || '—'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'كلمة المرور' : 'Password'}</p>
                  <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{maskSecret(store.rtsp_password_encrypted)}</p>
                </div>
                {subscription?.end_date && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'نهاية الاشتراك' : 'Sub. End Date'}</p>
                    <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{formatSaudiDate(subscription.end_date)}</p>
                  </div>
                )}
                {store.verification_requested_at && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'طلب التحقق' : 'Verification Request'}</p>
                    <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{formatSaudiDate(store.verification_requested_at)}</p>
                  </div>
                )}
                {speed && (
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{isAr ? 'آخر اختبار سرعة' : 'Last Speed Test'}</p>
                    <p className={`font-semibold ${speed.upload_ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {speed.download_mbps} Mbps • {speed.latency_ms}ms
                    </p>
                  </div>
                )}
              </div>

              {store.rtsp_url && (
                <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck size={14} className="text-brand-700" />
                    <p className="text-xs font-bold" style={{ color: 'var(--text-base)' }}>
                      {isAr ? 'بيانات التحقق والشبكة' : 'Verification & Network Data'}
                    </p>
                  </div>
                  <p className="text-xs break-all" style={{ color: 'var(--text-muted)' }}>RTSP: {store.rtsp_url}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                    {verificationMeta.label} — {store.verification_notes || (isAr ? 'لا توجد ملاحظات بعد' : 'No notes yet')}
                  </p>
                </div>
              )}

              {store.custom_questions?.length > 0 && (
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>
                    {isAr ? 'أسئلة التدقيق المعتمدة' : 'Approved Audit Questions'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {store.custom_questions.slice(0, 3).map((q: string, i: number) => (
                      <span key={i} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{q.slice(0, 40)}{q.length > 40 ? '…' : ''}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Pending Audit Questions — awaiting approval ── */}
              {store.pending_custom_questions?.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ListChecks size={14} className="text-amber-700" />
                    <p className="text-xs font-bold text-amber-700">
                      {isAr ? 'أسئلة تدقيق تنتظر الاعتماد' : 'Audit Questions Pending Approval'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {store.pending_custom_questions.map((q: string, i: number) => (
                      <p key={i} className="text-xs text-amber-800 flex gap-1.5"><span className="font-bold">{i + 1}.</span>{q}</p>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={onApproveQuestions}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      <CheckCircle size={12} />{isAr ? 'اعتماد' : 'Approve'}
                    </button>
                    <button
                      onClick={onRejectQuestions}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      <XCircle size={12} />{isAr ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Pending Working Hours — awaiting approval ── */}
              {store.pending_working_hours && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-blue-700" />
                    <p className="text-xs font-bold text-blue-700">
                      {isAr ? 'ساعات عمل تنتظر الاعتماد' : 'Working Hours Pending Approval'}
                    </p>
                  </div>
                  {(() => {
                    const wh = store.pending_working_hours as { start: number; end: number }
                    const fmt = (h: number) => `${String(h).padStart(2,'0')}:00`
                    return (
                      <p className="text-xs text-blue-800 font-semibold">
                        {fmt(wh.start)} → {fmt(wh.end)}{' '}
                        <span className="font-normal text-blue-600">
                          ({isAr ? 'توقيت السعودية' : 'KSA time'})
                        </span>
                      </p>
                    )
                  })()}
                  <button
                    onClick={onApproveHours}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <Lock size={12} />{isAr ? 'اعتماد وقفل' : 'Approve & Lock'}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                {store.store_status === 'pending' && readyForActivation && (
                  <Button onClick={onApprove} loading={approvingId === store.id} size="sm" className="flex items-center gap-1.5">
                    <CheckCircle size={14} />
                    {isAr ? 'موافقة نهائية وتفعيل' : 'Final Approval & Activate'}
                  </Button>
                )}

                {store.store_status === 'pending' && !readyForActivation && (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-3 py-2">
                    {hasVerificationPayload
                      ? (isAr ? 'بانتظار اعتماد الـ IT قبل التفعيل' : 'Awaiting IT approval before activation')
                      : (isAr ? 'بانتظار رفع بيانات الكاميرا من التاجر' : 'Awaiting camera data from merchant')}
                  </span>
                )}

                {store.store_status === 'pending' && (
                  <Button onClick={onReject} variant="danger" size="sm" className="flex items-center gap-1.5">
                    <XCircle size={14} />
                    {isAr ? 'رفض' : 'Reject'}
                  </Button>
                )}

                {store.store_status === 'active' && (
                  <Button onClick={onRemote} variant="secondary" size="sm" className="flex items-center gap-1.5">
                    <Send size={14} />
                    {isAr ? 'أوامر عن بعد' : 'Remote Commands'}
                  </Button>
                )}

                {store.store_status === 'active' && (
                  <Button onClick={() => onRemoteSpeed()} variant="secondary" size="sm" className="flex items-center gap-1.5">
                    <Gauge size={14} />
                    {isAr ? 'اختبار السرعة' : 'Speed Test'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
