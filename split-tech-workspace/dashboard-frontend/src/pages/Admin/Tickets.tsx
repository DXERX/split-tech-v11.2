import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Headphones, MessageSquare, ChevronDown, ChevronUp, Send, Loader, CheckCircle, Sparkles, Download, FileText, Camera, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchProfilesMap, fetchStoresMap } from '../../lib/adminData'
import { buildSupportBotGuide, getSuggestedReplies } from '../../lib/supportBot'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import type { Lang, TranslationKey } from '../../i18n'
import { formatRelative, statusLabel } from '../../lib/utils'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'

function buildTranscriptText(
  ticket: any,
  messages: any[],
  t: (k: TranslationKey) => string,
  lang: Lang,
): string {
  const loc = lang === 'ar' ? 'ar-SA' : 'en-US'
  const lines: string[] = []
  lines.push('══════════════════════════════════════════════════════')
  lines.push(`         ${t('tickets.transcript.bannerTitle')}`)
  lines.push('══════════════════════════════════════════════════════')
  lines.push(`${t('tickets.transcript.lineId')}  : ${ticket.id}`)
  lines.push(`${t('tickets.transcript.lineTitle')}      : ${ticket.title}`)
  lines.push(`${t('tickets.transcript.lineCategory')}      : ${ticket.category}`)
  lines.push(`${t('tickets.transcript.lineStatus')}       : ${ticket.status}`)
  lines.push(`${t('tickets.transcript.lineMerchant')}       : ${ticket.profiles?.full_name || ticket.profiles?.company_name || '—'}`)
  lines.push(`${t('tickets.transcript.lineStore')}       : ${ticket.stores?.name || '—'}`)
  lines.push(`${t('tickets.transcript.lineOpened')}  : ${new Date(ticket.created_at).toLocaleString(loc)}`)
  lines.push(`${t('tickets.transcript.lineClosed')}: ${new Date().toLocaleString(loc)}`)
  lines.push('──────────────────────────────────────────────────────')
  if (ticket.description) {
    lines.push(t('tickets.transcript.problemHeader'))
    lines.push(ticket.description)
    lines.push('──────────────────────────────────────────────────────')
  }
  lines.push(t('tickets.transcript.logHeader'))
  lines.push('')
  messages.forEach((msg: any) => {
    const sender = msg.is_internal
      ? t('tickets.transcript.internal')
      : msg.user_id === ticket.user_id
        ? t('tickets.transcript.merchant')
        : t('tickets.transcript.support')
    const time = new Date(msg.created_at).toLocaleString(loc)
    lines.push(`[${time}] ${sender}:`)
    lines.push(msg.message)
    lines.push('')
  })
  lines.push('══════════════════════════════════════════════════════')
  lines.push(t('tickets.transcript.footer'))
  lines.push('══════════════════════════════════════════════════════')
  return lines.join('\n')
}

