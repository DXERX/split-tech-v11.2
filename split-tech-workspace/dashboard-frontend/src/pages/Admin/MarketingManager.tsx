import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, CheckCircle2, DollarSign, ListTodo, Users, Upload, Banknote, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import type { MarketingLead } from '../../types'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

type ManagerTab = 'performance' | 'lead-approval' | 'associates' | 'team-tasks' | 'bulk-import' | 'payouts'

const LEAD_STATUS_KEY: Record<string, TranslationKey> = {
  new: 'mkt.leadStatus.new',
  contacted: 'mkt.leadStatus.contacted',
  interested: 'mkt.leadStatus.interested',
  trial_active: 'mkt.leadStatus.trial_active',
  converted: 'mkt.leadStatus.converted',
}
const TASK_STATUS_KEY: Record<string, TranslationKey> = {
  active: 'mkt.taskStatus.active',
  paused: 'mkt.taskStatus.paused',
  completed: 'mkt.taskStatus.completed',
  cancelled: 'mkt.taskStatus.cancelled',
}
const PAYOUT_STATUS_KEY: Record<string, TranslationKey> = {
  pending: 'mkt.payoutStatus.pending',
  paid: 'mkt.payoutStatus.paid',
  rejected: 'mkt.payoutStatus.rejected',
}

function pickLabel(t: (k: TranslationKey) => string, map: Record<string, TranslationKey>, raw: string) {
  const key = map[raw]
  return key ? t(key) : raw
}

function routeToTab(pathname: string): ManagerTab {
  if (pathname.endsWith('/lead-approval')) return 'lead-approval'
  if (pathname.endsWith('/associates')) return 'associates'
  if (pathname.endsWith('/team-tasks')) return 'team-tasks'
  if (pathname.endsWith('/bulk-import')) return 'bulk-import'
  if (pathname.endsWith('/payouts')) return 'payouts'
  return 'performance'
}

// ── CSS variable style helpers ────────────────────────────────────────────────
const S = {
  card:    { background: 'var(--bg-card)',   borderColor: 'var(--border)' } as React.CSSProperties,
  subtle:  { background: 'var(--bg-subtle)', borderColor: 'var(--border)' } as React.CSSProperties,
  muted:   { background: 'var(--bg-muted)' } as React.CSSProperties,
  base:    { color: 'var(--text-base)' }     as React.CSSProperties,
  muted_t: { color: 'var(--text-muted)' }    as React.CSSProperties,
  input:   { background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-base)' } as React.CSSProperties,
}

