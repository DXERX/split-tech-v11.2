import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, BarChart3, BarChart2, Cpu, Settings,
  Headphones, LogOut, Menu, X, Bell, Gauge, ChevronLeft, CreditCard, Phone, GitBranch, Receipt, ScanLine,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useMyStore } from '../../hooks/useStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { ThemeToggle, LangToggle } from '../ui/ThemeToggle'
import BroadcastBanner from '../BroadcastBanner'
import SmartBot from '../SmartBot'
import SplitLogo from '../ui/SplitLogo'
import PresenceTracker from '../PresenceTracker'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  enter:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18, ease: 'easeIn' } },
}

export default function DashboardLayout() {
  const { profile, signOut } = useAuth()
  const { data: store } = useMyStore()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const NAV = [
    { to: '/dashboard',               label: t('nav.home'),       icon: LayoutDashboard, end: true },
    { to: '/dashboard/billing',       label: t('nav.billing'),    icon: CreditCard },
    { to: '/dashboard/invoices',      label: t('nav.invoices'),   icon: Receipt },
    { to: '/dashboard/audits',        label: t('nav.audits'),     icon: BarChart3 },
    { to: '/dashboard/analytics',     label: t('nav.analytics'),  icon: BarChart2 },
    { to: '/dashboard/diagnostic',    label: t('nav.diagnostic'), icon: Gauge },
    { to: '/dashboard/store-setup',   label: t('nav.setup'),      icon: Cpu },
    { to: '/dashboard/zone-config',  label: lang === 'ar' ? 'إعداد المناطق' : 'Zone Config', icon: ScanLine },
    { to: '/dashboard/voice-agent',   label: t('nav.voiceAgent'), icon: Phone },
    { to: '/dashboard/branches',      label: t('nav.branches'),   icon: GitBranch },
    { to: '/dashboard/settings',      label: t('nav.settings'),   icon: Settings },
    { to: '/dashboard/support',       label: t('nav.support'),    icon: Headphones },
  ]

  const isConnected = store?.last_heartbeat
    ? Date.now() - new Date(store.last_heartbeat).getTime() < 30 * 60_000
    : false

  const currentLabel = useMemo(() =>
    NAV.find(n => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))?.label || t('nav.home'),
  [location.pathname, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const initials = profile?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '؟'

  return (
    <div
      className="min-h-screen flex overflow-x-hidden"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={{ background: 'var(--bg-page)', color: 'var(--text-base)' }}
    >
      <PresenceTracker />

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── SIDEBAR ──────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 end-0 w-72 z-50 flex flex-col
          border-s transition-transform duration-300 ease-expo-out
          ${open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'}
          lg:static lg:translate-x-0 lg:rtl:translate-x-0
        `}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div className="h-16 px-5 flex items-center justify-between flex-shrink-0 border-b"
             style={{ borderColor: 'var(--border)' }}>
          <SplitLogo size={30} variant="full" />
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Store card */}
        {store && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-4 mt-4 p-3.5 rounded-xl border flex-shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1"
               style={{ color: 'var(--text-muted)' }}>{t('dash.store')}</p>
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-base)' }}>{store.name}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-brand-500 animate-dot' : 'bg-slate-400'}`} />
              <span className={`text-[11px] font-medium ${isConnected ? 'text-brand-600 dark:text-brand-400' : ''}`}
                    style={!isConnected ? { color: 'var(--text-muted)' } : {}}>
                {isConnected ? t('dash.connected') : t('dash.disconnected')}
              </span>
              {isConnected && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ms-auto text-[10px] bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400 px-1.5 py-0.5 rounded-full font-semibold"
                >
                  {t('dash.live')}
                </motion.span>
              )}
            </div>
          </motion.div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }, idx) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => `
                relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${isActive ? 'bg-brand-700 text-white shadow-sm' : 'hover:bg-[var(--bg-muted)]'}
              `}
              style={({ isActive }) => isActive ? {} : { color: 'var(--text-muted)' }}
              data-delay={idx * 30}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute inset-0 bg-brand-700 rounded-lg -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon size={17} className="flex-shrink-0" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Theme + Language toggles */}
        <div className="px-4 pb-2 flex items-center gap-1 border-t pt-3"
             style={{ borderColor: 'var(--border)' }}>
          <ThemeToggle className="flex-1 justify-center" />
          <div className="w-px h-5 self-center" style={{ background: 'var(--border)' }} />
          <LangToggle className="flex-1 justify-center" />
        </div>

        {/* User */}
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-950 flex items-center justify-center text-brand-700 dark:text-brand-400 font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>
                {profile?.full_name || 'مستخدم'}
              </p>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {profile?.company_name || t('nav.panel')}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={15} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="h-14 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 flex-shrink-0 border-b"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-lg transition-colors border"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              <Menu size={17} />
            </button>
            <div className="lg:hidden min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>{currentLabel}</p>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-soft)' }}>SPLIT</span>
              <ChevronLeft size={12} />
              <span className="font-medium" style={{ color: 'var(--text-base)' }}>{store?.name || currentLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop toggles in header */}
            <div className="hidden lg:flex items-center gap-0.5">
              <ThemeToggle compact />
              <LangToggle compact />
            </div>
            <button
              onClick={() => navigate('/dashboard/support')}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <Bell size={17} />
            </button>
          </div>
        </header>

        {/* Content with page transitions */}
        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <BroadcastBanner />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
          <SmartBot storeId={store?.id} />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="grid grid-cols-5 px-2 py-2 pb-safe gap-1">
            {NAV.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `
                  flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors
                  ${isActive ? 'text-brand-700 dark:text-brand-400' : ''}
                `}
                style={({ isActive }) => isActive ? {} : { color: 'var(--text-muted)' }}
              >
                {({ isActive }) => (
                  <>
                    <motion.div animate={isActive ? { scale: 1.15 } : { scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                      <Icon size={18} />
                    </motion.div>
                    <span className="truncate max-w-[50px]">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              onClick={() => setOpen(true)}
              className="flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              <Menu size={18} />
              <span>{t('nav.more')}</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
