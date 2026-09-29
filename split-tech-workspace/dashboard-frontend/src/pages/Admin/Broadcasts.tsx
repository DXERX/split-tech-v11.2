import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Megaphone, Plus, Trash2, AlertTriangle, Info, Wrench, Sparkles, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchProfilesMap } from '../../lib/adminData'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatRelative } from '../../lib/utils'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'

const TYPE_KEYS = [
  { value: 'info', labelKey: 'bcast.type.info' as const, icon: Info, color: 'text-blue-600 bg-blue-50' },
  { value: 'warning', labelKey: 'bcast.type.warning' as const, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
  { value: 'maintenance', labelKey: 'bcast.type.maintenance' as const, icon: Wrench, color: 'text-slate-600 bg-slate-100' },
  { value: 'feature', labelKey: 'bcast.type.feature' as const, icon: Sparkles, color: 'text-purple-600 bg-purple-50' },
  { value: 'urgent', labelKey: 'bcast.type.urgent' as const, icon: Zap, color: 'text-red-600 bg-red-50' },
]

const TARGET_KEYS = [
  { value: 'all', labelKey: 'bcast.target.all' as const },
  { value: 'merchants', labelKey: 'bcast.target.merchants' as const },
  { value: 'it', labelKey: 'bcast.target.it' as const },
]

function typeConfig(type: string) {
  return TYPE_KEYS.find((t) => t.value === type) || TYPE_KEYS[0]
}

export default function Broadcasts() {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'info', target: 'all' })

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const profilesMap = await fetchProfilesMap((data || []).map((broadcast) => broadcast.created_by))

      return (data || []).map((broadcast) => ({
        ...broadcast,
        profiles: broadcast.created_by ? profilesMap[broadcast.created_by] ?? null : null,
      }))
    },
  })

  const createBroadcast = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('broadcasts').insert({
        title: form.title,
        message: form.message,
        type: form.type as any,
        target: form.target as any,
        is_active: true,
        created_by: user!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] })
      qc.invalidateQueries({ queryKey: ['active-broadcasts'] })
      setModal(false)
      setForm({ title: '', message: '', type: 'info', target: 'all' })
    },
  })

  const deleteBroadcast = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('broadcasts')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-broadcasts'] })
      qc.invalidateQueries({ queryKey: ['active-broadcasts'] })
    },
  })

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-brand-700" />
            {t('bcast.title')}
          </h1>
          <p className="text-slate-500 text-sm">{t('bcast.subtitle')}</p>
        </div>
        <Button onClick={() => setModal(true)} className="flex items-center gap-2">
          <Plus size={16} />
          {t('bcast.newBtn')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
          <Megaphone className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">{t('bcast.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(broadcasts as any[]).map((b) => {
            const config = typeConfig(b.type)
            const Icon = config.icon
            const targetKey = TARGET_KEYS.find((tk) => tk.value === b.target)
            return (
              <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`bg-white rounded-2xl border shadow-card p-5 ${!b.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-bold text-slate-900">{b.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.color}`}>
                          {t(config.labelKey)}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          {targetKey ? t(targetKey.labelKey) : b.target}
                        </span>
                        {!b.is_active && (
                          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">{t('bcast.cancelled')}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{b.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {b.profiles?.full_name || t('admin.bcast.system')} · {formatRelative(b.created_at, lang)}
                      </p>
                    </div>
                  </div>
                  {b.is_active && (
                    <button
                      onClick={() => deleteBroadcast.mutate(b.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title={t('bcast.cancelTitle')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={t('bcast.modalTitle')} size="md">
        <div className="space-y-4">
          <Input
            label={t('bcast.fieldTitle')}
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('bcast.fieldTitlePh')}
          />
          <div>
            <label className="label">{t('bcast.fieldMessage')}</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              className="input-field"
              placeholder={t('bcast.fieldMessagePh')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('bcast.typeLabel')}</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                {TYPE_KEYS.map(({ value, labelKey }) => (
                  <option key={value} value={value}>{t(labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('bcast.targetLabel')}</label>
              <select value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} className="input-field">
                {TARGET_KEYS.map(({ value, labelKey }) => (
                  <option key={value} value={value}>{t(labelKey)}</option>
                ))}
              </select>
            </div>
          </div>
          <Button
            className="w-full"
            loading={createBroadcast.isPending}
            onClick={() => form.title.trim() && form.message.trim() && createBroadcast.mutate()}
          >
            {t('bcast.sendBtn')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