export default function MarketingManagerDashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { t, isRtl } = useLanguage()
  const queryClient = useQueryClient()

  const activeTab = routeToTab(location.pathname)
  const [taskForm, setTaskForm] = useState({
    assignedTo: '',
    weekStart: new Date().toISOString().slice(0, 10),
    weekEnd: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    contactsTarget: 40,
    conversionTarget: 5,
    focusRegion: '',
    notes: '',
  })
  const [bulkImportText, setBulkImportText] = useState('')
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({})

  const { data: allLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['owner-marketing-leads-core'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_leads')
        .select('id,business_name,business_region,contact_phone,status,assigned_to,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data || []) as Pick<MarketingLead, 'id' | 'business_name' | 'business_region' | 'contact_phone' | 'status' | 'assigned_to' | 'created_at' | 'updated_at'>[]
    },
  })

  const { data: associates = [] } = useQuery({
    queryKey: ['owner-associates'],
    queryFn: async () => {
      const { data: mappings, error } = await supabase
        .from('marketing_role_mappings')
        .select('user_id,marketing_role,reports_to')
        .eq('marketing_role', 'associate')
      if (error) throw error

      const userIds = (mappings || []).map(m => m.user_id)
      if (!userIds.length) return []

      const { data: profiles } = await supabase
        .from('marketing_associate_profile')
        .select('id,display_name,is_active,total_conversions,total_leads_assigned')
        .in('id', userIds)

      return profiles || []
    },
  })

  const { data: bonusTracker = [] } = useQuery({
    queryKey: ['owner-bonus-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_bonus_tracker')
        .select('*')
        .order('bonus_sar', { ascending: false })
        .limit(100)
      if (error) throw error
      return data || []
    },
  })

  const { data: payouts = [] } = useQuery({
    queryKey: ['owner-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_commission_payouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data || []
    },
  })

  const { data: weeklyTasks = [] } = useQuery({
    queryKey: ['owner-weekly-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_weekly_tasks')
        .select('id,assigned_to,week_start,week_end,contacts_target,contacts_completed,conversion_target,conversions_completed,focus_region,notes,status,created_at')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data || []
    },
  })

  const approveLeadMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: string }) => {
      const { error } = await supabase
        .from('marketing_leads')
        .update({ status, updated_by: user?.id, status_updated_at: new Date().toISOString() })
        .eq('id', leadId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-marketing-leads-core'] }),
  })

  const toggleAssociateMutation = useMutation({
    mutationFn: async ({ associateId, nextActive }: { associateId: string; nextActive: boolean }) => {
      const { error } = await supabase
        .from('marketing_associate_profile')
        .update({ is_active: nextActive })
        .eq('id', associateId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-associates'] }),
  })

  const createPayoutMutation = useMutation({
    mutationFn: async ({ associateId, amount, cycles }: { associateId: string; amount: number; cycles: number }) => {
      const { error } = await supabase.from('marketing_commission_payouts').insert({
        associate_id: associateId,
        payout_cycles: cycles,
        payout_amount_sar: amount,
        payout_status: 'pending',
        created_by: user?.id,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-payouts'] }),
  })

  const setPayoutStatusMutation = useMutation({
    mutationFn: async ({ payoutId, status }: { payoutId: string; status: 'paid' | 'rejected' }) => {
      const { error } = await supabase
        .from('marketing_commission_payouts')
        .update({ payout_status: status, paid_at: status === 'paid' ? new Date().toISOString() : null })
        .eq('id', payoutId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-payouts'] }),
  })

  // ── Referral commissions (150 SAR per store signup via referral code) ────────
  const { data: referralConversions = [] } = useQuery({
    queryKey: ['mgr-referral-conversions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_referral_conversions')
        .select(`
          id, associate_id, referral_code, store_name, store_email,
          commission_amount, status, paid_at, payment_notes, created_at
        `)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data || []
    },
    enabled: activeTab === 'payouts',
  })

  const { data: associateProfiles = [] } = useQuery({
    queryKey: ['mgr-assoc-profiles-comm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_associate_profile')
        .select('id,display_name,referral_code,iban,pending_commissions_sar,paid_commissions_sar')
      if (error) throw error
      return data || []
    },
    enabled: activeTab === 'payouts',
  })

  const markPaidMutation = useMutation({
    mutationFn: async ({ conversionId, notes }: { conversionId: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/admin/commission/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ conversion_id: conversionId, notes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgr-referral-conversions'] })
      queryClient.invalidateQueries({ queryKey: ['mgr-assoc-profiles-comm'] })
      toast.success('✓ تم تسجيل الدفع بنجاح')
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'حدث خطأ'),
  })

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!taskForm.assignedTo) throw new Error('MGR_NO_ASSOCIATE')
      const { error } = await supabase
        .from('marketing_weekly_tasks')
        .insert({
          assigned_to: taskForm.assignedTo,
          assigned_by: user?.id,
          week_start: taskForm.weekStart,
          week_end: taskForm.weekEnd,
          contacts_target: Number(taskForm.contactsTarget || 0),
          conversion_target: Number(taskForm.conversionTarget || 0),
          focus_region: taskForm.focusRegion || null,
          notes: taskForm.notes || null,
          status: 'active',
        })
      if (error) throw error
    },
    onSuccess: () => {
      setTaskForm(prev => ({ ...prev, notes: '' }))
      queryClient.invalidateQueries({ queryKey: ['owner-weekly-tasks'] })
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'MGR_NO_ASSOCIATE') toast.warning(t('mkt.mgr.selectAssociateFirst'))
    },
  })

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: 'active' | 'paused' | 'completed' | 'cancelled' }) => {
      const { error } = await supabase
        .from('marketing_weekly_tasks')
        .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-weekly-tasks'] }),
  })

  const bulkImportLeadsMutation = useMutation({
    mutationFn: async () => {
      const lines = bulkImportText.split('\n').filter(l => l.trim())
      const leads = lines.map(line => {
        const [businessName, phone, region] = line.split('\t').map(s => s?.trim() || '')
        return { business_name: businessName, contact_phone: phone, business_region: region, source: 'bulk_manager_import' }
      })

      const { data, error } = await supabase.rpc('marketing_bulk_create_leads', { p_leads: leads })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      setBulkImportText('')
      queryClient.invalidateQueries({ queryKey: ['owner-marketing-leads-core'] })
      toast.success(t('mkt.mgr.importSuccess'))
    },
  })

  const updateLeadNoteMutation = useMutation({
    mutationFn: async ({ leadId, markdown }: { leadId: string; markdown: string }) => {
      const { error } = await supabase
        .from('marketing_leads')
        .update({ notes: markdown })
        .eq('id', leadId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-marketing-leads-core'] })
    },
  })

  const kpi = useMemo(() => {
    const total = allLeads.length
    const activeSubs = allLeads.filter(l => l.status === 'converted').length
    const trial = allLeads.filter(l => l.status === 'trial_active').length
    const interested = allLeads.filter(l => l.status === 'interested').length
    return { total, activeSubs, trial, interested }
  }, [allLeads])

  const associateNameById = useMemo(() => {
    const map = new Map<string, string>()
    associates.forEach((a: any) => map.set(a.id, a.display_name || a.id))
    return map
  }, [associates])

  if (leadsLoading) {
    return <div className="h-screen flex items-center justify-center"><LoadingSpinner /></div>
  }

  const tabBtn = (tab: ManagerTab, label: string) => (
    <button
      onClick={() => navigate(`/admin/marketing-manager/${tab}`)}
      style={activeTab === tab ? undefined : { ...S.card, color: 'var(--text-base)' }}
      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${activeTab === tab ? 'bg-brand-700 text-white border-brand-700' : ''}`}
    >
      {label}
    </button>
  )

  return (
    <div className="p-3 md:p-6 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold" style={S.base}>
            {t('mkt.mgr.title')}
          </h1>
          <p className="text-xs md:text-sm" style={S.muted_t}>
            {role === 'super_owner' ? t('mkt.mgr.roleSuper') : t('mkt.mgr.roleManager')}
            {' - '}
            {t('mkt.mgr.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabBtn('performance',   t('mkt.mgr.tabPerf'))}
          {tabBtn('lead-approval', t('mkt.mgr.tabApprovals'))}
          {tabBtn('associates',    t('mkt.mgr.tabTeam'))}
          {tabBtn('team-tasks',    t('mkt.mgr.tabTasks'))}
          {tabBtn('bulk-import',   t('mkt.mgr.tabImport'))}
          {tabBtn('payouts',       t('mkt.mgr.tabPayouts'))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        {t('mkt.disclaimer')}
      </div>

      {activeTab === 'performance' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border" style={S.card}><BarChart3 className="w-5 h-5 text-brand-700 mb-2" /><p className="text-xs" style={S.muted_t}>{t('mkt.mgr.kpiTotalLeads')}</p><p className="text-xl font-bold" style={S.base}>{kpi.total}</p></div>
          <div className="p-4 rounded-xl border" style={S.card}><CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" /><p className="text-xs" style={S.muted_t}>{t('mkt.mgr.kpiActiveSubs')}</p><p className="text-xl font-bold" style={S.base}>{kpi.activeSubs}</p></div>
          <div className="p-4 rounded-xl border" style={S.card}><Users className="w-5 h-5 text-indigo-600 mb-2" /><p className="text-xs" style={S.muted_t}>{t('mkt.mgr.kpiTrial')}</p><p className="text-xl font-bold" style={S.base}>{kpi.trial}</p></div>
          <div className="p-4 rounded-xl border" style={S.card}><DollarSign className="w-5 h-5 text-amber-600 mb-2" /><p className="text-xs" style={S.muted_t}>{t('mkt.mgr.kpiInterested')}</p><p className="text-xl font-bold" style={S.base}>{kpi.interested}</p></div>
        </div>
      )}

      {activeTab === 'lead-approval' && (
        <div className="rounded-xl border p-4 space-y-2" style={S.card}>
          {allLeads.slice(0, 120).map(lead => (
            <div key={lead.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-semibold" style={S.base}>{lead.business_name}</p>
                <p className="text-xs" style={S.muted_t}>
                  {lead.business_region || t('mkt.mgr.unspecified')}
                  {' - '}
                  {lead.contact_phone || t('mkt.mgr.noPhone')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs rounded px-2 py-1 font-semibold" style={{ ...S.muted, color: 'var(--text-base)' }}>{pickLabel(t, LEAD_STATUS_KEY, lead.status)}</span>
                <button className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 font-semibold" onClick={() => approveLeadMutation.mutate({ leadId: lead.id, status: 'converted' })}>{t('mkt.mgr.btnActive')}</button>
                <button className="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 font-semibold" onClick={() => approveLeadMutation.mutate({ leadId: lead.id, status: 'trial_active' })}>{t('mkt.mgr.btnTrial')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'associates' && (
        <div className="rounded-xl border p-4 space-y-2" style={S.card}>
          {associates.map((associate: any) => (
            <div key={associate.id} className="border rounded-lg p-3 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-semibold" style={S.base}>{associate.display_name || associate.id}</p>
                <p className="text-xs" style={S.muted_t}>
                  {t('mkt.mgr.assocLeads')} {associate.total_leads_assigned}
                  {' - '}
                  {t('mkt.mgr.assocConversions')} {associate.total_conversions}
                </p>
              </div>
              <button
                onClick={() => toggleAssociateMutation.mutate({ associateId: associate.id, nextActive: !associate.is_active })}
                className={`px-3 py-1 text-xs rounded font-semibold ${associate.is_active ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
              >
                {associate.is_active ? t('mkt.mgr.disable') : t('mkt.mgr.enable')}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="space-y-4">

          {/* ── Referral commission summary per associate ── */}
          <div className="rounded-xl border p-4" style={S.card}>
            <h2 className="font-semibold mb-1 flex items-center gap-2" style={S.base}>
              <Banknote className="w-4 h-4 text-brand-600" /> عمولات الإحالة — 150 ريال لكل متجر
            </h2>
            <p className="text-xs mb-3" style={S.muted_t}>كل موظف يجلب متجراً بكوده الخاص يحصل على 150 ريال. حوّل المبلغ على الإيبان ثم سجّل الدفع هنا.</p>

            {associateProfiles.length === 0 ? (
              <p className="text-sm py-3 text-center" style={S.muted_t}>لا يوجد موظفون مسجّلون بعد</p>
            ) : (
              <div className="space-y-2">
                {associateProfiles.map((ap: any) => (
                  <div key={ap.id} className="border rounded-xl p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold" style={S.base}>{ap.display_name || ap.id}</p>
                        <p className="text-xs font-mono" style={S.muted_t}>كود: {ap.referral_code || '—'}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">معلّق: {ap.pending_commissions_sar ?? 0} ريال</span>
                        <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full ms-1">مدفوع: {ap.paid_commissions_sar ?? 0} ريال</span>
                      </div>
                    </div>
                    {ap.iban ? (
                      <div className="flex items-center gap-2 rounded-lg px-3 py-2 border" style={S.subtle}>
                        <CreditCard className="w-3.5 h-3.5 shrink-0" style={S.muted_t} />
                        <span className="font-mono text-xs select-all" style={S.base}>{ap.iban}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> لم يُضف الموظف إيبانه بعد
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Per-conversion list with mark-paid buttons ── */}
          <div className="rounded-xl border p-4" style={S.card}>
            <h2 className="font-semibold mb-3 flex items-center gap-2" style={S.base}>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              سجل كل عملية إحالة ({referralConversions.length})
            </h2>

            {referralConversions.length === 0 ? (
              <p className="text-sm text-center py-4" style={S.muted_t}>لا توجد إحالات بعد</p>
            ) : (
              <div className="space-y-2">
                {referralConversions.map((conv: any) => {
                  const ap = associateProfiles.find((a: any) => a.id === conv.associate_id)
                  const isPaid = conv.status === 'paid'
                  return (
                    <div key={conv.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm" style={S.base}>{conv.store_name || conv.store_email || '—'}</p>
                        <p className="text-xs" style={S.muted_t}>
                          <span className="font-mono rounded px-1" style={S.muted}>{conv.referral_code}</span>
                          {' → '}
                          <span className="font-semibold">{ap?.display_name || conv.associate_id?.slice(0,8)}</span>
                          {ap?.iban && <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}> | {ap.iban}</span>}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{new Date(conv.created_at).toLocaleDateString('ar-SA')}</p>
                        {conv.paid_at && <p className="text-xs text-emerald-600">✓ دُفع: {new Date(conv.paid_at).toLocaleDateString('ar-SA')}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold" style={S.base}>{conv.commission_amount} ريال</span>
                        {isPaid ? (
                          <span className="text-xs bg-emerald-200 text-emerald-800 font-semibold px-2 py-1 rounded-lg">✓ مدفوع</span>
                        ) : (
                          <button
                            onClick={() => {
                              if (!ap?.iban) {
                                toast.error('الموظف لم يُضف إيبانه — اطلب منه إضافته أولاً')
                                return
                              }
                              if (!confirm(`تأكيد: هل حوّلت 150 ريال على إيبان ${ap.iban}؟`)) return
                              markPaidMutation.mutate({ conversionId: conv.id })
                            }}
                            disabled={markPaidMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <Banknote className="w-3.5 h-3.5" /> تم التحويل ✓
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Legacy bonus payouts (existing system) ── */}
          <details className="rounded-xl border" style={S.card}>
            <summary className="p-4 font-semibold cursor-pointer text-sm" style={S.muted_t}>
              نظام المكافآت القديم ({payouts.length} سجل)
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {bonusTracker.map((row: any) => {
                const cycles = row.bonus_cycles_completed || 0
                const amount = row.bonus_sar || 0
                return (
                  <div key={row.associate_id} className="border rounded-lg p-3 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="font-semibold" style={S.base}>{row.associate_name}</p>
                      <p className="text-xs" style={S.muted_t}>{t('mkt.mgr.cycles')} {cycles} — {t('mkt.mgr.bonus')} {amount} {t('mkt.mgr.sar')}</p>
                    </div>
                    <button disabled={amount <= 0} onClick={() => createPayoutMutation.mutate({ associateId: row.associate_id, amount, cycles })} className="px-3 py-1 rounded text-xs bg-amber-100 text-amber-700 disabled:opacity-50">{t('mkt.mgr.createPayout')}</button>
                  </div>
                )
              })}
              {payouts.map((p: any) => (
                <div key={p.id} className="border rounded-lg p-3 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="font-semibold" style={S.base}>{p.associate_id}</p>
                    <p className="text-xs" style={S.muted_t}>{p.payout_amount_sar} {t('mkt.mgr.sar')} — {pickLabel(t, PAYOUT_STATUS_KEY, p.payout_status)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700" onClick={() => setPayoutStatusMutation.mutate({ payoutId: p.id, status: 'paid' })}>{t('mkt.mgr.markPaid')}</button>
                    <button className="px-2 py-1 text-xs rounded bg-red-100 text-red-700" onClick={() => setPayoutStatusMutation.mutate({ payoutId: p.id, status: 'rejected' })}>{t('mkt.mgr.reject')}</button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {activeTab === 'team-tasks' && (
        <div className="space-y-3">
          <div className="rounded-xl border p-4 space-y-3" style={S.card}>
            <div className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-brand-700" />
              <h2 className="font-semibold" style={S.base}>{t('mkt.mgr.assignTasksTitle')}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.assocLabel')}</label>
                <select
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                >
                  <option value="">{t('mkt.mgr.selectAssoc')}</option>
                  {associates.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.display_name || a.id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.start')}</label>
                <input
                  type="date"
                  value={taskForm.weekStart}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, weekStart: e.target.value }))}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                />
              </div>

              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.end')}</label>
                <input
                  type="date"
                  value={taskForm.weekEnd}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, weekEnd: e.target.value }))}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                />
              </div>

              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.contactsTarget')}</label>
                <input
                  type="number"
                  min={1}
                  value={taskForm.contactsTarget}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, contactsTarget: Number(e.target.value || 0) }))}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                />
              </div>

              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.convTarget')}</label>
                <input
                  type="number"
                  min={1}
                  value={taskForm.conversionTarget}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, conversionTarget: Number(e.target.value || 0) }))}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                />
              </div>

              <div>
                <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.region')}</label>
                <input
                  value={taskForm.focusRegion}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, focusRegion: e.target.value }))}
                  placeholder={t('mkt.mgr.regionPh')}
                  className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                  style={S.input}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold" style={S.muted_t}>{t('mkt.mgr.taskNotes')}</label>
              <textarea
                value={taskForm.notes}
                onChange={(e) => setTaskForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder={t('mkt.mgr.taskNotesPh')}
                className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                style={S.input}
              />
            </div>

            <button
              onClick={() => createTaskMutation.mutate()}
              disabled={createTaskMutation.isPending}
              className="px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {createTaskMutation.isPending
                ? t('mkt.mgr.assigning')
                : t('mkt.mgr.assignTask')}
            </button>
          </div>

          <div className="rounded-xl border p-4 space-y-2" style={S.card}>
            <h2 className="font-semibold" style={S.base}>{t('mkt.mgr.taskBoard')}</h2>
            {weeklyTasks.map((task: any) => (
              <div key={task.id} className="border rounded-lg p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold" style={S.base}>{associateNameById.get(task.assigned_to) || task.assigned_to}</p>
                    <p className="text-xs" style={S.muted_t}>
                      {task.week_start} ← → {task.week_end} | {t('mkt.mgr.regionColon')} {task.focus_region || t('mkt.mgr.any')}
                    </p>
                  </div>
                  <span className="text-xs rounded px-2 py-1 font-semibold" style={{ ...S.muted, color: 'var(--text-base)' }}>{pickLabel(t, TASK_STATUS_KEY, task.status)}</span>
                </div>

                <p className="text-xs font-semibold" style={S.muted_t}>
                  ☎️ {task.contacts_completed}/{task.contacts_target} | 🎯 {task.conversions_completed}/{task.conversion_target}
                </p>

                {task.notes && <p className="text-xs" style={S.muted_t}>{task.notes}</p>}

                <div className="flex flex-wrap gap-2">
                  <button className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 font-semibold" onClick={() => updateTaskStatusMutation.mutate({ taskId: task.id, status: 'active' })}>{t('mkt.mgr.taskActive')}</button>
                  <button className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 font-semibold" onClick={() => updateTaskStatusMutation.mutate({ taskId: task.id, status: 'paused' })}>{t('mkt.mgr.taskPaused')}</button>
                  <button className="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 font-semibold" onClick={() => updateTaskStatusMutation.mutate({ taskId: task.id, status: 'completed' })}>{t('mkt.mgr.taskDone')}</button>
                  <button className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 font-semibold" onClick={() => updateTaskStatusMutation.mutate({ taskId: task.id, status: 'cancelled' })}>{t('mkt.mgr.taskCancelled')}</button>
                </div>
              </div>
            ))}

            {!weeklyTasks.length && (
              <div className="text-sm border rounded-lg p-4" style={{ ...S.muted_t, borderColor: 'var(--border)' }}>
                {t('mkt.mgr.noTasks')}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bulk-import' && (
        <div className="space-y-3">
          <div className="rounded-xl border p-4 space-y-3" style={S.card}>
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand-700" />
              <h2 className="font-semibold" style={S.base}>{t('mkt.mgr.bulkTitle')}</h2>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <p className="font-semibold mb-1">{t('mkt.mgr.bulkFormatTitle')}</p>
              <p>{t('mkt.mgr.bulkFormatLine')}</p>
              <p className="mt-2">{t('mkt.mgr.bulkExamples')}</p>
              <p>{t('mkt.mgr.bulkExampleLine')}</p>
            </div>

            <textarea
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              placeholder={t('mkt.mgr.bulkPlaceholder')}
              rows={10}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              style={S.input}
            />

            <div className="flex gap-2">
              <button
                onClick={() => bulkImportLeadsMutation.mutate()}
                disabled={!bulkImportText.trim() || bulkImportLeadsMutation.isPending}
                className="px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {bulkImportLeadsMutation.isPending
                  ? t('mkt.mgr.importing')
                  : t('mkt.mgr.importLeads')}
              </button>
              <button
                onClick={() => setBulkImportText(t('mkt.mgr.bulkSampleFill'))}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ ...S.muted, color: 'var(--text-base)' }}
              >
                {t('mkt.mgr.sampleBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
