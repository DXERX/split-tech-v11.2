import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Phone, Mail, MapPin, Store, Calendar,
  CheckCircle, XCircle, PhoneCall, RefreshCw, ChevronDown,
  Download, Search, Filter,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { formatSaudiDate } from '../../lib/utils'

// ── Types ────────────────────────────────────────────────────
type LeadStatus = 'new' | 'contacted' | 'converted' | 'rejected'

interface Lead {
  id: string
  created_at: string
  full_name: string
  store_name: string
  business_type: string
  phone: string
  email: string
  city: string
  notes: string | null
  lang: string
  source: string
  status: LeadStatus
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { labelAr: string; labelEn: string; color: string; icon: React.ReactNode }> = {
  new:       { labelAr: 'جديد',      labelEn: 'New',       color: 'blue',   icon: <Users size={12} /> },
  contacted: { labelAr: 'تم التواصل', labelEn: 'Contacted', color: 'yellow', icon: <PhoneCall size={12} /> },
  converted: { labelAr: 'تم التحويل', labelEn: 'Converted', color: 'green',  icon: <CheckCircle size={12} /> },
  rejected:  { labelAr: 'مرفوض',     labelEn: 'Rejected',  color: 'red',    icon: <XCircle size={12} /> },
}

const BUSINESS_LABELS: Record<string, { ar: string; en: string }> = {
  retail:     { ar: 'بيع بالتجزئة', en: 'Retail' },
  restaurant: { ar: 'مطعم',         en: 'Restaurant' },
  logistics:  { ar: 'لوجستيات',    en: 'Logistics' },
  laundry:    { ar: 'غسيل ملابس',   en: 'Laundry' },
  other:      { ar: 'أخرى',         en: 'Other' },
}

const TABS: { key: LeadStatus | 'all'; labelAr: string; labelEn: string }[] = [
  { key: 'all',       labelAr: 'الكل',       labelEn: 'All' },
  { key: 'new',       labelAr: 'جديد',       labelEn: 'New' },
  { key: 'contacted', labelAr: 'تم التواصل', labelEn: 'Contacted' },
  { key: 'converted', labelAr: 'تم التحويل', labelEn: 'Converted' },
  { key: 'rejected',  labelAr: 'مرفوض',      labelEn: 'Rejected' },
]

// ── CSV export ───────────────────────────────────────────────
function exportCSV(leads: Lead[]) {
  const headers = ['الاسم', 'المتجر', 'نوع النشاط', 'الهاتف', 'البريد', 'المدينة', 'الحالة', 'التاريخ']
  const rows = leads.map((l) => [
    l.full_name, l.store_name, l.business_type, l.phone, l.email, l.city, l.status,
    new Date(l.created_at).toLocaleDateString('ar-SA'),
  ])
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'early_access_leads.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Row detail (expandable) ───────────────────────────────────
function LeadRow({
  lead, isAr, onStatusChange, expanded, onToggle,
}: {
  lead: Lead
  isAr: boolean
  onStatusChange: (id: string, status: LeadStatus) => void
  expanded: boolean
  onToggle: () => void
}) {
  const sc = STATUS_CONFIG[lead.status]
  const bizLabel = BUSINESS_LABELS[lead.business_type]
  const [changeOpen, setChangeOpen] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        style={{ background: 'var(--surface)' }}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: 'var(--primary-10)', color: 'var(--primary)' }}>
          {lead.full_name.charAt(0)}
        </div>

