/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ── Supabase (required) ───────────────────────────────────────────────
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string

  // ── App ────────────────────────────────────────────────────────────────
  readonly VITE_APP_URL: string
  readonly VITE_APP_NAME?: string
  readonly VITE_SUPPORT_EMAIL?: string

  // ── Cloudflare Turnstile (optional — signup works without it) ─────────
  readonly VITE_TURNSTILE_SITE_KEY?: string

  // ── Gemini / AI (client-side, optional — server-side preferred) ───────
  readonly VITE_GEMINI_PUBLIC_KEY?: string

  // ── Analytics / misc (optional) ───────────────────────────────────────
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_POSTHOG_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// ── Global augmentations ─────────────────────────────────────────────────
declare global {
  interface Window {
    turnstile?: {
      render: (selector: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
  }
}
