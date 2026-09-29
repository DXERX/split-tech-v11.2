import { useState, Suspense, lazy } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Key, Fingerprint, AlertTriangle,
  Ban, StopCircle, CheckCircle, Search,
  Terminal, Activity
} from 'lucide-react'
const SecurityShield3D = lazy(() => import('../../components/ui/SecurityShield3D'))
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import { formatSaudiDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const API_URL = import.meta.env.VITE_API_URL

async function adminAction(
  action: string,
  payload: Record<string, unknown>,
  token: string
) {
  const resp = await fetch(`${API_URL}/v1/revoke-license`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'CMD_ACTION_FAILED')
  return data
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: {
  icon: React.FC<{ className?: string }>; label: string; value: string | number; color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-card p-4"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </motion.div>
  )
}

// ── Hardware Lock Row ──────────────────────────────────────────────────────
function formatHardwareEventType(eventType: string, t: (k: TranslationKey) => string): string {
  const map: Record<string, TranslationKey> = {
    activation: 'cmd.event.activation',
    fingerprint_mismatch: 'cmd.event.fingerprint_mismatch',
    fingerprint_override: 'cmd.event.fingerprint_override',
    license_revoked: 'cmd.event.license_revoked',
    license_expired: 'cmd.event.license_expired',
  }
  const key = map[eventType]
  return key ? t(key) : eventType
}

function HardwareLockRow({ log }: { log: any }) {
  const { t } = useLanguage()
  const eventColor: Record<string, string> = {
    activation:            'text-brand-700 bg-brand-50',
    fingerprint_mismatch:  'text-red-700 bg-red-50',
    fingerprint_override:  'text-amber-700 bg-amber-50',
    license_revoked:       'text-slate-700 bg-slate-100',
    license_expired:       'text-orange-700 bg-orange-50',
  }
  const color = eventColor[log.event_type] || 'text-slate-600 bg-slate-50'
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 text-sm">
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {formatHardwareEventType(log.event_type, t)}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">
        {log.stores?.name || log.store_id?.substring(0, 8) + '...'}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-400">
        {log.new_fingerprint ? log.new_fingerprint.substring(0, 12) + '...' : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{log.platform || '—'}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{formatSaudiDate(log.created_at)}</td>
    </tr>
  )
}

// ── API Key Row ────────────────────────────────────────────────────────────
function ApiKeyRow({
  keyRow, onRevoke, onOverride, isSuperOwner
}: {
  keyRow: any
  onRevoke: (id: string, storeName: string) => void
  onOverride: (id: string, current: string, storeName: string) => void
  isSuperOwner: boolean
}) {
  const { t } = useLanguage()
  const isActive = keyRow.is_active
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 text-sm">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{keyRow.stores?.name || '—'}</p>
        <p className="text-xs text-slate-400 font-mono">{keyRow.license_key || '—'}</p>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isActive ? 'text-brand-700 bg-brand-50' : 'text-slate-500 bg-slate-100'
        }`}>
          {isActive ? <CheckCircle size={10} /> : <Ban size={10} />}
          {isActive ? t('cmd.license.active') : t('cmd.license.revoked')}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">
        {keyRow.machine_fingerprint
          ? keyRow.machine_fingerprint.substring(0, 16) + '...'
          : <span className="text-amber-500">{t('cmd.fp.unbound')}</span>}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {keyRow.activated_at ? formatSaudiDate(keyRow.activated_at) : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              size="sm" variant="danger"
              onClick={() => onRevoke(keyRow.id, keyRow.stores?.name || '—')}
              className="flex items-center gap-1 text-xs"
            >
              <StopCircle size={11} /> {t('cmd.btn.revoke')}
            </Button>
          )}
          {isSuperOwner && keyRow.machine_fingerprint && (
            <Button
              size="sm" variant="secondary"
              onClick={() => onOverride(keyRow.id, keyRow.machine_fingerprint, keyRow.stores?.name || '—')}
              className="flex items-center gap-1 text-xs"
            >
              <Fingerprint size={11} /> {t('cmd.btn.override')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const { t } = useLanguage()
  const { session, role } = useAuth()
  const qc = useQueryClient()
  const isSuperOwner = role === 'super_owner'

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'licenses' | 'sessions' | 'hardware'>('licenses')

  // Revoke license modal
  const [revokeModal, setRevokeModal] = useState<{
    open: boolean; apiKeyId: string; storeName: string
  }>({ open: false, apiKeyId: '', storeName: '' })

  // Override fingerprint modal
  const [fpModal, setFpModal] = useState<{
    open: boolean; apiKeyId: string; currentFp: string; storeName: string; newFp: string
  }>({ open: false, apiKeyId: '', currentFp: '', storeName: '', newFp: '' })

  // Revoke sessions modal
  const [sessionModal, setSessionModal] = useState<{
    open: boolean; userId: string; userName: string
  }>({ open: false, userId: '', userName: '' })

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: apiKeys = [], isLoading: loadingKeys } = useQuery({
    queryKey: ['admin-api-keys'],
    queryFn: async () => {
      const { data } = await supabase
        .from('store_api_keys')
        .select('*, stores(id, name, store_status)')
        .order('created_at', { ascending: false })
      return data || []
    },
    refetchInterval: 30_000,
  })

  const { data: hwLogs = [], isLoading: loadingHw } = useQuery({
    queryKey: ['hw-lock-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hardware_lock_log')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      return data || []
    },
    refetchInterval: 15_000,
  })

  const { data: activeSessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('active_sessions')
        .select('*, profiles(full_name, company_name)')
        .eq('is_revoked', false)
        .order('last_seen', { ascending: false })
        .limit(200)
      return data || []
    },
    refetchInterval: 10_000,
  })

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = {
    activeKeys:     apiKeys.filter((k: any) => k.is_active).length,
    revokedKeys:    apiKeys.filter((k: any) => !k.is_active).length,
    activeSessions: activeSessions.length,
    fpMismatches:   hwLogs.filter((l: any) => l.event_type === 'fingerprint_mismatch').length,
  }

  const [actionError, setActionError] = useState<string | null>(null)

  // ── Mutations ──────────────────────────────────────────────────────────
  const doAction = useMutation({
    mutationFn: async (payload: Parameters<typeof adminAction>[1] & { action: string }) => {
      const { action, ...rest } = payload
      return adminAction(action, rest, session?.access_token || '')
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ['admin-api-keys'] })
      qc.invalidateQueries({ queryKey: ['hw-lock-log'] })
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
      setRevokeModal({ open: false, apiKeyId: '', storeName: '' })
      setFpModal({ open: false, apiKeyId: '', currentFp: '', storeName: '', newFp: '' })
      setSessionModal({ open: false, userId: '', userName: '' })
    },
    onError: (err: Error) => {
      setActionError(err.message === 'CMD_ACTION_FAILED' ? t('cmd.err.actionFailed') : err.message)
    },
  })

  // ── Filter ─────────────────────────────────────────────────────────────
  const filteredKeys = apiKeys.filter((k: any) =>
    !search || k.stores?.name?.toLowerCase().includes(search.toLowerCase()) ||
    k.license_key?.toLowerCase().includes(search.toLowerCase())
  )

  const tabs = [
    { id: 'licenses' as const, labelKey: 'cmd.tab.licenses' as TranslationKey, icon: Key, count: apiKeys.length },
    { id: 'sessions' as const, labelKey: 'cmd.tab.sessions' as TranslationKey, icon: Terminal, count: activeSessions.length },
    { id: 'hardware' as const, labelKey: 'cmd.tab.hardware' as TranslationKey, icon: Fingerprint, count: hwLogs.length },
  ]

  return (
    <div className="page-container space-y-6">
      {/* Header with 3D Shield */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-brand-900/20" />
        <div className="relative flex flex-col md:flex-row items-center gap-0 md:gap-6">
          <div className="w-full md:w-56 h-44 md:h-56 shrink-0">
            <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Shield className="w-12 h-12 text-brand-500 animate-pulse" /></div>}>
              <SecurityShield3D height={224} suspended={stats.revokedKeys > 0} />
            </Suspense>
          </div>
          <div className="pb-6 px-6 md:px-0 md:py-8 text-white text-center md:text-end">
            <p className="text-xs text-brand-400 font-semibold uppercase tracking-widest mb-2">{t('cmd.badge')}</p>
            <h1 className="text-2xl md:text-3xl font-black mb-2">{t('cmd.title')}</h1>
            <p className="text-slate-400 text-sm max-w-sm">{t('cmd.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Key}         label={t('cmd.stat.activeLicenses')}    value={stats.activeKeys}     color="text-brand-700 bg-brand-100" />
        <StatCard icon={Ban}         label={t('cmd.stat.revokedLicenses')}   value={stats.revokedKeys}    color="text-red-700 bg-red-100" />
        <StatCard icon={Activity}    label={t('cmd.stat.activeSessions')}     value={stats.activeSessions} color="text-blue-700 bg-blue-100" />
        <StatCard icon={AlertTriangle} label={t('cmd.stat.fpMismatch')}   value={stats.fpMismatches}   color={stats.fpMismatches > 0 ? 'text-amber-700 bg-amber-100' : 'text-slate-400 bg-slate-100'} />
      </div>

      {/* Warning banner for fingerprint mismatches */}
      <AnimatePresence>
        {stats.fpMismatches > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">
                {t('cmd.fpWarn.title').replace('{n}', String(stats.fpMismatches))}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {t('cmd.fpWarn.body')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        {/* Tab headers */}
        <div className="flex border-b border-slate-100 bg-slate-50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-brand-700 border-b-2 border-brand-600 bg-white'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon size={15} />
              {t(tab.labelKey)}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search bar (licenses tab) */}
        {activeTab === 'licenses' && (
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('cmd.searchPh')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full ps-4 pe-9 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>
        )}

        {/* ── Licenses Tab ────────────────────────────────────────────── */}
        {activeTab === 'licenses' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.storeLicense')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.status')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.fingerprint')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.activated')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingKeys ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredKeys.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">{t('cmd.empty.licenses')}</td>
                  </tr>
                ) : filteredKeys.map((k: any) => (
                  <ApiKeyRow
                    key={k.id}
                    keyRow={k}
                    isSuperOwner={isSuperOwner}
                    onRevoke={(id, name) => setRevokeModal({ open: true, apiKeyId: id, storeName: name })}
                    onOverride={(id, fp, name) => setFpModal({ open: true, apiKeyId: id, currentFp: fp, storeName: name, newFp: '' })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Sessions Tab ────────────────────────────────────────────── */}
        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.user')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.platform')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.lastActivity')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingSessions ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {[...Array(4)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : activeSessions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-400">{t('cmd.empty.sessions')}</td>
                  </tr>
                ) : activeSessions.map((s: any) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{s.profiles?.full_name || '—'}</p>
                      <p className="text-xs text-slate-400">{s.profiles?.company_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {s.platform || 'web'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatSaudiDate(s.last_seen)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm" variant="danger"
                        onClick={() => setSessionModal({
                          open: true,
                          userId: s.user_id,
                          userName: s.profiles?.full_name || '—',
                        })}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Ban size={11} /> {t('cmd.btn.revokeSessions')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Hardware Lock Log Tab ────────────────────────────────── */}
        {activeTab === 'hardware' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.event')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.store')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.newFp')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.platform')}</th>
                  <th className="text-start px-4 py-3 text-xs font-bold text-slate-500">{t('cmd.th.date')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingHw ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : hwLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">{t('cmd.empty.hardware')}</td>
                  </tr>
                ) : hwLogs.map((log: any) => (
                  <HardwareLockRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Revoke License Modal ───────────────────────────────────────── */}
      <Modal
        open={revokeModal.open}
        onClose={() => setRevokeModal({ open: false, apiKeyId: '', storeName: '' })}
        title={t('cmd.modal.revokeTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {t('cmd.modal.revokeLead')} {revokeModal.storeName}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {t('cmd.modal.revokeBody')}
              </p>
            </div>
          </div>
          {actionError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
          )}
          <Button
            className="w-full"
            variant="danger"
            loading={doAction.isPending}
            onClick={() => doAction.mutate({
              action:     'revoke_license',
              api_key_id: revokeModal.apiKeyId,
              reason:     'Admin revocation from Command Center',
            })}
          >
            {t('cmd.modal.confirmRevoke')}
          </Button>
        </div>
      </Modal>

      {/* ── Override Fingerprint Modal ─────────────────────────────────── */}
      <Modal
        open={fpModal.open}
        onClose={() => setFpModal({ open: false, apiKeyId: '', currentFp: '', storeName: '', newFp: '' })}
        title={t('cmd.modal.fpTitle').replace('{name}', fpModal.storeName)}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">{t('cmd.modal.currentFp')}</p>
            <code className="block text-xs bg-slate-100 p-2 rounded-lg break-all text-slate-600">
              {fpModal.currentFp || t('cmd.modal.fpUnset')}
            </code>
          </div>
          <div>
            <label className="label">{t('cmd.modal.newFpLabel')}</label>
            <input
              type="text"
              value={fpModal.newFp}
              onChange={e => setFpModal(f => ({ ...f, newFp: e.target.value }))}
              placeholder={t('cmd.modal.newFpPh')}
              className="input-field font-mono text-sm"
            />
          </div>
          <Button
            className="w-full"
            loading={doAction.isPending}
            disabled={!fpModal.newFp.trim()}
            onClick={() => doAction.mutate({
              action:          'override_fingerprint',
              api_key_id:      fpModal.apiKeyId,
              new_fingerprint: fpModal.newFp.trim(),
              reason:          'IT Support fingerprint override',
            })}
          >
            <Fingerprint size={14} className="ms-1" />
            {t('cmd.modal.updateFp')}
          </Button>
        </div>
      </Modal>

      {/* ── Revoke Sessions Modal ──────────────────────────────────────── */}
      <Modal
        open={sessionModal.open}
        onClose={() => setSessionModal({ open: false, userId: '', userName: '' })}
        title={t('cmd.modal.sessionsTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              {t('cmd.modal.sessionsBody').replace('{name}', sessionModal.userName)}
            </p>
          </div>
          <Button
            className="w-full"
            variant="danger"
            loading={doAction.isPending}
            onClick={() => doAction.mutate({
              action:         'revoke_sessions',
              target_user_id: sessionModal.userId,
              reason:         'Admin force-logout from Command Center',
            })}
          >
            {t('cmd.modal.revokeAllSessions')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
