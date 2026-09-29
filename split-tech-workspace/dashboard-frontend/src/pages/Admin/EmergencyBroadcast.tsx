import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Siren, AlertTriangle, Send, History, Zap,
  CheckCircle, Info, Megaphone, ShieldOff,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'
import { formatUiDate } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'

const severityBadge: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
}

export default function EmergencyBroadcast() {
  const { t, lang, isRtl } = useLanguage()
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [confirmKill, setConfirmKill] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    message: '',
    severity: 'warning',
    target_scope: 'all',
    target_tier: 'basic',
    target_store_ids: '',
    expires_in_minutes: 60,
    kill_signal: false,
    kill_reason: '',
  })

  const severityOptions = useMemo(
    () => [
      { value: 'info', labelKey: 'emergency.sevInfo' as TranslationKey, icon: Info, color: 'text-blue-600 bg-blue-50 border-blue-200' },
      { value: 'warning', labelKey: 'emergency.sevWarning' as TranslationKey, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 border-amber-200' },
      { value: 'critical', labelKey: 'emergency.sevCritical' as TranslationKey, icon: Siren, color: 'text-red-600 bg-red-50 border-red-200' },
    ],
    [],
  )

  const scopeOptions = useMemo(
    () => [
      { value: 'all', labelKey: 'emergency.scopeAll' as TranslationKey },
      { value: 'tier', labelKey: 'emergency.scopeTier' as TranslationKey },
      { value: 'store_ids', labelKey: 'emergency.scopeStores' as TranslationKey },
    ],
    [],
  )

  const tierOptions = useMemo(
    () => [
      { value: 'basic', labelKey: 'emergency.tierBasic' as TranslationKey },
      { value: 'pro', labelKey: 'emergency.tierPro' as TranslationKey },
      { value: 'enterprise', labelKey: 'emergency.tierEnt' as TranslationKey },
    ],
    [],
  )

  const scopeLabel = (scope: string) =>
    t((scopeOptions.find((o) => o.value === scope)?.labelKey ?? 'emergency.scopeAll') as TranslationKey)

  const severityLabel = (sev: string) =>
    t((severityOptions.find((s) => s.value === sev)?.labelKey ?? 'emergency.sevWarning') as TranslationKey)

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ['emergency-broadcasts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emergency_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 30_000,
  })

  const sendBroadcast = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('EMERGENCY_AUTH')

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        message: form.message.trim(),
        severity: form.severity,
        target_scope: form.target_scope,
        expires_in_minutes: form.expires_in_minutes,
        kill_signal: form.kill_signal,
      }
      if (form.target_scope === 'tier') payload.target_tier = form.target_tier
      if (form.target_scope === 'store_ids') {
        payload.target_store_ids = form.target_store_ids.split(',').map(s => s.trim()).filter(Boolean)
      }
      if (form.kill_signal && form.kill_reason.trim()) {
        payload.kill_reason = form.kill_reason.trim()
      }

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/emergency-broadcast`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error('EMERGENCY_SEND')
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emergency-broadcasts'] })
      setModal(false)
      setConfirmKill(false)
      setError('')
      setForm({
        title: '', message: '', severity: 'warning', target_scope: 'all',
        target_tier: 'basic', target_store_ids: '', expires_in_minutes: 60,
        kill_signal: false, kill_reason: '',
      })
    },
    onError: (e: Error) => {
      if (e.message === 'EMERGENCY_AUTH') setError(t('emergency.errAuth'))
      else if (e.message === 'EMERGENCY_SEND') setError(t('emergency.errSend'))
      else setError(e.message)
    },
  })

  const handleSend = () => {
    setError('')
    if (!form.title.trim() || !form.message.trim()) {
      setError(t('emergency.errFill'))
      return
    }
    if (form.kill_signal && !confirmKill) {
      setConfirmKill(true)
      return
    }
    sendBroadcast.mutate()
  }

  const resetModal = () => {
    setModal(false)
    setConfirmKill(false)
    setError('')
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-600 rounded-xl">
            <Siren className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('emergency.title')}</h1>
            <p className="text-sm text-gray-500">{t('emergency.subtitle')}</p>
          </div>
        </div>
        <Button onClick={() => setModal(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700">
          <Siren className="w-4 h-4" />
          {t('emergency.sendBtn')}
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">{t('emergency.bannerTitle')}</p>
          <p className="text-xs text-amber-700 mt-0.5">{t('emergency.bannerText')}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
          <History className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-800">{t('emergency.historyTitle')}</h2>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('emergency.historyEmpty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(broadcasts as any[]).map(b => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-5 py-4 flex items-start gap-4"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${severityBadge[b.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                  {b.kill_signal ? <ShieldOff className="w-4 h-4" /> : <Siren className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-medium text-gray-800 truncate">{b.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityBadge[b.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                      {severityLabel(b.severity)}
                    </span>
                    {b.kill_signal && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-white font-bold">{t('emergency.killFull')}</span>
                    )}
                    {!b.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{t('emergency.expired')}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{b.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{formatUiDate(b.created_at, lang)}</span>
                    <span>·</span>
                    <span>{t('emergency.scopePrefix')} {scopeLabel(b.target_scope)}</span>
                  </div>
                </div>
                {b.is_active && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('emergency.active')}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modal} onClose={resetModal} title={t('emergency.modalTitle')} size="lg">
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <AnimatePresence>
            {confirmKill && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-50 border border-red-300 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <ShieldOff className="w-5 h-5 text-red-600" />
                  <p className="font-bold text-red-800">{t('emergency.killConfirmTitle')}</p>
                </div>
                <p className="text-sm text-red-700">{t('emergency.killConfirmText')}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <Input
            label={t('emergency.fieldTitle')}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t('emergency.fieldTitlePh')}
          />

          <div>
            <label className="label">{t('emergency.fieldMessage')}</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={3}
              className="input-field"
              placeholder={t('emergency.fieldMessagePh')}
            />
          </div>

          <div>
            <label className="label">{t('emergency.severityLabel')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {severityOptions.map(s => {
                const Icon = s.icon
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, severity: s.value }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition-all
                      ${form.severity === s.value ? s.color + ' border-current' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {t(s.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('emergency.targetLabel')}</label>
              <select
                value={form.target_scope}
                onChange={e => setForm(f => ({ ...f, target_scope: e.target.value }))}
                className="input-field"
              >
                {scopeOptions.map(o => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('emergency.durationLabel')}</label>
              <input
                type="number"
                value={form.expires_in_minutes}
                onChange={e => setForm(f => ({ ...f, expires_in_minutes: Number(e.target.value) }))}
                className="input-field"
                min={5}
                max={1440}
              />
            </div>
          </div>

          {form.target_scope === 'tier' && (
            <div>
              <label className="label">{t('emergency.targetTierLabel')}</label>
              <select
                value={form.target_tier}
                onChange={e => setForm(f => ({ ...f, target_tier: e.target.value }))}
                className="input-field"
              >
                {tierOptions.map(o => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </div>
          )}

          {form.target_scope === 'store_ids' && (
            <Input
              label={t('emergency.storeIdsLabel')}
              value={form.target_store_ids}
              onChange={e => setForm(f => ({ ...f, target_store_ids: e.target.value }))}
              placeholder={t('emergency.storeIdsPh')}
            />
          )}

          <div className={`rounded-xl border-2 p-4 ${form.kill_signal ? 'border-red-400 bg-red-50' : 'border-gray-100'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={form.kill_signal}
                  onChange={e => {
                    setForm(f => ({ ...f, kill_signal: e.target.checked }))
                    setConfirmKill(false)
                  }}
                  className="sr-only"
                />
                <div className={`w-10 h-6 rounded-full transition-colors ${form.kill_signal ? 'bg-red-600' : 'bg-gray-200'}`}>
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow absolute top-1 transition-all ${
                      form.kill_signal
                        ? (isRtl ? 'right-1' : 'left-1')
                        : (isRtl ? 'right-5' : 'left-5')
                    }`}
                  />
                </div>
              </div>
              <div>
                <p className={`font-medium text-sm ${form.kill_signal ? 'text-red-700' : 'text-gray-700'}`}>
                  <Zap className="w-4 h-4 inline ms-1" />
                  {t('emergency.killToggle')}
                </p>
                <p className="text-xs text-gray-400">{t('emergency.killToggleHint')}</p>
              </div>
            </label>
            {form.kill_signal && (
              <div className="mt-3">
                <Input
                  label={t('emergency.killReasonLabel')}
                  value={form.kill_reason}
                  onChange={e => setForm(f => ({ ...f, kill_reason: e.target.value }))}
                  placeholder={t('emergency.killReasonPh')}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3">
            <Button
              className={`flex-1 ${form.kill_signal ? 'bg-red-600 hover:bg-red-700' : ''}`}
              loading={sendBroadcast.isPending}
              onClick={handleSend}
            >
              {confirmKill ? (
                <><ShieldOff className="w-4 h-4 ms-2" />{t('emergency.btnConfirmKill')}</>
              ) : (
                <><Send className="w-4 h-4 ms-2" />{t('emergency.btnSend')}</>
              )}
            </Button>
            <Button variant="secondary" onClick={resetModal}>{t('emergency.cancel')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
