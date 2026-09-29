import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart2, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, XCircle,
  Minus, RefreshCw, Download, Loader, Calendar, Sparkles, Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMyStores } from '../../hooks/useBranches'
import { formatRelative } from '../../lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type Period = '7d' | '30d' | '90d'

interface DayRow {
  day: string
  total: number
  avg_score: number | null
  pass: number
  warn: number
  fail: number
}

interface Totals {
  total: number
  avg_score: number | null
  best_score: number | null
  worst_score: number | null
  pass: number
  warn: number
  fail: number
}

interface HeatCell {
  dow: number
  hour: number
  count: number
  avg_score: number | null
}

interface RecentAudit {
  id: string
  score: number
  status: string
  created_at: string
  observations: Array<{ question: string; answer: string }> | string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(s: number | null): string {
  if (s === null) return 'var(--text-muted)'
  if (s >= 75) return '#16a34a'
  if (s >= 50) return '#d97706'
  return '#dc2626'
}

function scoreBg(s: number | null): string {
  if (s === null) return 'var(--bg-subtle)'
  if (s >= 75) return 'rgba(22,163,74,0.12)'
  if (s >= 50) return 'rgba(217,119,6,0.12)'
  return 'rgba(220,38,38,0.12)'
}

async function fetchAnalytics(period: Period, storeId?: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthenticated')
  const params = new URLSearchParams({ period })
  if (storeId) params.set('store_id', storeId)
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/analytics/summary?${params}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  )
  if (!res.ok) throw new Error('Failed to load analytics')
  return res.json() as Promise<{
    daily: DayRow[]
    totals: Totals
    heatmap: HeatCell[]
    recent: RecentAudit[]
    period: Period
    store_id: string
  }>
}