function downloadTranscript(ticket: any, messages: any[], t: (k: TranslationKey) => string, lang: Lang) {
  const text = buildTranscriptText(ticket, messages, t, lang)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ticket-${ticket.id.slice(0, 8)}-transcript.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminTickets() {
  const { lang, t } = useLanguage()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Camera change approval state
  const [cameraApprovalTicketId, setCameraApprovalTicketId] = useState<string | null>(null)
  const [cameraForm, setCameraForm] = useState({ rtsp_url: '', camera_ip: '', camera_username: '' })
  const isAr = lang === 'ar'

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin-tickets', filterStatus],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from('support_tickets')
        .select('*, ticket_messages(id, message, user_id, created_at, is_internal)')
        .order('created_at', { ascending: false })

      if (filterStatus === 'active') {
        q = q.in('status', ['open', 'in_progress'])
      } else if (filterStatus !== 'all') {
        q = q.eq('status', filterStatus as 'open' | 'in_progress' | 'resolved' | 'closed')
      }

      const { data, error } = await q
      if (error) throw error

      const [profilesMap, storesMap] = await Promise.all([
        fetchProfilesMap((data || []).map((ticket) => ticket.user_id)),
        fetchStoresMap((data || []).map((ticket) => ticket.store_id)),
      ])

      return (data || []).map((ticket) => ({
        ...ticket,
        profiles: profilesMap[ticket.user_id] ?? null,
        stores: ticket.store_id ? storesMap[ticket.store_id] ?? null : null,
      }))
    },
    refetchInterval: 20_000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tickets, expandedId])

  const sendReply = useMutation({
    mutationFn: async ({ ticketId, message, currentStatus }: { ticketId: string; message: string; currentStatus: 'open' | 'in_progress' | 'resolved' | 'closed' }) => {
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        user_id: user!.id,
        message,
        is_internal: false,
      })
      if (error) throw error

      if (currentStatus === 'open') {
        const { error: statusError } = await supabase
          .from('support_tickets')
          .update({ status: 'in_progress' })
          .eq('id', ticketId)

        if (statusError) throw statusError
      }
    },
    onSuccess: () => {
      setReplyText('')
      qc.invalidateQueries({ queryKey: ['admin-tickets'] })
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ ticketId, status, ticket }: { ticketId: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; ticket?: any }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status, closed_at: status === 'closed' ? new Date().toISOString() : undefined })
        .eq('id', ticketId)
      if (error) throw error

      // Auto-archive transcript when closing
      if (status === 'closed' && ticket) {
        const allMessages = ticket.ticket_messages || []
        const transcript = buildTranscriptText(ticket, allMessages, t, lang)
        await supabase.from('ticket_transcripts').upsert({
          ticket_id: ticketId,
          transcript_text: transcript,
          message_count: allMessages.length,
          closed_at: new Date().toISOString(),
        }, { onConflict: 'ticket_id' })
        // Trigger download immediately
        downloadTranscript(ticket, allMessages, t, lang)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tickets'] }) },
  })

  const approveCameraChange = useMutation({
    mutationFn: async ({ ticketId, storeId }: { ticketId: string; storeId: string }) => {
      if (!cameraForm.rtsp_url.trim()) throw new Error(isAr ? 'رابط RTSP مطلوب' : 'RTSP URL is required')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(isAr ? 'يرجى تسجيل الدخول' : 'Please log in')
      const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_SUPABASE_URL
      const r = await fetch(`${apiUrl}/v1/admin/approve-camera-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ticket_id: ticketId,
          store_id: storeId,
          rtsp_url: cameraForm.rtsp_url.trim(),
          camera_ip: cameraForm.camera_ip.trim() || null,
          camera_username: cameraForm.camera_username.trim() || null,
        }),
      })
      const result = await r.json()
      if (!r.ok || result.error) throw new Error(result.error || 'Failed')
    },
    onSuccess: () => {
      setCameraApprovalTicketId(null)
      setCameraForm({ rtsp_url: '', camera_ip: '', camera_username: '' })
      qc.invalidateQueries({ queryKey: ['admin-tickets'] })
    },
  })

  // Helper — is this a camera settings change request ticket?
  function isCameraTicket(ticket: any) {
    const title: string = ticket.title || ''
    return title.includes('Camera settings') || title.includes('إعدادات الكاميرا')
  }

  const statusVariant = (s: string) => {
    const map: Record<string, 'active' | 'pending' | 'suspended' | 'info'> = {
      open: 'pending', in_progress: 'info', resolved: 'active', closed: 'suspended',
    }
    return map[s] || 'info'
  }

  const categoryKey = (c: string): TranslationKey => {
    const map: Record<string, TranslationKey> = {
      technical: 'tickets.cat.technical',
      billing: 'tickets.cat.billing',
      general: 'tickets.cat.general',
      hardware: 'tickets.cat.hardware',
      activation: 'tickets.cat.activation',
    }
    return map[c] ?? 'tickets.cat.general'
  }

  const STATUSES: { value: string; labelKey: TranslationKey }[] = [
    { value: 'active', labelKey: 'tickets.filter.active' },
    { value: 'open', labelKey: 'tickets.filter.open' },
    { value: 'in_progress', labelKey: 'tickets.filter.in_progress' },
    { value: 'resolved', labelKey: 'tickets.filter.resolved' },
    { value: 'closed', labelKey: 'tickets.filter.closed' },
    { value: 'all', labelKey: 'tickets.filter.all' },
  ]

  const openCount = (tickets as any[]).filter((tk) => ['open', 'in_progress'].includes(tk.status)).length

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Headphones className="w-6 h-6 text-brand-700" />
            {t('tickets.pageTitle')}
          </h1>
          <p className="text-slate-500 text-sm">{t('tickets.subtitleCount').replace('{n}', String((tickets as any[]).length))}</p>
        </div>
        {openCount > 0 && (
          <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1.5 rounded-xl">
            {t('tickets.activeBadge').replace('{n}', String(openCount))}
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map(({ value, labelKey }) => (
          <button
            key={value}
            onClick={() => setFilterStatus(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filterStatus === value
                ? 'bg-brand-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-slate-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (tickets as any[]).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-10 text-center">
          <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">{t('tickets.emptyCategory')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(tickets as any[]).map((ticket) => {
            const messages = (ticket.ticket_messages || []).filter((m: any) => !m.is_internal)
            return (
              <motion.div key={ticket.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`bg-white rounded-2xl border shadow-card overflow-hidden ${
                  ticket.status === 'open' ? 'border-amber-200' : 'border-slate-100'
                }`}>
                <button onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                  className="w-full flex items-center justify-between p-4 text-start">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      <MessageSquare size={16} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{ticket.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant={statusVariant(ticket.status)} label={statusLabel(ticket.status, lang)} />
                        <span className="text-xs text-slate-500 font-medium">
                          {ticket.profiles?.company_name || ticket.profiles?.full_name || '—'}
                        </span>
                        <span className="text-xs text-slate-400">{t(categoryKey(ticket.category))}</span>
                        <span className="text-xs text-slate-400">{formatRelative(ticket.created_at, lang)}</span>
                      </div>
                    </div>
                  </div>
                  {expandedId === ticket.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                <AnimatePresence>
                  {expandedId === ticket.id && (
                    <motion.div
                      key="chat"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-slate-100 overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-3 space-y-3">
                        {ticket.description && (
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-xs text-slate-400 mb-1">{t('tickets.problemDescription')}</p>
                            <p className="text-sm text-slate-600">{ticket.description}</p>
                          </div>
                        )}

                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {messages.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 py-4">{t('tickets.noMessagesYet')}</p>
                          ) : messages.map((msg: any) => {
                            const isSupport = msg.user_id === user?.id
                            return (
                              <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                                className={`flex ${isSupport ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                                  isSupport ? 'bg-brand-700 text-white rounded-bl-md' : 'bg-slate-100 text-slate-700 rounded-br-md'
                                }`}>
                                  {!isSupport && (
                                    <p className="text-xs font-semibold mb-1 text-slate-500">
                                      {ticket.profiles?.full_name || t('tickets.roleMerchant')}
                                    </p>
                                  )}
                                  <p>{msg.message}</p>
                                  <p className={`text-[10px] mt-1 ${isSupport ? 'text-brand-200' : 'text-slate-400'}`}>
                                    {formatRelative(msg.created_at, lang)}
                                  </p>
                                </div>
                              </motion.div>
                            )
                          })}
                          <div ref={messagesEndRef} />
                        </div>

                        {/* ── Camera Change Approval Block ───────────────── */}
                        {isCameraTicket(ticket) && ticket.status !== 'closed' && ticket.status !== 'resolved' && (
                          <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30">
                              <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                {isAr ? 'طلب تغيير إعدادات الكاميرا' : 'Camera Settings Change Request'}
                              </span>
                              {cameraApprovalTicketId === ticket.id && (
                                <button
                                  onClick={() => { setCameraApprovalTicketId(null); setCameraForm({ rtsp_url: '', camera_ip: '', camera_username: '' }) }}
                                  className="mr-auto ml-0 text-blue-400 hover:text-blue-600"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {cameraApprovalTicketId === ticket.id ? (
                              <div className="p-3 space-y-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {isAr
                                    ? 'أدخل الإعدادات الجديدة للكاميرا ثم اضغط قبول لتطبيقها وإغلاق التذكرة.'
                                    : 'Enter the new camera settings below, then click Approve to apply them and resolve the ticket.'}
                                </p>
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    value={cameraForm.rtsp_url}
                                    onChange={e => setCameraForm(f => ({ ...f, rtsp_url: e.target.value }))}
                                    placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                                    className="input-field w-full text-xs font-mono"
                                  />
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={cameraForm.camera_ip}
                                      onChange={e => setCameraForm(f => ({ ...f, camera_ip: e.target.value }))}
                                      placeholder={isAr ? 'عنوان IP (اختياري)' : 'Camera IP (optional)'}
                                      className="input-field flex-1 text-xs"
                                    />
                                    <input
                                      type="text"
                                      value={cameraForm.camera_username}
                                      onChange={e => setCameraForm(f => ({ ...f, camera_username: e.target.value }))}
                                      placeholder={isAr ? 'اسم المستخدم (اختياري)' : 'Username (optional)'}
                                      className="input-field flex-1 text-xs"
                                    />
                                  </div>
                                </div>
                                {approveCameraChange.error && (
                                  <p className="text-xs text-red-500">{(approveCameraChange.error as Error).message}</p>
                                )}
                                <Button
                                  size="sm"
                                  loading={approveCameraChange.isPending}
                                  disabled={!cameraForm.rtsp_url.trim() || !ticket.store_id}
                                  onClick={() => approveCameraChange.mutate({ ticketId: ticket.id, storeId: ticket.store_id })}
                                >
                                  <CheckCircle size={13} />
                                  {isAr ? 'قبول وتطبيق الإعدادات' : 'Approve & Apply Settings'}
                                </Button>
                              </div>
                            ) : (
                              <div className="px-3 py-2">
                                <button
                                  onClick={() => setCameraApprovalTicketId(ticket.id)}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                                >
                                  <Camera size={13} />
                                  {isAr ? 'الموافقة على تغيير الكاميرا' : 'Approve Camera Change'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {ticket.status !== 'closed' ? (
                          <div className="space-y-2">
                            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3">
                              {(() => {
                                const guide = buildSupportBotGuide({
                                  title: ticket.title,
                                  description: ticket.description,
                                  category: ticket.category,
                                  storeName: ticket.stores?.name,
                                  storeStatus: ticket.stores?.store_status,
                                  isConnected: ticket.stores?.last_heartbeat
                                    ? Date.now() - new Date(ticket.stores.last_heartbeat).getTime() < 30 * 60 * 1000
                                    : false,
                                  lastHeartbeat: ticket.stores?.last_heartbeat,
                                  priority: ticket.priority,
                                }, lang)
                                const suggestions = getSuggestedReplies({
                                  title: ticket.title,
                                  description: ticket.description,
                                  category: ticket.category,
                                  storeName: ticket.stores?.name,
                                  storeStatus: ticket.stores?.store_status,
                                  isConnected: ticket.stores?.last_heartbeat
                                    ? Date.now() - new Date(ticket.stores.last_heartbeat).getTime() < 30 * 60 * 1000
                                    : false,
                                  lastHeartbeat: ticket.stores?.last_heartbeat,
                                  priority: ticket.priority,
                                }, lang)

                                return (
                                  <>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Sparkles className="w-4 h-4 text-brand-700" />
                                      <p className="text-xs font-bold text-brand-700">{t('tickets.smartAssistant')}</p>
                                    </div>
                                    <p className="text-xs text-slate-600 mb-2">{guide.summary}</p>
                                    <div className="flex gap-2 flex-wrap">
                                      {suggestions.map((suggestion) => (
                                        <button
                                          key={suggestion}
                                          onClick={() => setReplyText(suggestion)}
                                          className="text-xs bg-white border border-brand-200 text-brand-700 px-2.5 py-1 rounded-lg hover:bg-brand-100 transition-colors"
                                        >
                                          {suggestion.length > 30 ? `${suggestion.slice(0, 30)}...` : suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && replyText.trim())
                                    sendReply.mutate({ ticketId: ticket.id, message: replyText.trim(), currentStatus: ticket.status })
                                }}
                                placeholder={t('tickets.replyPlaceholder')}
                                className="input-field flex-1 text-sm"
                              />
                              <button
                                onClick={() => replyText.trim() && sendReply.mutate({ ticketId: ticket.id, message: replyText.trim(), currentStatus: ticket.status })}
                                disabled={!replyText.trim() || sendReply.isPending}
                                className="p-3 bg-brand-700 text-white rounded-xl hover:bg-brand-800 disabled:opacity-50 transition-colors"
                              >
                                {sendReply.isPending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                              </button>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {ticket.status === 'open' && (
                                <Button size="sm" variant="secondary"
                                  loading={updateStatus.isPending}
                                  onClick={() => updateStatus.mutate({ ticketId: ticket.id, status: 'in_progress' })}>
                                  {t('tickets.btnInProgress')}
                                </Button>
                              )}
                              <Button size="sm" variant="secondary"
                                className="flex items-center gap-1"
                                loading={updateStatus.isPending}
                                onClick={() => updateStatus.mutate({ ticketId: ticket.id, status: 'resolved' })}>
                                <CheckCircle size={14} />
                                {t('tickets.resolved')}
                              </Button>
                              <Button size="sm" variant="secondary"
                                loading={updateStatus.isPending}
                                onClick={() => updateStatus.mutate({ ticketId: ticket.id, status: 'closed', ticket })}>
                                <FileText size={14} />
                                {t('tickets.closeArchive')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                            <p className="text-xs text-slate-400">{t('tickets.closed')}</p>
                            <button
                              onClick={() => downloadTranscript(ticket, ticket.ticket_messages || [], t, lang)}
                              className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 font-medium"
                            >
                              <Download size={13} />
                              {t('tickets.downloadTranscript')}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
