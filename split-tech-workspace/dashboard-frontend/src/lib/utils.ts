import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { ar } from 'date-fns/locale'
import { enUS } from 'date-fns/locale'

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Calendar-style date for UI tables (respects interface language). */
export function formatUiDate(date: string | Date, lang: 'ar' | 'en' = 'ar'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (lang === 'en') {
    if (isToday(d)) return `Today ${format(d, 'HH:mm')}`
    if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`
    return format(d, 'd MMM yyyy', { locale: enUS })
  }
  if (isToday(d)) return `اليوم ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `أمس ${format(d, 'HH:mm')}`
  return format(d, 'd MMM yyyy', { locale: ar })
}

/** @deprecated Use formatUiDate(date, lang) so English UI does not show Arabic dates. */
export function formatArabicDate(date: string | Date): string {
  return formatUiDate(date, 'ar')
}

export function formatRelativeArabic(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: ar })
}

/** Language-aware relative time — pass lang from useLanguage() */
export function formatRelative(date: string | Date, lang: 'ar' | 'en' = 'ar'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: lang === 'en' ? enUS : ar })
}

export function formatSaudiDate(date: string | Date, lang: 'ar' | 'en' = 'ar'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'dd/MM/yyyy', { locale: lang === 'en' ? enUS : ar })
}

export function tierLabel(tier: string, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    const en: Record<string, string> = {
      basic:      'Basic Plan',
      pro:        'Professional Plan',
      enterprise: 'Enterprise Plan',
    }
    return en[tier] || tier
  }
  const labels: Record<string, string> = {
    basic:      'الباقة الأساسية',
    pro:        'الباقة الاحترافية',
    enterprise: 'باقة المؤسسات',
  }
  return labels[tier] || tier
}

export function tierPrice(tier: string): number {
  const prices: Record<string, number> = {
    basic: 1, pro: 219, enterprise: 269,
    voice_basic: 199, voice_pro: 299, voice_enterprise: 499,
  }
  return prices[tier] || 0
}

export function tierAnnualPrice(tier: string): number {
  const prices: Record<string, number> = {
    basic: 1, pro: 1999, enterprise: 2499,
    voice_basic: 1799, voice_pro: 2699, voice_enterprise: 4499,
  }
  return prices[tier] || 0
}

export function tierCameras(tier: string, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    const en: Record<string, string> = {
      basic: '1 camera',
      pro: 'Up to 3 cameras',
      enterprise: 'Up to 6 cameras',
    }
    return en[tier] || tier
  }
  const cameras: Record<string, string> = {
    basic: 'كاميرا واحدة',
    pro: 'حتى 3 كاميرات',
    enterprise: 'حتى 6 كاميرات',
  }
  return cameras[tier] || tier
}

/** Voice Agent tier labels */
export function voiceTierLabel(tier: string, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    const en: Record<string, string> = {
      voice_basic:      'Basic Voice Agent',
      voice_pro:        'Professional Voice Agent',
      voice_enterprise: 'Enterprise Voice Agent',
    }
    return en[tier] || tier
  }
  const ar: Record<string, string> = {
    voice_basic:      'وكيل الهاتف — أساسي',
    voice_pro:        'وكيل الهاتف — احترافي',
    voice_enterprise: 'وكيل الهاتف — مؤسسات',
  }
  return ar[tier] || tier
}

/** Check if a tier is a voice agent tier */
export function isVoiceTier(tier: string): boolean {
  return tier.startsWith('voice_')
}

export function statusLabel(status: string, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') {
    const en: Record<string, string> = {
      pending:     'Pending approval',
      active:      'Active',
      inactive:    'Inactive',
      suspended:   'Suspended',
      cancelled:   'Cancelled',
      expired:     'Expired',
      pass:        'Pass',
      warning:     'Warning',
      fail:        'Needs review',
      open:        'Open',
      in_progress: 'In progress',
      resolved:    'Resolved',
      closed:      'Closed',
      trialing:    'Trial',
      under_review:'Under review',
      rejected:    'Rejected',
    }
    return en[status] || status
  }
  const labels: Record<string, string> = {
    pending:     'في انتظار الموافقة',
    active:      'نشط',
    inactive:    'غير نشط',
    suspended:   'موقوف',
    cancelled:   'ملغي',
    expired:     'منتهي الصلاحية',
    pass:        'مقبول',
    warning:     'تحذير',
    fail:        'يحتاج مراجعة',
    open:        'مفتوح',
    in_progress: 'قيد المعالجة',
    resolved:    'محلول',
    closed:      'مغلق',
    trialing:    'تجريبي',
    under_review:'قيد المراجعة',
    rejected:    'مرفوض',
  }
  return labels[status] || status
}

export function generateTxtReport(
  storeName: string,
  logs: Array<{
    created_at: string
    summary: string | null
    observations: Array<{ question: string; answer: string }>
  }>
): string {
  const lines: string[] = [
    '═══════════════════════════════════════════',
    `تقرير التدقيق التشغيلي — ذكاء سبلت`,
    `المتجر: ${storeName}`,
    `تاريخ التقرير: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ar })}`,
    '═══════════════════════════════════════════',
    '',
  ]

  logs.forEach((log, i) => {
    lines.push(`── جولة #${i + 1} ──────────────────────────`)
    lines.push(`الوقت: ${formatArabicDate(log.created_at)}`)
    if (log.summary) lines.push(`الملخص: ${log.summary}`)
    lines.push('')
    if (log.observations?.length > 0) {
      lines.push('الملاحظات:')
      log.observations.forEach((obs) => {
        lines.push(`  • ${obs.question}`)
        lines.push(`    → ${obs.answer}`)
      })
    }
    lines.push('')
  })

  lines.push('═══════════════════════════════════════════')
  lines.push('سبلت تيك AI')
  lines.push('info@splittech.sa')

  return lines.join('\n')
}
