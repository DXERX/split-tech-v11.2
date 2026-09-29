import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Headphones, Plus, MessageSquare, ChevronDown, ChevronUp, Send, Loader, ArrowRight, Sparkles, Bot, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchProfilesMap } from '../lib/adminData'
import { useAuth } from '../contexts/AuthContext'
import { useMyStore } from '../hooks/useStore'
import { useLanguage } from '../contexts/LanguageContext'
import { formatRelative, statusLabel } from '../lib/utils'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'

type BotState = 'idle' | 'awaiting_confirm' | 'awaiting_title' | 'ticket_created' | 'rtsp_guide'

interface BotMessage {
  from: 'bot' | 'user'
  text: string
  ticketId?: string
}

function detectIntent(text: string): 'confirm' | 'rtsp_help' | 'cancel' | 'ticket' | 'other' {
  const t = text.toLowerCase().trim()
  if (/^(نعم|yes|أيوه|اه|ايه|موافق|تفضل|أنشئ|create|ok|okay|يلا|تمام|نعم بالتأكيد)/.test(t)) return 'confirm'
  if (/(rtsp|كاميرا|كامير|ip|رابط|بث|stream)/.test(t)) return 'rtsp_help'
  if (/(لا|no|إلغاء|cancel|مب|مو)/.test(t)) return 'cancel'
  if (/(تذكرة|ticket|دعم|فني|موظف|بشري)/.test(t)) return 'ticket'
  return 'other'
}

async function callSmartBot(
  message: string,
  sessionId: string | null,
  storeId: string | null,
): Promise<{ response: string; session_id: string; routed_to_support?: boolean; ticket_id?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('غير مسجل')
  const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/smart-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ message, session_id: sessionId, store_id: storeId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'فشل الاتصال بالمساعد الذكي')
  }
  return res.json()
}

