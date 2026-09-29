import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, Receipt, Search, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatSaudiDate, tierLabel } from '../../lib/utils'
import Badge from '../../components/ui/Badge'

interface Transaction {
  id: string
  invoice_num: string
  moyasar_id: string
  amount: number
  currency: string
  status: string
  initiated_at: string
  email: string
  full_name: string
  store_name: string
  tier: string
  service: string
  end_date: string
}

interface Metrics {
  total_transactions: string
  total_revenue: string
  mrr: string
  arr_ytd: string
  new_this_month: string
}

async function fetchBilling(search: string, page: number) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthenticated')
  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('search', search)
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/admin/billing?${params}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch billing data')
  return res.json() as Promise<{ transactions: Transaction[]; metrics: Metrics; page: number; limit: number }>
}

export default function BillingLedger() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-billing', search, page],
    queryFn: () => fetchBilling(search, page),
    staleTime: 30_000,
  })

  const metrics = data?.metrics
  const txs = data?.transactions ?? []

  function handleSearch() {
    setSearch(searchInput.trim())
    setPage(1)
  }

  const MetricCard = ({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center">
          <Icon size={18} className="text-brand-700" />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      <p className="text-2xl font-black" style={{ color: 'var(--text-base)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'سجل الفواتير والمدفوعات' : 'Billing & Payments Ledger'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'جميع معاملات الاشتراك من بيئة الإنتاج' : 'All live subscription transactions'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={DollarSign}
          label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
          value={`${Number(metrics?.total_revenue || 0).toFixed(2)} ر.س`}
          sub={isAr ? `${metrics?.total_transactions || 0} عملية` : `${metrics?.total_transactions || 0} transactions`}
        />
        <MetricCard
          icon={TrendingUp}
          label={isAr ? 'إيرادات هذا الشهر (MRR)' : 'This Month (MRR)'}
          value={`${Number(metrics?.mrr || 0).toFixed(2)} ر.س`}
          sub={isAr ? `${metrics?.new_this_month || 0} اشتراك جديد` : `${metrics?.new_this_month || 0} new subscriptions`}
        />
        <MetricCard
          icon={TrendingUp}
          label={isAr ? 'إيرادات هذا العام (YTD)' : 'Year to Date (ARR)'}
          value={`${Number(metrics?.arr_ytd || 0).toFixed(2)} ر.س`}
        />
        <MetricCard
          icon={Receipt}
          label={isAr ? 'إجمالي الفواتير' : 'Total Invoices'}
          value={String(metrics?.total_transactions || 0)}
        />
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 rtl:right-auto rtl:left-3" style={{ color: 'var(--text-faint)' }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={isAr ? 'بحث برقم الفاتورة، الإيميل، أو معرّف موثر…' : 'Search by invoice #, email, or Moyasar ID…'}
            className="w-full rounded-xl border px-4 py-2.5 pr-9 rtl:pl-9 text-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-base)' }}
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 text-white"
        >
          {isAr ? 'بحث' : 'Search'}
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                {[
                  isAr ? 'رقم الفاتورة' : 'Invoice #',
                  isAr ? 'المشترك' : 'Subscriber',
                  isAr ? 'الباقة' : 'Plan',
                  isAr ? 'المبلغ' : 'Amount',
                  isAr ? 'تاريخ الدفع' : 'Payment Date',
                  isAr ? 'صالح حتى' : 'Valid Until',
                  isAr ? 'الحالة' : 'Status',
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-right rtl:text-right ltr:text-left font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded animate-pulse w-3/4" style={{ background: 'var(--bg-muted)' }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && txs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                    {isAr ? 'لا توجد معاملات' : 'No transactions found'}
                  </td>
                </tr>
              )}

              {txs.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--bg-muted)] transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-xs" style={{ color: 'var(--text-base)' }}>
                    {tx.invoice_num}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm" style={{ color: 'var(--text-base)' }}>{tx.full_name || '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tx.email}</p>
                    {tx.store_name && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{tx.store_name}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-base)' }}>
                    SPLIT {tx.service === 'voice' ? 'Voice' : 'Vision'} — {tierLabel(tx.tier, lang)}
                  </td>
                  <td className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: 'var(--text-base)' }}>
                    {Number(tx.amount).toFixed(2)} <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>ر.س</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-muted)' }}>
                    {formatSaudiDate(tx.initiated_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-muted)' }}>
                    {tx.end_date ? formatSaudiDate(tx.end_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="active">{isAr ? 'مدفوع' : 'Paid'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {txs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? `صفحة ${page}` : `Page ${page}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {isAr ? 'السابق' : 'Prev'}
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={txs.length < 50}
                className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-40"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
