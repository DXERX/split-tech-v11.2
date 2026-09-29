import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  Users, LogOut, Menu, X, Bell, TrendingUp, DollarSign, ClipboardCheck, BarChart3,
  Home, Store, CreditCard, Radio, ShieldAlert, RotateCcw, Megaphone, Ticket,
  MessageSquare, Activity, Gauge, ListTodo, Wifi, CalendarClock, BadgeCheck,
  UserCircle, ChevronLeft, ChevronRight, Receipt,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { ThemeToggle, LangToggle } from '../ui/ThemeToggle'
import type { UserRole } from '../../types'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '../../i18n'
import SplitLogo from '../ui/SplitLogo'
import PresenceTracker from '../PresenceTracker'

interface NavDef {
  to: string
  navKey: TranslationKey
  groupKey: TranslationKey
  icon: LucideIcon
  end?: boolean
  roles: UserRole[] | null
}

const GROUP_KEYS: TranslationKey[] = [
  'admin.navGroup.general',
  'admin.navGroup.marketing',
  'admin.navGroup.support',
  'admin.navGroup.operations',
  'admin.navGroup.it',
  'admin.navGroup.personal',
]

const ADMIN_NAV: NavDef[] = [
  { to: '/admin', navKey: 'admin.nav.overview', groupKey: 'admin.navGroup.general', icon: Home, end: true, roles: ['super_owner', 'it_support', 'customer_support', 'marketing_manager'] },
  { to: '/admin/stores', navKey: 'admin.nav.storeApprovals', groupKey: 'admin.navGroup.general', icon: Store, roles: ['super_owner', 'it_support', 'customer_support'] },
  { to: '/admin/analytics', navKey: 'admin.nav.analytics', groupKey: 'admin.navGroup.general', icon: BarChart3, roles: ['super_owner', 'it_support', 'customer_support', 'marketing_manager'] },
  { to: '/admin/users', navKey: 'admin.nav.users', groupKey: 'admin.navGroup.general', icon: Users, roles: ['super_owner'] },
  { to: '/admin/subscriptions', navKey: 'admin.nav.subscriptions', groupKey: 'admin.navGroup.general', icon: CreditCard, roles: ['super_owner'] },
  { to: '/admin/billing-ledger', navKey: 'admin.nav.billingLedger', groupKey: 'admin.navGroup.general', icon: Receipt, roles: ['super_owner', 'it_support'] },
  { to: '/admin/marketing-manager/performance', navKey: 'admin.nav.mmPerformance', groupKey: 'admin.navGroup.marketing', icon: BarChart3, roles: ['super_owner', 'marketing_manager'] },
  { to: '/admin/marketing-manager/lead-approval', navKey: 'admin.nav.mmLeadApproval', groupKey: 'admin.navGroup.marketing', icon: ClipboardCheck, roles: ['super_owner', 'marketing_manager'] },
  { to: '/admin/marketing-manager/associates', navKey: 'admin.nav.mmAssociates', groupKey: 'admin.navGroup.marketing', icon: Users, roles: ['super_owner', 'marketing_manager'] },
  { to: '/admin/marketing-manager/team-tasks', navKey: 'admin.nav.mmTeamTasks', groupKey: 'admin.navGroup.marketing', icon: ListTodo, roles: ['super_owner', 'marketing_manager'] },
  { to: '/admin/marketing-manager/payouts', navKey: 'admin.nav.mmPayouts', groupKey: 'admin.navGroup.marketing', icon: DollarSign, roles: ['super_owner', 'marketing_manager'] },
  { to: '/admin/communications', navKey: 'admin.nav.communications', groupKey: 'admin.navGroup.marketing', icon: MessageSquare, roles: ['super_owner', 'it_support', 'marketing_manager'] },
  { to: '/admin/leads', navKey: 'admin.nav.earlyAccessLeads', groupKey: 'admin.navGroup.support', icon: Users, roles: ['super_owner', 'it_support', 'customer_support'] },
  { to: '/admin/contact-requests', navKey: 'admin.nav.contactRequests', groupKey: 'admin.navGroup.support', icon: MessageSquare, roles: ['super_owner', 'it_support', 'customer_support'] },
  { to: '/admin/tickets', navKey: 'admin.nav.tickets', groupKey: 'admin.navGroup.support', icon: Ticket, roles: ['super_owner', 'it_support', 'customer_support'] },
  { to: '/admin/broadcasts', navKey: 'admin.nav.broadcasts', groupKey: 'admin.navGroup.support', icon: Megaphone, roles: ['super_owner', 'it_support', 'customer_support', 'marketing_manager'] },
  { to: '/admin/live', navKey: 'admin.nav.live', groupKey: 'admin.navGroup.operations', icon: Radio, roles: ['super_owner', 'it_support'] },
  { to: '/admin/command', navKey: 'admin.nav.command', groupKey: 'admin.navGroup.operations', icon: Activity, roles: ['super_owner'] },
  { to: '/admin/emergency', navKey: 'admin.nav.emergency', groupKey: 'admin.navGroup.operations', icon: ShieldAlert, roles: ['super_owner', 'it_support'] },
  { to: '/admin/rollback', navKey: 'admin.nav.rollback', groupKey: 'admin.navGroup.operations', icon: RotateCcw, roles: ['super_owner', 'it_support'] },
  { to: '/admin/staff-performance', navKey: 'admin.nav.staffPerformance', groupKey: 'admin.navGroup.operations', icon: TrendingUp, roles: ['super_owner'] },
  { to: '/admin/it-dashboard', navKey: 'admin.nav.itDashboard', groupKey: 'admin.navGroup.it', icon: Activity, roles: ['super_owner', 'it_support'] },
  { to: '/admin/network-speed', navKey: 'admin.nav.networkSpeed', groupKey: 'admin.navGroup.it', icon: Gauge, roles: ['super_owner', 'it_support'] },
  { to: '/admin/presence', navKey: 'admin.nav.presence', groupKey: 'admin.navGroup.it', icon: Wifi, roles: ['super_owner', 'it_support'] },
  { to: '/admin/attendance', navKey: 'admin.nav.attendance', groupKey: 'admin.navGroup.it', icon: CalendarClock, roles: ['super_owner', 'it_support'] },
  { to: '/admin/marketing-associate/entry', navKey: 'admin.nav.maEntry', groupKey: 'admin.navGroup.general', icon: TrendingUp, roles: ['marketing_associate'] },
  { to: '/admin/marketing-associate/leads', navKey: 'admin.nav.maLeads', groupKey: 'admin.navGroup.general', icon: ClipboardCheck, roles: ['marketing_associate'] },
  { to: '/admin/marketing-associate/bonus', navKey: 'admin.nav.maBonus', groupKey: 'admin.navGroup.general', icon: DollarSign, roles: ['marketing_associate'] },
  { to: '/admin/id-card', navKey: 'admin.nav.idCard', groupKey: 'admin.navGroup.personal', icon: BadgeCheck, roles: ['super_owner', 'it_support', 'marketing_manager', 'marketing_associate', 'customer_support'] },
  { to: '/admin/profile', navKey: 'admin.nav.profile', groupKey: 'admin.navGroup.personal', icon: UserCircle, roles: ['super_owner', 'it_support', 'marketing_manager', 'marketing_associate', 'customer_support'] },
]

