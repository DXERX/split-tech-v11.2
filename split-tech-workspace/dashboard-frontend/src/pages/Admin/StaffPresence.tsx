import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity, Users, ShieldCheck, HeadphonesIcon, Megaphone,
  TrendingUp, Store, Wifi, MapPin, Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePresence, type PresenceRow } from '../../hooks/usePresence'
import PresenceDot from '../../components/PresenceDot'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'

const ROLE_STYLE: Record<string, { icon: typeof Users; color: string; bg: string }> = {
  super_owner:         { icon: ShieldCheck,    color: 'text-amber-600',    bg: 'bg-amber-50' },
  it_support:          { icon: Activity,       color: 'text-sky-600',      bg: 'bg-sky-50' },
  customer_support:    { icon: HeadphonesIcon, color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  marketing_manager:   { icon: Megaphone,      color: 'text-purple-600',   bg: 'bg-purple-50' },
  marketing_associate: { icon: TrendingUp,     color: 'text-fuchsia-600',  bg: 'bg-fuchsia-50' },
  merchant:            { icon: Store,          color: 'text-brand-700',    bg: 'bg-brand-50' },
  unknown:             { icon: Users,          color: 'text-slate-500',    bg: 'bg-slate-50' },
}

const ROLE_KEYS: Record<string, TranslationKey> = {
  super_owner: 'presence.role.super_owner',
  it_support: 'presence.role.it_support',
  customer_support: 'presence.role.customer_support',
  marketing_manager: 'presence.role.marketing_manager',
  marketing_associate: 'presence.role.marketing_associate',
  merchant: 'presence.role.merchant',
  unknown: 'presence.role.unknown',
}

function roleLabel(role: string | null | undefined, t: (k: TranslationKey) => string): string {
  const r = role && ROLE_KEYS[role] ? role : 'unknown'
  return t(ROLE_KEYS[r])
}

function roleStyle(role: string | null | undefined) {
  const r = role && ROLE_STYLE[role] ? role : 'unknown'
  return ROLE_STYLE[r]
}

function relTime(iso: string, t: (k: TranslationKey) => string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const s = Math.round(diff / 1000)
  if (s < 60) return t('presence.relNow')
  const m = Math.round(s / 60)
  if (m < 60) return t('presence.relMins').replace('{m}', String(m))
  const h = Math.round(m / 60)
  return t('presence.relHours').replace('{h}', String(h))
}

export default function StaffPresence() {
  const { t, lang } = useLanguage()
  const { online, byRole, isLoading } = usePresence(true)

  const { data: recentEvents = [] } = useQuery<
    Array<{
      id: string
      user_id: string
      role: string | null
      event: string
      page: string | null
      ip: string | null
      occurred_at: string
      full_name: string | null
    }>
  >({
    queryKey: ['presence-events', 'recent'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_presence_events')
        .select('id, user_id, role, event, page, ip, occurred_at')
        .eq('event', 'login')
        .order('occurred_at', { ascending: false })
        .limit(40)
      const events = data ?? []
      const ids = Array.from(new Set(events.map((r) => r.user_id)))
      const nameMap = new Map<string, string | null>()
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        for (const p of profiles ?? []) nameMap.set(p.id, p.full_name)
      }
      return events.map((e) => ({ ...e, full_name: nameMap.get(e.user_id) ?? null }))
    },
  })

  const counters = useMemo(() => {
    const order = [
      'super_owner',
      'it_support',
      'customer_support',
      'marketing_manager',
      'marketing_associate',
      'merchant',
    ]
    return order.map((role) => ({
      role,
      style: roleStyle(role),
      label: roleLabel(role, t),
      count: byRole[role]?.length ?? 0,
    }))
  }, [byRole, t])

  const timeLocale = lang === 'ar' ? 'ar-SA' : 'en-GB'
  const dateLocale = lang === 'ar' ? 'ar-SA' : 'en-GB'

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('presence.title')}</h1>
          <p className="text-sm text-slate-500">
            {t('presence.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full">
          <Wifi className="w-4 h-4" />
          {online.length} {t('presence.onlineBadge')}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {counters.map(({ role, style, label, count }) => {
          const Icon = style.icon
          return (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-4"
            >
              <div className={`w-9 h-9 rounded-xl ${style.bg} ${style.color} flex items-center justify-center mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{count}</p>
            </motion.div>
          )
        })}
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <header className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-700" />
          <h2 className="font-semibold text-slate-800">{t('presence.activityMap')}</h2>
          <span className="ms-auto text-xs text-slate-400">
            {isLoading ? t('presence.loadingShort') : t('presence.itemsCount').replace('{n}', String(online.length))}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="text-start px-4 py-2 font-medium">{t('presence.colStaff')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('presence.colRole')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('presence.colPage')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('presence.colLastActivity')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('presence.colPresence')}</th>
              </tr>
            </thead>
            <tbody>
              {online.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                    {t('presence.emptyOnline')}
                  </td>
                </tr>
              )}
              {online.map((row: PresenceRow) => {
                const st = roleStyle(row.role)
                const lb = roleLabel(row.role, t)
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                      <PresenceDot lastActiveAt={row.last_active_at} />
                      {row.full_name ?? row.user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${st.bg} ${st.color}`}>
                        {lb}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                      {row.current_page ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {relTime(row.last_active_at, t)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      <Clock className="w-3 h-3 inline ms-1" />
                      {new Date(row.check_in_at).toLocaleTimeString(timeLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <header className="px-4 sm:px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{t('presence.recentLogins')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('presence.recentLoginsSub')}</p>
        </header>
        <div className="divide-y divide-slate-100">
          {recentEvents.length === 0 && (
            <p className="text-center py-8 text-slate-400 text-sm">{t('presence.emptyLogs')}</p>
          )}
          {recentEvents.map((e) => {
            const st = roleStyle(e.role)
            const lb = roleLabel(e.role, t)
            return (
              <div key={e.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 truncate">
                    {e.full_name ?? e.user_id.slice(0, 8)}
                    <span className={`ms-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${st.bg} ${st.color}`}>
                      {lb}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {t('presence.loginFrom')}{' '}
                    <span className="font-mono text-slate-700">{e.ip ?? t('presence.unknownIp')}</span>
                    {e.page ? ` · ${e.page}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(e.occurred_at).toLocaleString(dateLocale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
