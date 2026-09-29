import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { fetchProfilesMap, fetchSubscriptionsMap } from '../lib/adminData'
import { useAuth } from '../contexts/AuthContext'
import type { CallLog, Store, StoreApiKey, Subscription, VoiceAgent } from '../types'

export function useMyStore() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-store', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/my-store`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return null
      const json = await res.json()
      return (json.store as Store) || null
    },
  })
}

export function useMySubscription() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-subscription', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/my-subscription`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return null
      const json = await res.json()
      return (json.subscription as Subscription) || null
    },
  })
}

// Returns both voice + vision subscriptions independently
export function useAllMySubscriptions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-subscriptions-all', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { vision: null, voice: null, all: [] }
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/my-subscriptions`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return { vision: null, voice: null, all: [] }
      const json = await res.json()
      return {
        vision: (json.vision as Subscription | null) ?? null,
        voice:  (json.voice  as Subscription | null) ?? null,
        all:    (json.all    as Subscription[])       ?? [],
      }
    },
  })
}

export function useStoreApiKey(storeId: string | undefined) {
  return useQuery({
    queryKey: ['store-api-key', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_api_keys')
        .select('id, store_id, license_key, key_preview, is_active, activated_at, expires_at, machine_fingerprint')
        .eq('store_id', storeId!)
        .eq('is_active', true)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data as Omit<StoreApiKey, 'api_key'> | null
    },
  })
}

export function useUpdateStore() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ storeId, updates }: { storeId: string; updates: Partial<Store> }) => {
      const { data, error } = await supabase
        .from('stores')
        .update(updates)
        .eq('id', storeId)
        .eq('user_id', user!.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-store'] })
      qc.invalidateQueries({ queryKey: ['all-stores'] })
      qc.invalidateQueries({ queryKey: ['stores-status'] })
      qc.invalidateQueries({ queryKey: ['verification-requests'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })
}

export function useAllStores() {
  return useQuery({
    queryKey: ['all-stores'],
    queryFn: async () => {
      // Use direct admin endpoint (bypasses PostgREST) so new columns like
      // pending_custom_questions / pending_working_hours are always returned.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('غير مصرح')
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/admin/stores`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'فشل تحميل المتاجر')
      }
      return res.json()
    },
  })
}

export function useApproveStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('غير مصرح')

      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${apiUrl}/v1/admin/approve-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ store_id: storeId }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || 'تعذر اعتماد المتجر')
      return result
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-stores'] })
      qc.invalidateQueries({ queryKey: ['verification-requests'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Store approval failed')
    },
  })
}

// ─── Voice Agent ─────────────────────────────────────────────────────────────

export function useMyVoiceAgent() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-voice-agent', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { agent: null, subscription: null }
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/voice-agent/me`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return { agent: null, subscription: null }
      const json = await res.json()
      return {
        agent:        (json.agent as VoiceAgent | null) ?? null,
        subscription: (json.subscription as Subscription | null) ?? null,
      }
    },
  })
}

export function useUpdateVoicePersona() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<VoiceAgent>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expired')
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/voice-agent/persona`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update persona')
      return json.agent as VoiceAgent
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-voice-agent'] })
    },
  })
}

export function useVoiceCalls(limit = 50) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['voice-calls', user?.id, limit],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return { calls: [] as CallLog[], total: 0 }
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/voice-agent/calls?limit=${limit}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) return { calls: [] as CallLog[], total: 0 }
      const json = await res.json()
      return {
        calls: (json.calls as CallLog[]) || [],
        total: (json.total as number) || 0,
      }
    },
  })
}

export function useConnectivityStatus(storeId: string | undefined) {
  return useQuery({
    queryKey: ['connectivity', storeId],
    enabled: !!storeId,
    refetchInterval: 30_000, // Check every 30 seconds
    queryFn: async () => {
      const { data } = await supabase
        .from('stores')
        .select('last_heartbeat')
        .eq('id', storeId!)
        .single()

      if (!data?.last_heartbeat) return 'disconnected'
      const diff = Date.now() - new Date(data.last_heartbeat).getTime()
      return diff < 30 * 60 * 1000 ? 'connected' : 'disconnected'
    },
  })
}
