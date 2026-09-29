export type VerificationStatus = 'draft' | 'pending' | 'under_review' | 'verified' | 'rejected'

type VerificationMeta = {
  label: string
  variant: 'active' | 'pending' | 'expired' | 'info'
  description: string
}

const VERIFICATION_META_AR: Record<VerificationStatus, VerificationMeta> = {
  draft: {
    label: 'مسودة',
    variant: 'pending',
    description: 'لم يُرسل طلب التفعيل بعد — أكمل الإعداد بعد الدفع.',
  },
  pending: {
    label: 'بانتظار التحقق',
    variant: 'pending',
    description: 'تم استلام بيانات الكاميرا والشبكة وسيتم فحصها قبل إصدار الترخيص الشهري.',
  },
  under_review: {
    label: 'قيد المراجعة',
    variant: 'info',
    description: 'فريق الـ IT يراجع بيانات الشبكة والكاميرا حالياً.',
  },
  verified: {
    label: 'مؤهل للتفعيل',
    variant: 'active',
    description: 'تم اعتماد البيانات ويمكن إصدار أو تجديد الترخيص تلقائياً.',
  },
  rejected: {
    label: 'يحتاج تعديل',
    variant: 'expired',
    description: 'يجب تعديل بيانات الكاميرا أو الشبكة ثم إعادة إرسال الطلب.',
  },
}

const VERIFICATION_META_EN: Record<VerificationStatus, VerificationMeta> = {
  draft: {
    label: 'Draft',
    variant: 'pending',
    description: 'Activation not submitted yet — complete setup after payment.',
  },
  pending: {
    label: 'Pending verification',
    variant: 'pending',
    description: 'Camera and network details received; they will be reviewed before the monthly license is issued.',
  },
  under_review: {
    label: 'Under review',
    variant: 'info',
    description: 'IT is reviewing network and camera details.',
  },
  verified: {
    label: 'Eligible for activation',
    variant: 'active',
    description: 'Data approved; license can be issued or renewed automatically.',
  },
  rejected: {
    label: 'Changes required',
    variant: 'expired',
    description: 'Update camera or network details and resubmit the request.',
  },
}

export function getVerificationMeta(status?: string | null, lang: 'ar' | 'en' = 'ar'): VerificationMeta {
  const key = (status as VerificationStatus) || 'pending'
  const table = lang === 'en' ? VERIFICATION_META_EN : VERIFICATION_META_AR
  return table[key] || table.pending
}

export function hasVerificationPayload(store?: {
  rtsp_url?: string | null
  camera_ip?: string | null
  camera_username?: string | null
  rtsp_password_encrypted?: string | null
} | null) {
  return Boolean(
    store?.rtsp_url?.trim() &&
    store?.camera_ip?.trim() &&
    store?.camera_username?.trim() &&
    store?.rtsp_password_encrypted?.trim(),
  )
}

export function maskSecret(value?: string | null) {
  if (!value) return '—'
  if (value.length <= 2) return '••'
  return `${value.slice(0, 1)}${'•'.repeat(Math.max(4, value.length - 2))}${value.slice(-1)}`
}

export function buildActivationToken(storeId?: string | null, licenseKey?: string | null) {
  if (!storeId || !licenseKey) return ''
  return `${storeId}:${licenseKey}`
}

export function buildActivationUrl(storeId?: string | null, licenseKey?: string | null) {
  if (!storeId || !licenseKey) return ''
  return `splittech://activate?store=${encodeURIComponent(storeId)}&key=${encodeURIComponent(licenseKey)}`
}
