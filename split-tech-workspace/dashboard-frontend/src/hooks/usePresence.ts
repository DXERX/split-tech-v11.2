import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types'

export interface PresenceRow {
  id: string
  user_id: string
  role: UserRole | null
  full_name: string | null
  current_page: string | null
  last_active_at: string
  check_in_at: string
  check_out_at: string | null
  active_seconds: number
  idle_seconds: number
  first_ip: string | null
  last_ip: string | null
}

const ONLINE_WINDOW_SECONDS = 90 // last_active_at must be within last 90s

export function usePresence(enabled = true): {
  rows: PresenceRow[]
  isLoading: boolean
  byRole: Record<string, PresenceRow[]>
  online: PresenceRow[]
} {
  const { data = [], isLoading } = useQuery({
    queryKey: ['presence-attendance', 'today'],
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PresenceRow[]> => {
      const today = new Date()
      // Riyadh-day midnight (UTC+3) — pull rows from today only.
      const riyadhMidnight = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), -3, 0, 0),
      )
      const { data, error } = await supabase
        .from('daily_attendance_view')
        .select('*')
        .gte('check_in_at', riyadhMidnight.toISOString())
        .order('last_active_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as PresenceRow[]
    },
  })

  const online = useMemo(() => {
    const cutoff = Date.now() - ONLINE_WINDOW_SECONDS * 1000
    return data.filter((r) => new Date(r.last_active_at).getTime() >= cutoff)
  }, [data])

  const byRole = useMemo(() => {
    const map: Record<string, PresenceRow[]> = {}
    for (const r of online) {
      const key = r.role ?? 'unknown'
      ;(map[key] ??= []).push(r)
    }
    return map
  }, [online])

  return { rows: data, isLoading, byRole, online }
}

export function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_SECONDS * 1000
}
