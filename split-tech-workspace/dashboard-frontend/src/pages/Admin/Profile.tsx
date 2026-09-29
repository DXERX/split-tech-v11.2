import { useRef, useState } from 'react'
import { UserCircle, Lock, Upload, Save, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'

function compressImage(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(size / img.width, size / img.height)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMG_READ_FAIL')) }
    img.src = url
  })
}

export default function AdminProfile() {
  const { t } = useLanguage()
  const { profile, user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null)
  const [uploading, setUploading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const base64 = await compressImage(file)
      const { error } = await supabase.from('profiles').update({ avatar_url: base64 }).eq('id', user.id)
      if (error) throw error
      setAvatarUrl(base64)
    } catch (err: any) {
      toast.error(`${t('profile.uploadFail')} ${err.message === 'IMG_READ_FAIL' ? t('profile.imgReadFail') : err.message}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    setProfileMsg('')
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
      if (error) throw error
      setProfileMsg(t('profile.saved'))
    } catch (err: any) {
      setProfileMsg(`${t('profile.errorPrefix')} ${err.message}`)
    } finally {
      setSavingProfile(false)
      setTimeout(() => setProfileMsg(''), 4000)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg('')
    if (newPassword !== confirmPassword) {
      setPasswordMsg(t('profile.pwMismatch'))
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg(t('profile.pwMin'))
      return
    }
    setChangingPassword(true)
    try {
      // Re-authenticate first with current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      })
      if (signInErr) throw new Error('PW_CURRENT_WRONG')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordMsg(t('profile.pwSuccess'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordMsg(err.message === 'PW_CURRENT_WRONG' ? t('profile.pwWrongCurrent') : err.message || t('profile.pwError'))
    } finally {
      setChangingPassword(false)
      setTimeout(() => setPasswordMsg(''), 5000)
    }
  }

  const initials = fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'SP'

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-brand-700" />
          {t('profile.title')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t('profile.subtitle')}</p>
      </div>

      {/* Profile Info */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-5">{t('profile.sectionPersonal')}</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
              border: '3px solid #AECC1E', overflow: 'hidden',
              background: avatarUrl ? `url(${avatarUrl}) center/cover` : '#AECC1E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {!avatarUrl && (
              <span style={{ color: '#1e293b', fontWeight: 800, fontSize: 22 }}>{initials}</span>
            )}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? t('profile.uploading') : t('profile.changePhoto')}
            </button>
            <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('profile.fullName')}</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent"
              placeholder={t('profile.fullNamePh')}
            />
          </div>

          {profileMsg && (
            <p className={`text-sm ${profileMsg.startsWith(t('profile.errorPrefix')) ? 'text-red-600' : 'text-green-600'}`}>
              {profileMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {savingProfile ? t('profile.saving') : t('profile.save')}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500" />
          {t('profile.sectionPassword')}
        </h2>
        <p className="text-xs text-slate-400 mb-5">{t('profile.pwIntro')}</p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('profile.currentPw')}</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent pe-10"
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute inset-y-0 end-3 flex items-center text-slate-400">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('profile.newPw')}</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent pe-10"
                placeholder="••••••••"
                required
                minLength={8}
              />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute inset-y-0 end-3 flex items-center text-slate-400">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('profile.confirmPw')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {passwordMsg && (
            <p className={`text-sm ${passwordMsg === t('profile.pwSuccess') ? 'text-green-600' : 'text-red-600'}`}>
              {passwordMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-700 text-white rounded-xl text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            {changingPassword ? t('profile.changingPw') : t('profile.changePwBtn')}
          </button>
        </form>
      </div>
    </div>
  )
}
