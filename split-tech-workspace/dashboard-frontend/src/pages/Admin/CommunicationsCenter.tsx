// CommunicationsCenter — Admin communications hub
// Tabs: Email Composer | WhatsApp Sender | Notification Log | Template Manager

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, MessageCircle, Bell, BookTemplate,
  Send, Loader, CheckCircle, XCircle, RefreshCw,
  Info,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import type { TranslationKey } from '../../i18n'

type Tab = 'email' | 'whatsapp' | 'log' | 'templates'

type EventType =
  | 'welcome' | 'security_alert' | 'daily_insight' | 'weekly_report'
  | 'store_approved' | 'store_rejected' | 'license_activated'
  | 'subscription_expired' | 'custom'

interface NotifLog {
  id: string
  channel: string
  event_type: string
  to_address: string
  subject: string | null
  body_preview: string | null
  status: string
  provider: string | null
  error_detail: string | null
  created_at: string
  recipient_id: string | null
  store_id: string | null
}

interface Template {
  id: string
  name: string
  channel: string
  event_type: string
  subject: string | null
  body_text: string
  is_active: boolean
  updated_at: string
}

const STATUS_COLORS: Record<string, string> = {
  sent:      'text-green-600 bg-green-50',
  delivered: 'text-blue-600 bg-blue-50',
  failed:    'text-red-600 bg-red-50',
  bounced:   'text-orange-600 bg-orange-50',
  opened:    'text-purple-600 bg-purple-50',
}

const EVENT_KEYS: Record<EventType, TranslationKey> = {
  welcome:              'comm.event.welcome',
  security_alert:       'comm.event.security_alert',
  daily_insight:        'comm.event.daily_insight',
  weekly_report:        'comm.event.weekly_report',
  store_approved:       'comm.event.store_approved',
  store_rejected:       'comm.event.store_rejected',
  license_activated:    'comm.event.license_activated',
  subscription_expired: 'comm.event.subscription_expired',
  custom:               'comm.event.custom',
}

const API_URL = import.meta.env.VITE_API_URL ?? ''

function eventLabel(eventType: string, t: (k: TranslationKey) => string): string {
  const k = EVENT_KEYS[eventType as EventType]
  return k ? t(k) : eventType
}

function logStatusLabel(status: string, t: (k: TranslationKey) => string): string {
  const key = `comm.status.${status}` as TranslationKey
  const v = t(key)
  return v === key ? status : v
}

function channelLabel(ch: string, t: (k: TranslationKey) => string): string {
  if (ch === 'email') return t('comm.channel.email')
  if (ch === 'whatsapp') return t('comm.channel.whatsapp')
  return t('comm.channel.other')
}

function EmailComposer() {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    to_email:   '',
    to_name:    '',
    event_type: 'custom' as EventType,
    subject:    '',
    body:       '',
    store_id:   '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function send() {
    if (!form.to_email) return
    setStatus('sending')
    setErrMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          event_type:     form.event_type,
          to_email:       form.to_email,
          to_name:        form.to_name || undefined,
          store_id:       form.store_id || undefined,
          custom_subject: form.event_type === 'custom' ? form.subject : undefined,
          custom_body:    form.event_type === 'custom' ? form.body    : undefined,
          variables: {
            merchant_name: form.to_name,
            store_name:    '',
            dashboard_url: window.location.origin + '/dashboard',
          },
        }),
      })
      if (res.ok) {
        setStatus('ok')
        setTimeout(() => setStatus('idle'), 3000)
        setForm(f => ({ ...f, to_email: '', to_name: '', subject: '', body: '', store_id: '' }))
      } else {
        const d = await res.json()
        setErrMsg(d.error ?? t('comm.email.sendFail'))
        setStatus('err')
      }
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : t('common.error'))
      setStatus('err')
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">{t('comm.email.title')}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.email.to')}</label>
          <input
            type="email"
            value={form.to_email}
            onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))}
            className="input w-full"
            placeholder="merchant@example.com"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.email.toName')}</label>
          <input
            value={form.to_name}
            onChange={e => setForm(f => ({ ...f, to_name: e.target.value }))}
            className="input w-full"
            placeholder="Ahmad"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.email.eventType')}</label>
        <select
          value={form.event_type}
          onChange={e => setForm(f => ({ ...f, event_type: e.target.value as EventType }))}
          className="input w-full"
        >
          {(Object.keys(EVENT_KEYS) as EventType[]).map((k) => (
            <option key={k} value={k}>{eventLabel(k, t)}</option>
          ))}
        </select>
      </div>

      {form.event_type === 'custom' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.email.subject')}</label>
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="input w-full"
              placeholder={t('comm.email.phSubject')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.email.body')}</label>
            <textarea
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              className="input w-full min-h-[120px] resize-y"
              placeholder={t('comm.email.phBody')}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={status === 'sending' || !form.to_email}
          className="btn-primary flex items-center gap-2 disabled:opacity-60"
        >
          {status === 'sending'
            ? <Loader size={16} className="animate-spin" />
            : <Send size={16} />}
          {t('comm.email.send')}
        </button>

        {status === 'ok' && (
          <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
            <CheckCircle size={16} /> {t('comm.email.sentOk')}
          </span>
        )}
        {status === 'err' && (
          <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
            <XCircle size={16} /> {errMsg}
          </span>
        )}
      </div>
    </div>
  )
}

