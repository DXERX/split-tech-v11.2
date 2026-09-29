import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings, User, Building, Phone, Mail, LogOut, Shield, CreditCard, RefreshCw, ServerCog, Lock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useMySubscription } from '../../hooks/useStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import { formatSaudiDate, statusLabel, tierLabel } from '../../lib/utils'

const API = import.meta.env.VITE_API_URL

export default function DashboardSettings() {
  const { user, profile, signOut } = useAuth()
  const { data: subscription } = useMySubscription()
  const qc = useQueryClient()
  const { lang, t } = useLanguage()
  const isAr = lang === 'ar'

  // ── Account info ──────────────────────────────────────────────────────────
  const [form, setForm]   = useState({ full_name: '', company_name: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved]     = useState(false)

  // ── Email OTP flow ────────────────────────────────────────────────────────
  const [newEmail, setNewEmail]         = useState('')
  const [emailStep, setEmailStep]       = useState<'idle' | 'otp'>('idle')
  const [emailOtpCode, setEmailOtpCode] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError]     = useState('')
  const [emailCooldown, setEmailCooldown] = useState(0)
  const emailCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Password ──────────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm]       = useState({ newPassword: '', confirmPassword: '' })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordSaved, setPasswordSaved]     = useState(false)

  // ── Subscription ──────────────────────────────────────────────────────────
  const [subLoading, setSubLoading] = useState(false)

  useEffect(() => () => {
    if (emailCooldownTimer.current) clearInterval(emailCooldownTimer.current)
  }, [])

  useEffect(() => {
    setForm({
      full_name:    profile?.full_name    || '',
      company_name: profile?.company_name || '',
      phone:        profile?.phone        || '',
    })
  }, [profile?.full_name, profile?.phone, profile?.company_name])

  function startEmailCooldown() {
    setEmailCooldown(60)
    emailCooldownTimer.current = setInterval(() => {
      setEmailCooldown((n) => {
        if (n <= 1) { if (emailCooldownTimer.current) { clearInterval(emailCooldownTimer.current); emailCooldownTimer.current = null } return 0 }
        return n - 1
      })
    }, 1000)
  }

  // ── Account info save (name + company + phone directly) ───────────────────
  async function handleSave() {
    if (!user) return
    setLoading(true)
    const { error } = await supabase.from('profiles').update({
      full_name:    form.full_name,
      company_name: form.company_name,
      phone:        form.phone || null,
    }).eq('id', user.id)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['profile'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Email: send OTP to current email (identity check) ────────────────────
  async function handleSendEmailOtp() {
    const email = newEmail.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(isAr ? 'أدخل بريداً إلكترونياً صحيحاً' : 'Enter a valid email'); return
    }
    if (email === user?.email) {
      setEmailError(isAr ? 'البريد الجديد مطابق للحالي' : 'New email is the same as current'); return
    }
    setEmailError('')
    setEmailLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية' : 'Session expired')
      const r = await fetch(`${API}/v1/otp/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setEmailStep('otp')
      setEmailOtpCode('')
      startEmailCooldown()
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Error')
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Email: verify OTP then submit email change to GoTrue ──────────────────
  async function handleVerifyEmailOtp() {
    if (!emailOtpCode.trim()) return
    setEmailLoading(true)
    setEmailError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'الجلسة منتهية' : 'Session expired')
      const r = await fetch(`${API}/v1/otp/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ code: emailOtpCode.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Verification failed')
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      toast.success(isAr ? 'تم إرسال رابط التأكيد إلى بريدك الجديد ✓' : 'Confirmation link sent to your new email ✓')
      setEmailStep('idle')
      setEmailOtpCode('')
      setNewEmail('')
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Error')
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Password ──────────────────────────────────────────────────────────────
  async function handlePasswordChange() {
    if (passwordForm.newPassword.length < 8) { toast.error(t('settings.passwordTooShort')); return }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error(t('settings.passwordMismatch')); return }
    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword })
    setPasswordLoading(false)
    if (error) { toast.error(error.message); return }
    setPasswordForm({ newPassword: '', confirmPassword: '' })
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  // ── Subscription auto-renew ───────────────────────────────────────────────
  async function toggleAutoRenew(autoRenew: boolean) {
    if (!subscription) return
    const confirmed = window.confirm(
      isAr
        ? autoRenew ? 'هل تريد إعادة تفعيل التجديد التلقائي للاشتراك؟' : 'هل تريد إيقاف التجديد التلقائي عند نهاية الدورة الحالية؟'
        : autoRenew ? 'Do you want to re-enable auto-renewal for your subscription?' : 'Do you want to disable auto-renewal at the end of the current cycle?'
    )
    if (!confirmed) return
    setSubLoading(true)
    const note = `${subscription.notes ? `${subscription.notes}\n` : ''}${
      autoRenew ? 'Auto-renewal re-enabled' : 'Auto-renewal disabled'
    } — ${new Date().toISOString()}`
    const { error } = await supabase.from('subscriptions').update({ auto_renew: autoRenew, notes: note }).eq('id', subscription.id)
    if (error) { toast.error(error.message); setSubLoading(false); return }
    qc.invalidateQueries({ queryKey: ['my-subscription'] })
    setSubLoading(false)
  }

  return (
    <div className="page-container space-y-6 max-w-3xl" dir={isAr ? 'rtl' : 'ltr'}>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
          <Settings className="w-6 h-6 text-brand-700" />
          {isAr ? 'الإعدادات المتقدمة' : 'Account Settings'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'إدارة الحساب والأمان والرخصة والتشغيل من مكان واحد.' : 'Manage your account, security, subscription, and operations in one place.'}
        </p>
      </div>

      {/* ── Account Info ── */}
      <div className="rounded-2xl border shadow-card p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h3 className="font-bold mb-5" style={{ color: 'var(--text-base)' }}>
          {isAr ? 'معلومات الحساب' : 'Account Information'}
        </h3>
        <div className="space-y-4">
          <Input
            label={isAr ? 'الاسم الكامل' : 'Full Name'} type="text"
            value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            icon={<User size={16} />}
          />
          <Input
            label={isAr ? 'اسم الشركة / المنشأة' : 'Company / Business Name'} type="text"
            value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            icon={<Building size={16} />}
          />
          <Input
            label={isAr ? 'رقم الجوال' : 'Phone Number'} type="tel"
            value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            icon={<Phone size={16} />} placeholder="+966 5x xxx xxxx"
          />
          <div>
            <p className="label">{isAr ? 'البريد الإلكتروني' : 'Email Address'}</p>
            <p className="input-field cursor-not-allowed" style={{ color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}>
              {user?.email}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'لتغيير البريد استخدم القسم أدناه.' : 'To change email use the section below.'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} loading={loading} className="mt-5">
          {saved ? (isAr ? 'تم الحفظ ✓' : 'Saved ✓') : (isAr ? 'حفظ التغييرات' : 'Save Changes')}
        </Button>
      </div>

      {/* ── Email Change with OTP ── */}
      <div className="rounded-2xl border shadow-card p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'تغيير البريد الإلكتروني' : 'Change Email Address'}
          </h3>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          {isAr ? `البريد الحالي: ${user?.email}` : `Current email: ${user?.email}`}
        </p>

        {emailError && (
          <div className="rounded-xl p-3 mb-4 border text-sm" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {emailError}
          </div>
        )}

        {emailStep === 'idle' ? (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label={isAr ? 'البريد الإلكتروني الجديد' : 'New Email Address'} type="email"
                value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                icon={<Mail size={16} />} placeholder="new@company.sa"
              />
            </div>
            <Button onClick={handleSendEmailOtp} loading={emailLoading} variant="secondary" className="mb-0.5">
              {isAr ? 'إرسال رمز التحقق' : 'Send OTP'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? `تم إرسال رمز التحقق إلى بريدك الحالي ${user?.email}` : `Verification code sent to your current email ${user?.email}`}
            </p>
            <Input
              label={isAr ? 'رمز التحقق' : 'Verification Code'} type="text" inputMode="numeric"
              value={emailOtpCode} onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="XXXXXX" maxLength={6}
            />
            <div className="flex gap-3">
              <Button onClick={handleVerifyEmailOtp} loading={emailLoading} disabled={emailOtpCode.length < 4} className="flex-1">
                {isAr ? 'تأكيد تغيير البريد' : 'Confirm Email Change'}
              </Button>
              <Button variant="secondary" disabled={emailCooldown > 0}
                onClick={() => { setEmailStep('idle'); setEmailError(''); handleSendEmailOtp() }}>
                {emailCooldown > 0 ? `${emailCooldown}s` : (isAr ? 'إعادة الإرسال' : 'Resend')}
              </Button>
              <Button variant="secondary" onClick={() => { setEmailStep('idle'); setEmailError(''); setEmailOtpCode('') }}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Security & Password ── */}
      <div className="rounded-2xl border shadow-card p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'الأمان وتغيير كلمة المرور' : 'Security & Password'}
          </h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label={isAr ? 'كلمة المرور الجديدة' : 'New Password'} type="password"
            value={passwordForm.newPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
            icon={<Lock size={16} />} placeholder="••••••••" />
          <Input label={isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'} type="password"
            value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            icon={<Lock size={16} />} placeholder="••••••••" />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {isAr ? 'ننصح باستخدام كلمة مرور قوية تحتوي على حروف كبيرة وصغيرة وأرقام.' : 'Use a strong password with uppercase, lowercase letters and numbers.'}
        </p>
        <Button variant="secondary" onClick={handlePasswordChange} loading={passwordLoading} className="mt-4">
          {passwordSaved ? (isAr ? 'تم تحديث كلمة المرور ✓' : 'Password Updated ✓') : (isAr ? 'تحديث كلمة المرور' : 'Update Password')}
        </Button>
      </div>

      {/* ── Subscription ── */}
      <div className="rounded-2xl border shadow-card p-6 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>
            {isAr ? 'إدارة الاشتراك والرخصة' : 'Subscription & License'}
          </h3>
        </div>
        {subscription && ['active', 'trialing'].includes(subscription.status) ? (
          <>
            <div className="grid md:grid-cols-4 gap-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isAr ? 'الخطة' : 'Plan'}</p>
                <p className="font-bold" style={{ color: 'var(--text-base)' }}>{tierLabel(subscription.tier, lang)}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isAr ? 'الحالة' : 'Status'}</p>
                <Badge variant="active" label={statusLabel(subscription.status, lang)} />
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isAr ? 'ينتهي في' : 'Expires'}</p>
                <p className="font-bold" style={{ color: 'var(--text-base)' }}>
                  {subscription.end_date ? formatSaudiDate(subscription.end_date) : '—'}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{isAr ? 'التجديد' : 'Renewal'}</p>
                <p className="font-bold" style={{ color: 'var(--text-base)' }}>
                  {subscription.auto_renew ? (isAr ? 'تلقائي مفعل' : 'Auto On') : (isAr ? 'موقوف' : 'Disabled')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant={subscription.auto_renew ? 'danger' : 'secondary'} onClick={() => toggleAutoRenew(!subscription.auto_renew)} loading={subLoading}>
                <RefreshCw size={15} />
                {subscription.auto_renew ? (isAr ? 'إيقاف التجديد التلقائي' : 'Disable Auto-Renewal') : (isAr ? 'إعادة تفعيل التجديد' : 'Enable Auto-Renewal')}
              </Button>
              <Link to="/dashboard/support" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors">
                {isAr ? 'طلب تعديل الباقة أو الفوترة' : 'Request Plan Change or Billing Help'}
              </Link>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800/40 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              {subscription.auto_renew
                ? (isAr ? 'التجديد التلقائي مفعل حالياً لتفادي توقف الرخصة الشهرية.' : 'Auto-renewal is currently active to avoid service interruption.')
                : (isAr ? 'تم إيقاف التجديد التلقائي، وسيبقى الاشتراك فعالاً حتى نهاية الدورة الحالية.' : 'Auto-renewal is disabled. Your subscription stays active until the end of the current cycle.')}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'لا يوجد اشتراك فعال مرتبط بالحساب.' : 'No active subscription linked to this account.'}
            </p>
            <Link to="/dashboard/billing" className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-700 text-white hover:bg-brand-800 transition-colors">
              {isAr ? 'اشترك الآن' : 'Subscribe now'}
            </Link>
          </div>
        )}
      </div>

      {/* ── Quick Access ── */}
      <div className="rounded-2xl border shadow-card p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <ServerCog className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold" style={{ color: 'var(--text-base)' }}>{isAr ? 'اختصارات التشغيل' : 'Quick Access'}</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Link to="/dashboard/store-setup" className="rounded-xl border p-4 transition-colors hover:border-brand-200 hover:bg-brand-50 dark:hover:bg-brand-950/20" style={{ borderColor: 'var(--border)' }}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-base)' }}>{isAr ? 'إعداد الجهاز والرخصة' : 'Device & License Setup'}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{isAr ? 'راجع حالة الكاميرا وبيانات التفعيل والاتصال.' : 'Review camera status, activation data and connectivity.'}</p>
          </Link>
        </div>
      </div>

      {/* ── Sign Out ── */}
      <div className="rounded-2xl border border-red-100 dark:border-red-900/40 shadow-card p-6" style={{ background: 'var(--bg-card)' }}>
        <h3 className="font-bold text-red-600 mb-3">{isAr ? 'تسجيل الخروج' : 'Sign Out'}</h3>
        <Button variant="danger" onClick={signOut} className="flex items-center gap-2">
          <LogOut size={16} />
          {isAr ? 'تسجيل الخروج من الحساب' : 'Sign Out of Account'}
        </Button>
      </div>
    </div>
  )
}
