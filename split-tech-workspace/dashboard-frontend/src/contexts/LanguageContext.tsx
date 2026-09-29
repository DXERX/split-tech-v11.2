import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from '../i18n'

/** Default UI language: Arabic (RTL). English is opt-in via language toggle → `split-lang` in localStorage. */
export const DEFAULT_LANG: Lang = 'ar'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
  isRtl: boolean
}

const Ctx = createContext<LangCtx>({
  lang: 'ar',
  setLang: () => {},
  t: (k) => k,
  isRtl: true,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem('split-lang')
      if (stored === 'en') return 'en'
      return DEFAULT_LANG
    } catch {
      return DEFAULT_LANG
    }
  })

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('split-lang', l)
  }

  useEffect(() => {
    const isAr = lang === 'ar'
    document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', lang)
    // update html font for EN (use Inter for better Latin rendering)
    document.documentElement.style.fontFamily = isAr
      ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
      : "'IBM Plex Sans', system-ui, sans-serif"
  }, [lang])

  function t(key: TranslationKey): string {
    const v = translations[lang][key]
    if (v != null && v !== '') return v
    // Never fall back to Arabic when English is selected (avoids mixed-language UI).
    if (lang === 'en') return String(key)
    return translations.ar[key] ?? translations.en[key] ?? String(key)
  }

  return (
    <Ctx.Provider value={{ lang, setLang, t, isRtl: lang === 'ar' }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLanguage = () => useContext(Ctx)
