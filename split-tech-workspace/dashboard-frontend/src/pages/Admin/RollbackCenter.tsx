import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Camera, Clock, CheckCircle, AlertTriangle, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatUiDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'

async function callRollback(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('ROLLBACK_AUTH')
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/rollback`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    },
  )
  const json = await res.json()
  if (!res.ok) throw new Error('ROLLBACK_FAIL')
  return json
}

function StoreRollbackPanel({ store }: { store: { id: string; name: string } }) {
  const { t, lang, isRtl } = useLanguage()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [snapshotModal, setSnapshotModal] = useState(false)
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const { data: snapshots = [], isLoading: snapsLoading } = useQuery({
    queryKey: ['snapshots', store.id],
    queryFn: () => callRollback('list_snapshots', { store_id: store.id }).then(r => r.snapshots ?? []),
    enabled: expanded,
  })

  const createSnapshot = useMutation({
    mutationFn: (r: string) => callRollback('create_snapshot', { store_id: store.id, reason: r }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots', store.id] })
      setSnapshotModal(false)
      setReason('')
      setError('')
    },
    onError: (e: Error) => {
      if (e.message === 'ROLLBACK_AUTH') setError(t('rollback.errAuth'))
      else if (e.message === 'ROLLBACK_FAIL') setError(t('rollback.errFail'))
      else setError(e.message)
    },
  })

  const applyRollback = useMutation({
    mutationFn: ({ snapshotId, r }: { snapshotId: string; r: string }) =>
      callRollback('apply_rollback', { store_id: store.id, snapshot_id: snapshotId, reason: r }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots', store.id] })
      setConfirmRollback(null)
      setReason('')
      setError('')
    },
    onError: (e: Error) => {
      if (e.message === 'ROLLBACK_AUTH') setError(t('rollback.errAuth'))
      else if (e.message === 'ROLLBACK_FAIL') setError(t('rollback.errFail'))
      else setError(e.message)
    },
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <RotateCcw className="w-4 h-4 text-brand-700" />
          </div>
          <div className={isRtl ? 'text-end' : 'text-start'}>
            <p className="font-medium text-gray-800">{store.name}</p>
            <p className="text-xs text-gray-400">{store.id.slice(0, 8)}...</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-50"
          >
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <p className="text-sm font-medium text-gray-700">{t('rollback.snapshotsTitle')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSnapshotModal(true)}
                  className="flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {t('rollback.newSnapshot')}
                </Button>
              </div>

              {snapsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (snapshots as any[]).length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <Camera className="w-7 h-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('rollback.emptySnapshots')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(snapshots as any[]).map((snap: any) => (
                    <div key={snap.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {snap.reason ?? t('rollback.manualSnapshot')}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{formatUiDate(snap.created_at, lang)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setConfirmRollback(snap.id); setReason('') }}
                        className={`flex items-center gap-1.5 text-xs text-brand-700 font-medium hover:text-brand-900 transition-colors shrink-0 ${isRtl ? 'ms-3' : 'me-3'}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('rollback.restore')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={snapshotModal} onClose={() => { setSnapshotModal(false); setError('') }} title={t('rollback.modalSnapshotTitle')} size="sm">
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <p className="text-sm text-gray-600">{t('rollback.modalSnapshotBody')}</p>
          <Input
            label={t('rollback.snapshotReason')}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('rollback.snapshotReasonPh')}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button
              className="flex-1"
              loading={createSnapshot.isPending}
              onClick={() => createSnapshot.mutate(reason.trim() || t('rollback.manualSnapshot'))}
            >
              <Camera className="w-4 h-4 ms-2" />{t('rollback.saveSnapshot')}
            </Button>
            <Button variant="secondary" onClick={() => setSnapshotModal(false)}>{t('rollback.cancel')}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmRollback}
        onClose={() => { setConfirmRollback(null); setError('') }}
        title={t('rollback.confirmTitle')}
        size="sm"
      >
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{t('rollback.confirmBody')}</p>
          </div>
          <Input
            label={t('rollback.restoreReason')}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('rollback.restoreReasonPh')}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-amber-600 hover:bg-amber-700"
              loading={applyRollback.isPending}
              onClick={() => confirmRollback && applyRollback.mutate({
                snapshotId: confirmRollback,
                r: reason.trim() || t('rollback.defaultRestore'),
              })}
            >
              <RotateCcw className="w-4 h-4 ms-2" />{t('rollback.confirmBtn')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRollback(null)}>{t('rollback.cancel')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function RollbackCenter() {
  const { t, isRtl } = useLanguage()
  const [search, setSearch] = useState('')

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['rollback-stores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .eq('store_status', 'active')
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const filtered = (stores as any[]).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-brand-700 rounded-xl">
          <RotateCcw className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('rollback.pageTitle')}</h1>
          <p className="text-sm text-gray-500">{t('rollback.pageSubtitle')}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">{t('rollback.howTitle')}</p>
          <p className="text-xs text-blue-700 mt-0.5">{t('rollback.howBody')}</p>
        </div>
      </div>

      <div className="relative">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${isRtl ? 'end-3' : 'start-3'}`} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('rollback.searchPh')}
          className={`input-field ${isRtl ? 'pe-9' : 'ps-9'}`}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? t('rollback.noMatch') : t('rollback.noStores')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((store: any) => (
            <StoreRollbackPanel key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  )
}
