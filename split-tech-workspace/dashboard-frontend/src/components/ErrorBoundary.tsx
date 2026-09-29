import * as Sentry from '@sentry/react'
import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

function FallbackUI({ resetError }: { resetError: () => void }) {
  const reload = () => {
    resetError()
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-card p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          تم إبلاغ الفريق التقني تلقائياً. حاول إعادة تحميل الصفحة، وإن استمرت المشكلة تواصل مع الدعم.
        </p>
        <button
          onClick={reload}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة تحميل
        </button>
      </div>
    </div>
  )
}

function PageFallbackUI({ resetError }: { resetError: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-1">تعذّر تحميل هذه الصفحة</p>
      <p className="text-xs text-slate-500 mb-5">تم إبلاغ الفريق التقني تلقائياً</p>
      <button
        onClick={() => { resetError(); window.location.reload() }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        إعادة المحاولة
      </button>
    </div>
  )
}

export default function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <FallbackUI resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  )
}

export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <PageFallbackUI resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  )
}
