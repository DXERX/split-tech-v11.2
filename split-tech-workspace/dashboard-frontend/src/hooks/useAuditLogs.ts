import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { AnalyticsLog } from '../types'

type DateFilter = 'today' | 'week' | 'month' | 'all'

function getDateFilter(filter: DateFilter): string | null {
  const now = new Date()
  switch (filter) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return start.toISOString()
    }
    case 'week': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return start.toISOString()
    }
    case 'month': {
      const start = new Date(now)
      start.setMonth(start.getMonth() - 1)
      return start.toISOString()
    }
    default:
      return null
  }
}

export function useAuditLogs(storeId: string | undefined, filter: DateFilter = 'today', limit = 5) {
  return useQuery({
    queryKey: ['audit-logs', storeId, filter, limit],
    enabled: !!storeId,
    queryFn: async () => {
      let query = supabase
        .from('analytics_logs')
        .select('*')
        .eq('store_id', storeId!)
        .order('created_at', { ascending: false })
        .limit(limit)

      const fromDate = getDateFilter(filter)
      if (fromDate) {
        query = query.gte('created_at', fromDate)
      }

      const { data, error } = await query
      if (error) throw error
      return data as AnalyticsLog[]
    },
  })
}

export function useRealtimeAuditLogs(
  storeId: string | undefined,
  onNewLog: (log: AnalyticsLog) => void
) {
  const seenAfterRef = useRef<string>(new Date().toISOString())
  const onNewLogRef = useRef(onNewLog)
  onNewLogRef.current = onNewLog

  useEffect(() => {
    if (!storeId) return

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('analytics_logs')
        .select('*')
        .eq('store_id', storeId)
        .gt('created_at', seenAfterRef.current)
        .order('created_at', { ascending: true })
        .limit(10)

      if (data && data.length > 0) {
        seenAfterRef.current = data[data.length - 1].created_at
        data.forEach(log => onNewLogRef.current(log as AnalyticsLog))
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [storeId])
}

export function useAllStoreAuditLogs(filter: DateFilter = 'today') {
  return useQuery({
    queryKey: ['all-audit-logs', filter],
    queryFn: async () => {
      let query = supabase
        .from('analytics_logs')
        .select(`*, stores(name, user_id)`)
        .order('created_at', { ascending: false })
        .limit(200)

      const fromDate = getDateFilter(filter)
      if (fromDate) query = query.gte('created_at', fromDate)

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
