import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Phone, Mail, Building2, Calendar,
  CheckCircle, XCircle, Clock, RefreshCw, ChevronDown,
  Download, Search, Loader2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import Button from '../../components/ui/Button'
import { formatSaudiDate } from '../../lib/utils'

// ── Types ─────────────────────────────────────────────────────
type RequestStatus = 'new' | 'in_progress' | 'resolved' | 'closed'

interface ContactRequest {
  id: string
  created_at: string
  full_name: string
  company: string | null
  phone: string
  email: string
  subject: string
  message: string
  lang: string
  source: string
  status: RequestStatus
}

// ── Status config ─────────────────────────────────────────────
const STATUS: Record<RequestStatus, { ar: string; en: string; color: string; icon: React.ReactNode }> = {
  new:         { ar: 'جديد',      en: 'New',         color: '#3b82f6', icon: <MessageSquare size={11} /> },
  in_progress: { ar: 'قيد المعالجة', en: 'In Progress', color: '#f59e0b', icon: <Clock size={11} /> },
  resolved:    { ar: 'تم الحل',   en: 'Resolved',    color: '#22c55e', icon: <CheckCircle size={11} /> },
  closed:      { ar: 'مغلق',      en: 'Closed',      color: '#6b7280', icon: <XCircle size={11} /> },
}

const TABS: { key: RequestStatus | 'all'; ar: string; en: string }[] = [
  { key: 'all',         ar: 'الكل',          en: 'All' },
  { key: 'new',         ar: 'جديد',           en: 'New' },
  { key: 'in_progress', ar: 'قيد المعالجة',  en: 'In Progress' },
  { key: 'resolved',    ar: 'تم الحل',        en: 'Resolved' },
  { key: 'closed',      ar: 'مغلق',           en: 'Closed' },
]

