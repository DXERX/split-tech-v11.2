import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, TicketCheck, Clock, TrendingUp, Award,
  ShieldAlert, Megaphone, RotateCcw, Activity, Star,
  Medal, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { StaggerContainer, StaggerItem } from '../../components/ui/AnimatedCard'
import AnimatedCard from '../../components/ui/AnimatedCard'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentStat {
  id: string
  name: string
  role: string
  ticketsResolved: number
  ticketsOpen: number
  avgResponseHours: number
  broadcastsSent: number
  actionsLogged: number
  performanceScore: number
}

const roleColor: Record<string, string> = {
  it_support: 'bg-blue-100 text-blue-700',
  customer_support: 'bg-purple-100 text-purple-700',
  marketing_manager: 'bg-amber-100 text-amber-700',
  super_owner: 'bg-brand-100 text-brand-700',
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'from-emerald-400 to-emerald-600'
    : score >= 60 ? 'from-amber-400 to-amber-600'
    : 'from-red-400 to-red-600'
  return (
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
      <span className="text-white text-sm font-bold">{score}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
function roleLabelKey(role: string): TranslationKey {
  const map: Record<string, TranslationKey> = {
    it_support: 'staff.role.it_support',
    customer_support: 'staff.role.customer_support',
    marketing_manager: 'staff.role.marketing_manager',
    super_owner: 'staff.role.super_owner',
  }
  return map[role] ?? 'staff.unknown'
}

export default function StaffPerformance() {
  const { t, lang } = useLanguage()
  const { data, isLoading } = useQuery({
    queryKey: ['staff-performance', lang],
    queryFn: async (): Promise<{ agents: AgentStat[]; totals: Record<string, number> }> => {
      // 1. Fetch all staff roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['it_support', 'customer_support', 'marketing_manager'])

      if (!roles?.length) return { agents: [], totals: {} }

      const userIds = roles.map(r => r.user_id)

      // 2. Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      // 3. Fetch tickets assigned to these staff
      const { data: tickets } = await supabase
        .from('support_tickets')
        .select('id, assigned_to, status, created_at, updated_at')
        .in('assigned_to', userIds)

      // 4. Broadcasts sent by staff
      const { data: broadcasts } = await supabase
        .from('broadcasts')
        .select('id, created_by, created_at')
        .in('created_by', userIds)

      // 5. Security alerts resolved by staff
      const { data: alerts } = await supabase
        .from('security_alerts')
        .select('id, resolved_by, created_at')
        .in('resolved_by', userIds)
        .eq('resolved', true)

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]))
      const ticketList = tickets ?? []
      const broadcastList = broadcasts ?? []
      const alertList = alerts ?? []

      const agents: AgentStat[] = roles.map(r => {
        const myTickets   = ticketList.filter(t => t.assigned_to === r.user_id)
        const resolved    = myTickets.filter(t => ['resolved', 'closed'].includes(t.status))
        const open        = myTickets.filter(t => ['open', 'in_progress'].includes(t.status))

        // Avg response time = avg (updated_at - created_at) for resolved tickets in hours
        const avgH = resolved.length
          ? resolved.reduce((acc, t) => {
              const diff = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()
              return acc + diff / (1000 * 60 * 60)
            }, 0) / resolved.length
          : 0

        const myBroadcasts = broadcastList.filter(b => b.created_by === r.user_id).length
        const myAlerts     = alertList.filter(a => a.resolved_by === r.user_id).length

        // Performance score 0-100
        // Components: resolution rate (40%), response time (30%), activity (30%)
        const resolutionRate = myTickets.length ? (resolved.length / myTickets.length) * 100 : 50
        const responseScore  = avgH === 0 ? 100 : Math.max(0, 100 - avgH * 3)   // <1h=97, >33h=0
        const activityScore  = Math.min(100, (myBroadcasts + myAlerts) * 10 + resolved.length * 2)
        const score = Math.round(resolutionRate * 0.4 + responseScore * 0.3 + activityScore * 0.3)

        return {
          id: r.user_id,
          name: profileMap[r.user_id] ?? t('staff.unknown'),
          role: r.role,
          ticketsResolved: resolved.length,
          ticketsOpen: open.length,
          avgResponseHours: Math.round(avgH * 10) / 10,
          broadcastsSent: myBroadcasts,
          actionsLogged: myAlerts,
          performanceScore: Math.min(100, score),
        }
      }).sort((a, b) => b.performanceScore - a.performanceScore)

      const totals = {
        totalResolved: agents.reduce((a, x) => a + x.ticketsResolved, 0),
        totalOpen: agents.reduce((a, x) => a + x.ticketsOpen, 0),
        totalBroadcasts: agents.reduce((a, x) => a + x.broadcastsSent, 0),
        avgScore: agents.length ? Math.round(agents.reduce((a, x) => a + x.performanceScore, 0) / agents.length) : 0,
      }

      return { agents, totals }
    },
    refetchInterval: 120_000,
  })

  const agents  = data?.agents  ?? []
  const totals  = data?.totals  ?? {}
  const topAgent = agents[0]

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand-700 rounded-xl">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('staff.pageTitle')}</h1>
          <p className="text-sm text-gray-500">{t('staff.subtitle')}</p>
        </div>
      </div>

      {/* Summary cards */}
      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { labelKey: 'staff.kpi.resolved' as TranslationKey, value: totals.totalResolved ?? 0, icon: TicketCheck, color: 'bg-emerald-500' },
          { labelKey: 'staff.kpi.open' as TranslationKey, value: totals.totalOpen ?? 0, icon: Clock, color: 'bg-amber-500' },
          { labelKey: 'staff.kpi.broadcasts' as TranslationKey, value: totals.totalBroadcasts ?? 0, icon: Megaphone, color: 'bg-purple-500' },
          { labelKey: 'staff.kpi.avgPerf' as TranslationKey, value: `${totals.avgScore ?? 0}%`, icon: TrendingUp, color: 'bg-brand-700' },
        ].map((s, i) => (
          <StaggerItem key={i}>
            <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
              <div className={`p-3 rounded-xl ${s.color}`}>
                <s.icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t(s.labelKey)}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            </AnimatedCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Top performer highlight */}
      {topAgent && (
        <AnimatedCard
          className="bg-gradient-to-r from-brand-700 to-brand-600 rounded-2xl p-5 text-white shadow-high"
          delay={0.1}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 mb-0.5">{t('staff.topLabel')}</p>
              <p className="text-lg font-bold truncate">{topAgent.name}</p>
              <p className="text-xs text-white/70">{t(roleLabelKey(topAgent.role))}</p>
            </div>
            <div className="text-end shrink-0">
              <p className="text-3xl font-black">{topAgent.performanceScore}</p>
              <p className="text-xs text-white/70">{t('staff.points')}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-lg font-bold">{topAgent.ticketsResolved}</p>
              <p className="text-xs text-white/70">{t('staff.col.resolved')}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-lg font-bold">{topAgent.avgResponseHours}h</p>
              <p className="text-xs text-white/70">{t('staff.col.avgReply')}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-lg font-bold">{topAgent.broadcastsSent}</p>
              <p className="text-xs text-white/70">{t('staff.col.broadcasts')}</p>
            </div>
          </div>
        </AnimatedCard>
      )}

      {/* ── Leaderboard Podium (top 3) ─────────────────────────── */}
      {agents.length >= 2 && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 overflow-hidden">
          <div className="flex items-center gap-2 mb-5">
            <Medal className="w-4 h-4 text-amber-400" />
            <h2 className="font-bold text-white text-sm">{t('staff.podium')}</h2>
          </div>
          {/* Podium bars */}
          <div className="flex items-end justify-center gap-3 h-36">
            {/* Silver — rank 2 */}
            {agents[1] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: '72%', opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
                className="flex flex-col items-center justify-end w-24"
              >
                <p className="text-white/80 text-xs font-medium mb-1 truncate w-full text-center">{agents[1].name}</p>
                <p className="text-2xl font-black text-slate-300 mb-1">{agents[1].performanceScore}</p>
                <div className="w-full bg-gradient-to-t from-slate-400 to-slate-300 rounded-t-lg flex items-center justify-center" style={{ height: '100%' }}>
                  <span className="text-slate-700 font-black text-xl">2</span>
                </div>
              </motion.div>
            )}
            {/* Gold — rank 1 */}
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: '100%', opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.05, ease: 'easeOut' }}
              className="flex flex-col items-center justify-end w-24"
            >
              <div className="relative mb-1">
                <Award className="w-6 h-6 text-amber-400 absolute -top-2 left-1/2 -translate-x-1/2" />
              </div>
              <p className="text-white text-xs font-semibold mt-5 mb-1 truncate w-full text-center">{agents[0].name}</p>
              <p className="text-3xl font-black text-amber-300 mb-1">{agents[0].performanceScore}</p>
              <div className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-lg flex items-center justify-center" style={{ height: '100%' }}>
                <span className="text-amber-900 font-black text-2xl">1</span>
              </div>
            </motion.div>
            {/* Bronze — rank 3 */}
            {agents[2] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: '55%', opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.35, ease: 'easeOut' }}
                className="flex flex-col items-center justify-end w-24"
              >
                <p className="text-white/70 text-xs font-medium mb-1 truncate w-full text-center">{agents[2].name}</p>
                <p className="text-xl font-black text-amber-700 mb-1">{agents[2].performanceScore}</p>
                <div className="w-full bg-gradient-to-t from-amber-900 to-amber-700 rounded-t-lg flex items-center justify-center" style={{ height: '100%' }}>
                  <span className="text-amber-200 font-black text-lg">3</span>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Agent table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-800">{t('staff.tableTitle')}</h2>
        </div>

        {agents.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('staff.noData')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {agents.map((agent, idx) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06 }}
                className={`px-5 py-4 ${idx === 0 ? 'bg-amber-50/40' : ''}`}
              >
                {/* Mobile: stacked, Desktop: row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Rank + name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-slate-100 text-slate-600' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-800 truncate">{agent.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[agent.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          {t(roleLabelKey(agent.role))}
                        </span>
                        {idx === 0 && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-4 gap-3 text-center text-xs">
                    <div>
                      <p className="font-bold text-gray-800 text-base">{agent.ticketsResolved}</p>
                      <p className="text-gray-400">{t('staff.col.resolved')}</p>
                    </div>
                    <div>
                      <p className="font-bold text-amber-500 text-base">{agent.ticketsOpen}</p>
                      <p className="text-gray-400">{t('staff.col.open')}</p>
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-base">{agent.avgResponseHours}h</p>
                      <p className="text-gray-400">{t('staff.col.avgReply')}</p>
                    </div>
                    <div>
                      <p className="font-bold text-purple-600 text-base">{agent.broadcastsSent}</p>
                      <p className="text-gray-400">{t('staff.col.broadcasts')}</p>
                    </div>
                  </div>

                  {/* Score */}
                  <ScoreBadge score={agent.performanceScore} />
                </div>

                {/* Animated progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{t('staff.perfRate')}</span>
                    <span className="text-xs font-semibold text-gray-600">{agent.performanceScore}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${agent.performanceScore}%` }}
                      transition={{ duration: 0.9, delay: idx * 0.07 + 0.15, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        agent.performanceScore >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                        : agent.performanceScore >= 60 ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : 'bg-gradient-to-r from-red-400 to-red-500'
                      }`}
                    />
                  </div>
                </div>

                {agent.actionsLogged > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                    <ShieldAlert className="w-3 h-3" />
                    <span>{t('staff.securityActions').replace('{n}', String(agent.actionsLogged))}</span>
                    <RotateCcw className="w-3 h-3 ms-2" />
                    <Star className="w-3 h-3" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail note */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-500 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
        <p>{t('staff.footer')}</p>
      </div>
    </div>
  )
}