function WhatsAppSender() {
  const { t } = useLanguage()
  const [form, setForm] = useState({
    to_phone:   '',
    event_type: 'custom' as EventType,
    message:    '',
    store_id:   '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function send() {
    if (!form.to_phone) return
    setStatus('sending')
    setErrMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          event_type:     form.event_type,
          to_phone:       form.to_phone,
          store_id:       form.store_id || undefined,
          custom_message: form.event_type === 'custom' ? form.message : undefined,
          variables:      {},
        }),
      })
      if (res.ok) {
        setStatus('ok')
        setTimeout(() => setStatus('idle'), 3000)
        setForm(f => ({ ...f, to_phone: '', message: '', store_id: '' }))
      } else {
        const d = await res.json()
        setErrMsg(d.error ?? t('comm.email.sendFail'))
        setStatus('err')
      }
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : t('common.error'))
      setStatus('err')
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">{t('comm.whatsapp.title')}</h2>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.whatsapp.phone')}</label>
        <input
          value={form.to_phone}
          onChange={e => setForm(f => ({ ...f, to_phone: e.target.value }))}
          className="input w-full"
          placeholder="+966XXXXXXXXX"
          dir="ltr"
        />
        <p className="text-xs text-slate-400 mt-1">{t('comm.whatsapp.phoneHint')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.whatsapp.msgType')}</label>
        <select
          value={form.event_type}
          onChange={e => setForm(f => ({ ...f, event_type: e.target.value as EventType }))}
          className="input w-full"
        >
          {(Object.keys(EVENT_KEYS) as EventType[]).map((k) => (
            <option key={k} value={k}>{eventLabel(k, t)}</option>
          ))}
        </select>
      </div>

      {form.event_type === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('comm.whatsapp.msgBody')}</label>
          <textarea
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            className="input w-full min-h-[120px] resize-y"
            placeholder={t('comm.whatsapp.phBody')}
          />
          <p className="text-xs text-slate-400 mt-1">{t('comm.whatsapp.formatHint')}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={status === 'sending' || !form.to_phone}
          className="btn-primary flex items-center gap-2 disabled:opacity-60"
        >
          {status === 'sending'
            ? <Loader size={16} className="animate-spin" />
            : <MessageCircle size={16} />}
          {t('comm.email.send')}
        </button>

        {status === 'ok' && (
          <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
            <CheckCircle size={16} /> {t('comm.email.sentOk')}
          </span>
        )}
        {status === 'err' && (
          <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
            <XCircle size={16} /> {errMsg}
          </span>
        )}
      </div>
    </div>
  )
}

