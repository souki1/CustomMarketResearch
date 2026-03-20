import * as Tabs from '@radix-ui/react-tabs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  aiGroqChat,
  getAiSessionMessages,
  listAiSessions,
  type AiChatHistoryMessage,
  type AiChatMode,
  type AiSessionSummary,
} from '@/lib/api'

const MODES: { value: AiChatMode; label: string; hint: string }[] = [
  {
    value: 'chat',
    label: 'Chat',
    hint: 'Back-and-forth assistant for research, procurement, and explanations. Conversations are stored in MongoDB.',
  },
  {
    value: 'summarize',
    label: 'Summarize',
    hint: 'Turn long text into concise bullets or short paragraphs. Each run is saved as its own session in MongoDB.',
  },
  {
    value: 'rewrite',
    label: 'Rewrite',
    hint: 'Clearer, more professional wording while keeping your meaning. Saved per run in MongoDB.',
  },
  {
    value: 'brainstorm',
    label: 'Brainstorm',
    hint: 'Ideas, angles, and next steps for a topic or problem. Saved per run in MongoDB.',
  },
]

function formatSessionTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function AiPlaceholderPage() {
  const token = useMemo(() => getToken(), [])
  const [tab, setTab] = useState<AiChatMode>('chat')
  const [chatMessages, setChatMessages] = useState<AiChatHistoryMessage[]>([])
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<AiSessionSummary[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [singleInput, setSingleInput] = useState('')
  const [singleOutput, setSingleOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshChatSessions = useCallback(async () => {
    if (!token) return
    setLoadingSessions(true)
    try {
      const list = await listAiSessions(token, { mode: 'chat', limit: 40 })
      setChatSessions(list)
    } catch {
      setChatSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }, [token])

  useEffect(() => {
    if (token && tab === 'chat') void refreshChatSessions()
  }, [token, tab, refreshChatSessions])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const startNewChat = useCallback(() => {
    setChatSessionId(null)
    setChatMessages([])
    setChatInput('')
    setError(null)
  }, [])

  const runChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || !token) return
    const prior = chatMessages
    const sid = chatSessionId
    setError(null)
    setLoading(true)
    setChatInput('')
    setChatMessages([...prior, { role: 'user', content: text }])
    scrollToBottom()
    try {
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: text,
        history: prior,
        session_id: sid ?? undefined,
      })
      setChatSessionId(res.session_id)
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
      scrollToBottom()
      void refreshChatSessions()
    } catch (e) {
      setChatMessages(prior)
      setChatInput(text)
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [chatInput, chatMessages, chatSessionId, token, refreshChatSessions, scrollToBottom])

  const runSingleMode = useCallback(async () => {
    const text = singleInput.trim()
    if (!text || !token) return
    setError(null)
    setLoading(true)
    setSingleOutput('')
    try {
      const res = await aiGroqChat(token, {
        mode: tab,
        message: text,
        history: [],
      })
      setSingleOutput(res.content)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [singleInput, tab, token])

  const onSessionSelect = useCallback(
    async (value: string) => {
      if (!token) return
      if (!value) {
        startNewChat()
        return
      }
      setError(null)
      setLoading(true)
      try {
        const data = await getAiSessionMessages(token, value)
        setChatSessionId(data.session_id)
        setChatMessages(data.messages)
        scrollToBottom()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    },
    [token, startNewChat, scrollToBottom]
  )

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

  const tabHint = MODES.find((m) => m.value === tab)?.hint ?? ''

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">AI</h1>
            <p className="mt-0.5 text-sm text-gray-600">
              Powered by <span className="font-medium text-gray-800">Groq</span> (
              <code className="rounded bg-gray-100 px-1 text-xs">GROQ_API_KEY</code> /{' '}
              <code className="rounded bg-gray-100 px-1 text-xs">GROQ_MODEL</code>
              ). Every completion is stored in{' '}
              <span className="font-medium text-gray-800">MongoDB</span> (
              <code className="rounded bg-gray-100 px-1 text-xs">MONGO_URL</code>,{' '}
              <code className="rounded bg-gray-100 px-1 text-xs">MONGO_DB_NAME</code>
              , collection <code className="rounded bg-gray-100 px-1 text-xs">ai_interactions</code>
              ).
            </p>
          </div>
        </div>

        {!token && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Sign in to use AI. Requests require authentication and use your workspace account.
          </div>
        )}

        <Tabs.Root
          value={tab}
          onValueChange={(v) => {
            setTab(v as AiChatMode)
            setError(null)
            setSingleOutput('')
          }}
          className="mt-6"
        >
          <Tabs.List
            className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
            aria-label="AI modes"
          >
            {MODES.map((m) => (
              <Tabs.Trigger
                key={m.value}
                value={m.value}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900 data-[state=active]:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {m.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <p className="mt-3 text-xs text-gray-500">{tabHint}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <Tabs.Content value="chat" className="mt-4 outline-none">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
                <label htmlFor="ai-chat-session" className="text-xs font-medium text-gray-600">
                  Conversation (MongoDB)
                </label>
                <select
                  id="ai-chat-session"
                  className={inputClass}
                  disabled={!token || loading || loadingSessions}
                  value={chatSessionId ?? ''}
                  onChange={(e) => void onSessionSelect(e.target.value)}
                >
                  <option value="">New conversation</option>
                  {chatSessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {formatSessionTime(s.last_at)} — {s.preview || s.session_id.slice(0, 8) + '…'} (
                      {s.turn_count} turn{s.turn_count === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={startNewChat}
                disabled={!token || loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0" aria-hidden />
                New chat
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div
                ref={scrollRef}
                className="max-h-[min(420px,55vh)] min-h-[200px] space-y-3 overflow-y-auto p-4"
              >
                {chatMessages.length === 0 && (
                  <p className="text-sm text-gray-500">
                    Start a conversation or resume one from the list. Messages are saved to MongoDB after each
                    reply.
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={`${i}-${msg.role}-${msg.content.slice(0, 24)}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-100 bg-gray-50 text-gray-900'
                      }`}
                    >
                      <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Thinking…
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 p-3">
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    className={`${inputClass} min-h-[44px] resize-none`}
                    placeholder="Message…"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (token && !loading) void runChat()
                      }
                    }}
                    disabled={!token || loading}
                    aria-label="Chat message"
                  />
                  <button
                    type="button"
                    onClick={() => void runChat()}
                    disabled={!token || loading || !chatInput.trim()}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </Tabs.Content>

          {(['summarize', 'rewrite', 'brainstorm'] as const).map((mode) => (
            <Tabs.Content key={mode} value={mode} className="mt-4 outline-none">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Your text</label>
                <textarea
                  rows={10}
                  className={`${inputClass} mt-2 resize-y`}
                  placeholder="Paste or type content…"
                  value={singleInput}
                  onChange={(e) => setSingleInput(e.target.value)}
                  disabled={!token || loading}
                />
                <button
                  type="button"
                  onClick={() => void runSingleMode()}
                  disabled={!token || loading || !singleInput.trim()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Run with Groq
                </button>
                {singleOutput && (
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Result</h3>
                    <div className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-900">
                      {singleOutput}
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </div>
  )
}
