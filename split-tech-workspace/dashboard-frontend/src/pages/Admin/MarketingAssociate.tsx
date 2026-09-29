import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, CheckCircle2, ClipboardList, Trophy, Zap,
  Copy, Share2, Banknote, Clock, CheckCheck, AlertCircle, CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import type { MarketingLead } from '../../types'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

type AssocTab = 'entry' | 'leads' | 'bonus' | 'commission'

type DuplicateCheckResult = {
  exists: boolean
  lead_id?: string
  status?: string
  owned_by_me?: boolean
  created_at?: string
}

const PIPELINE_STEPS = ['new', 'contacted', 'interested', 'trial_active', 'converted'] as const
const PIPELINE_LABEL_KEY: Record<(typeof PIPELINE_STEPS)[number], TranslationKey> = {
  new: 'mkt.asc.pl.new',
  contacted: 'mkt.asc.pl.contacted',
  interested: 'mkt.asc.pl.interested',
  trial_active: 'mkt.asc.pl.trial_active',
  converted: 'mkt.asc.pl.converted',
}

function routeToTab(pathname: string): AssocTab {
  if (pathname.endsWith('/entry')) return 'entry'
  if (pathname.endsWith('/bonus')) return 'bonus'
  if (pathname.endsWith('/commission')) return 'commission'
  return 'leads'
}

// ── CSS variable style helpers ────────────────────────────────────────────────
const S = {
  card:     { background: 'var(--bg-card)',   borderColor: 'var(--border)' } as React.CSSProperties,
  subtle:   { background: 'var(--bg-subtle)', borderColor: 'var(--border)' } as React.CSSProperties,
  muted:    { background: 'var(--bg-muted)' } as React.CSSProperties,
  base:     { color: 'var(--text-base)' }     as React.CSSProperties,
  muted_t:  { color: 'var(--text-muted)' }    as React.CSSProperties,
  input:    { background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-base)' } as React.CSSProperties,
}