// ── CSV export ─────────────────────────────────────────────────
function exportCSV(rows: ContactRequest[]) {
  const h = ['الاسم', 'الشركة', 'الهاتف', 'البريد', 'الموضوع', 'الحالة', 'التاريخ']
  const r = rows.map((c) => [
    c.full_name, c.company ?? '', c.phone, c.email, c.subject, c.status,
    new Date(c.created_at).toLocaleDateString('ar-SA'),
  ])
  const csv = [h, ...r].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'contact_requests.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Request row ───────────────────────────────────────────────
function RequestRow({
  req, isAr, expanded, onToggle, onStatus,
}: {
  req: ContactRequest; isAr: boolean; expanded: boolean
  onToggle: () => void; onStatus: (id: string, s: RequestStatus) => void
}) {
  const sc = STATUS[req.status]
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: 'var(--primary-10)', color: 'var(--primary)' }}
        >
          {req.full_name.charAt(0)}
        </div>

        {/* Name + subject */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{req.full_name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{req.subject}</p>
        </div>

        {/* Company */}
        {req.company && (
          <div className="hidden sm:flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Building2 size={11} />{req.company}
          </div>
        )}

        {/* Date */}
        <div className="hidden md:block text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          {formatSaudiDate(req.created_at)}
        </div>

        {/* Status badge + change */}
        <div className="relative shrink-0">
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-opacity hover:opacity-80"
            style={{ color: sc.color, borderColor: sc.color + '33', background: sc.color + '18' }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          >
            {sc.icon}
            <span>{isAr ? sc.ar : sc.en}</span>
            <ChevronDown size={10} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 mt-1 right-0 w-44 rounded-xl shadow-xl border overflow-hidden"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {(Object.entries(STATUS) as [RequestStatus, typeof STATUS[RequestStatus]][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => { onStatus(req.id, k); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80 text-start"
                    style={{
                      background: req.status === k ? v.color + '18' : 'transparent',
                      color: req.status === k ? v.color : 'var(--text)',
                    }}
                  >
                    {v.icon} {isAr ? v.ar : v.en}
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

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-3 border-t space-y-3"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              {/* Message */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الرسالة' : 'Message'}
                </p>
                <p className="text-sm leading-relaxed p-3 rounded-lg border" style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  {req.message}
                </p>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetaItem icon={<Phone size={12} />} label={isAr ? 'الهاتف' : 'Phone'}>
                  <a href={`tel:${req.phone}`} className="text-blue-500 hover:underline">{req.phone}</a>
                </MetaItem>
                <MetaItem icon={<Mail size={12} />} label={isAr ? 'البريد' : 'Email'}>
                  <a href={`mailto:${req.email}`} className="text-blue-500 hover:underline truncate block">{req.email}</a>
                </MetaItem>
                <MetaItem icon={<Calendar size={12} />} label={isAr ? 'التاريخ' : 'Date'}>
                  {new Date(req.created_at).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                </MetaItem>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <a
                  href={`https://wa.me/966${req.phone.replace(/^0/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ background: '#25D366' }}
                >
                  <Phone size={11} /> واتساب
                </a>
                <a
                  href={`mailto:${req.email}?subject=رد: ${req.subject}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  <Mail size={11} /> {isAr ? 'رد بالبريد' : 'Reply'}
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function MetaItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>{label}
      </p>
      <div className="text-sm" style={{ color: 'var(--text)' }}>{children}</div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function ContactRequests() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const qc = useQueryClient()

  const [tab, setTab] = useState<RequestStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fetch
  const { data: requests = [], isLoading } = useQuery<ContactRequest[]>({
    queryKey: ['contact-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        // Table may not exist yet — return empty gracefully
        if ((error as any).code === '42P01') return []
        throw error
      }
      return (data ?? []) as ContactRequest[]
    },
    refetchInterval: 60_000,
  })

  // Update status
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RequestStatus }) => {
      const { error } = await supabase.from('contact_requests').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-requests'] }),
  })

  // Filter
  const filtered = requests.filter((r) => {
    const matchTab = tab === 'all' || r.status === tab
    const q = search.toLowerCase()
    const matchSearch = !q || [r.full_name, r.company ?? '', r.phone, r.email, r.subject].some((v) => v.toLowerCase().includes(q))
    return matchTab && matchSearch
  })

  // Counts
  const counts: Record<string, number> = { all: requests.length }
  for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1

  return (
    <div className="p-4 md:p-6 space-y-5" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {isAr ? 'رسائل التواصل' : 'Contact Messages'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isAr ? `${requests.length} رسالة واردة` : `${requests.length} message${requests.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['contact-requests'] })}
            className="flex items-center gap-1.5">
            <RefreshCw size={13} /> {isAr ? 'تحديث' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5">
            <Download size={13} /> {isAr ? 'تصدير' : 'Export'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(STATUS) as [RequestStatus, typeof STATUS[RequestStatus]][]).map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl p-3 border cursor-pointer transition-all hover:scale-[1.02]"
            style={{
              borderColor: tab === k ? v.color : 'var(--border)',
              background: tab === k ? v.color + '18' : 'var(--surface)',
            }}
            onClick={() => setTab((prev) => prev === k ? 'all' : k)}
          >
            <p className="text-2xl font-bold" style={{ color: tab === k ? v.color : 'var(--text)' }}>
              {counts[k] ?? 0}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? v.ar : v.en}
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
            placeholder={isAr ? 'بحث بالاسم، الموضوع، البريد...' : 'Search by name, subject, email...'}
            className="w-full rounded-lg border text-sm py-2 ps-8 pe-3 outline-none focus:ring-1"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: tab === t.key ? 'var(--primary)' : 'var(--surface-2)',
                color: tab === t.key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {isAr ? t.ar : t.en}
              {counts[t.key] !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{ background: tab === t.key ? 'rgba(255,255,255,0.2)' : 'var(--border)' }}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isAr ? 'لا توجد رسائل' : 'No messages yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((req) => (
              <RequestRow
                key={req.id}
                req={req}
                isAr={isAr}
                expanded={expandedId === req.id}
                onToggle={() => setExpandedId((p) => p === req.id ? null : req.id)}
                onStatus={(id, s) => updateStatus.mutate({ id, status: s })}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
