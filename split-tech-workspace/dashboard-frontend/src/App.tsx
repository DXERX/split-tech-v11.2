import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useMySubscription } from './hooks/useStore'
import type { UserRole } from './types'
import LoadingSpinner from './components/ui/LoadingSpinner'
import { PageErrorBoundary } from './components/ErrorBoundary'
import { trackPageView } from './lib/analytics'

// ─── Eagerly loaded (critical first-paint routes) ────────────────────────────
import Landing  from './pages/Landing'
import Login    from './pages/Login'
import Signup   from './pages/Signup'
import Pricing  from './pages/Pricing'

// ─── Lazy-loaded public pages ─────────────────────────────────────────────────
const EarlyAccess        = lazy(() => import('./pages/EarlyAccess'))
const Contact            = lazy(() => import('./pages/Contact'))
const Demo               = lazy(() => import('./pages/Demo'))
const Terms              = lazy(() => import('./pages/Terms'))
const ResetPassword      = lazy(() => import('./pages/ResetPassword'))
const Support            = lazy(() => import('./pages/Support'))
const SubscriptionExpired = lazy(() => import('./pages/SubscriptionExpired'))
const PaymentCallback    = lazy(() => import('./pages/PaymentCallback'))
const PaymentCheckout    = lazy(() => import('./pages/PaymentCheckout'))
const Compare            = lazy(() => import('./pages/Compare'))

// ─── Lazy-loaded Dashboard pages ─────────────────────────────────────────────
const DashboardLayout    = lazy(() => import('./components/layout/DashboardLayout'))
const DashboardHome      = lazy(() => import('./pages/Dashboard/index'))
const Billing            = lazy(() => import('./pages/Dashboard/Billing'))
const AuditReports       = lazy(() => import('./pages/Dashboard/AuditReports'))
const StoreSetup         = lazy(() => import('./pages/Dashboard/StoreSetup'))
const VoiceAgent         = lazy(() => import('./pages/Dashboard/VoiceAgent'))
const Diagnostic         = lazy(() => import('./pages/Dashboard/Diagnostic'))
const DashboardSettings  = lazy(() => import('./pages/Dashboard/Settings'))
const BranchComparison   = lazy(() => import('./pages/Dashboard/BranchComparison'))
const Invoices           = lazy(() => import('./pages/Dashboard/Invoices'))
const MerchantAnalytics  = lazy(() => import('./pages/Dashboard/Analytics'))
const ZoneConfig         = lazy(() => import('./pages/Dashboard/ZoneConfig'))

// ─── Lazy-loaded Admin pages ──────────────────────────────────────────────────
const AdminLayout          = lazy(() => import('./components/layout/AdminLayout'))
const AdminHome            = lazy(() => import('./pages/Admin/index'))
const StoreApprovals       = lazy(() => import('./pages/Admin/StoreApprovals'))
const AdminUsers           = lazy(() => import('./pages/Admin/Users'))
const AdminSubscriptions   = lazy(() => import('./pages/Admin/Subscriptions'))
const BillingLedger        = lazy(() => import('./pages/Admin/BillingLedger'))
const AdminAnalytics       = lazy(() => import('./pages/Admin/Analytics'))
const AdminTickets         = lazy(() => import('./pages/Admin/Tickets'))
const Broadcasts           = lazy(() => import('./pages/Admin/Broadcasts'))
const LiveView             = lazy(() => import('./pages/Admin/LiveView'))
const CommandCenter        = lazy(() => import('./pages/Admin/CommandCenter'))
const MarketingAssociate   = lazy(() => import('./pages/Admin/MarketingAssociate'))
const MarketingManager     = lazy(() => import('./pages/Admin/MarketingManager'))
const EmergencyBroadcast   = lazy(() => import('./pages/Admin/EmergencyBroadcast'))
const RollbackCenter       = lazy(() => import('./pages/Admin/RollbackCenter'))
const EarlyAccessLeads     = lazy(() => import('./pages/Admin/EarlyAccessLeads'))
const ContactRequests      = lazy(() => import('./pages/Admin/ContactRequests'))
const StaffPerformance     = lazy(() => import('./pages/Admin/StaffPerformance'))
const CommunicationsCenter = lazy(() => import('./pages/Admin/CommunicationsCenter'))
const ITDashboard          = lazy(() => import('./pages/ITDashboard'))
const NetworkSpeedTest     = lazy(() => import('./pages/Admin/NetworkSpeedTest'))
const StaffPresence        = lazy(() => import('./pages/Admin/StaffPresence'))
const AttendanceReport     = lazy(() => import('./pages/Admin/AttendanceReport'))
const IDCard               = lazy(() => import('./pages/Admin/IDCard'))
const AdminProfile         = lazy(() => import('./pages/Admin/Profile'))

// ─── Page loading fallback ────────────────────────────────────────────────────
function PageLoader() {
  return <LoadingSpinner full />
}

