import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BranchStore {
  id: string
  store_name: string
  branch_name: string
  city: string | null
  branch_order: number
  status: string
  group_name: string | null
  score: number | null
  audit_status: string | null
  last_audit_at: string | null
  audits_7d: number
}

export interface BranchGroup {
  id: string
  user_id: string
  name: string
  description: string | null
  branch_count: number
  created_at: string
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')
  return { Authorization: `Bearer ${session.access_token}` }
}

const API = () => import.meta.env.VITE_API_URL

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** All stores for the current user (no LIMIT 1) */
export function useMyStores() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-stores', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const headers = await authHeader()
      const res = await fetch(`${API()}/v1/my-stores`, { headers })
      if (!res.ok) throw new Error('Failed to load stores')
      const json = await res.json()
      return (json.stores ?? []) as BranchStore[]
    },
  })
}

/** Branch comparison data with scores, last audit, 7d audit count */
export function useBranchComparison() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['branch-comparison', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const headers = await authHeader()
      const res = await fetch(`${API()}/v1/branch-comparison`, { headers })
      if (!res.ok) throw new Error('Failed to load branch comparison')
      const json = await res.json()
      return (json.branches ?? []) as BranchStore[]
    },
  })
}

/** All branch groups for the current user */
export function useBranchGroups() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['branch-groups', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const headers = await authHeader()
      const res = await fetch(`${API()}/v1/branch-groups`, { headers })
      if (!res.ok) throw new Error('Failed to load branch groups')
      const json = await res.json()
      return (json.groups ?? []) as BranchGroup[]
    },
  })
}

/** Create a new branch group */
export function useCreateBranchGroup() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const headers = await authHeader()
      const res = await fetch(`${API()}/v1/branch-groups`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create group')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-groups', user?.id] })
    },
  })
}

/** Update branch metadata */
export function useUpdateBranch() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      storeId,
      ...payload
    }: {
      storeId: string
      branch_name?: string
      branch_order?: number
      city?: string
      branch_group_id?: string
    }) => {
      const headers = await authHeader()
      const res = await fetch(`${API()}/v1/branches/${storeId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update branch')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-stores', user?.id] })
      qc.invalidateQueries({ queryKey: ['branch-comparison', user?.id] })
    },
  })
}
