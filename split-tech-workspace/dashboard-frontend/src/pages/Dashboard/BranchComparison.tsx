import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitBranch, MapPin, BarChart2, Clock, TrendingUp, TrendingDown,
  Minus, AlertCircle, CheckCircle2, XCircle, RefreshCw, ChevronRight,
  Building2, Layers, Plus, X,
} from 'lucide-react'
import { useBranchComparison, useBranchGroups, useCreateBranchGroup } from '../../hooks/useBranches'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAllMySubscriptions } from '../../hooks/useStore'
import { formatRelative } from '../../lib/utils'
import type { BranchStore } from '../../hooks/useBranches'

// ── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-muted)'
  if (score >= 75) return '#16a34a'
  if (score >= 50) return '#d97706'
  return '#dc2626'
}

function scoreBg(score: number | null): string {
  if (score === null) return 'var(--bg-subtle)'
  if (score >= 75) return 'rgba(22,163,74,0.1)'
  if (score >= 50) return 'rgba(217,119,6,0.1)'
  return 'rgba(220,38,38,0.1)'
}

function ScoreRing({ score }: { score: number | null }) {
  const r = 28
  const circumference = 2 * Math.PI * r
  const pct = score !== null ? Math.min(score, 100) / 100 : 0
  const dash = pct * circumference
  const color = scoreColor(score)

  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="flex-shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      <motion.circle
        cx={36} cy={36} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - dash }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
        style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
      />
      <text x={36} y={38} textAnchor="middle" dominantBaseline="middle"
        fontSize={score !== null ? 15 : 11}
        fontWeight={700} fill={color}>
        {score !== null ? `${score}%` : '—'}
      </text>
    </svg>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ['#f59e0b', '#94a3b8', '#b45309']
  const bg     = ['rgba(245,158,11,0.15)', 'rgba(148,163,184,0.15)', 'rgba(180,83,9,0.15)']
  const labels = ['🥇', '🥈', '🥉']
  if (rank > 3) return (
    <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
      #{rank}
    </span>
  )
  return (
    <span style={{
      background: bg[rank - 1],
      color: colors[rank - 1],
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 12,
      fontWeight: 700,
    }}>
      {labels[rank - 1]}
    </span>
  )
}

function AuditStatusIcon({ status }: { status: string | null }) {
  if (status === 'pass') return <CheckCircle2 size={14} color="#16a34a" />
  if (status === 'warn') return <AlertCircle size={14} color="#d97706" />
  if (status === 'fail') return <XCircle size={14} color="#dc2626" />
  return <Minus size={14} color="var(--text-muted)" />
}

function TrendIcon({ score }: { score: number | null }) {
  if (score === null) return null
  if (score >= 75) return <TrendingUp size={14} color="#16a34a" />
  if (score >= 50) return <Minus size={14} color="#d97706" />
  return <TrendingDown size={14} color="#dc2626" />
}