const ROLE_NAV_KEY: Partial<Record<UserRole, TranslationKey>> = {
  super_owner: 'admin.role.super_owner',
  it_support: 'admin.role.it_support',
  customer_support: 'admin.role.customer_support',
  marketing_manager: 'admin.role.marketing_manager',
  marketing_associate: 'admin.role.marketing_associate',
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3.5 mb-1 text-[10px] font-bold uppercase tracking-[0.15em]"
         style={{ color: 'var(--text-muted)' }}>{label}</p>
      {children}
    </div>
  )
}

export default function AdminLayout() {
  const { profile, role, signOut } = useAuth()
  const { lang, t } = useLanguage()
  const isAr = lang === 'ar'
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const visible = ADMIN_NAV.filter(item => !item.roles || (role && item.roles.includes(role)))

  const grouped = useMemo(() => {
    const map = new Map<TranslationKey, NavDef[]>()
    for (const g of GROUP_KEYS) map.set(g, [])
    for (const item of visible) {
      const list = map.get(item.groupKey)
      if (list) list.push(item)
    }
    return map
  }, [visible, role])

  const currentLabel = useMemo(() => {
    const path = location.pathname
    const sorted = [...visible].sort((a, b) => b.to.length - a.to.length)
    const current = sorted.find((item) => (item.end ? path === item.to : path.startsWith(item.to)))
    return current ? t(current.navKey) : t('admin.nav.panelSubtitle')
  }, [location.pathname, visible, t])

  const roleLabel = role && ROLE_NAV_KEY[role] ? t(ROLE_NAV_KEY[role]!) : t('admin.role.fallback')

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const initials = profile?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'A'

  return (
    <div
      className="min-h-screen flex overflow-x-hidden"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ background: 'var(--bg-page)', color: 'var(--text-base)' }}
    >
      <PresenceTracker />

      {open && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 end-0 w-72 flex flex-col z-50
          border-s transition-transform duration-300 ease-expo-out
          ${open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'}
          lg:static lg:translate-x-0 lg:rtl:translate-x-0
        `}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div
          className="h-16 px-5 flex items-center justify-between flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <SplitLogo size={28} variant="mark" />
            <div>
              <p className="text-sm font-bold tracking-tight leading-none" style={{ color: 'var(--text-base)' }}>SPLIT</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t('admin.nav.panelSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 flex-shrink-0">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-soft)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-lime animate-dot" />
            {roleLabel}
          </span>
        </div>

        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-4">
          {GROUP_KEYS.map((gk) => {
            const items = grouped.get(gk) ?? []
            if (!items.length) return null
            return (
              <NavGroup key={gk} label={t(gk)}>
                {items.map(({ to, navKey, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `
                      flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${isActive
                        ? 'bg-lime text-ink'
                        : 'hover:bg-[var(--bg-muted)]'}
                    `}
                    style={({ isActive }) => isActive ? {} : { color: 'var(--text-muted)' }}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    <span className="truncate">{t(navKey)}</span>
                  </NavLink>
                ))}
              </NavGroup>
            )
          })}
        </nav>

        <div
          className="px-4 pb-2 flex items-center gap-1 border-t pt-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <ThemeToggle className="flex-1 justify-center" />
          <div className="w-px h-5 self-center" style={{ background: 'var(--border)' }} />
          <LangToggle className="flex-1 justify-center" />
        </div>

        <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
              style={{ background: 'var(--bg-subtle)', color: 'var(--text-base)' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>
                {profile?.full_name || t('admin.nav.userPlaceholder')}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {roleLabel}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={15} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
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
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-base)' }}>
                {currentLabel}
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-soft)' }}>SPLIT</span>
              {isAr ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
              <span className="font-medium" style={{ color: 'var(--text-base)' }}>{currentLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="hidden lg:flex items-center gap-0.5">
              <ThemeToggle compact />
              <LangToggle compact />
            </div>
            <button
              onClick={() => navigate('/support')}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <Bell size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 lg:pb-0">
          <Outlet />
        </main>

        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="grid grid-cols-5 px-2 py-2 pb-safe gap-1">
            {visible.slice(0, 4).map(({ to, navKey, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `
                  flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-medium
                  transition-colors
                  ${isActive ? 'text-brand-700 dark:text-brand-400' : ''}
                `}
                style={({ isActive }) => isActive ? {} : { color: 'var(--text-muted)' }}
              >
                <Icon size={18} />
                <span className="truncate max-w-[52px]">{t(navKey)}</span>
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
