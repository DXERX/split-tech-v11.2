import { supabase } from './supabase'

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
}

export async function fetchProfilesMap(ids: Array<string | null | undefined>) {
  const userIds = uniqueIds(ids)
  if (!userIds.length) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, company_name, avatar_url, is_banned, banned_at, banned_reason, created_at, updated_at')
    .in('id', userIds)

  if (error) throw error

  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]))
}

export async function fetchUserRolesMap(ids: Array<string | null | undefined>) {
  const userIds = uniqueIds(ids)
  if (!userIds.length) return {}

  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds)

  if (error) throw error

  return Object.fromEntries((data || []).map((row) => [row.user_id, row]))
}

export async function fetchSubscriptionsMap(ids: Array<string | null | undefined>) {
  const subscriptionIds = uniqueIds(ids)
  if (!subscriptionIds.length) return {}

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, tier, status, start_date, end_date, monthly_amount, auto_renew')
    .in('id', subscriptionIds)

  if (error) throw error

  return Object.fromEntries((data || []).map((subscription) => [subscription.id, subscription]))
}

export async function fetchStoresMap(ids: Array<string | null | undefined>) {
  const storeIds = uniqueIds(ids)
  if (!storeIds.length) return {}

  const { data, error } = await supabase
    .from('stores')
    .select('id, user_id, subscription_id, name, store_status, last_heartbeat, remote_command, admin_override_signal, created_at')
    .in('id', storeIds)

  if (error) throw error

  return Object.fromEntries((data || []).map((store) => [store.id, store]))
}

export async function fetchStoresBySubscriptionMap(ids: Array<string | null | undefined>) {
  const subscriptionIds = uniqueIds(ids)
  if (!subscriptionIds.length) return {}

  const { data, error } = await supabase
    .from('stores')
    .select('id, user_id, subscription_id, name, store_status, last_heartbeat, created_at')
    .in('subscription_id', subscriptionIds)

  if (error) throw error

  return Object.fromEntries(
    (data || [])
      .filter((store) => !!store.subscription_id)
      .map((store) => [store.subscription_id as string, store])
  )
}
