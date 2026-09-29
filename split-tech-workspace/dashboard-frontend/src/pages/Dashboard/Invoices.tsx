import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Download, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Camera, Phone, CreditCard,
  TrendingUp, Calendar, FileText,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { formatSaudiDate, tierLabel } from '../../lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string
  invoice_num: string
  moyasar_id: string
  amount: number
  currency: string
  status: 'paid' | 'failed' | 'pending' | string
  initiated_at: string
  tier: string
  service: string
  end_date: string
  start_date: string
}

interface InvoiceMeta {
  total_count: number
  total_paid: number
  last_paid_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchInvoices(page: number) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthenticated')
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/my-invoices?page=${page}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  )
  if (!res.ok) throw new Error('Failed to load invoices')
  return res.json() as Promise<{ invoices: Invoice[]; meta: InvoiceMeta; page: number; limit: number }>
}

function statusColor(s: string): { bg: string; color: string } {
  if (s === 'paid')    return { bg: 'rgba(22,163,74,0.1)',  color: '#16a34a' }
  if (s === 'failed')  return { bg: 'rgba(220,38,38,0.1)',  color: '#dc2626' }
  return                      { bg: 'rgba(217,119,6,0.1)',  color: '#d97706' }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'paid')   return <CheckCircle2 size={13} color="#16a34a" />
  if (status === 'failed') return <XCircle size={13} color="#dc2626" />
  return <Clock size={13} color="#d97706" />
}

function ServiceIcon({ service }: { service: string }) {
  if (service === 'voice') return <Phone size={14} color="#7c3aed" />
  return <Camera size={14} color="#1d4ed8" />
}

