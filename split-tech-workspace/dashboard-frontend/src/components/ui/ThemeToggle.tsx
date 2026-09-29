import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLanguage } from '../../contexts/LanguageContext'

interface Props {
  compact?: boolean
  className?: string
}

export function ThemeToggle({ compact = false, className = '' }: Props) {
  const { isDark, toggle } = useTheme()
  const { t } = useLanguage()

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      className={`flex items-center gap-1.5 rounded-lg transition-colors
        text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)]
        ${compact ? 'p-2' : 'px-3 py-2 text-xs font-medium'} ${className}`}
    >
      {isDark
        ? <Sun size={compact ? 17 : 15} />
        : <Moon size={compact ? 17 : 15} />
      }
      {!compact && <span>{isDark ? t('theme.labelLight') : t('theme.labelDark')}</span>}
    </button>
  )
}

export function LangToggle({ compact = false, className = '' }: Props) {
  const { lang, setLang, t } = useLanguage()
  const next = lang === 'ar' ? 'en' : 'ar'

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={lang === 'ar' ? t('nav.langToEn') : t('nav.langToAr')}
      className={`flex items-center gap-1.5 rounded-lg transition-colors font-semibold
        text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)]
        ${compact ? 'p-2 text-xs' : 'px-3 py-2 text-xs'} ${className}`}
    >
      <span className="font-mono tracking-wide">{lang === 'ar' ? 'EN' : 'ع'}</span>
      {!compact && <span>{lang === 'ar' ? 'English' : t('nav.langNameAr')}</span>}
    </button>
  )
}
