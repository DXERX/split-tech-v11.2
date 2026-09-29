/**
 * analytics.ts — SplitTech unified analytics layer
 * Supports: Google Analytics 4 + Microsoft Clarity
 * Env vars: VITE_GA_MEASUREMENT_ID, VITE_CLARITY_ID
 */

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    clarity: ((...args: unknown[]) => void) & { q?: unknown[][] }
  }
}

// ─── Initialise all analytics providers ──────────────────────────────────────
export function initAnalytics(): void {
  _initGA4()
  _initClarity()
}

// ─── Track a page-view (call on every route change) ──────────────────────────
export function trackPageView(path: string, title?: string): void {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title ?? document.title,
    })
  }
  if (typeof window.clarity === 'function') {
    window.clarity('set', 'page_path', path)
  }
}

// ─── Track a custom event ─────────────────────────────────────────────────────
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params ?? {})
  }
}

// ─── Identify a logged-in user (Clarity) ─────────────────────────────────────
export function identifyUser(userId: string, role?: string): void {
  if (typeof window.clarity === 'function') {
    window.clarity('identify', userId, undefined, undefined, role)
  }
}

// ─── Internal: bootstrap GA4 ─────────────────────────────────────────────────
function _initGA4(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
  if (!measurementId) return

  // Inject gtag.js script
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  script.async = true
  document.head.appendChild(script)

  // Bootstrap dataLayer + gtag helper
  window.dataLayer = window.dataLayer ?? []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    // Respect Saudi privacy: don't send IP addresses
    anonymize_ip: true,
    // Disable ad personalization signals
    allow_google_signals: false,
    send_page_view: false, // we fire page_view manually on route changes
  })
}

// ─── Internal: bootstrap Microsoft Clarity ───────────────────────────────────
function _initClarity(): void {
  const clarityId = import.meta.env.VITE_CLARITY_ID as string | undefined
  if (!clarityId) return

  // Minimal Clarity snippet (no inline eval)
  window.clarity =
    window.clarity ??
    Object.assign(
      function (...args: unknown[]) {
        ;(window.clarity.q = window.clarity.q ?? []).push(args)
      },
      { q: [] as unknown[][] },
    )

  const script = document.createElement('script')
  script.src = `https://www.clarity.ms/tag/${clarityId}`
  script.async = true
  document.head.appendChild(script)
}