// ── Invoice PDF generator (client-side) ──────────────────────────────────────
function generateInvoicePDF(inv: Invoice, fullName: string, isAr: boolean) {
  const amount = (inv.amount / 100).toFixed(2)
  const serviceName = inv.service === 'voice'
    ? (isAr ? 'الوكيل الصوتي' : 'Voice Agent')
    : (isAr ? 'رؤية AI' : 'AI Vision')
  const tierName = tierLabel(inv.tier, isAr ? 'ar' : 'en')
  const date = new Date(inv.initiated_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const html = `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8" />
<title>${isAr ? 'فاتورة' : 'Invoice'} — ${inv.invoice_num}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1f2937; background: #fff; padding: 48px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
  .logo { font-size: 24px; font-weight: 900; color: #006c35; letter-spacing: -1px; }
  .logo span { color: #1d4ed8; }
  .inv-badge { text-align: ${isAr ? 'left' : 'right'}; }
  .inv-badge .num { font-size: 18px; font-weight: 800; color: #111827; }
  .inv-badge .date { font-size: 12px; color: #9ca3af; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
    ${inv.status === 'paid' ? 'background: #dcfce7; color: #16a34a;' : 'background: #fee2e2; color: #dc2626;'} }
  .divider { border: none; border-top: 1.5px solid #e5e7eb; margin: 32px 0; }
  .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .row:last-child { border-bottom: none; }
  .row .label { color: #6b7280; }
  .row .value { font-weight: 600; color: #111827; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #f0fdf4; border-radius: 12px; margin-top: 24px; }
  .total-row .label { font-size: 16px; font-weight: 700; color: #166534; }
  .total-row .amount { font-size: 28px; font-weight: 900; color: #16a34a; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1.5px solid #e5e7eb; text-align: center; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
<div class="header">
  <div class="logo">SPLIT<span>.</span>AI</div>
  <div class="inv-badge">
    <div class="num">${inv.invoice_num}</div>
    <div class="date">${date}</div>
    <div style="margin-top:6px"><span class="status-badge">${inv.status === 'paid' ? (isAr ? 'مدفوعة' : 'PAID') : (isAr ? 'فاشلة' : 'FAILED')}</span></div>
  </div>
</div>

<div class="section-label">${isAr ? 'بيانات العميل' : 'Bill To'}</div>
<div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:4px">${fullName || (isAr ? 'العميل' : 'Customer')}</div>
<div style="font-size:13px;color:#6b7280">${isAr ? 'المملكة العربية السعودية' : 'Saudi Arabia'}</div>

<hr class="divider" />

<div class="section-label">${isAr ? 'تفاصيل الفاتورة' : 'Invoice Details'}</div>
<div class="row"><span class="label">${isAr ? 'الخدمة' : 'Service'}</span><span class="value">${serviceName}</span></div>
<div class="row"><span class="label">${isAr ? 'الباقة' : 'Plan'}</span><span class="value">${tierName}</span></div>
<div class="row"><span class="label">${isAr ? 'تاريخ البدء' : 'Start Date'}</span><span class="value">${formatSaudiDate(inv.start_date)}</span></div>
<div class="row"><span class="label">${isAr ? 'تاريخ الانتهاء' : 'End Date'}</span><span class="value">${formatSaudiDate(inv.end_date)}</span></div>
<div class="row"><span class="label">${isAr ? 'رقم المعاملة' : 'Transaction ID'}</span><span class="value" style="font-size:12px;font-family:monospace">${inv.moyasar_id}</span></div>

<div class="total-row">
  <span class="label">${isAr ? 'الإجمالي المدفوع' : 'Total Paid'}</span>
  <span class="amount">${amount} ${isAr ? 'ريال' : 'SAR'}</span>
</div>

<div class="footer">
  SplitTech AI · ${isAr ? 'المملكة العربية السعودية' : 'Saudi Arabia'} · info@splittech.sa<br/>
  ${isAr ? 'هذه الفاتورة تم إنشاؤها تلقائياً ولا تحتاج إلى توقيع.' : 'This invoice was auto-generated and requires no signature.'}
</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Invoices() {
  const { lang } = useLanguage()
  const { profile } = useAuth()
  const isAr = lang === 'ar'
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'paid' | 'failed'>('all')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-invoices', page],
    queryFn: () => fetchInvoices(page),
    staleTime: 60_000,
  })

  const invoices = (data?.invoices ?? []).filter(inv => {
    if (filter === 'all') return true
    return inv.status === filter
  })
  const meta = data?.meta
  const totalPages = Math.ceil((meta?.total_count ?? 0) / (data?.limit ?? 20))

  const totalSpent = ((meta?.total_paid ?? 0) / 100).toFixed(0)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center flex-shrink-0">
            <Receipt size={20} color="white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'الفواتير والسجل المالي' : 'Invoices & Billing History'}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'سجل كامل لجميع مدفوعاتك' : 'Complete record of all your payments'}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: isAr ? 'إجمالي المدفوع' : 'Total Paid',
            value: `${Number(totalSpent).toLocaleString()} ${isAr ? 'ر.س' : 'SAR'}`,
            icon: <TrendingUp size={16} />,
            color: '#16a34a',
            bg: 'rgba(22,163,74,0.1)',
          },
          {
            label: isAr ? 'عدد الفواتير' : 'Total Invoices',
            value: meta?.total_count ?? 0,
            icon: <FileText size={16} />,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.1)',
          },
          {
            label: isAr ? 'آخر دفعة' : 'Last Payment',
            value: meta?.last_paid_at ? formatSaudiDate(meta.last_paid_at) : '—',
            icon: <Calendar size={16} />,
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,0.1)',
          },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-xl"
                style={{ background: card.bg, color: card.color }}>
                {card.icon}
              </span>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {card.label}
              </span>
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-base)' }}>
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'paid', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: filter === f ? 'var(--primary)' : 'var(--bg-card)',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              border: `1.5px solid ${filter === f ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {f === 'all'    ? (isAr ? 'الكل' : 'All')
           : f === 'paid'   ? (isAr ? 'مدفوعة' : 'Paid')
           :                  (isAr ? 'فاشلة' : 'Failed')}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-20 animate-pulse"
              style={{ background: 'var(--bg-subtle)' }} />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-14 text-center"
          style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}
        >
          <Receipt size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
          <p className="font-semibold text-base mb-1" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'لا توجد فواتير بعد' : 'No invoices yet'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'ستظهر فواتيرك هنا بعد أول دفعة' : 'Your invoices will appear here after your first payment'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {invoices.map((inv, i) => {
              const sc = statusColor(inv.status)
              const amount = (inv.amount / 100).toFixed(2)
              return (
                <motion.div
                  key={inv.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-2xl p-4 flex items-center gap-4"
                  style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}
                >
                  {/* Status icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: sc.bg, color: sc.color }}>
                    <StatusIcon status={inv.status} />
                  </div>

                  {/* Invoice details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm font-mono" style={{ color: 'var(--text-base)' }}>
                        {inv.invoice_num}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: inv.service === 'voice' ? 'rgba(124,58,237,0.1)' : 'rgba(29,78,216,0.1)',
                                 color: inv.service === 'voice' ? '#7c3aed' : '#1d4ed8' }}>
                        <ServiceIcon service={inv.service} />
                        {inv.service === 'voice'
                          ? (isAr ? 'الوكيل الصوتي' : 'Voice Agent')
                          : (isAr ? 'رؤية AI' : 'AI Vision')}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: sc.bg, color: sc.color }}>
                        {inv.status === 'paid'
                          ? (isAr ? 'مدفوعة' : 'Paid')
                          : inv.status === 'failed'
                          ? (isAr ? 'فاشلة' : 'Failed')
                          : (isAr ? 'معلقة' : 'Pending')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {tierLabel(inv.tier, isAr ? 'ar' : 'en')}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(inv.initiated_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </span>
                      {inv.end_date && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {isAr ? 'صالح حتى' : 'Valid until'}: {formatSaudiDate(inv.end_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount + download */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-base font-black" style={{ color: sc.color }}>
                      {Number(amount).toLocaleString()} {isAr ? 'ر.س' : 'SAR'}
                    </span>
                    {inv.status === 'paid' && (
                      <button
                        onClick={() => generateInvoicePDF(inv, profile?.full_name || '', isAr)}
                        className="flex items-center gap-1 text-[11px] font-semibold transition-colors hover:opacity-80"
                        style={{ color: 'var(--primary)' }}
                      >
                        <Download size={11} />
                        {isAr ? 'تحميل' : 'PDF'}
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border transition-colors disabled:opacity-40"
            style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <ChevronRight size={16} />
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border transition-colors disabled:opacity-40"
            style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {/* Legal note */}
      <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'جميع الفواتير تشمل ضريبة القيمة المضافة (15٪) حيث ينطبق · SplitTech AI · info@splittech.sa'
          : 'All invoices include VAT (15%) where applicable · SplitTech AI · info@splittech.sa'}
      </p>

    </div>
  )
}