// ── Create Group Modal ────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, isAr }: { onClose: () => void; isAr: boolean }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const createGroup = useCreateBranchGroup()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createGroup.mutateAsync({ name: name.trim(), description: desc.trim() || undefined })
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('branch_groups_require_pro')) {
        alert(isAr ? 'هذه الميزة تتطلب اشتراك Pro أو Enterprise' : 'This feature requires a Pro or Enterprise subscription')
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full max-w-md rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'إنشاء مجموعة فروع' : 'Create Branch Group'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'اسم السلسلة / المجموعة' : 'Group / Chain Name'}
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isAr ? 'مثال: سلسلة البيك' : 'e.g. Al-Baik Chain'}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500"
              style={{
                background: 'var(--bg-input)',
                border: '1.5px solid var(--border)',
                color: 'var(--text-base)',
              }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'وصف (اختياري)' : 'Description (optional)'}
            </label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-brand-500"
              style={{
                background: 'var(--bg-input)',
                border: '1.5px solid var(--border)',
                color: 'var(--text-base)',
              }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={createGroup.isPending || !name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {createGroup.isPending
                ? (isAr ? 'جارٍ الإنشاء…' : 'Creating…')
                : (isAr ? 'إنشاء' : 'Create')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ── Branch Card ──────────────────────────────────────────────────────────────

function BranchCard({ branch, rank, isAr }: { branch: BranchStore; rank: number; isAr: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.06 }}
      className="rounded-2xl p-4 flex items-center gap-4"
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Rank */}
      <div className="w-10 flex justify-center flex-shrink-0">
        <RankBadge rank={rank} />
      </div>

      {/* Score ring */}
      <ScoreRing score={branch.score} />

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm truncate" style={{ color: 'var(--text-base)' }}>
            {branch.branch_name || branch.store_name}
          </span>
          {branch.group_name && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--primary-10)', color: 'var(--primary)' }}>
              {branch.group_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {branch.city && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={11} />
              {branch.city}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <AuditStatusIcon status={branch.audit_status} />
            {branch.audit_status
              ? (isAr
                  ? branch.audit_status === 'pass' ? 'ناجح' : branch.audit_status === 'warn' ? 'تحذير' : 'فاشل'
                  : branch.audit_status)
              : (isAr ? 'لا يوجد تدقيق' : 'No audit')}
          </span>
          {branch.last_audit_at && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={11} />
              {formatRelative(branch.last_audit_at)}
            </span>
          )}
        </div>
      </div>

      {/* Right: 7d audits + trend */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <TrendIcon score={branch.score} />
        <span className="text-xs font-semibold px-2 py-1 rounded-lg"
          style={{ background: scoreBg(branch.score), color: scoreColor(branch.score) }}>
          {branch.score !== null ? `${branch.score}%` : '—'}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {branch.audits_7d} {isAr ? 'تدقيق (7أيام)' : 'audits (7d)'}
        </span>
      </div>
    </motion.div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BranchComparison() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { data: branches = [], isLoading, refetch, isFetching } = useBranchComparison()
  const { data: groups = [] } = useBranchGroups()
  const { data: allSubs } = useAllMySubscriptions()
  const [showCreate, setShowCreate] = useState(false)

  const tier = allSubs?.vision?.tier || allSubs?.voice?.tier || 'basic'
  const canGroup = tier === 'pro' || tier === 'enterprise'

  const avgScore = branches.length
    ? Math.round(
        branches.filter(b => b.score !== null).reduce((s, b) => s + (b.score ?? 0), 0) /
        (branches.filter(b => b.score !== null).length || 1)
      )
    : null

  const topBranch  = branches[0] ?? null
  const totalAudits7d = branches.reduce((s, b) => s + b.audits_7d, 0)

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center flex-shrink-0">
            <GitBranch size={20} color="white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
              {isAr ? 'مقارنة الفروع' : 'Branch Comparison'}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isAr
                ? `${branches.length} فرع · مرتبة حسب الأداء`
                : `${branches.length} branches · ranked by performance`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canGroup && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}
            >
              <Plus size={14} />
              {isAr ? 'مجموعة' : 'Group'}
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {branches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: isAr ? 'عدد الفروع' : 'Total Branches',
              value: branches.length,
              icon: <Building2 size={15} />,
              color: '#3b82f6',
              bg: 'rgba(59,130,246,0.1)',
            },
            {
              label: isAr ? 'متوسط الدرجة' : 'Avg Score',
              value: avgScore !== null ? `${avgScore}%` : '—',
              icon: <BarChart2 size={15} />,
              color: scoreColor(avgScore),
              bg: scoreBg(avgScore),
            },
            {
              label: isAr ? 'أفضل فرع' : 'Top Branch',
              value: topBranch ? (topBranch.branch_name || topBranch.store_name).slice(0, 14) : '—',
              icon: <TrendingUp size={15} />,
              color: '#16a34a',
              bg: 'rgba(22,163,74,0.1)',
            },
            {
              label: isAr ? 'تدقيقات (7 أيام)' : 'Audits (7d)',
              value: totalAudits7d,
              icon: <Layers size={15} />,
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
                <span style={{ color: card.color, background: card.bg, padding: '5px', borderRadius: 8 }}>
                  {card.icon}
                </span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {card.label}
                </span>
              </div>
              <p className="text-xl font-bold truncate" style={{ color: 'var(--text-base)' }}>
                {card.value}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Groups list (if any) */}
      {groups.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'مجموعات الفروع' : 'Branch Groups'}
          </p>
          <div className="flex flex-wrap gap-2">
            {groups.map(g => (
              <span key={g.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--primary-10)', color: 'var(--primary)', border: '1px solid var(--primary-30)' }}>
                <Layers size={11} />
                {g.name}
                <span className="opacity-60">({g.branch_count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Branch list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl p-4 h-24 animate-pulse"
              style={{ background: 'var(--bg-subtle)' }} />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)' }}
        >
          <GitBranch size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
          <p className="font-semibold text-base mb-2" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'لا توجد فروع بعد' : 'No branches yet'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr
              ? 'أضف متجرك الأول من صفحة إعداد المتجر'
              : 'Add your first store from Store Setup'}
          </p>
          <a
            href="/dashboard/store-setup"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 transition-colors"
          >
            {isAr ? 'إعداد المتجر' : 'Store Setup'}
            <ChevronRight size={14} />
          </a>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {branches.map((branch, idx) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                rank={idx + 1}
                isAr={isAr}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Single-branch hint for basic tier */}
      {!canGroup && branches.length === 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1.5px solid rgba(139,92,246,0.2)' }}
        >
          <Layers size={18} color="#8b5cf6" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#8b5cf6' }}>
              {isAr ? 'هل لديك أكثر من فرع؟' : 'Got multiple branches?'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {isAr
                ? 'ترقّ إلى Pro أو Enterprise لإضافة فروع متعددة وإنشاء مجموعات للسلاسل التجارية.'
                : 'Upgrade to Pro or Enterprise to add multiple branches and create chain groups.'}
            </p>
            <a
              href="/dashboard/billing"
              className="inline-flex items-center gap-1 mt-2 text-xs font-bold"
              style={{ color: '#8b5cf6' }}
            >
              {isAr ? 'ترقية الخطة' : 'Upgrade plan'}
              <ChevronRight size={12} />
            </a>
          </div>
        </motion.div>
      )}

      {/* Create group modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateGroupModal onClose={() => setShowCreate(false)} isAr={isAr} />
        )}
      </AnimatePresence>
    </div>
  )
}