// ─── Route change tracker ─────────────────────────────────────────────────────
function RouteTracker() {
  const location = useLocation()
  useEffect(() => {
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
  return null
}

// ─── Strict per-route RBAC ────────────────────────────────────────────────────
const FULL_ACCESS: UserRole[] = ['super_owner', 'it_support']

function hasAccess(
  userRole: UserRole | null,
  allowed: UserRole[],
  superOnly = false,
): boolean {
  if (!userRole) return false
  if (superOnly) return userRole === 'super_owner'
  if (FULL_ACCESS.includes(userRole)) return true
  return allowed.includes(userRole)
}

function ProtectedRoute({
  children,
  allowed,
  superOnly,
}: {
  children: React.ReactNode
  allowed?: UserRole[]
  superOnly?: boolean
}) {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingSpinner full />
  if (!user) return <Navigate to="/login" replace />
  if (superOnly && !hasAccess(role, [], true)) {
    return <Navigate to="/admin" replace />
  }
  if (allowed && !superOnly && !hasAccess(role, allowed)) {
    if (role === 'merchant') return <Navigate to="/dashboard" replace />
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}

// ─── Merchant route ───────────────────────────────────────────────────────────
function MerchantRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()
  const { isLoading: subLoading, isFetching } = useMySubscription()
  if (loading || subLoading) return <LoadingSpinner full />
  if (!user) return <Navigate to="/login" replace />
  if (role !== 'merchant') return <Navigate to="/admin" replace />
  if (isFetching && subLoading) return <LoadingSpinner full />
  return <>{children}</>
}

// ─── Public routes: redirect if already logged in ────────────────────────────
function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingSpinner full />
  if (user) {
    if (role === 'merchant') return <Navigate to="/dashboard" replace />
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}

// ─── Permission matrix ────────────────────────────────────────────────────────
const PERM = {
  stores:              ['customer_support'] as UserRole[],
  users:               [] as UserRole[],
  subscriptions:       [] as UserRole[],
  analytics:           ['customer_support', 'marketing_manager'] as UserRole[],
  marketing:           ['marketing_manager'] as UserRole[],
  marketingManager:    ['marketing_manager'] as UserRole[],
  marketingAssociate:  ['marketing_associate'] as UserRole[],
  live:                [] as UserRole[],
  emergency:           [] as UserRole[],
  rollback:            [] as UserRole[],
  broadcasts:          ['customer_support', 'marketing_manager'] as UserRole[],
  tickets:             ['customer_support'] as UserRole[],
  staff:               [] as UserRole[],
  communications:      ['marketing_manager'] as UserRole[],
  leads:               [] as UserRole[],
  contactRequests:     [] as UserRole[],
  itDashboard:         [] as UserRole[],
  networkSpeed:        [] as UserRole[],
  presence:            [] as UserRole[],
  attendance:          [] as UserRole[],
}

// ─── Marketing role index redirect ───────────────────────────────────────────
function AdminIndexRoute() {
  const { role } = useAuth()
  if (role === 'marketing_associate') return <Navigate to="/admin/marketing-associate/entry" replace />
  if (role === 'marketing_manager') return <Navigate to="/admin/marketing-manager/performance" replace />
  return <AdminHome />
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RouteTracker />
      <Routes>
        {/* ── Public ── */}
        <Route path="/"             element={<Landing />} />
        <Route path="/pricing"      element={<Pricing />} />
        <Route path="/early-access" element={<EarlyAccess />} />
        <Route path="/contact"      element={<Contact />} />
        <Route path="/demo"         element={<Demo />} />
        <Route path="/compare"      element={<Compare />} />
        <Route path="/login"        element={<AuthRedirect><Login /></AuthRedirect>} />
        <Route path="/signup"       element={<AuthRedirect><Signup /></AuthRedirect>} />
        <Route path="/terms"        element={<Terms />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ── Legacy redirect ── */}
        <Route path="/onboarding" element={<Navigate to="/dashboard/billing" replace />} />

        {/* ── Paywall ── */}
        <Route path="/subscription-expired"
          element={<ProtectedRoute><SubscriptionExpired /></ProtectedRoute>} />

        {/* ── Payment ── */}
        <Route path="/payment/callback"
          element={<ProtectedRoute><PaymentCallback /></ProtectedRoute>} />
        <Route path="/payment/checkout"
          element={<ProtectedRoute><PaymentCheckout /></ProtectedRoute>} />

        {/* ── Merchant Dashboard ── */}
        <Route path="/dashboard"
          element={<MerchantRoute><DashboardLayout /></MerchantRoute>}>
          <Route index                element={<DashboardHome />} />
          <Route path="billing"       element={<Billing />} />
          <Route path="audits"        element={<PageErrorBoundary><AuditReports /></PageErrorBoundary>} />
          <Route path="analytics"     element={<PageErrorBoundary><MerchantAnalytics /></PageErrorBoundary>} />
          <Route path="diagnostic"    element={<Diagnostic />} />
          <Route path="store-control" element={<Navigate to="/dashboard/store-setup" replace />} />
          <Route path="store-setup"   element={<StoreSetup />} />
          <Route path="zone-config"  element={<PageErrorBoundary><ZoneConfig /></PageErrorBoundary>} />
          <Route path="voice-agent"   element={<PageErrorBoundary><VoiceAgent /></PageErrorBoundary>} />
          <Route path="branches"      element={<BranchComparison />} />
          <Route path="invoices"      element={<Invoices />} />
          <Route path="settings"      element={<DashboardSettings />} />
          <Route path="support"       element={<Support />} />
        </Route>

        {/* ── Admin Panel ── */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowed={['customer_support', 'marketing_manager', 'marketing_associate']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminIndexRoute />} />

          <Route path="stores"
            element={<ProtectedRoute allowed={PERM.stores}><StoreApprovals /></ProtectedRoute>} />

          <Route path="users"
            element={<ProtectedRoute allowed={PERM.users}><AdminUsers /></ProtectedRoute>} />

          <Route path="subscriptions"
            element={<ProtectedRoute allowed={PERM.subscriptions}><AdminSubscriptions /></ProtectedRoute>} />

          <Route path="billing-ledger"
            element={<ProtectedRoute allowed={FULL_ACCESS}><BillingLedger /></ProtectedRoute>} />

          <Route path="analytics"
            element={<ProtectedRoute allowed={PERM.analytics}><AdminAnalytics /></ProtectedRoute>} />

          <Route path="marketing"
            element={<ProtectedRoute allowed={PERM.marketing}><Navigate to="/admin/marketing-manager/performance" replace /></ProtectedRoute>} />

          <Route path="marketing-manager"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/performance"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/lead-approval"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/associates"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/bulk-import"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/team-tasks"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />
          <Route path="marketing-manager/payouts"
            element={<ProtectedRoute allowed={PERM.marketingManager}><MarketingManager /></ProtectedRoute>} />

          <Route path="marketing-associate"
            element={<ProtectedRoute allowed={PERM.marketingAssociate}><MarketingAssociate /></ProtectedRoute>} />
          <Route path="marketing-associate/entry"
            element={<ProtectedRoute allowed={PERM.marketingAssociate}><MarketingAssociate /></ProtectedRoute>} />
          <Route path="marketing-associate/leads"
            element={<ProtectedRoute allowed={PERM.marketingAssociate}><MarketingAssociate /></ProtectedRoute>} />
          <Route path="marketing-associate/bonus"
            element={<ProtectedRoute allowed={PERM.marketingAssociate}><MarketingAssociate /></ProtectedRoute>} />

          <Route path="marketing-associate/commission"
            element={<ProtectedRoute allowed={PERM.marketingAssociate}><MarketingAssociate /></ProtectedRoute>} />

          <Route path="live"
            element={<ProtectedRoute allowed={PERM.live}><PageErrorBoundary><LiveView /></PageErrorBoundary></ProtectedRoute>} />

          <Route path="command"
            element={<ProtectedRoute superOnly><PageErrorBoundary><CommandCenter /></PageErrorBoundary></ProtectedRoute>} />

          <Route path="emergency"
            element={<ProtectedRoute allowed={PERM.emergency}><EmergencyBroadcast /></ProtectedRoute>} />

          <Route path="rollback"
            element={<ProtectedRoute allowed={PERM.rollback}><RollbackCenter /></ProtectedRoute>} />

          <Route path="broadcasts"
            element={<ProtectedRoute allowed={PERM.broadcasts}><Broadcasts /></ProtectedRoute>} />

          <Route path="tickets"
            element={<ProtectedRoute allowed={PERM.tickets}><AdminTickets /></ProtectedRoute>} />

          <Route path="leads"
            element={<ProtectedRoute allowed={PERM.leads}><EarlyAccessLeads /></ProtectedRoute>} />

          <Route path="contact-requests"
            element={<ProtectedRoute allowed={PERM.contactRequests}><ContactRequests /></ProtectedRoute>} />

          <Route path="staff-performance"
            element={<ProtectedRoute superOnly><PageErrorBoundary><StaffPerformance /></PageErrorBoundary></ProtectedRoute>} />

          <Route path="communications"
            element={<ProtectedRoute allowed={PERM.communications}><CommunicationsCenter /></ProtectedRoute>} />

          <Route path="it-dashboard"
            element={<ProtectedRoute allowed={PERM.itDashboard}><ITDashboard /></ProtectedRoute>} />

          <Route path="network-speed"
            element={<ProtectedRoute allowed={PERM.networkSpeed}><NetworkSpeedTest /></ProtectedRoute>} />

          <Route path="presence"
            element={<ProtectedRoute allowed={PERM.presence}><StaffPresence /></ProtectedRoute>} />

          <Route path="attendance"
            element={<ProtectedRoute allowed={PERM.attendance}><AttendanceReport /></ProtectedRoute>} />

          <Route path="id-card"
            element={<ProtectedRoute allowed={['super_owner', 'it_support', 'marketing_manager', 'marketing_associate', 'customer_support']}><IDCard /></ProtectedRoute>} />

          <Route path="profile"
            element={<ProtectedRoute allowed={['super_owner', 'it_support', 'marketing_manager', 'marketing_associate', 'customer_support']}><AdminProfile /></ProtectedRoute>} />
        </Route>

        {/* ── Support (standalone) ── */}
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