export default function Support() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const { user } = useAuth()
  const { data: store } = useMyStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [newModal, setNewModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [form, setForm] = useState({ title: '', description: '', category: 'technical', priority: 'medium' })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [botState, setBotState] = useState<BotState>('idle')
  const [botMessages, setBotMessages] = useState<BotMessage[]>([])
  const [botInput, setBotInput] = useState('')
  const [botPending, setBotPending] = useState(false)
  const [botSessionId, setBotSessionId] = useState<string | null>(null)
  const [pendingTicketTitle, setPendingTicketTitle] = useState('')
  const botEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { botEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [botMessages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [expandedId])

  function botSay(text: string, extra?: Partial<BotMessage>) {
    setBotMessages(prev => [...prev, { from: 'bot', text, ...extra }])
  }
  function userSay(text: string) {
    setBotMessages(prev => [...prev, { from: 'user', text }])
  }

  function startBot() {
    setBotMessages([{
      from: 'bot',
      text: isAr
        ? 'مرحباً! أنا مساعد SPLIT للدعم الفني 🤖\n\nأستطيع مساعدتك بشكل فوري في أي استفسار.\n\n• اكتب مشكلتك وسأساعدك في حلها\n• اكتب "RTSP" لمساعدة في إعداد الكاميرا\n• اكتب "تذكرة" لفتح تذكرة دعم مباشرة'
        : 'Hi! I\'m the SPLIT support assistant 🤖\n\nI can help you instantly with any question.\n\n• Describe your issue and I\'ll help resolve it\n• Type "RTSP" for camera setup help\n• Type "ticket" to open a support ticket directly',
    }])
    setBotState('idle')
    setBotSessionId(null)
  }

  async function handleBotSend() {
    const text = botInput.trim()
    if (!text || botPending) return
    setBotInput('')
    userSay(text)
    setBotPending(true)

    const intent = detectIntent(text)

    if (botState === 'awaiting_confirm') {
      if (intent === 'confirm') {
        const title = pendingTicketTitle || text
        try {
          const { data: ticket, error } = await supabase.from('support_tickets').insert({
            user_id: user!.id,
            store_id: store?.id ?? null,
            title,
            description: botMessages.filter(m => m.from === 'user').map(m => m.text).join('\n'),
            category: 'technical',
            priority: 'medium',
          }).select('id').single()
          if (error) throw error
          setBotState('ticket_created')
          botSay(
            isAr
              ? `✅ تم إنشاء تذكرة الدعم بنجاح!\n\n🎫 رقم التذكرة: ${ticket.id.slice(0, 8).toUpperCase()}\n\nسيتواصل معك فريق الدعم خلال أوقات العمل (9ص–5م). يمكنك متابعة التذكرة في قائمة "تذاكري" أدناه.`
              : `✅ Support ticket created successfully!\n\n🎫 Ticket ID: ${ticket.id.slice(0, 8).toUpperCase()}\n\nOur support team will contact you during business hours (9am–5pm). Track your ticket in "My tickets" below.`,
            { ticketId: ticket.id }
          )
          qc.invalidateQueries({ queryKey: ['my-tickets', user?.id] })
        } catch {
          botSay(isAr
            ? 'عذراً، حدث خطأ أثناء إنشاء التذكرة. حاول مجدداً أو اضغط "تذكرة جديدة".'
            : 'Sorry, an error occurred while creating the ticket. Try again or click "New ticket".')
          setBotState('idle')
        }
      } else if (intent === 'cancel') {
        setBotState('idle')
        botSay(isAr ? 'حسناً، تم الإلغاء. هل يمكنني مساعدتك بشيء آخر؟' : 'Cancelled. Can I help you with anything else?')
      } else {
        botSay(isAr
          ? 'هل تريد فتح تذكرة دعم لهذه المشكلة؟ اكتب "نعم" للتأكيد أو "لا" للإلغاء.'
          : 'Do you want to open a support ticket for this issue? Type "yes" to confirm or "no" to cancel.')
      }
      setBotPending(false)
      return
    }

    if (botState === 'awaiting_title') {
      setPendingTicketTitle(text)
      setBotState('awaiting_confirm')
      botSay(isAr
        ? `سأفتح تذكرة بعنوان: "${text}"\n\nهل تريد المتابعة؟ اكتب "نعم" للتأكيد.`
        : `I'll open a ticket titled: "${text}"\n\nDo you want to proceed? Type "yes" to confirm.`)
      setBotPending(false)
      return
    }

    if (intent === 'ticket') {
      setBotState('awaiting_title')
      botSay(isAr
        ? 'بالتأكيد! ما هو عنوان المشكلة التي تريد فتح تذكرة بشأنها؟'
        : 'Sure! What is the title of the issue you want to open a ticket for?')
      setBotPending(false)
      return
    }

    try {
      const result = await callSmartBot(text, botSessionId, store?.id ?? null)
      setBotSessionId(result.session_id)
      if (result.routed_to_support && result.ticket_id) {
        setBotState('ticket_created')
        botSay(result.response, { ticketId: result.ticket_id })
        qc.invalidateQueries({ queryKey: ['my-tickets', user?.id] })
      } else {
        const problemKeywords = ['مشكلة', 'خطأ', 'لا يعمل', 'لم يعمل', 'error', 'فشل', 'معطل', 'مو شغال', 'ما يشتغل', 'ما شتغل', 'واجهت', 'تعذر', 'problem', 'not working', 'broken', 'failed']
        const isProblem = problemKeywords.some(k => text.toLowerCase().includes(k))
        if (isProblem) {
          botSay(result.response + '\n\n' + (isAr ? 'هل تريد فتح تذكرة دعم لهذه المشكلة؟' : 'Do you want to open a support ticket for this issue?'))
          setBotState('awaiting_confirm')
          setPendingTicketTitle(text.slice(0, 80))
        } else {
          botSay(result.response)
          setBotState('idle')
        }
      }
    } catch {
      botSay(isAr
        ? 'عذراً، تعذر الاتصال بالمساعد الذكي حالياً. هل تريد فتح تذكرة دعم مباشرة؟'
        : 'Sorry, the AI assistant is currently unavailable. Do you want to open a support ticket directly?')
      setBotState('awaiting_confirm')
      setPendingTicketTitle(text.slice(0, 80))
    }
    setBotPending(false)
  }

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['my-tickets', user?.id],
    enabled: !!user?.id,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, ticket_messages(id, message, user_id, created_at, is_internal)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const profileIds = [
        ...(data || []).map((t) => t.user_id),
        ...(data || []).flatMap((t) => (t.ticket_messages || []).map((m: any) => m.user_id)),
      ]
      const profilesMap = await fetchProfilesMap(profileIds)
      return (data || []).map((ticket) => ({ ...ticket, profiles: profilesMap[ticket.user_id] ?? null }))
    },
  })

  const expandedTicket = tickets.find((t: any) => t.id === expandedId)

  const createTicket = useMutation({
    mutationFn: async () => {
      const { data: ticket, error } = await supabase.from('support_tickets').insert({
        user_id: user!.id,
        store_id: store?.id || null,
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
      }).select('id').single()
      if (error) throw error
      if (form.description.trim()) {
        const { error: msgErr } = await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id,
          user_id: user!.id,
          message: form.description.trim(),
          is_internal: false,
        })
        if (msgErr) throw msgErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tickets', user?.id] })
      setNewModal(false)
      setForm({ title: '', description: '', category: 'technical', priority: 'medium' })
    },
  })

  const sendReply = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId, user_id: user!.id, message: replyText.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => { setReplyText(''); qc.invalidateQueries({ queryKey: ['my-tickets', user?.id] }) },
  })

  const statusVariant = (s: string) => {
    const map: Record<string, 'active' | 'pending' | 'suspended' | 'info'> = {
      open: 'pending', in_progress: 'info', resolved: 'active', closed: 'suspended',
    }
    return map[s] || 'info'
  }

  const categories: Record<string, { ar: string; en: string }> = {
    technical: { ar: 'تقني', en: 'Technical' },
    billing:   { ar: 'فواتير', en: 'Billing' },
    general:   { ar: 'عام', en: 'General' },
    hardware:  { ar: 'أجهزة', en: 'Hardware' },
    activation:{ ar: 'تفعيل', en: 'Activation' },
  }

  const priorityColors: Record<string, string> = {
    low: 'text-slate-500', medium: 'text-amber-600', high: 'text-orange-600', urgent: 'text-red-600 font-bold',
  }

  const priorityLabels: Record<string, { ar: string; en: string }> = {
    low:    { ar: 'منخفضة', en: 'Low' },
    medium: { ar: 'متوسطة', en: 'Medium' },
    high:   { ar: 'عالية', en: 'High' },
    urgent: { ar: 'عاجل', en: 'Urgent' },
  }

  const catLabel = (key: string) => (isAr ? categories[key]?.ar : categories[key]?.en) || key
  const priLabel = (key: string) => (isAr ? priorityLabels[key]?.ar : priorityLabels[key]?.en) || key

  const botPlaceholder =
    botState === 'awaiting_confirm' ? (isAr ? 'اكتب "نعم" للتأكيد أو "لا" للإلغاء...' : 'Type "yes" to confirm or "no" to cancel...') :
    botState === 'awaiting_title'   ? (isAr ? 'اكتب عنوان المشكلة...' : 'Type the issue title...') :
    botState === 'ticket_created'   ? (isAr ? 'تم! يمكنك طرح سؤال آخر...' : 'Done! You can ask another question...') :
    (isAr ? 'اكتب مشكلتك أو اسأل عن RTSP...' : 'Describe your issue or ask about RTSP...')

  return (
    <div className="page-container space-y-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
              <Headphones className="w-6 h-6 text-brand-700" />
              {isAr ? 'الدعم الفني' : 'Technical Support'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isAr ? 'تواصل مع فريق سبلت تيك AI' : 'Contact the SplitTech AI team'}
            </p>
          </div>
        </div>
        <Button onClick={() => setNewModal(true)} className="flex items-center gap-2">
          <Plus size={16} />
          {isAr ? 'تذكرة جديدة' : 'New ticket'}
        </Button>
      </div>

      {/* Info banner */}
      <div
        className="rounded-2xl p-4 flex items-center gap-3 border"
        style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
      >
        <div className="w-10 h-10 bg-brand-700 rounded-xl flex items-center justify-center flex-shrink-0">
          <Headphones className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-semibold text-brand-700">
            {isAr ? 'فريق الدعم الفني — سبلت تيك AI' : 'Support Team — SplitTech AI'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {isAr
              ? 'البريد: info@splittech.sa • أوقات العمل: 9 صباحاً — 5 مساءً (أيام الأسبوع)'
              : 'Email: info@splittech.sa • Business hours: 9am — 5pm (weekdays)'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
            {isAr
              ? 'السجل التجاري: 7053975251 — جدة، المملكة العربية السعودية'
              : 'CR: 7053975251 — Jeddah, Saudi Arabia'}
          </p>
        </div>
      </div>

      {/* Smart Bot Chat */}
      <div
        className="rounded-2xl border shadow-card overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-700 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-base)' }}>
                {isAr ? 'مساعد SPLIT للدعم' : 'SPLIT Support Assistant'}
              </p>
              <p className="text-xs text-brand-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block animate-pulse" />
                {isAr ? 'متاح الآن' : 'Available now'}
              </p>
            </div>
          </div>
          {botMessages.length === 0 && (
            <Button size="sm" variant="secondary" onClick={startBot}>
              <Sparkles size={13} /> {isAr ? 'ابدأ المحادثة' : 'Start chat'}
            </Button>
          )}
        </div>

        {botMessages.length > 0 && (
          <>
            <div className="h-56 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--bg-subtle)' }}>
              {botMessages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line ${
                    msg.from === 'user'
                      ? 'bg-brand-700 text-white rounded-bl-md'
                      : 'rounded-br-md shadow-sm border'
                  }`}
                  style={msg.from !== 'user' ? {
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-base)',
                  } : undefined}>
                    {msg.text}
                    {msg.ticketId && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-brand-200">
                        <CheckCircle2 size={12} />
                        {isAr ? 'تذكرة' : 'Ticket'} #{msg.ticketId.slice(0, 8).toUpperCase()}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {botPending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 flex gap-1 shadow-sm border"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    {[0, 1, 2].map(i => (
                      <motion.span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full block"
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={botEndRef} />
            </div>

            <div className="px-4 py-3 flex gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <input
                type="text"
                value={botInput}
                onChange={e => setBotInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleBotSend()}
                placeholder={botPlaceholder}
                className="input-field flex-1 text-sm"
                disabled={botPending}
              />
              <button
                onClick={handleBotSend}
                disabled={!botInput.trim() || botPending}
                className="p-2.5 bg-brand-700 text-white rounded-xl hover:bg-brand-800 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tickets list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border shadow-card p-10 text-center"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <MessageSquare className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border)' }} />
          <p className="font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
            {isAr ? 'لا توجد تذاكر دعم' : 'No support tickets'}
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-faint)' }}>
            {isAr ? 'لم تقم بفتح أي تذكرة بعد' : 'You haven\'t opened any tickets yet'}
          </p>
          <Button onClick={() => setNewModal(true)} variant="secondary">
            {isAr ? 'افتح تذكرة جديدة' : 'Open new ticket'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket: any) => {
            const messages = (ticket.ticket_messages || []).filter((m: any) => !m.is_internal)
            const unreadCount = messages.filter((m: any) => m.user_id !== user?.id).length
            return (
              <motion.div key={ticket.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl border shadow-card overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                  className="w-full flex items-center justify-between p-4 text-start"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center relative"
                      style={{ background: 'var(--bg-subtle)' }}>
                      <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
                      {unreadCount > 0 && expandedId !== ticket.id && (
                        <span className="absolute -top-1 -end-1 w-4 h-4 bg-brand-700 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--text-base)' }}>{ticket.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant={statusVariant(ticket.status)} label={statusLabel(ticket.status, lang)} />
                        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{catLabel(ticket.category)}</span>
                        <span className={`text-xs ${priorityColors[ticket.priority] || ''}`}>
                          {priLabel(ticket.priority)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                          {formatRelative(ticket.created_at, lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expandedId === ticket.id
                    ? <ChevronUp size={16} style={{ color: 'var(--text-faint)' }} />
                    : <ChevronDown size={16} style={{ color: 'var(--text-faint)' }} />}
                </button>

                <AnimatePresence>
                  {expandedId === ticket.id && expandedTicket && (
                    <motion.div key="chat"
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
                      <div className="px-4 pb-4 pt-3">
                        {expandedTicket.description && (
                          <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-subtle)' }}>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>
                              {isAr ? 'وصف المشكلة' : 'Problem description'}
                            </p>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                              {expandedTicket.description}
                            </p>
                          </div>
                        )}

                        <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
                          {messages.length === 0 ? (
                            <p className="text-center text-xs py-4" style={{ color: 'var(--text-faint)' }}>
                              {isAr ? 'لا توجد رسائل بعد — ابدأ المحادثة' : 'No messages yet — start the conversation'}
                            </p>
                          ) : (
                            messages.map((msg: any) => {
                              const isMe = msg.user_id === user?.id
                              return (
                                <motion.div key={msg.id}
                                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                                    isMe ? 'bg-brand-700 text-white rounded-bl-md' : 'rounded-br-md'
                                  }`}
                                  style={!isMe ? { background: 'var(--bg-subtle)', color: 'var(--text-base)' } : undefined}>
                                    {!isMe && (
                                      <p className="text-xs font-semibold mb-1 text-brand-600">
                                        {isAr ? 'فريق الدعم' : 'Support team'}
                                      </p>
                                    )}
                                    <p>{msg.message}</p>
                                    <p className={`text-[10px] mt-1 ${isMe ? 'text-brand-200' : ''}`}
                                      style={!isMe ? { color: 'var(--text-faint)' } : undefined}>
                                      {formatRelative(msg.created_at, lang)}
                                    </p>
                                  </div>
                                </motion.div>
                              )
                            })
                          )}
                          <div ref={messagesEndRef} />
                        </div>

                        {expandedTicket.status !== 'closed' ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && replyText.trim() && sendReply.mutate(expandedTicket.id)}
                              placeholder={isAr ? 'اكتب ردك...' : 'Type your reply...'}
                              className="input-field flex-1 text-sm"
                            />
                            <button
                              onClick={() => replyText.trim() && sendReply.mutate(expandedTicket.id)}
                              disabled={!replyText.trim() || sendReply.isPending}
                              className="p-3 bg-brand-700 text-white rounded-xl hover:bg-brand-800 disabled:opacity-50 transition-colors"
                            >
                              {sendReply.isPending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-center text-xs rounded-xl py-2"
                            style={{ color: 'var(--text-faint)', background: 'var(--bg-subtle)' }}>
                            {isAr ? 'هذه التذكرة مغلقة' : 'This ticket is closed'}
                          </p>
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

      {/* New ticket modal */}
      <Modal
        open={newModal}
        onClose={() => setNewModal(false)}
        title={isAr ? 'فتح تذكرة دعم جديدة' : 'Open new support ticket'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label={isAr ? 'عنوان المشكلة' : 'Issue title'}
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={isAr ? 'صف مشكلتك باختصار' : 'Brief description of your issue'}
          />
          <div>
            <label className="label">{isAr ? 'تفاصيل المشكلة' : 'Problem details'}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              className="input-field"
              placeholder={isAr ? 'اشرح المشكلة بالتفصيل...' : 'Explain the issue in detail...'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{isAr ? 'الفئة' : 'Category'}</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-field">
                {Object.entries(categories).map(([v, l]) => (
                  <option key={v} value={v}>{isAr ? l.ar : l.en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{isAr ? 'الأولوية' : 'Priority'}</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="input-field">
                {Object.entries(priorityLabels).map(([v, l]) => (
                  <option key={v} value={v}>{isAr ? l.ar : l.en}</option>
                ))}
              </select>
            </div>
          </div>
          <Button
            className="w-full"
            loading={createTicket.isPending}
            onClick={() => form.title.trim() && createTicket.mutate()}
          >
            {isAr ? 'إرسال التذكرة' : 'Submit ticket'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
