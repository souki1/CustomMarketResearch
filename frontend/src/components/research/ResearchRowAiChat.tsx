import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  aiGroqChat,
  getAiSessionMessages,
  type AiChatHistoryMessage,
} from '@/lib/api'

const RESEARCH_AI_SOURCE = 'research_inspector'

type Props = {
  /** Used directly as the MongoDB session_id — deterministic per tab + row. */
  tabRowKey: string
  researchContext: string
  sessionLabel: string
}

export function ResearchRowAiChat({ tabRowKey, researchContext, sessionLabel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<AiChatHistoryMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setError(null)
      const token = getToken()
      if (!token || !tabRowKey.trim()) {
        if (!cancelled) {
          setMessages([])
          setLoadingSession(false)
        }
        return
      }

      if (!cancelled) setLoadingSession(true)
      try {
        const data = await getAiSessionMessages(token, tabRowKey)
        if (cancelled) return
        setMessages(data.messages)
        setError(null)
        scrollToBottom()
      } catch {
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setLoadingSession(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [tabRowKey, scrollToBottom])

  const send = useCallback(async () => {
    const text = input.trim()
    const token = getToken()
    if (!text || !token) {
      if (!token) setError('Sign in to chat.')
      return
    }
    const prior = messages
    setError(null)
    setLoading(true)
    setInput('')
    setMessages([...prior, { role: 'user', content: text }])
    scrollToBottom()
    try {
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: text,
        history: prior,
        session_id: tabRowKey,
        context: researchContext || undefined,
        session_label: sessionLabel,
        source: RESEARCH_AI_SOURCE,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
      scrollToBottom()
    } catch (e) {
      setMessages(prior)
      setInput(text)
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [input, messages, tabRowKey, researchContext, sessionLabel, scrollToBottom])

  const hasThread = messages.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sky-200/80 bg-linear-to-b from-sky-50/40 to-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-sky-100 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
          <Bot className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-gray-900">Row assistant</p>
          <p className="truncate text-[11px] text-gray-500">Chat history synced from your account.</p>
        </div>
      </div>

      {!getToken() && (
        <p className="shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          Sign in to chat. Sessions are saved to your AI history.
        </p>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3"
        aria-live="polite"
      >
        {loadingSession && !hasThread && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading conversation…
          </div>
        )}
        {!loadingSession && !hasThread && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white/80 px-3 py-6 text-center text-sm text-gray-600">
            Ask about this part, pricing, specs, or the scraped sources. Context updates when structured data changes.
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={`${i}-u`} className="flex justify-end">
              <div className="max-w-[min(92%,18rem)] rounded-2xl bg-gray-100 px-3 py-2 text-sm leading-relaxed text-gray-900">
                <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
              </div>
            </div>
          ) : (
            <div key={`${i}-a`} className="flex justify-start">
              <div className="w-full min-w-0 text-sm leading-relaxed text-gray-900">
                <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
              </div>
            </div>
          )
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Thinking…
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-gray-100 bg-white px-3 py-2">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-center text-xs text-red-800">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50/80 px-2 py-2">
          <textarea
            rows={2}
            className="max-h-28 min-h-[40px] w-full flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-40"
            placeholder="Message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (getToken() && !loading && !loadingSession) void send()
              }
            }}
            disabled={!getToken() || loading || loadingSession}
            aria-label="Message"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!getToken() || loading || loadingSession || !input.trim()}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-800 shadow-sm transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400">AI can make mistakes. Verify important details.</p>
      </div>
    </div>
  )
}
