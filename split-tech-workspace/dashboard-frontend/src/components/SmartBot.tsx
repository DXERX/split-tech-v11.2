import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Bot, User, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const WELCOME = 'مرحباً! أنا سبلت سمارت بوت 🤖\nيمكنني مساعدتك في إعداد الكاميرات، فهم التقارير، حل مشاكل الاشتراك، وأي أسئلة تقنية. كيف يمكنني مساعدتك اليوم؟'

export default function SmartBot({ storeId }: { storeId?: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME, ts: Date.now() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')

    const userMsg: Message = { role: 'user', content: text, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('يرجى تسجيل الدخول')

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/smart-bot`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: text, session_id: sessionId, store_id: storeId }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.fallback ?? json.error ?? 'خطأ في الاتصال')

      if (json.session_id && !sessionId) setSessionId(json.session_id)
      setMessages(prev => [...prev, { role: 'assistant', content: json.response, ts: Date.now() }])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-brand-700 hover:bg-brand-800 text-white rounded-full shadow-xl flex items-center justify-center transition-colors"
            title="سبلت سمارت بوت"
          >
            <MessageCircle className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-6 z-50 w-80 sm:w-96 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ height: '520px' }}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-brand-700 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm leading-none">سبلت سمارت بوت</p>
                  <p className="text-xs text-white/70 mt-0.5">مساعد ذكي متخصص</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'assistant' ? 'bg-brand-100' : 'bg-gray-100'
                  }`}>
                    {msg.role === 'assistant'
                      ? <Bot className="w-3.5 h-3.5 text-brand-700" />
                      : <User className="w-3.5 h-3.5 text-gray-600" />
                    }
                  </div>
                  <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'assistant'
                      ? 'bg-gray-100 text-gray-800 rounded-tr-sm'
                      : 'bg-brand-700 text-white rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <div className="flex items-end gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-brand-700" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tr-sm px-4 py-3">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 px-3 py-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="اكتب سؤالك هنا..."
                  disabled={loading}
                  className="flex-1 text-sm bg-gray-50 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-brand-300 placeholder:text-gray-400 disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="w-9 h-9 bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-center text-xs text-gray-300 mt-2">مدعوم بالذكاء الاصطناعي · سبلت تيك AI</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
