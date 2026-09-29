import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Users, Shield, Ban, Mail, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatSaudiDate } from '../../lib/utils'
import { fetchUserRolesMap } from '../../lib/adminData'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'

const ROLES = [
  { value: 'merchant',             labelAr: 'تاجر',            labelEn: 'Merchant',          groupAr: 'عام',    groupEn: 'General' },
  { value: 'customer_support',    labelAr: 'دعم العملاء',      labelEn: 'Customer Support',  groupAr: 'داخلي',  groupEn: 'Internal' },
  { value: 'it_support',          labelAr: 'دعم تقني',         labelEn: 'IT Support',        groupAr: 'داخلي',  groupEn: 'Internal' },
  { value: 'marketing_associate', labelAr: 'مندوب تسويق',      labelEn: 'Marketing Assoc.',  groupAr: 'تسويق',  groupEn: 'Marketing' },
  { value: 'marketing_manager',   labelAr: 'مدير تسويق',       labelEn: 'Marketing Mgr.',    groupAr: 'تسويق',  groupEn: 'Marketing' },
  { value: 'super_owner',         labelAr: 'مالك رئيسي',       labelEn: 'Super Owner',       groupAr: 'مشرف',   groupEn: 'Admin' },
]

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {[1, 2, 3, 4].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse w-3/4" style={{ background: 'var(--bg-muted)' }} />
        </td>
      ))}
    </tr>
  )
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const qc = useQueryClient()
  const [roleModal, setRoleModal] = useState<{ open: boolean; userId: string | null; currentRole: string; name: string }>({ open: false, userId: null, currentRole: 'merchant', name: '' })
  const [banModal, setBanModal] = useState<{ open: boolean; userId: string | null; name: string; isBanned: boolean }>({ open: false, userId: null, name: '', isBanned: false })
  const [banReason, setBanReason] = useState('')
  const [newRole, setNewRole] = useState('merchant')
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rolesMap = await fetchUserRolesMap((profiles || []).map((profile) => profile.id))
      return (profiles || []).map((profile) => ({
        ...profile,
        user_roles: rolesMap[profile.id] ? { role: rolesMap[profile.id].role } : null,
      }))
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role }, { onConflict: 'user_id' })
      if (error) throw error

      if (role === 'marketing_associate' || role === 'marketing_manager') {
        const marketingRole = role === 'marketing_manager' ? 'manager' : 'associate'
        const { error: mappingError } = await supabase
          .from('marketing_role_mappings')
          .upsert(
            {
              user_id: userId,
              marketing_role: marketingRole,
              reports_to: role === 'marketing_associate' ? currentUser?.id ?? null : null,
              can_view_all_leads: role === 'marketing_manager',
              can_assign_leads:   role === 'marketing_manager',
              can_create_tasks:   role === 'marketing_manager',
              can_send_emails:    role === 'marketing_manager',
              can_view_performance: role === 'marketing_manager',
            },
            { onConflict: 'user_id' }
          )
        if (mappingError) throw mappingError

        if (role === 'marketing_associate') {
          const { error: profileError } = await supabase
            .from('marketing_associate_profile')
            .upsert(
              { id: userId, team_lead: currentUser?.id ?? null, is_active: true, can_share_lead_contacts: false },
              { onConflict: 'id' }
            )
          if (profileError) throw profileError
        }
      } else {
        const { error: deleteMappingError } = await supabase
          .from('marketing_role_mappings')
          .delete()
          .eq('user_id', userId)
        if (deleteMappingError) throw deleteMappingError
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-users'] })
      setRoleModal({ open: false, userId: null, currentRole: 'merchant', name: '' })
    },
  })

  const banUser = useMutation({
    mutationFn: async ({ userId, ban, reason }: { userId: string; ban: boolean; reason?: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_banned: ban,
          banned_at: ban ? new Date().toISOString() : null,
          banned_reason: ban ? reason || null : null,
        })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-users'] })
      setBanModal({ open: false, userId: null, name: '', isBanned: false })
      setBanReason('')
    },
  })

  const roleLabelMap: Record<string, { ar: string; en: string }> = {
    super_owner:          { ar: 'مالك رئيسي',    en: 'Super Owner' },
    it_support:           { ar: 'دعم تقني',       en: 'IT Support' },
    customer_support:     { ar: 'دعم عملاء',      en: 'Customer Support' },
    marketing_manager:    { ar: 'مدير تسويق',     en: 'Marketing Manager' },
    marketing_associate:  { ar: 'مندوب تسويق',    en: 'Marketing Associate' },
    merchant:             { ar: 'تاجر',            en: 'Merchant' },
  }

  const roleBadge: Record<string, 'active' | 'info' | 'pending' | 'suspended' | 'warning'> = {
    super_owner:          'active',
    it_support:           'info',
    customer_support:     'pending',
    marketing_manager:    'warning',
    marketing_associate:  'warning',
    merchant:             'suspended',
  }

  const filtered = users.filter((u: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.company_name?.toLowerCase().includes(q)
    )
  })

  // Groups for role select
  const groups = isAr
    ? ['عام', 'داخلي', 'تسويق', 'مشرف']
    : ['General', 'Internal', 'Marketing', 'Admin']

  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
            <Users className="w-6 h-6 text-brand-700" />
            {isAr ? 'إدارة المستخدمين' : 'User Management'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr ? `${users.length} مستخدم مسجل` : `${users.length} registered users`}
          </p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={isAr ? 'بحث بالاسم أو اسم الشركة...' : 'Search by name or company...'}
        className="input-field max-w-sm"
      />

      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-start px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'المستخدم' : 'User'}
                </th>
                <th className="text-start px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الدور' : 'Role'}
                </th>
                <th className="text-start px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th className="text-start px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'تاريخ التسجيل' : 'Registered'}
                </th>
                <th className="text-start px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'الإجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.map((u: any) => {
                  const role = u.user_roles?.role || 'merchant'
                  const isSelf = u.id === currentUser?.id
                  const isBanned = u.is_banned === true
                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${isBanned ? 'opacity-60' : ''}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelf ? 'rgba(0,95,45,0.04)' : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            isBanned ? 'bg-red-100 text-red-600' : 'bg-brand-100 text-brand-700'
                          }`}>
                            {isBanned ? '🚫' : (u.full_name?.[0] || '?')}
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{u.full_name || '—'}</p>
                            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{u.company_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={roleBadge[role] || 'info'}
                          label={isAr ? (roleLabelMap[role]?.ar || role) : (roleLabelMap[role]?.en || role)}
                        />
                        {isSelf && (
                          <span className="text-[10px] mr-1" style={{ color: 'var(--text-faint)' }}>
                            {isAr ? '(أنت)' : '(you)'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isBanned ? (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            {isAr ? 'محظور' : 'Banned'}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                            {isAr ? 'نشط' : 'Active'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                        {formatSaudiDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {!isSelf && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button size="sm" variant="secondary"
                              onClick={() => {
                                setNewRole(role)
                                setRoleModal({ open: true, userId: u.id, currentRole: role, name: u.full_name })
                              }}
                              className="flex items-center gap-1"
                            >
                              <Shield size={12} />
                              {isAr ? 'الدور' : 'Role'}
                            </Button>
                            <Button size="sm" variant="secondary"
                              onClick={() => setBanModal({ open: true, userId: u.id, name: u.full_name, isBanned })}
                              className={`flex items-center gap-1 ${isBanned ? 'text-brand-600' : 'text-red-600 hover:bg-red-50'}`}
                            >
                              <Ban size={12} />
                              {isBanned ? (isAr ? 'رفع الحظر' : 'Unban') : (isAr ? 'حظر' : 'Ban')}
                            </Button>
                            <a
                              href={`mailto:?subject=${isAr ? 'رسالة من سبلت تيك AI' : 'Message from SplitTech AI'}&body=${isAr ? `السلام عليكم ${u.full_name || ''}،` : `Hello ${u.full_name || ''},`}`}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                              style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                            >
                              <Mail size={12} />
                              {isAr ? 'مراسلة' : 'Email'}
                            </a>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role modal */}
      <Modal
        open={roleModal.open}
        onClose={() => setRoleModal({ open: false, userId: null, currentRole: 'merchant', name: '' })}
        title={isAr ? `تغيير دور — ${roleModal.name}` : `Change Role — ${roleModal.name}`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{isAr ? 'الدور الجديد' : 'New Role'}</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input-field">
              {groups.map(group => {
                const groupRoles = ROLES.filter(r => isAr ? r.groupAr === group : r.groupEn === group)
                return (
                  <optgroup key={group} label={group}>
                    {groupRoles.map(({ value, labelAr, labelEn }) => (
                      <option key={value} value={value}>{isAr ? labelAr : labelEn}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {(newRole === 'marketing_associate' || newRole === 'marketing_manager') && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">
                {newRole === 'marketing_manager'
                  ? (isAr ? '📊 مدير التسويق' : '📊 Marketing Manager')
                  : (isAr ? '📋 مندوب التسويق' : '📋 Marketing Associate')}
              </p>
              <p className="text-xs">
                {newRole === 'marketing_manager'
                  ? (isAr
                      ? 'يمكنه: الوصول لبرج التحكم، إدارة الفريق، تعيين المهام الأسبوعية، إرسال حملات البريد، عرض جميع العملاء المحتملين.'
                      : 'Can: access command center, manage team, assign weekly tasks, send email campaigns, view all leads.')
                  : (isAr
                      ? 'يمكنه: الوصول للوحة التسويق الشخصية، إدارة العملاء المحتملين المعينين إليه، تسجيل محاولات التواصل.'
                      : 'Can: access personal marketing dashboard, manage assigned leads, log contact attempts.')}
              </p>
              <p className="text-xs mt-1 font-medium">
                {isAr ? 'سيتم إنشاء صلاحيات التسويق تلقائياً.' : 'Marketing permissions will be created automatically.'}
              </p>
            </div>
          )}

          <Button className="w-full" loading={updateRole.isPending}
            onClick={() => roleModal.userId && updateRole.mutate({ userId: roleModal.userId, role: newRole })}>
            {isAr ? 'تأكيد التغيير' : 'Confirm Change'}
          </Button>
        </div>
      </Modal>

      {/* Ban modal */}
      <Modal
        open={banModal.open}
        onClose={() => setBanModal({ open: false, userId: null, name: '', isBanned: false })}
        title={banModal.isBanned
          ? (isAr ? `رفع الحظر — ${banModal.name}` : `Unban — ${banModal.name}`)
          : (isAr ? `حظر المستخدم — ${banModal.name}` : `Ban User — ${banModal.name}`)}
        size="sm"
      >
        <div className="space-y-4">
          {!banModal.isBanned && (
            <>
              <div className="flex items-start gap-3 bg-red-50 rounded-xl p-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  {isAr
                    ? 'سيتم منع هذا المستخدم من الدخول للمنصة فوراً.'
                    : 'This user will be immediately blocked from accessing the platform.'}
                </p>
              </div>
              <div>
                <label className="label">{isAr ? 'سبب الحظر (اختياري)' : 'Ban reason (optional)'}</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  rows={3}
                  className="input-field"
                  placeholder={isAr ? 'اذكر السبب...' : 'State the reason...'}
                />
              </div>
            </>
          )}
          <Button
            className={`w-full ${banModal.isBanned ? '' : 'bg-red-600 hover:bg-red-700'}`}
            loading={banUser.isPending}
            onClick={() => banModal.userId && banUser.mutate({
              userId: banModal.userId,
              ban: !banModal.isBanned,
              reason: banReason,
            })}
          >
            {banModal.isBanned
              ? (isAr ? 'رفع الحظر' : 'Remove Ban')
              : (isAr ? 'تأكيد الحظر' : 'Confirm Ban')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