        {/* Name + store */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{lead.full_name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {lead.store_name} · {isAr ? (bizLabel?.ar ?? lead.business_type) : (bizLabel?.en ?? lead.business_type)}
          </p>
        </div>

        {/* City */}
        <div className="hidden sm:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MapPin size={12} />{lead.city}
        </div>

        {/* Date */}
        <div className="hidden md:block text-xs" style={{ color: 'var(--text-muted)' }}>
          {formatSaudiDate(lead.created_at)}
        </div>

        {/* Status badge */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            onClick={(e) => { e.stopPropagation(); setChangeOpen((v) => !v) }}
          >
            {sc.icon}
            <span>{isAr ? sc.labelAr : sc.labelEn}</span>
            <ChevronDown size={10} />
          </button>
          <AnimatePresence>
            {changeOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 mt-1 right-0 w-40 rounded-xl shadow-xl border overflow-hidden"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([k, v]) => (
                  <button
                    key={k}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80 transition-colors text-start"
                    style={{
                      background: lead.status === k ? 'var(--primary-10)' : 'transparent',
                      color: lead.status === k ? 'var(--primary)' : 'var(--text)',
                    }}
                    onClick={() => { onStatusChange(lead.id, k); setChangeOpen(false) }}
                  >
                    {v.icon} {isAr ? v.labelAr : v.labelEn}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ChevronDown
          size={14}
          className="transition-transform shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-muted)' }}
        />
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>

              <Detail icon={<Phone size={13} />} label={isAr ? 'الهاتف' : 'Phone'}>
                <a href={`tel:${lead.phone}`} className="text-blue-500 hover:underline">{lead.phone}</a>
              </Detail>

              <Detail icon={<Mail size={13} />} label={isAr ? 'البريد الإلكتروني' : 'Email'}>
                <a href={`mailto:${lead.email}`} className="text-blue-500 hover:underline">{lead.email}</a>
              </Detail>

              <Detail icon={<MapPin size={13} />} label={isAr ? 'المدينة' : 'City'}>
                {lead.city}
              </Detail>

              <Detail icon={<Store size={13} />} label={isAr ? 'نوع النشاط' : 'Business Type'}>
                {isAr ? (BUSINESS_LABELS[lead.business_type]?.ar ?? lead.business_type) : (BUSINESS_LABELS[lead.business_type]?.en ?? lead.business_type)}
              </Detail>

              <Detail icon={<Calendar size={13} />} label={isAr ? 'تاريخ التسجيل' : 'Registered'}>
                {new Date(lead.created_at).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
              </Detail>

              <Detail icon={<Filter size={13} />} label={isAr ? 'المصدر' : 'Source'}>
                {lead.source}
              </Detail>

              {lead.notes && (
                <div className="sm:col-span-2">
                  <Detail icon={<Filter size={13} />} label={isAr ? 'ملاحظات' : 'Notes'}>
                    {lead.notes}
                  </Detail>
                </div>
              )}

              {/* WhatsApp quick action */}
              <div className="sm:col-span-2 flex gap-2 pt-1">
                <a
                  href={`https://wa.me/966${lead.phone.replace(/^0/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: '#25D366' }}
                >
                  <Phone size={12} /> واتساب
                </a>
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  <Mail size={12} /> {isAr ? 'إرسال بريد' : 'Email'}
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm" style={{ color: 'var(--text)' }}>{children}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function EarlyAccessLeads() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<LeadStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Fetch leads ──────────────────────────────────────────────
  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['early-access-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('early_access_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lead[]
    },
    refetchInterval: 60_000,
  })

  // ── Update status ────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from('early_access_requests')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['early-access-leads'] }),
  })

  // ── Filter ───────────────────────────────────────────────────
  const filtered = leads.filter((l) => {
    const matchTab = activeTab === 'all' || l.status === activeTab
    const q = search.toLowerCase()
    const matchSearch = !q || [l.full_name, l.store_name, l.phone, l.email, l.city].some((v) => v.toLowerCase().includes(q))
    return matchTab && matchSearch
  })

  // ── Counts ───────────────────────────────────────────────────
  const counts: Record<string, number> = { all: leads.length }
  for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1

  return (
    <div className="p-4 md:p-6 space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {isAr ? 'طلبات الوصول المبكر' : 'Early Access Leads'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isAr ? `${leads.length} طلب مسجّل` : `${leads.length} registered request${leads.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['early-access-leads'] })}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={13} /> {isAr ? 'تحديث' : 'Refresh'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5"
          >
            <Download size={13} /> {isAr ? 'تصدير CSV' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl p-3 border cursor-pointer transition-all hover:scale-[1.02]"
            style={{
              borderColor: activeTab === k ? 'var(--primary)' : 'var(--border)',
              background: activeTab === k ? 'var(--primary-10)' : 'var(--surface)',
            }}
            onClick={() => setActiveTab((prev) => prev === k ? 'all' : k)}
          >
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{counts[k] ?? 0}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? v.labelAr : v.labelEn}
            </p>
          </div>
        ))}
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم، المتجر، الهاتف...' : 'Search by name, store, phone...'}
            className="w-full rounded-lg border text-sm py-2 ps-8 pe-3 outline-none focus:ring-1"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: activeTab === tab.key ? 'var(--primary)' : 'var(--surface-2)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {isAr ? tab.labelAr : tab.labelEn}
              {counts[tab.key] !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--border)',
                  }}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isAr ? 'لا توجد نتائج' : 'No results found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isAr={isAr}
                expanded={expandedId === lead.id}
                onToggle={() => setExpandedId((prev) => prev === lead.id ? null : lead.id)}
                onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
