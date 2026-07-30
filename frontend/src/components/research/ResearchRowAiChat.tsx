import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Table2 } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  aiGroqChat,
  getAiSessionMessages,
  type AiChatHistoryMessage,
} from '@/lib/api'
import {
  parseSheetUpdatesFromAssistantMessage,
  type SheetColumnUpdate,
} from '@/lib/researchSheetUpdates'

const RESEARCH_AI_SOURCE = 'research_inspector'

type Props = {
  /** Used directly as the MongoDB session_id — deterministic per tab + row. */
  tabRowKey: string
  researchContext: string
  sessionLabel: string
  /** Compact layout for inline source cards. */
  compact?: boolean
  onApplySheetUpdates?: (updates: SheetColumnUpdate[]) => void
}

export function ResearchRowAiChat({
  tabRowKey,
  researchContext,
  sessionLabel,
  compact = false,
  onApplySheetUpdates,
}: Props) {
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

  const stripSheetUpdatesFence = useCallback((content: string) => {
    return content.replace(/```sheet_updates\s*[\s\S]*?```/gi, '').trim()
  }, [])

  const hasThread = messages.length > 0

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-sky-200/80 bg-linear-to-b from-sky-50/40 to-white ${
        compact ? 'max-h-[min(22rem,50vh)]' : 'flex-1'
      }`}
    >
      <div className={`flex shrink-0 items-center gap-2 border-b border-sky-100 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <div className={`flex items-center justify-center rounded-lg bg-sky-100 text-sky-800 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}>
          <Bot className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold text-gray-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {compact ? 'Source assistant' : 'Row assistant'}
          </p>
          <p className={`truncate text-gray-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
            Ask questions or add columns to the sheet.
          </p>
        </div>
      </div>

      {!getToken() && (
        <p className="shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          Sign in to chat. Sessions are saved to your AI history.
        </p>
      )}

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain ${compact ? 'px-2 py-2' : 'px-3 py-3'}`}
        aria-live="polite"
      >
        {loadingSession && !hasThread && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading conversation…
          </div>
        )}
        {!loadingSession && !hasThread && (
          <div className={`rounded-lg border border-dashed border-gray-200 bg-white/80 text-center text-gray-600 ${compact ? 'px-2 py-4 text-xs' : 'px-3 py-6 text-sm'}`}>
            Ask about this source, compare vendors, or say &quot;add price and vendor to my sheet&quot;.
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={`${i}-u`} className="flex justify-end">
                <div className={`max-w-[min(92%,18rem)] rounded-2xl bg-gray-100 text-gray-900 ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} leading-relaxed`}>
                  <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
                </div>
              </div>
            )
          }

          const updates = parseSheetUpdatesFromAssistantMessage(msg.content)
          const visible = stripSheetUpdatesFence(msg.content)

          return (
            <div key={`${i}-a`} className="flex justify-start">
              <div className="w-full min-w-0 space-y-2">
                {visible && (
                  <div className={`leading-relaxed text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
                    <span className="block whitespace-pre-wrap wrap-break-word">{visible}</span>
                  </div>
                )}
                {updates.length > 0 && onApplySheetUpdates && (
                  <button
                    type="button"
                    onClick={() => onApplySheetUpdates(updates)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    <Table2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Apply {updates.length} column{updates.length === 1 ? '' : 's'} to sheet
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Thinking…
          </div>
        )}
      </div>

      <div className={`shrink-0 space-y-2 border-t border-gray-100 bg-white ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-center text-xs text-red-800">
            {error}
          </div>
        )}
        <div className={`flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50/80 ${compact ? 'px-1.5 py-1.5' : 'px-2 py-2'}`}>
          <textarea
            rows={compact ? 1 : 2}
            className={`w-full flex-1 resize-none border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-40 ${compact ? 'max-h-20 min-h-[32px] px-1 py-0.5 text-xs' : 'max-h-28 min-h-[40px] px-1 py-1 text-sm'}`}
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
            className={`mb-0.5 flex shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-800 shadow-sm transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
            aria-label="Send"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {!compact && (
          <p className="text-center text-[10px] text-gray-400">AI can make mistakes. Verify important details.</p>
        )}
      </div>
    </div>
  )
}
