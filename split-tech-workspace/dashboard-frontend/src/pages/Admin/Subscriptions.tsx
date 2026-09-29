import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, RefreshCw, AlertTriangle, PauseCircle, PlayCircle,
  XCircle, Calendar, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchProfilesMap, fetchStoresBySubscriptionMap } from '../../lib/adminData'
import { formatSaudiDate, tierLabel } from '../../lib/utils'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useLanguage } from '../../contexts/LanguageContext'

type ActionModal =
  | { type: 'renew';   subId: string; userId: string; storeName: string; currentEnd: string | null }
  | { type: 'suspend'; subId: string; userId: string; storeName: string }
  | { type: 'restore'; subId: string; userId: string; storeName: string }
  | { type: 'cancel';  subId: string; storeName: string }
  | null

export default function AdminSubscriptions() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const qc = useQueryClient()
  const [modal, setModal] = useState<ActionModal>(null)
  const [months, setMonths] = useState(1)
  const [customEnd, setCustomEnd] = useState('')
  const [useCustomDate, setUseCustomDate] = useState(false)

  const close = () => { setModal(null); setMonths(1); setCustomEnd(''); setUseCustomDate(false) }

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['all-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error

      const [profilesMap, storesMap] = await Promise.all([
        fetchProfilesMap((data || []).map((s) => s.user_id)),
        fetchStoresBySubscriptionMap((data || []).map((s) => s.id)),
      ])

      return (data || []).map((sub) => ({
        ...sub,
        stores: storesMap[sub.id] ? [storesMap[sub.id]] : [],
        profiles: profilesMap[sub.user_id] ?? null,
      }))
    },
  })

  // ── Renew ─────────────────────────────────────────────────────────────────
  const renewMut = useMutation({
    mutationFn: async ({ subId, months, customEnd }: { subId: string; months: number; customEnd: string }) => {
      if (customEnd) {
        const { error } = await supabase
          .from('subscriptions')
          .update({ end_date: customEnd, status: 'active', updated_at: new Date().toISOString() })
          .eq('id', subId)
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('renew_subscription', {
          p_subscription_id: subId,
          p_months: months,
        })
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-subscriptions'] }); close() },
  })

  // ── Suspend ────────────────────────────────────────────────────────────────
  const suspendMut = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: 'suspend' | 'restore' }) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/admin/merchant/${userId}/suspend`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-subscriptions'] }); close() },
  })

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelMut = useMutation({
    mutationFn: async ({ subId }: { subId: string }) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', subId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-subscriptions'] }); close() },
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  const statusBadge = (status: string): 'active' | 'pending' | 'suspended' | 'expired' | 'warning' => {
    const map: Record<string, 'active' | 'pending' | 'suspended' | 'expired'> = {
      active: 'active', pending: 'pending', expired: 'expired',
      cancelled: 'suspended', suspended: 'suspended',
    }
    return map[status] || 'pending'
  }

  const statusLabel = (s: string) => ({
    active:    { ar: 'نشط',   en: 'Active' },
    pending:   { ar: 'معلق',  en: 'Pending' },
    expired:   { ar: 'منتهي', en: 'Expired' },
    cancelled: { ar: 'ملغي',  en: 'Cancelled' },
    suspended: { ar: 'موقوف', en: 'Suspended' },
  }[s]?.[isAr ? 'ar' : 'en'] ?? s)

  const stats = {
    total:     subscriptions.length,
    active:    subscriptions.filter((s: any) => s.status === 'active').length,
    pending:   subscriptions.filter((s: any) => s.status === 'pending').length,
    suspended: subscriptions.filter((s: any) => s.status === 'suspended' || s.status === 'cancelled').length,
    expired:   subscriptions.filter((s: any) => s.status === 'expired').length,
  }

  const isBusy = renewMut.isPending || suspendMut.isPending || cancelMut.isPending

  // ── Min date for custom picker (today) ────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <CreditCard className="w-6 h-6 text-brand-700" />
          {isAr ? 'إدارة الاشتراكات' : 'Subscription Management'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'تجديد وإدارة وتجميد اشتراكات التجار' : 'Renew, suspend, and manage merchant subscriptions'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { labelAr: 'الإجمالي',  labelEn: 'Total',     value: stats.total,     color: 'text-slate-700' },
          { labelAr: 'نشط',       labelEn: 'Active',     value: stats.active,    color: 'text-brand-700' },
          { labelAr: 'معلق',      labelEn: 'Pending',    value: stats.pending,   color: 'text-amber-600' },
          { labelAr: 'موقوف/ملغي',labelEn: 'Suspended',  value: stats.suspended, color: 'text-red-600' },
          { labelAr: 'منتهي',     labelEn: 'Expired',    value: stats.expired,   color: 'text-slate-500' },
        ].map(({ labelAr, labelEn, value, color }) => (
          <div key={labelAr} className="rounded-2xl border p-4 text-center"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? labelAr : labelEn}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                {[
                  isAr ? 'المتجر / التاجر' : 'Store / Merchant',
                  isAr ? 'الباقة'          : 'Plan',
                  isAr ? 'الحالة'          : 'Status',
                  isAr ? 'تاريخ الانتهاء' : 'Expiry Date',
                  isAr ? 'المبلغ'          : 'Amount',
                  isAr ? 'الإجراءات'       : 'Actions',
                ].map(h => (
                  <th key={h} className="text-start px-4 py-3 text-xs font-bold whitespace-nowrap"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse w-3/4" style={{ background: 'var(--bg-muted)' }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                    {isAr ? 'لا توجد اشتراكات' : 'No subscriptions found'}
                  </td>
                </tr>
              )}

              {subscriptions.map((sub: any) => {
                const store   = Array.isArray(sub.stores) ? sub.stores[0] : sub.stores
                const profile = sub.profiles
                const expiringSoon = sub.end_date &&
                  new Date(sub.end_date).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 &&
                  sub.status === 'active'
                const isSuspended = sub.status === 'suspended' || sub.status === 'cancelled'

                return (
                  <tr key={sub.id} className="transition-colors hover:bg-[var(--bg-muted)]"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{store?.name || '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{profile?.full_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{profile?.email}</p>
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-base)' }}>
                      {tierLabel(sub.tier, lang)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Badge variant={statusBadge(sub.status)} label={statusLabel(sub.status)} />
                        {expiringSoon && <AlertTriangle size={13} className="text-amber-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={expiringSoon ? 'text-amber-600 font-semibold' : ''} style={!expiringSoon ? { color: 'var(--text-muted)' } : undefined}>
                        {sub.end_date ? formatSaudiDate(sub.end_date) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
                      {sub.monthly_amount ? `${sub.monthly_amount} ${isAr ? 'ر.س' : 'SAR'}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Renew */}
                        <button
                          onClick={() => setModal({ type: 'renew', subId: sub.id, userId: sub.user_id, storeName: store?.name || '', currentEnd: sub.end_date })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          title={isAr ? 'تجديد' : 'Renew'}
                        >
                          <RefreshCw size={12} />
                          {isAr ? 'تجديد' : 'Renew'}
                        </button>

                        {/* Suspend / Restore */}
                        {isSuspended ? (
                          <button
                            onClick={() => setModal({ type: 'restore', subId: sub.id, userId: sub.user_id, storeName: store?.name || '' })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-green-50 hover:border-green-300 hover:text-green-700"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            title={isAr ? 'استعادة' : 'Restore'}
                          >
                            <PlayCircle size={12} />
                            {isAr ? 'استعادة' : 'Restore'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setModal({ type: 'suspend', subId: sub.id, userId: sub.user_id, storeName: store?.name || '' })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            title={isAr ? 'تجميد' : 'Suspend'}
                          >
                            <PauseCircle size={12} />
                            {isAr ? 'تجميد' : 'Suspend'}
                          </button>
                        )}

                        {/* Cancel */}
                        {sub.status !== 'cancelled' && (
                          <button
                            onClick={() => setModal({ type: 'cancel', subId: sub.id, storeName: store?.name || '' })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            title={isAr ? 'إلغاء' : 'Cancel'}
                          >
                            <XCircle size={12} />
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Renew Modal ─────────────────────────────────────────────────────── */}
      <Modal
        open={modal?.type === 'renew'}
        onClose={close}
        title={isAr ? `تجديد اشتراك — ${modal?.type === 'renew' ? modal.storeName : ''}` : `Renew Subscription — ${modal?.type === 'renew' ? modal.storeName : ''}`}
        size="sm"
      >
        {modal?.type === 'renew' && (
          <div className="space-y-4">
            {modal.currentEnd && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'تاريخ الانتهاء الحالي:' : 'Current expiry:'}{' '}
                <span className="font-semibold" style={{ color: 'var(--text-base)' }}>
                  {formatSaudiDate(modal.currentEnd)}
                </span>
              </p>
            )}

            {/* Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setUseCustomDate(false)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${!useCustomDate ? 'bg-brand-600 text-white border-brand-600' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                <ChevronDown size={12} className="inline mr-1" />
                {isAr ? 'تمديد بالأشهر' : 'Extend by months'}
              </button>
              <button
                onClick={() => setUseCustomDate(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${useCustomDate ? 'bg-brand-600 text-white border-brand-600' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
              >
                <Calendar size={12} className="inline mr-1" />
                {isAr ? 'تاريخ مخصص' : 'Custom date'}
              </button>
            </div>

            {!useCustomDate ? (
              <div>
                <label className="label">{isAr ? 'عدد الأشهر' : 'Number of Months'}</label>
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="input-field">
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {isAr ? `${m} ${m === 1 ? 'شهر' : 'أشهر'}` : `${m} ${m === 1 ? 'month' : 'months'}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="label">{isAr ? 'تاريخ الانتهاء الجديد' : 'New Expiry Date'}</label>
                <input
                  type="date"
                  value={customEnd}
                  min={today}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="input-field"
                />
              </div>
            )}

            <Button
              className="w-full"
              loading={renewMut.isPending}
              disabled={useCustomDate && !customEnd}
              onClick={() => renewMut.mutate({ subId: modal.subId, months, customEnd })}
            >
              <RefreshCw size={14} />
              {isAr ? 'تأكيد التجديد' : 'Confirm Renewal'}
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Suspend Modal ────────────────────────────────────────────────────── */}
      <Modal
        open={modal?.type === 'suspend'}
        onClose={close}
        title={isAr ? 'تجميد الاشتراك' : 'Suspend Subscription'}
        size="sm"
      >
        {modal?.type === 'suspend' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <PauseCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {isAr
                  ? `سيتم تجميد اشتراك "${modal.storeName}" وتعطيل وصولهم إلى لوحة التحكم وميزات الذكاء الاصطناعي.`
                  : `"${modal.storeName}" will be suspended. Their dashboard access and AI features will be disabled.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600"
                loading={suspendMut.isPending}
                onClick={() => suspendMut.mutate({ userId: modal.userId, action: 'suspend' })}
              >
                <PauseCircle size={14} />
                {isAr ? 'تجميد' : 'Suspend'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Restore Modal ────────────────────────────────────────────────────── */}
      <Modal
        open={modal?.type === 'restore'}
        onClose={close}
        title={isAr ? 'استعادة الاشتراك' : 'Restore Subscription'}
        size="sm"
      >
        {modal?.type === 'restore' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <PlayCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-800 dark:text-green-200">
                {isAr
                  ? `سيتم استعادة اشتراك "${modal.storeName}" وإعادة تفعيل وصولهم.`
                  : `"${modal.storeName}"'s subscription will be restored and access re-enabled.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
              <Button
                className="flex-1"
                loading={suspendMut.isPending}
                onClick={() => suspendMut.mutate({ userId: modal.userId, action: 'restore' })}
              >
                <PlayCircle size={14} />
                {isAr ? 'استعادة' : 'Restore'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Cancel Modal ─────────────────────────────────────────────────────── */}
      <Modal
        open={modal?.type === 'cancel'}
        onClose={close}
        title={isAr ? 'إلغاء الاشتراك' : 'Cancel Subscription'}
        size="sm"
      >
        {modal?.type === 'cancel' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <XCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-200">
                {isAr
                  ? `هل أنت متأكد من إلغاء اشتراك "${modal.storeName}"؟ لا يمكن التراجع عن هذا الإجراء.`
                  : `Are you sure you want to cancel "${modal.storeName}"'s subscription? This cannot be undone.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>{isAr ? 'تراجع' : 'Go back'}</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                loading={cancelMut.isPending}
                onClick={() => cancelMut.mutate({ subId: modal.subId })}
              >
                <XCircle size={14} />
                {isAr ? 'تأكيد الإلغاء' : 'Confirm Cancel'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
