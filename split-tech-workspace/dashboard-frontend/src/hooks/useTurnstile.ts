import { useState, useRef, useEffect } from 'react'

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()

export function useTurnstile() {
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const renderedRef = useRef(false)

  const resetTurnstile = () => {
    setCaptchaToken('')
    const tw = (window as any).turnstile
    if (tw && widgetIdRef.current !== null) {
      try { tw.reset(widgetIdRef.current) } catch (_) { /* ignore */ }
    }
  }

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    let interval: ReturnType<typeof setInterval> | null = null

    function tryRender() {
      if (renderedRef.current) return true
      if (!turnstileRef.current) return false
      const tw = (window as any).turnstile
      if (!tw) return false

      // Ensure container is empty
      turnstileRef.current.innerHTML = ''

      try {
        const id = tw.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        })
        widgetIdRef.current = id
        renderedRef.current = true
        return true
      } catch (_) {
        return false
      }
    }

    if (!tryRender()) {
      interval = setInterval(() => {
        if (tryRender() && interval) clearInterval(interval)
      }, 500)
    }

    return () => {
      if (interval) clearInterval(interval)
      renderedRef.current = false
      const tw = (window as any).turnstile
      if (tw && widgetIdRef.current !== null) {
        try { tw.remove(widgetIdRef.current) } catch (_) { /* ignore */ }
        widgetIdRef.current = null
      }
    }
  }, [])

  return {
    turnstileRef,
    captchaToken,
    resetTurnstile,
    isEnabled: !!TURNSTILE_SITE_KEY,
  }
}