// ── Score Line Chart (SVG) ────────────────────────────────────────────────────
function ScoreLineChart({ daily, isAr }: { daily: DayRow[]; isAr: boolean }) {
  const W = 600, H = 160, PAD = { t: 16, r: 12, b: 32, l: 36 }
  const pts = daily.filter(d => d.avg_score !== null)

  if (pts.length < 2) {
    return (
      <div className="flex items-center justify-center h-40" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        {isAr ? '— بيانات غير كافية —' : '— Not enough data —'}
      </div>
    )
  }

  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  const minY = 0, maxY = 100

  const xs = pts.map((_, i) => PAD.l + (i / (pts.length - 1)) * iW)
  const ys = pts.map(d => PAD.t + (1 - (d.avg_score! - minY) / (maxY - minY)) * iH)

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${xs[xs.length - 1]},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`

  // Grid lines at 25, 50, 75, 100
  const gridYs = [25, 50, 75, 100].map(v => PAD.t + (1 - v / 100) * iH)

  // X-axis labels (show ~6 evenly)
  const labelStep = Math.max(1, Math.floor(pts.length / 6))
  const labelIdxs = pts.map((_, i) => i).filter(i => i % labelStep === 0 || i === pts.length - 1)

  const lastScore = pts[pts.length - 1].avg_score!
  const lineColor = scoreColor(lastScore)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
      <defs>
        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {gridYs.map((gy, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy}
            stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3,3" />
          <text x={PAD.l - 6} y={gy + 4} textAnchor="end"
            fontSize={9} fill="var(--text-muted)">{[25, 50, 75, 100][i]}</text>
        </g>
      ))}

      {/* Fill */}
      <path d={fillPath} fill="url(#chart-grad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points */}
      {pts.map((d, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r={3.5} fill={scoreColor(d.avg_score)} stroke="var(--bg-card)" strokeWidth={1.5} />
        </g>
      ))}

      {/* X-axis labels */}
      {labelIdxs.map(i => (
        <text key={i} x={xs[i]} y={H - PAD.b + 14} textAnchor="middle"
          fontSize={9} fill="var(--text-muted)">
          {new Date(pts[i].day).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  )
}

// ── Stacked Bar Chart ─────────────────────────────────────────────────────────
function StackedBarChart({ daily, isAr }: { daily: DayRow[]; isAr: boolean }) {
  if (!daily.length) return null
  const maxTotal = Math.max(...daily.map(d => d.total), 1)

  return (
    <div className="flex items-end gap-0.5 h-20 w-full">
      {daily.map((d, i) => {
        const height = Math.max(4, (d.total / maxTotal) * 80)
        const passH  = d.total ? (d.pass / d.total) * height : 0
        const warnH  = d.total ? (d.warn / d.total) * height : 0
        const failH  = d.total ? (d.fail / d.total) * height : 0
        return (
          <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.day}\n✅ ${d.pass} ⚠️ ${d.warn} ❌ ${d.fail}`}>
            <div style={{ height: failH,  background: '#dc2626', borderRadius: '2px 2px 0 0' }} />
            <div style={{ height: warnH,  background: '#d97706' }} />
            <div style={{ height: passH,  background: '#16a34a', borderRadius: failH > 0 || warnH > 0 ? 0 : '2px 2px 0 0' }} />
          </div>
        )
      })}
    </div>
  )
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function AuditHeatmap({ heatmap, isAr }: { heatmap: HeatCell[]; isAr: boolean }) {
  const cellMap: Record<string, HeatCell> = {}
  heatmap.forEach(c => { cellMap[`${c.dow}-${c.hour}`] = c })
  const maxCount = Math.max(...heatmap.map(c => c.count), 1)

  const dows = isAr
    ? ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const peakHours = [9, 12, 15, 18, 21]

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 500 }}>
        {/* Hour labels */}
        <div className="flex gap-0.5 mb-1 ms-8">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center" style={{ fontSize: 8, color: 'var(--text-muted)' }}>
              {peakHours.includes(h) ? h : ''}
            </div>
          ))}
        </div>
        {/* Rows */}
        {[0, 1, 2, 3, 4, 5, 6].map(dow => (
          <div key={dow} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-8 text-[9px] flex-shrink-0 text-end pe-1" style={{ color: 'var(--text-muted)' }}>
              {dows[dow]}
            </span>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = cellMap[`${dow}-${h}`]
              const intensity = cell ? cell.count / maxCount : 0
              const bg = cell
                ? `rgba(0, 108, 53, ${0.1 + intensity * 0.9})`
                : 'var(--bg-subtle)'
              return (
                <div
                  key={h}
                  className="flex-1 rounded-sm"
                  style={{ height: 14, background: bg }}
                  title={cell ? `${dows[dow]} ${h}:00 — ${cell.count} ${isAr ? 'تدقيق' : 'audits'} · ${cell.avg_score ?? '—'}%` : ''}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PDF Report ────────────────────────────────────────────────────────────────
function exportReport(totals: Totals, period: Period, storeName: string, isAr: boolean) {
  const periodLabel = period === '7d' ? (isAr ? '7 أيام' : '7 days')
    : period === '30d' ? (isAr ? '30 يوم' : '30 days')
    : (isAr ? '90 يوم' : '90 days')

  const html = `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head><meta charset="UTF-8"/><title>${isAr ? 'تقرير الأداء' : 'Performance Report'} — ${storeName}</title>
<style>
  body{font-family:'Segoe UI',Tahoma,sans-serif;padding:40px;color:#1f2937}
  h1{font-size:22px;font-weight:900;color:#006c35;margin-bottom:4px}
  .sub{font-size:13px;color:#6b7280;margin-bottom:32px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
  .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center}
  .card .val{font-size:28px;font-weight:900;margin-bottom:4px}
  .card .lbl{font-size:11px;color:#6b7280;font-weight:600}
  .pass{color:#16a34a}.warn{color:#d97706}.fail{color:#dc2626}.avg{color:#1d4ed8}
  .footer{margin-top:40px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:11px;color:#9ca3af;text-align:center}
</style></head><body>
<h1>SplitTech AI — ${isAr ? 'تقرير الأداء' : 'Performance Report'}</h1>
<div class="sub">${storeName} · ${isAr ? 'الفترة:' : 'Period:'} ${periodLabel} · ${new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}</div>
<div class="grid">
  <div class="card"><div class="val avg">${totals.avg_score ?? '—'}%</div><div class="lbl">${isAr ? 'متوسط الدرجة' : 'Avg Score'}</div></div>
  <div class="card"><div class="val pass">${totals.pass}</div><div class="lbl">${isAr ? 'ناجح' : 'Pass'}</div></div>
  <div class="card"><div class="val warn">${totals.warn}</div><div class="lbl">${isAr ? 'تحذير' : 'Warning'}</div></div>
  <div class="card"><div class="val fail">${totals.fail}</div><div class="lbl">${isAr ? 'فاشل' : 'Fail'}</div></div>
  <div class="card"><div class="val" style="color:#1f2937">${totals.total}</div><div class="lbl">${isAr ? 'إجمالي التدقيقات' : 'Total Audits'}</div></div>
  <div class="card"><div class="val pass">${totals.best_score ?? '—'}%</div><div class="lbl">${isAr ? 'أعلى درجة' : 'Best Score'}</div></div>
  <div class="card"><div class="val fail">${totals.worst_score ?? '—'}%</div><div class="lbl">${isAr ? 'أدنى درجة' : 'Worst Score'}</div></div>
  <div class="card"><div class="val avg">${totals.total ? Math.round(totals.pass / totals.total * 100) : 0}%</div><div class="lbl">${isAr ? 'معدل النجاح' : 'Pass Rate'}</div></div>
</div>
<div class="footer">SplitTech AI · info@splittech.sa · ${isAr ? 'تقرير تلقائي' : 'Auto-generated report'}</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 400)
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { lang } = useLanguage()
  const { profile } = useAuth()
  const isAr = lang === 'ar'
  const [period, setPeriod] = useState<Period>('30d')
  const [selectedStore, setSelectedStore] = useState<string | undefined>()

  const { data: stores = [] } = useMyStores()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['analytics-summary', period, selectedStore],
    queryFn: () => fetchAnalytics(period, selectedStore),
    staleTime: 2 * 60_000,
  })

  const daily   = data?.daily   ?? []
  const totals  = data?.totals  ?? {} as Totals
  const heatmap = data?.heatmap ?? []
  const recent  = data?.recent  ?? []

  const passRate = totals.total ? Math.round((totals.pass ?? 0) / totals.total * 100) : 0

  const trendDelta = useMemo(() => {
    if (daily.length < 4) return null
    const half = Math.floor(daily.length / 2)
    const firstHalf = daily.slice(0, half).filter(d => d.avg_score !== null)
    const lastHalf  = daily.slice(half).filter(d => d.avg_score !== null)
    if (!firstHalf.length || !lastHalf.length) return null
    const avgFirst = firstHalf.reduce((s, d) => s + (d.avg_score ?? 0), 0) / firstHalf.length
    const avgLast  = lastHalf.reduce((s, d)  => s + (d.avg_score ?? 0), 0) / lastHalf.length
    return Math.round(avgLast - avgFirst)
  }, [daily])

  const periodOptions: { key: Period; label: string }[] = [
    { key: '7d',  label: isAr ? '7 أيام'  : '7 Days'  },
    { key: '30d', label: isAr ? '30 يوم'  : '30 Days' },
    { key: '90d', label: isAr ? '90 يوم'  : '90 Days' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={20} color="white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'تحليلات الأداء' : 'Performance Analytics'}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'نظرة شاملة على أداء متجرك عبر الزمن' : 'Full performance overview over time'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Store selector (if multiple) */}
          {stores.length > 1 && (
            <select
              value={selectedStore ?? ''}
              onChange={e => setSelectedStore(e.target.value || undefined)}
              className="text-sm rounded-lg px-3 py-2 border outline-none"
              style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', color: 'var(--text-base)' }}
            >
              <option value="">{isAr ? 'كل الفروع' : 'All branches'}</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.branch_name || s.store_name}</option>
              ))}
            </select>
          )}
          {/* Period selector */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {periodOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: period === opt.key ? 'var(--primary)' : 'var(--bg-card)',
                  color: period === opt.key ? '#fff' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => data && exportReport(totals, period, stores[0]?.store_name ?? (profile?.full_name ?? ''), isAr)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <Download size={14} />
            PDF
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg transition-colors"
            style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: isAr ? 'متوسط الدرجة' : 'Avg Score',
                value: totals.avg_score !== null && totals.avg_score !== undefined ? `${totals.avg_score}%` : '—',
                color: scoreColor(totals.avg_score ?? null),
                bg:    scoreBg(totals.avg_score ?? null),
                icon:  <Sparkles size={15} />,
                sub:   trendDelta !== null ? (
                  <span style={{ color: trendDelta >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: 11 }}>
                    {trendDelta >= 0 ? <TrendingUp size={11} style={{ display: 'inline' }} /> : <TrendingDown size={11} style={{ display: 'inline' }} />}
                    {' '}{trendDelta >= 0 ? '+' : ''}{trendDelta}%
                  </span>
                ) : null,
              },
              {
                label: isAr ? 'معدل النجاح' : 'Pass Rate',
                value: `${passRate}%`,
                color: passRate >= 70 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#dc2626',
                bg:    scoreBg(passRate),
                icon:  <CheckCircle2 size={15} />,
                sub:   <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{totals.pass ?? 0} {isAr ? 'ناجح' : 'passed'}</span>,
              },
              {
                label: isAr ? 'إجمالي التدقيقات' : 'Total Audits',
                value: totals.total ?? 0,
                color: '#3b82f6',
                bg:    'rgba(59,130,246,0.1)',
                icon:  <BarChart2 size={15} />,
                sub:   <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{daily.length} {isAr ? 'يوم نشط' : 'active days'}</span>,
              },
              {
                label: isAr ? 'أعلى / أدنى درجة' : 'Best / Worst',
                value: `${totals.best_score ?? '—'} / ${totals.worst_score ?? '—'}`,
                color: '#8b5cf6',
                bg:    'rgba(139,92,246,0.1)',
                icon:  <Calendar size={15} />,
                sub:   <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{isAr ? 'خلال الفترة' : 'in period'}</span>,
              },
            ].map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-2xl p-4"
                style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg"
                    style={{ background: card.bg, color: card.color }}>
                    {card.icon}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {card.label}
                  </span>
                </div>
                <p className="text-xl font-black" style={{ color: card.color }}>{card.value}</p>
                {card.sub && <div className="mt-1">{card.sub}</div>}
              </motion.div>
            ))}
          </div>

          {/* ── Pass/Warn/Fail breakdown ── */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'توزيع نتائج التدقيق' : 'Audit Result Distribution'}
            </p>
            <div className="flex gap-3 mb-3">
              {[
                { label: isAr ? 'ناجح' : 'Pass',    count: totals.pass ?? 0, color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   icon: <CheckCircle2 size={13} /> },
                { label: isAr ? 'تحذير' : 'Warning', count: totals.warn ?? 0, color: '#d97706', bg: 'rgba(217,119,6,0.1)',   icon: <AlertCircle size={13} /> },
                { label: isAr ? 'فاشل' : 'Fail',     count: totals.fail ?? 0, color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   icon: <XCircle size={13} /> },
              ].map((s, i) => (
                <div key={i} className="flex-1 rounded-xl p-3 flex items-center gap-2"
                  style={{ background: s.bg }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <div>
                    <p className="text-lg font-black" style={{ color: s.color }}>{s.count}</p>
                    <p className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Distribution bar */}
            {(totals.total ?? 0) > 0 && (
              <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
                {(totals.pass ?? 0) > 0 && (
                  <div style={{ flex: totals.pass, background: '#16a34a' }} title={`${totals.pass} pass`} />
                )}
                {(totals.warn ?? 0) > 0 && (
                  <div style={{ flex: totals.warn, background: '#d97706' }} title={`${totals.warn} warn`} />
                )}
                {(totals.fail ?? 0) > 0 && (
                  <div style={{ flex: totals.fail, background: '#dc2626' }} title={`${totals.fail} fail`} />
                )}
              </div>
            )}
          </motion.div>

          {/* ── Score trend line chart ── */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'منحنى متوسط الدرجة' : 'Average Score Trend'}
              </p>
              {trendDelta !== null && (
                <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    background: trendDelta >= 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                    color: trendDelta >= 0 ? '#16a34a' : '#dc2626',
                  }}>
                  {trendDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {trendDelta >= 0 ? '+' : ''}{trendDelta}%
                  <span className="font-normal opacity-70">{isAr ? 'مقارنة ببداية الفترة' : 'vs start of period'}</span>
                </span>
              )}
            </div>
            <ScoreLineChart daily={daily} isAr={isAr} />
          </motion.div>

          {/* ── Daily audit count (stacked bars) ── */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'التدقيقات اليومية' : 'Daily Audits'}
              </p>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1" style={{ color: '#16a34a' }}><span className="w-2 h-2 rounded-full bg-[#16a34a]" /> {isAr ? 'ناجح' : 'Pass'}</span>
                <span className="flex items-center gap-1" style={{ color: '#d97706' }}><span className="w-2 h-2 rounded-full bg-[#d97706]" /> {isAr ? 'تحذير' : 'Warn'}</span>
                <span className="flex items-center gap-1" style={{ color: '#dc2626' }}><span className="w-2 h-2 rounded-full bg-[#dc2626]" /> {isAr ? 'فاشل' : 'Fail'}</span>
              </div>
            </div>
            <StackedBarChart daily={daily} isAr={isAr} />
            {/* X-axis date labels */}
            {daily.length > 0 && (
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(daily[0].day).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(daily[daily.length - 1].day).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </motion.div>

          {/* ── Activity heatmap ── */}
          {heatmap.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
              className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'خريطة النشاط (يوم × ساعة)' : 'Activity Heatmap (Day × Hour)'}
              </p>
              <AuditHeatmap heatmap={heatmap} isAr={isAr} />
              <div className="flex items-center justify-end gap-2 mt-2">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{isAr ? 'أقل' : 'Less'}</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map((op, i) => (
                  <span key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(0,108,53,${op})` }} />
                ))}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{isAr ? 'أكثر' : 'More'}</span>
              </div>
            </motion.div>
          )}

          {/* ── Recent audits ── */}
          {recent.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'آخر التدقيقات' : 'Recent Audits'}
              </p>
              <div className="space-y-2">
                {recent.map((audit, i) => (
                  <motion.div
                    key={audit.id}
                    initial={{ opacity: 0, x: isAr ? 8 : -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--bg-subtle)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{ background: scoreBg(audit.score), color: scoreColor(audit.score) }}>
                      {audit.score}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {audit.status === 'pass'
                          ? <CheckCircle2 size={12} color="#16a34a" />
                          : audit.status === 'fail'
                          ? <XCircle size={12} color="#dc2626" />
                          : <AlertCircle size={12} color="#d97706" />}
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-base)' }}>
                          {audit.status === 'pass'
                            ? (isAr ? 'ناجح' : 'Pass')
                            : audit.status === 'fail'
                            ? (isAr ? 'فاشل' : 'Fail')
                            : (isAr ? 'تحذير' : 'Warning')}
                        </span>
                      </div>
                      {(() => {
                        const obs = audit.observations
                        if (!obs) return null
                        if (typeof obs === 'string') return (
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{obs}</p>
                        )
                        if (Array.isArray(obs) && obs.length > 0) return (
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{obs[0].question}</p>
                        )
                        return null  // object / empty array → render nothing
                      })()}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={10} />
                      {formatRelative(audit.created_at, lang)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Empty state */}
          {!isLoading && (totals.total ?? 0) === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl p-14 text-center"
              style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
              <BarChart2 size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
              <p className="font-semibold" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'لا توجد بيانات لهذه الفترة' : 'No data for this period'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {isAr ? 'تأكد من أن محرك التدقيق يعمل' : 'Make sure the audit engine is running'}
              </p>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
