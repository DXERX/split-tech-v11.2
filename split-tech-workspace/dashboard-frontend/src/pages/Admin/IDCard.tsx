import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Printer, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import { supabase } from '../../lib/supabase'

function idcardRoleKey(role: string, which: 'role' | 'roleEn' | 'dept'): TranslationKey {
  const base = which === 'role' ? 'idcard.role' : which === 'roleEn' ? 'idcard.roleEn' : 'idcard.dept'
  return `${base}.${role}` as TranslationKey
}

function compressImage(file: File, size = 300): Promise<string> {
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
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMG_READ_FAIL')) }
    img.src = url
  })
}

// Inline SVG for Split logo mark (two offset rounded squares)
const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="34" y="6" width="48" height="38" rx="13" ry="13" fill="#AECC1E" transform="rotate(15 58 25)"/>
  <rect x="18" y="56" width="48" height="38" rx="13" ry="13" fill="#AECC1E" transform="rotate(15 42 75)"/>
</svg>`

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="34" y="6" width="48" height="38" rx="13" ry="13" fill="#AECC1E" transform="rotate(15 58 25)" />
      <rect x="18" y="56" width="48" height="38" rx="13" ry="13" fill="#AECC1E" transform="rotate(15 42 75)" />
    </svg>
  )
}

export default function IDCard() {
  const { t, lang } = useLanguage()
  const { profile, role, user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null)
  const [uploading, setUploading] = useState(false)
  const [employeeId, setEmployeeId] = useState<string>('...')

  const roleKey = role ?? 'merchant'
  const initials = profile?.full_name
    ?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'SP'

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => { if (data?.employee_id) setEmployeeId(data.employee_id) })
  }, [user])

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

  function handlePrint() {
    const name = profile?.full_name || t('idcard.fallbackName')
    const titleAr = t(idcardRoleKey(roleKey, 'role'))
    const titleEn = t(idcardRoleKey(roleKey, 'roleEn'))
    const dept = t(idcardRoleKey(roleKey, 'dept'))
    const htmlDir = lang === 'ar' ? 'rtl' : 'ltr'
    const photo = avatarUrl
      ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;">
           <span style="font-size:56px;font-weight:900;color:#AECC1E;font-family:sans-serif;">${initials}</span>
         </div>`

    const docTitle = t('idcard.printDocTitle').replace('{name}', name)
    const lbEmp = t('idcard.labelEmpId')
    const lbOrg = t('idcard.labelOrg')
    const lbYear = t('idcard.labelYear')
    const badge = t('idcard.staffBadge')

    const html = `<!DOCTYPE html>
<html dir="${htmlDir}">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{
      background:#f1f5f9;
      display:flex;justify-content:center;align-items:center;
      min-height:100vh;
      font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;
    }
    .card{
      width:300px;
      background:#fff;
      border-radius:20px;
      overflow:hidden;
      box-shadow:0 24px 64px rgba(0,0,0,0.22);
    }
    /* ── Header ── */
    .header{
      background:#005F2D;
      padding:20px 20px 0;
      position:relative;
    }
    .header-top{
      display:flex;align-items:center;justify-content:space-between;
      margin-bottom:18px;
    }
    .logo-group{display:flex;align-items:center;gap:10px;}
    .logo-text{color:#fff;font-weight:800;font-size:18px;letter-spacing:2px;}
    .logo-sub{color:#AECC1E;font-weight:600;font-size:9px;letter-spacing:3px;margin-top:-2px;}
    .emp-badge{
      background:rgba(174,204,30,0.15);
      border:1px solid rgba(174,204,30,0.4);
      color:#AECC1E;
      font-size:8px;font-weight:700;
      padding:4px 10px;border-radius:20px;
      letter-spacing:1.5px;
    }
    /* ── Photo ── */
    .photo-ring{
      width:110px;height:110px;
      margin:0 auto;
      border-radius:50%;
      padding:3px;
      background:linear-gradient(135deg,#AECC1E,#8aaa0f);
      position:relative;z-index:2;
    }
    .photo-inner{
      width:100%;height:100%;
      border-radius:50%;
      overflow:hidden;
      border:3px solid #005F2D;
    }
    /* ── Body ── */
    .body{padding:20px 20px 16px;text-align:center;background:#fff;}
    .name{font-weight:800;font-size:20px;color:#0f172a;margin-bottom:4px;line-height:1.2;}
    .title-ar{color:#005F2D;font-weight:700;font-size:13px;margin-bottom:2px;}
    .title-en{color:#64748b;font-size:11px;font-weight:500;margin-bottom:4px;}
    .dept-chip{
      display:inline-block;
      background:#f1f5f9;border:1px solid #e2e8f0;
      color:#475569;font-size:10px;font-weight:600;
      padding:3px 10px;border-radius:20px;
      margin-bottom:16px;
    }
    /* ── Info strip ── */
    .info-strip{
      display:flex;align-items:stretch;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:12px;
      overflow:hidden;
    }
    .info-cell{flex:1;padding:10px 8px;text-align:center;}
    .info-cell + .info-cell{border-right:1px solid #e2e8f0;}
    .info-label{font-size:8px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;margin-bottom:3px;text-transform:uppercase;}
    .info-value{font-size:12px;color:#0f172a;font-weight:700;direction:ltr;letter-spacing:0.3px;}
    /* ── Barcode strip ── */
    .barcode-strip{
      margin:14px 0 0;
      display:flex;align-items:flex-end;justify-content:center;gap:1px;
    }
    .bar{background:#0f172a;border-radius:1px;}
    /* ── Footer accent ── */
    .footer-accent{
      height:6px;
      background:linear-gradient(90deg,#AECC1E 0%,#8aaa0f 40%,#005F2D 100%);
    }
    @media print{
      body{background:#fff;}
      .card{box-shadow:none;}
    }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="header-top">
      <div class="logo-group">
        ${LOGO_SVG.replace('width="32"', 'width="28"').replace('height="32"', 'height="28"')}
        <div>
          <div class="logo-text">SPLIT</div>
          <div class="logo-sub">INTELLIGENCE</div>
        </div>
      </div>
      <span class="emp-badge">${badge}</span>
    </div>
    <div class="photo-ring">
      <div class="photo-inner">${photo}</div>
    </div>
  </div>

  <div class="body">
    <div class="name">${name}</div>
    <div class="title-ar">${titleAr}</div>
    <div class="title-en">${titleEn}</div>
    <div class="dept-chip">${dept}</div>

    <div class="info-strip">
      <div class="info-cell">
        <div class="info-label">${lbEmp}</div>
        <div class="info-value">${employeeId}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">${lbOrg}</div>
        <div class="info-value">splittech.sa</div>
      </div>
      <div class="info-cell">
        <div class="info-label">${lbYear}</div>
        <div class="info-value">${new Date().getFullYear()}</div>
      </div>
    </div>

    <div class="barcode-strip">
      ${Array.from({ length: 36 }, (_, i) => {
        const h = [18, 10, 22, 14, 26, 12, 20, 8, 24, 16, 18, 12, 22, 10, 26, 14, 20, 16, 22, 10, 18, 24, 12, 20, 14, 26, 10, 18, 22, 16, 20, 12, 24, 14, 18, 22][i]
        const w = i % 3 === 0 ? 2 : 1
        return `<div class="bar" style="width:${w}px;height:${h}px;"></div>`
      }).join('')}
    </div>
    <p style="font-size:8px;color:#94a3b8;letter-spacing:2px;margin-top:6px;direction:ltr;">${employeeId.replace('-', '').padEnd(12, '0')}</p>
  </div>

  <div class="footer-accent"></div>
</div>
<script>
  window.onload = () => {
    setTimeout(() => { window.print(); setTimeout(() => window.close(), 800); }, 400);
  };
</script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=440,height=720')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-brand-700" />
          {t('idcard.title')}
        </h1>
        <p className="text-slate-500 text-sm mt-1">{t('idcard.subtitle')}</p>
      </div>

      {/* ── Card preview ───────────────────────────────────── */}
      <div className="flex justify-center mb-8">
        <div style={{
          width: 300,
          background: '#fff',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{ background: '#005F2D', padding: '20px 20px 0' }}>
            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LogoMark size={28} />
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 2 }}>SPLIT</div>
                  <div style={{ color: '#AECC1E', fontWeight: 600, fontSize: 9, letterSpacing: 3, marginTop: -2 }}>INTELLIGENCE</div>
                </div>
              </div>
              <span style={{
                background: 'rgba(174,204,30,0.15)', border: '1px solid rgba(174,204,30,0.4)',
                color: '#AECC1E', fontSize: 8, fontWeight: 700,
                padding: '4px 10px', borderRadius: 20, letterSpacing: 1.5,
              }}>{t('idcard.staffBadge')}</span>
            </div>

            {/* Photo */}
            <div style={{
              width: 110, height: 110, margin: '0 auto',
              borderRadius: '50%', padding: 3,
              background: 'linear-gradient(135deg,#AECC1E,#8aaa0f)',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                overflow: 'hidden', border: '3px solid #005F2D',
                background: avatarUrl ? `url(${avatarUrl}) center/cover` : '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!avatarUrl && (
                  <span style={{ color: '#AECC1E', fontWeight: 900, fontSize: 36 }}>{initials}</span>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 20px 16px', textAlign: 'center', background: '#fff' }}>
            <p style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 4, lineHeight: 1.2 }}>
              {profile?.full_name || t('idcard.fallbackName')}
            </p>
            <p style={{ color: '#005F2D', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{t(idcardRoleKey(roleKey, 'role'))}</p>
            <p style={{ color: '#64748b', fontSize: 11, fontWeight: 500, marginBottom: 4 }}>{t(idcardRoleKey(roleKey, 'roleEn'))}</p>
            <span style={{
              display: 'inline-block', background: '#f1f5f9',
              border: '1px solid #e2e8f0', color: '#475569',
              fontSize: 10, fontWeight: 600, padding: '3px 10px',
              borderRadius: 20, marginBottom: 16,
            }}>{t(idcardRoleKey(roleKey, 'dept'))}</span>

            {/* Info strip */}
            <div style={{
              display: 'flex', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden',
            }}>
              {[
                { label: t('idcard.labelEmpId'), value: employeeId },
                { label: t('idcard.labelOrg'), value: 'splittech.sa' },
                { label: t('idcard.labelYear'), value: String(new Date().getFullYear()) },
              ].map(({ label, value }, i) => (
                <div key={label} style={{
                  flex: 1, padding: '10px 8px', textAlign: 'center',
                  borderRight: i < 2 ? '1px solid #e2e8f0' : undefined,
                }}>
                  <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700, direction: 'ltr', letterSpacing: 0.3 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Mini barcode visual */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1, marginTop: 14 }}>
              {[18,10,22,14,26,12,20,8,24,16,18,12,22,10,26,14,20,16,22,10,18,24,12,20,14,26,10,18,22,16,20,12,24,14,18,22].map((h, i) => (
                <div key={i} style={{ width: i % 3 === 0 ? 2 : 1, height: h, background: '#0f172a', borderRadius: 1 }} />
              ))}
            </div>
            <p style={{ fontSize: 8, color: '#94a3b8', letterSpacing: 2, marginTop: 6, direction: 'ltr' }}>
              {employeeId.replace('-', '').padEnd(12, '0')}
            </p>
          </div>

          {/* Footer accent */}
          <div style={{ height: 6, background: 'linear-gradient(90deg,#AECC1E 0%,#8aaa0f 40%,#005F2D 100%)' }} />
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 border-2 border-dashed border-brand-300 text-brand-700 rounded-xl hover:bg-brand-50 transition-colors text-sm font-semibold disabled:opacity-50"
        >
          {uploading
            ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            : <Upload className="w-4 h-4" />}
          {uploading ? t('idcard.uploading') : t('idcard.uploadBtn')}
        </button>
        <p className="text-center text-xs text-slate-400">{t('idcard.uploadHint')}</p>

        <button
          onClick={handlePrint}
          className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-semibold text-sm"
        >
          <Printer className="w-4 h-4" />
          {t('idcard.printBtn')}
        </button>
        <p className="text-center text-xs text-slate-400">{t('idcard.printHint')}</p>
      </div>
    </div>
  )
}
