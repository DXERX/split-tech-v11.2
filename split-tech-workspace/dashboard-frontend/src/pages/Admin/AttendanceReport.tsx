import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PresenceDot from '../../components/PresenceDot'
import { isOnline } from '../../hooks/usePresence'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'

interface AttendanceRow {
  id: string
  user_id: string
  full_name: string | null
  role: string | null
  work_date: string
  check_in_at: string
  check_out_at: string | null
  last_active_at: string
  active_seconds: number
  idle_seconds: number
  total_seconds: number
  heartbeat_count: number
  current_page: string | null
  first_ip: string | null
  last_ip: string | null
}

function fmtHours(seconds: number, template: string): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return template.replace('{h}', String(h)).replace('{m}', String(m))
}

function roleLabel(role: string | null, t: (k: TranslationKey) => string): string {
  if (!role) return '—'
  const key = `staff.role.${role}` as TranslationKey
  const translated = t(key)
  return translated === key ? role : translated
}

function todayIsoDate(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function AttendanceReport() {
  const { t, lang, isRtl } = useLanguage()
  const [date, setDate] = useState<string>(todayIsoDate())
  const timeLocale = lang === 'ar' ? 'ar-SA' : 'en-US'
  const durationTpl = t('attendance.duration')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['attendance-report', date],
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from('daily_attendance_view')
        .select('*')
        .eq('work_date', date)
        .order('active_seconds', { ascending: false })
      if (error) throw error
      return (data ?? []) as AttendanceRow[]
    },
  })

  const totals = useMemo(() => {
    const totalActive = rows.reduce((s, r) => s + (r.active_seconds ?? 0), 0)
    const totalIdle = rows.reduce((s, r) => s + (r.idle_seconds ?? 0), 0)
    const onlineNow = rows.filter((r) => isOnline(r.last_active_at)).length
    return { totalActive, totalIdle, onlineNow, count: rows.length }
  }, [rows])

  const exportCsv = () => {
    const headers = [
      'date',
      'name',
      'role',
      'check_in',
      'check_out',
      'last_active',
      'active_hours',
      'idle_hours',
      'first_ip',
      'last_ip',
    ]
    const lines = rows.map((r) =>
      [
        r.work_date,
        (r.full_name ?? '').replace(/,/g, ' '),
        r.role ?? '',
        r.check_in_at,
        r.check_out_at ?? '',
        r.last_active_at,
        (r.active_seconds / 3600).toFixed(2),
        (r.idle_seconds / 3600).toFixed(2),
        r.first_ip ?? '',
        r.last_ip ?? '',
      ].join(','),
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('attendance.title')}</h1>
          <p className="text-sm text-slate-500">{t('attendance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Calendar className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ps-3 pe-10 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {t('attendance.exportCsv')}
          </button>
        </div>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <p className="text-xs text-slate-500">{t('attendance.cardStaffCount')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.count}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <p className="text-xs text-slate-500">{t('attendance.cardOnlineNow')}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{totals.onlineNow}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <p className="text-xs text-slate-500">{t('attendance.cardTotalActive')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmtHours(totals.totalActive, durationTpl)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
          <p className="text-xs text-slate-500">{t('attendance.cardTotalIdle')}</p>
          <p className="text-2xl font-bold text-slate-500 mt-1">{fmtHours(totals.totalIdle, durationTpl)}</p>
        </div>
      </div>

      {/* Table */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-xs uppercase">
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thEmployee')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thRole')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thCheckIn')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thLastActive')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thActive')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thIdle')}</th>
                <th className="text-start px-4 py-2 font-medium">{t('attendance.thIp')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                    {t('attendance.loading')}
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                    {t('attendance.empty')}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <PresenceDot lastActiveAt={r.last_active_at} />
                      {r.full_name ?? r.user_id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {roleLabel(r.role, t)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(r.check_in_at).toLocaleTimeString(timeLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    <Clock className="w-3 h-3 inline ms-1" />
                    {new Date(r.last_active_at).toLocaleTimeString(timeLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-emerald-600 text-xs font-medium">
                    {fmtHours(r.active_seconds, durationTpl)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {fmtHours(r.idle_seconds, durationTpl)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                    {r.last_ip ?? r.first_ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