export default function MarketingAssociateDashboard() {
  const { user } = useAuth()
  const { t, isRtl } = useLanguage()
  const pipeline = PIPELINE_STEPS.map(value => ({ value, label: t(PIPELINE_LABEL_KEY[value]) }))
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  const activeTab = routeToTab(location.pathname)

  const [singleForm, setSingleForm] = useState({
    businessName: '',
    businessRegion: '',
    mapsLink: '',
    contactPhone: '',
    status: 'interested',
  })
  const [bulkText, setBulkText] = useState('')
  const [bulkStatus, setBulkStatus] = useState('interested')
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null)

  // ── Commission tab state ────────────────────────────────────────────────────
  const [ibanInput, setIbanInput] = useState('')
  const [savingIban, setSavingIban] = useState(false)

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['assoc-my-leads', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('marketing_leads')
        .select('*')
        .eq('assigned_to', user.id)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data || []) as MarketingLead[]
    },
    enabled: !!user?.id,
  })

  const { data: bonusRow } = useQuery({
    queryKey: ['assoc-bonus-row', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('marketing_bonus_tracker')
        .select('*')
        .eq('associate_id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user?.id,
  })

  const { data: weeklyTask } = useQuery({
    queryKey: ['assoc-weekly-task-fast', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('marketing_weekly_tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .neq('status', 'cancelled')
        .order('assigned_at', { ascending: false })
        .limit(1)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  })

  // ── Commission queries ──────────────────────────────────────────────────────
  // Uses API endpoint (not direct Supabase) so it auto-creates the profile row
  // (and triggers referral code generation) if the associate is new.
  const { data: commProfile } = useQuery({
    queryKey: ['assoc-comm-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/associate/profile`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!user?.id,
  })

  const { data: conversions = [] } = useQuery({
    queryKey: ['assoc-conversions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('marketing_referral_conversions')
        .select('id,store_name,store_email,commission_amount,status,paid_at,created_at')
        .eq('associate_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data || []
    },
    enabled: !!user?.id && activeTab === 'commission',
  })

  const checkDuplicateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('marketing_check_duplicate_lead', {
        p_business_name: singleForm.businessName,
        p_business_region: singleForm.businessRegion,
        p_contact_phone: singleForm.contactPhone,
      })
      if (error) throw error
      return data as DuplicateCheckResult
    },
    onSuccess: setDuplicateResult,
  })

  const createLeadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('marketing_create_lead', {
        p_business_name: singleForm.businessName,
        p_contact_name: null,
        p_contact_phone: singleForm.contactPhone || null,
        p_contact_email: null,
        p_business_region: singleForm.businessRegion || null,
        p_business_type: null,
        p_source: 'mobile_fast_entry',
        p_notes: singleForm.mapsLink || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      if (singleForm.status !== 'new') {
        const { data: latestLead } = await supabase
          .from('marketing_leads')
          .select('id,status')
          .eq('assigned_to', user?.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (latestLead?.id) {
          await supabase.from('marketing_lead_status_history').insert({
            lead_id: latestLead.id,
            old_status: latestLead.status,
            new_status: singleForm.status,
            changed_by: user?.id,
          })
          await supabase.from('marketing_leads').update({ status: singleForm.status }).eq('id', latestLead.id)
        }
      }
      setSingleForm({ businessName: '', businessRegion: '', mapsLink: '', contactPhone: '', status: 'interested' })
      setDuplicateResult(null)
      queryClient.invalidateQueries({ queryKey: ['assoc-my-leads'] })
      queryClient.invalidateQueries({ queryKey: ['assoc-bonus-row'] })
    },
  })

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const rows = bulkText.split('\n').map(line => line.trim()).filter(Boolean)
      const payload = rows.map((line) => {
        const [businessName, businessRegion, contactPhone, mapsLink] = line.split(',').map(v => v?.trim() || '')
        return { business_name: businessName, business_region: businessRegion, contact_phone: contactPhone, source: 'bulk_mobile_fast_entry', maps_link: mapsLink }
      })
      const { data, error } = await supabase.rpc('marketing_bulk_create_leads', { p_leads: payload })
      if (error) throw error
      if (bulkStatus !== 'new') {
        const { data: latest } = await supabase.from('marketing_leads').select('id,status').eq('assigned_to', user?.id).order('created_at', { ascending: false }).limit(payload.length)
        for (const lead of latest || []) {
          if (lead.status !== bulkStatus) {
            await supabase.from('marketing_lead_status_history').insert({ lead_id: lead.id, old_status: lead.status, new_status: bulkStatus, changed_by: user?.id })
            await supabase.from('marketing_leads').update({ status: bulkStatus }).eq('id', lead.id)
          }
        }
      }
      return data
    },
    onSuccess: () => {
      setBulkText('')
      queryClient.invalidateQueries({ queryKey: ['assoc-my-leads'] })
      queryClient.invalidateQueries({ queryKey: ['assoc-bonus-row'] })
    },
  })

  const setLeadStatusMutation = useMutation({
    mutationFn: async ({ lead, status }: { lead: MarketingLead; status: string }) => {
      await supabase.from('marketing_lead_status_history').insert({ lead_id: lead.id, old_status: lead.status, new_status: status, changed_by: user?.id })
      const { error } = await supabase.from('marketing_leads').update({ status, status_updated_at: new Date().toISOString() }).eq('id', lead.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assoc-my-leads'] })
      queryClient.invalidateQueries({ queryKey: ['assoc-bonus-row'] })
    },
  })

  // ── Commission helpers ──────────────────────────────────────────────────────
  const referralCode = commProfile?.referral_code ?? '...'
  const shareLink    = `https://splittech.sa/signup?ref=${referralCode}`

  function copyCode() {
    navigator.clipboard.writeText(referralCode).then(() => toast.success('تم نسخ الكود ✓'))
  }
  function copyLink() {
    navigator.clipboard.writeText(shareLink).then(() => toast.success('تم نسخ الرابط ✓'))
  }

  async function handleSaveIban() {
    const cleaned = ibanInput.trim().toUpperCase().replace(/\s/g, '')
    if (!/^SA\d{22}$/.test(cleaned)) {
      toast.error('صيغة IBAN غير صحيحة — يجب SA + 22 رقماً')
      return
    }
    setSavingIban(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/associate/save-iban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ iban: cleaned }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('تم حفظ الإيبان بنجاح ✓')
      setIbanInput('')
      queryClient.invalidateQueries({ queryKey: ['assoc-comm-profile'] })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ')
    } finally {
      setSavingIban(false)
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const tabButton = (tab: AssocTab, label: string) => (
    <button
      onClick={() => navigate(`/admin/marketing-associate/${tab}`)}
      style={activeTab === tab ? undefined : { ...S.card, color: 'var(--text-base)' }}
      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${activeTab === tab ? 'bg-brand-700 text-white border-brand-700' : ''}`}
    >
      {label}
    </button>
  )

  const bonusProgress = (bonusRow?.progress_to_next_bonus ?? 0) as number
  const bonusSar = (bonusRow?.bonus_sar ?? 0) as number

  if (isLoading) return <div className="h-screen flex items-center justify-center"><LoadingSpinner /></div>

  return (
    <div className="p-3 md:p-6 space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold" style={S.base}>{t('mkt.asc.title')}</h1>
          <p className="text-xs md:text-sm" style={S.muted_t}>{t('mkt.asc.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabButton('entry', t('mkt.asc.tabEntry'))}
          {tabButton('leads', t('mkt.asc.tabLeads'))}
          {tabButton('bonus', t('mkt.asc.tabBonus'))}
          {tabButton('commission', '💰 عمولاتي')}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        {t('mkt.disclaimer')}
      </div>

      {/* ── Entry tab ── */}
      {activeTab === 'entry' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4 space-y-3" style={S.card}>
            <h2 className="font-semibold flex items-center gap-2" style={S.base}><Zap className="w-4 h-4" /> {t('mkt.asc.fastTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="px-3 py-2 border rounded-lg" style={S.input} placeholder={t('mkt.asc.phStore')} value={singleForm.businessName} onChange={e => setSingleForm(v => ({ ...v, businessName: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" style={S.input} placeholder={t('mkt.asc.phRegion')} value={singleForm.businessRegion} onChange={e => setSingleForm(v => ({ ...v, businessRegion: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" style={S.input} placeholder={t('mkt.asc.phPhone')} value={singleForm.contactPhone} onChange={e => setSingleForm(v => ({ ...v, contactPhone: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" style={S.input} placeholder={t('mkt.asc.phMaps')} value={singleForm.mapsLink} onChange={e => setSingleForm(v => ({ ...v, mapsLink: e.target.value }))} />
              <select className="px-3 py-2 border rounded-lg md:col-span-2" style={S.input} value={singleForm.status} onChange={e => setSingleForm(v => ({ ...v, status: e.target.value }))}>
                {pipeline.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => checkDuplicateMutation.mutate()} disabled={!singleForm.businessName || !singleForm.contactPhone || checkDuplicateMutation.isPending} className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ ...S.muted, color: 'var(--text-base)' }}>{t('mkt.asc.checkFirst')}</button>
              <button onClick={() => createLeadMutation.mutate()} disabled={!singleForm.businessName || !singleForm.contactPhone || duplicateResult?.exists || createLeadMutation.isPending} className="px-3 py-2 rounded-lg bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">{t('mkt.asc.saveLead')}</button>
            </div>
            {duplicateResult?.exists && (
              <div className="text-xs bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 font-semibold">{t('mkt.asc.dupWarn')}</div>
            )}
          </div>

          <div className="rounded-xl border p-4 space-y-3" style={S.card}>
            <h2 className="font-semibold flex items-center gap-2" style={S.base}><ClipboardList className="w-4 h-4" /> {t('mkt.asc.bulkTitle')}</h2>
            <p className="text-xs rounded p-2 border" style={S.subtle}>{t('mkt.asc.bulkFormat')}</p>
            <textarea className="w-full border rounded-lg px-3 py-2 min-h-48 font-mono text-xs" style={S.input} value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={t('mkt.asc.bulkPlaceholder')} />
            <div className="flex items-center gap-2">
              <select className="px-3 py-2 border rounded-lg" style={S.input} value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                {pipeline.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button onClick={() => bulkCreateMutation.mutate()} disabled={!bulkText.trim() || bulkCreateMutation.isPending} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                {bulkCreateMutation.isPending ? t('mkt.asc.submitting') : t('mkt.asc.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leads tab ── */}
      {activeTab === 'leads' && (
        <div className="rounded-xl border p-4 space-y-3" style={S.card}>
          <h2 className="font-semibold flex items-center gap-2" style={S.base}><Building2 className="w-4 h-4" /> {`${t('mkt.asc.myLeadsTitle')} (${leads.length})`}</h2>
          {leads.length === 0 && <p className="text-sm" style={S.muted_t}>{t('mkt.asc.noLeads')}</p>}
          <div className="space-y-2">
            {leads.map(lead => (
              <div key={lead.id} className="border rounded-lg p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold" style={S.base}>{lead.business_name}</p>
                    <p className="text-xs" style={S.muted_t}>{lead.business_region || t('mkt.asc.noRegion')}{' - '}{lead.contact_phone || t('mkt.asc.noPhone')}</p>
                  </div>
                  <select value={lead.status} onChange={e => setLeadStatusMutation.mutate({ lead, status: e.target.value })} className="px-2 py-1 border rounded-lg text-sm" style={S.input}>
                    {pipeline.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bonus tab ── */}
      {activeTab === 'bonus' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4" style={S.card}>
            <h2 className="font-semibold flex items-center gap-2" style={S.base}><Trophy className="w-4 h-4 text-amber-500" />{t('mkt.asc.bonusTitle')}</h2>
            <div className="mt-3 flex items-center justify-between text-sm"><span style={S.base}>{t('mkt.asc.bonusProgress')}</span><span className="font-bold text-amber-600">{bonusProgress}/5</span></div>
            <div className="mt-2 h-2 bg-amber-100 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(bonusProgress / 5) * 100}%` }} /></div>
            <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--text-muted)' }}>{`${t('mkt.asc.bonusTotalPrefix')} ${bonusSar} ${t('mkt.asc.bonusCurrency')}`}</p>
          </div>
          <div className="rounded-xl border p-4" style={S.card}>
            <h3 className="font-semibold flex items-center gap-2" style={S.base}><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {t('mkt.asc.weeklyTitle')}</h3>
            {!weeklyTask ? <p className="text-sm mt-2" style={S.muted_t}>{t('mkt.asc.noWeeklyTask')}</p> : (
              <div className="mt-2 text-sm" style={S.base}>{t('mkt.asc.contactsLabel')} {weeklyTask.contacts_completed}/{weeklyTask.contacts_target}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Commission tab ── */}
      {activeTab === 'commission' && (
        <div className="space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: <Clock className="w-5 h-5 text-amber-500" />, label: 'عمولات معلّقة', value: `${commProfile?.pending_commissions_sar ?? 0} ريال`, bg: 'bg-amber-50 border-amber-200' },
              { icon: <CheckCheck className="w-5 h-5 text-emerald-600" />, label: 'عمولات مدفوعة', value: `${commProfile?.paid_commissions_sar ?? 0} ريال`, bg: 'bg-emerald-50 border-emerald-200' },
              { icon: <Building2 className="w-5 h-5 text-brand-600" />, label: 'متاجر مسجّلة', value: String(commProfile?.total_conversions ?? 0), bg: 'bg-blue-50 border-blue-200' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border rounded-xl p-3`}>
                {s.icon}
                <p className="text-xs mt-1" style={S.muted_t}>{s.label}</p>
                <p className="font-bold text-lg" style={S.base}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Referral code */}
          <div className="rounded-xl border p-5" style={S.card}>
            <h2 className="font-bold mb-1 flex items-center gap-2" style={S.base}>
              <Share2 className="w-4 h-4 text-brand-600" /> كود الإحالة الخاص بك
            </h2>
            <p className="text-xs mb-3" style={S.muted_t}>أعطِ هذا الكود أو الرابط للمتجر — وعندما يسجّل باستخدامه تُضاف لك عمولة 150 ريال</p>

            {/* Code display */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 rounded-xl px-4 py-3 font-mono text-2xl font-black text-center tracking-widest text-brand-700 select-all border" style={S.subtle}>
                {referralCode}
              </div>
              <button onClick={copyCode} className="p-3 rounded-xl bg-brand-700 text-white hover:bg-brand-800 transition-colors" title="نسخ الكود">
                <Copy className="w-4 h-4" />
              </button>
            </div>

            {/* Share link */}
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg px-3 py-2 text-xs font-mono truncate border" style={{ ...S.subtle, color: 'var(--text-muted)' }}>
                {shareLink}
              </div>
              <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap">
                <Share2 className="w-3.5 h-3.5" /> نسخ الرابط
              </button>
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              💡 <strong>كيف يعمل؟</strong> أرسل الرابط للمتجر — عندما يكمل التسجيل فيه تُحتسب عمولة 150 ريال تلقائياً في حسابك.
            </div>
          </div>

          {/* IBAN */}
          <div className="rounded-xl border p-5" style={S.card}>
            <h2 className="font-bold mb-1 flex items-center gap-2" style={S.base}>
              <CreditCard className="w-4 h-4 text-brand-600" /> الإيبان البنكي
            </h2>
            <p className="text-xs mb-3" style={S.muted_t}>سيُحوَّل المبلغ المستحق إلى هذا الحساب بعد تأكيد الإدارة</p>

            {commProfile?.iban ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                <div>
                  <p className="text-xs text-emerald-600 font-semibold mb-0.5">الإيبان المسجّل</p>
                  <p className="font-mono font-bold tracking-widest" style={S.base}>{commProfile.iban}</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            ) : (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">لم تُضف إيبانك بعد — أضفه حتى تتمكن الإدارة من تحويل عمولاتك</p>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={ibanInput}
                onChange={e => setIbanInput(e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="SA0000000000000000000000"
                maxLength={24}
                className="flex-1 border rounded-lg px-3 py-2 font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                style={S.input}
              />
              <button
                onClick={handleSaveIban}
                disabled={savingIban || !ibanInput.trim()}
                className="px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
              >
                <Banknote className="w-4 h-4" />
                {savingIban ? 'جارٍ الحفظ...' : 'حفظ الإيبان'}
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>الصيغة: SA + 22 رقماً (24 حرف)</p>
          </div>

          {/* Conversions list */}
          <div className="rounded-xl border p-4" style={S.card}>
            <h2 className="font-bold mb-3 flex items-center gap-2" style={S.base}>
              <Banknote className="w-4 h-4 text-brand-600" /> سجل العمولات ({conversions.length})
            </h2>
            {conversions.length === 0 ? (
              <p className="text-sm text-center py-4" style={S.muted_t}>لا توجد عمولات بعد — شارك كودك مع المتاجر</p>
            ) : (
              <div className="space-y-2">
                {conversions.map((conv: {
                  id: string; store_name: string | null; store_email: string | null;
                  commission_amount: number; status: string; paid_at: string | null; created_at: string
                }) => (
                  <div key={conv.id} className={`flex items-center justify-between p-3 rounded-xl border ${conv.status === 'paid' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div>
                      <p className="font-semibold text-sm" style={S.base}>{conv.store_name || conv.store_email || '—'}</p>
                      <p className="text-xs" style={S.muted_t}>{new Date(conv.created_at).toLocaleDateString('ar-SA')}</p>
                      {conv.paid_at && <p className="text-xs text-emerald-600">تم التحويل: {new Date(conv.paid_at).toLocaleDateString('ar-SA')}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold" style={S.base}>{conv.commission_amount} ريال</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${conv.status === 'paid' ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                        {conv.status === 'paid' ? '✓ مدفوع' : '⏳ معلّق'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
