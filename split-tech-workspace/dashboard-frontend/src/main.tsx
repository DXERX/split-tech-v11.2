import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { captureError, initMonitoring } from './lib/monitoring'
import { initAnalytics } from './lib/analytics'
import './index.css'

initMonitoring()
initAnalytics()

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      captureError(error, { source: 'react-query', queryKey: query.queryKey })
    },
  }),
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
    mutations: {
      onError: (error) => {
        captureError(error, { source: 'react-query.mutation' })
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthProvider>
                <App />
                <Toaster richColors position="top-center" closeButton />
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
