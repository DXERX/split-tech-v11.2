import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? import.meta.env.MODE
const RELEASE = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'split-intelligence@unknown'

const TRACES_RATE = numEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', APP_ENV === 'production' ? 0.1 : 1.0)
const REPLAY_RATE = numEnv('VITE_SENTRY_REPLAY_SAMPLE_RATE', APP_ENV === 'production' ? 0.0 : 0.0)
const REPLAY_ON_ERROR = numEnv('VITE_SENTRY_REPLAY_ON_ERROR_RATE', 1.0)

function numEnv(key: string, fallback: number): number {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

let initialized = false

export function initMonitoring(): void {
  if (initialized) return
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.info('[monitoring] VITE_SENTRY_DSN not set — Sentry disabled')
    }
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,
    release: RELEASE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: TRACES_RATE,
    replaysSessionSampleRate: REPLAY_RATE,
    replaysOnErrorSampleRate: REPLAY_ON_ERROR,
    sendDefaultPii: false,
    ignoreErrors: [
      // Browser noise — not actionable
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // Extension noise
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
    beforeSend(event) {
      // Strip access tokens and refresh tokens that may sneak into URLs
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url)
      }
      return event
    },
  })

  initialized = true
}

function scrubUrl(url: string): string {
  try {
    const u = new URL(url)
    for (const key of ['access_token', 'refresh_token', 'apikey', 'token']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '[redacted]')
    }
    return u.toString()
  } catch {
    return url
  }
}

export type IdentityFields = {
  id: string
  email?: string | null
  role?: string | null
  storeId?: string | null
}

export function identifyUser(user: IdentityFields): void {
  if (!initialized) return
  Sentry.setUser({ id: user.id, email: user.email ?? undefined })
  Sentry.setTag('user.role', user.role ?? 'unknown')
  if (user.storeId) Sentry.setTag('store.id', user.storeId)
}

export function clearUser(): void {
  if (!initialized) return
  Sentry.setUser(null)
  Sentry.setTag('user.role', null as unknown as string)
  Sentry.setTag('store.id', null as unknown as string)
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    if (import.meta.env.DEV) console.error('[monitoring]', error, context)
    return
  }
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.addBreadcrumb({ message, data, level: 'info' })
}

export const monitoring = {
  init: initMonitoring,
  identify: identifyUser,
  clear: clearUser,
  capture: captureError,
  breadcrumb: addBreadcrumb,
}