function NotificationLog() {
  const { t, lang } = useLanguage()
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<NotifLog[]>({
    queryKey: ['notification-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  const channelIcon = (ch: string) => {
    if (ch === 'email')    return <Mail size={14} />
    if (ch === 'whatsapp') return <MessageCircle size={14} />
    return <Bell size={14} />
  }

  const dateLocale = lang === 'ar' ? 'ar-SA' : 'en-GB'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{t('comm.log.title')}</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary flex items-center gap-1.5 text-sm py-1.5"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {t('comm.log.refresh')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t('comm.log.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-start px-4 py-3 font-semibold text-slate-600">{t('comm.log.colChannel')}</th>
                <th className="text-start px-4 py-3 font-semibold text-slate-600">{t('comm.log.colEvent')}</th>
                <th className="text-start px-4 py-3 font-semibold text-slate-600">{t('comm.log.colRecipient')}</th>
                <th className="text-start px-4 py-3 font-semibold text-slate-600">{t('comm.log.colStatus')}</th>
                <th className="text-start px-4 py-3 font-semibold text-slate-600">{t('comm.log.colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-slate-600 capitalize">
                      {channelIcon(log.channel)}
                      {channelLabel(log.channel, t)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {eventLabel(log.event_type, t)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs" dir="ltr">
                    {log.to_address}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] ?? 'text-slate-600 bg-slate-100'}`}>
                      {log.status === 'sent'      && <CheckCircle size={11} />}
                      {log.status === 'failed'    && <XCircle size={11} />}
                      {log.status === 'delivered' && <CheckCircle size={11} />}
                      {logStatusLabel(log.status, t)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString(dateLocale, { timeZone: 'Asia/Riyadh' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TemplateManager() {
  const { t } = useLanguage()
  const { data: templates = [], isLoading, refetch } = useQuery<Template[]>({
    queryKey: ['comm-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_templates')
        .select('id, name, channel, event_type, subject, body_text, is_active, updated_at')
        .order('channel')
      if (error) throw error
      return data ?? []
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('communication_templates')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => refetch(),
  })

  const channelBadge = (ch: string) => {
    if (ch === 'email')    return 'bg-blue-50 text-blue-700'
    if (ch === 'whatsapp') return 'bg-green-50 text-green-700'
    return 'bg-slate-100 text-slate-600'
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">{t('comm.tpl.title')}</h2>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${channelBadge(tpl.channel)}`}>
                    {channelLabel(tpl.channel, t)}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {eventLabel(tpl.event_type, t)}
                  </span>
                  {!tpl.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500">{t('comm.tpl.disabled')}</span>
                  )}
                </div>
                <p className="font-semibold text-slate-800 text-sm">{tpl.name}</p>
                {tpl.subject && (
                  <p className="text-xs text-slate-500 mt-0.5">{t('comm.tpl.subjectPrefix')} {tpl.subject}</p>
                )}
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.body_text}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ id: tpl.id, is_active: !tpl.is_active })}
                disabled={toggleMutation.isPending}
                className={`shrink-0 relative w-10 h-6 rounded-full transition-colors duration-200 ${
                  tpl.is_active ? 'bg-brand-600' : 'bg-slate-200'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                  tpl.is_active ? 'right-1' : 'right-5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommunicationsCenter() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<Tab>('email')

  const TABS: { id: Tab; labelKey: TranslationKey; icon: LucideIcon }[] = [
    { id: 'email',     labelKey: 'comm.tab.email',     icon: Mail },
    { id: 'whatsapp',  labelKey: 'comm.tab.whatsapp',  icon: MessageCircle },
    { id: 'log',       labelKey: 'comm.tab.log',       icon: Bell },
    { id: 'templates', labelKey: 'comm.tab.templates', icon: BookTemplate },
  ]

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-brand-700" />
          {t('comm.title')}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {t('comm.subtitle')}
        </p>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          {t('comm.banner')}
        </p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-card p-6"
        >
          {activeTab === 'email'     && <EmailComposer />}
          {activeTab === 'whatsapp'  && <WhatsAppSender />}
          {activeTab === 'log'       && <NotificationLog />}
          {activeTab === 'templates' && <TemplateManager />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
