import * as Tabs from '@radix-ui/react-tabs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy,
  History,
  Lightbulb,
  ListCollapse,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  aiGroqChat,
  getAiSessionMessages,
  listAiSessions,
  type AiChatHistoryMessage,
  type AiChatMode,
  type AiSessionSummary,
} from '@/lib/api'

const MODES: {
  value: AiChatMode
  label: string
  hint: string
  icon: typeof MessageSquare
}[] = [
  {
    value: 'chat',
    label: 'Chat',
    hint: 'Back-and-forth assistant for research, procurement, and explanations. Conversations are stored in MongoDB.',
    icon: MessageSquare,
  },
  {
    value: 'summarize',
    label: 'Summarize',
    hint: 'Turn long text into concise bullets or short paragraphs. Each run is saved as its own session in MongoDB.',
    icon: ListCollapse,
  },
  {
    value: 'rewrite',
    label: 'Rewrite',
    hint: 'Clearer, more professional wording while keeping your meaning. Saved per run in MongoDB.',
    icon: Pencil,
  },
  {
    value: 'brainstorm',
    label: 'Brainstorm',
    hint: 'Ideas, angles, and next steps for a topic or problem. Saved per run in MongoDB.',
    icon: Lightbulb,
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

const msgActionBtn =
  'rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:pointer-events-none disabled:opacity-35'

function AssistantMessageToolbar({
  content,
  messageIndex,
  isLastAssistant,
  loading,
  onRegenerate,
  vote,
  onVote,
  copiedIndex,
  onCopied,
}: {
  content: string
  messageIndex: number
  isLastAssistant: boolean
  loading: boolean
  onRegenerate: () => void
  vote: 'up' | 'down' | undefined
  onVote: (v: 'up' | 'down') => void
  copiedIndex: number | null
  onCopied: (index: number | null) => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      onCopied(messageIndex)
      window.setTimeout(() => onCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: content })
      } else {
        await navigator.clipboard.writeText(content)
        onCopied(messageIndex)
        window.setTimeout(() => onCopied(null), 2000)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Message actions">
      <button type="button" className={msgActionBtn} onClick={() => void copy()} title="Copy" aria-label="Copy">
        <Copy className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={msgActionBtn}
        onClick={() => onVote('up')}
        title="Good response"
        aria-label="Thumbs up"
        aria-pressed={vote === 'up'}
      >
        <ThumbsUp className={`h-4 w-4 ${vote === 'up' ? 'text-gray-900' : ''}`} aria-hidden />
      </button>
      <button
        type="button"
        className={msgActionBtn}
        onClick={() => onVote('down')}
        title="Bad response"
        aria-label="Thumbs down"
        aria-pressed={vote === 'down'}
      >
        <ThumbsDown className={`h-4 w-4 ${vote === 'down' ? 'text-gray-900' : ''}`} aria-hidden />
      </button>
      <button type="button" className={msgActionBtn} onClick={() => void share()} title="Share" aria-label="Share">
        <Share2 className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        className={msgActionBtn}
        onClick={onRegenerate}
        disabled={loading || !isLastAssistant}
        title="Regenerate response"
        aria-label="Regenerate"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={msgActionBtn} title="More" aria-label="More" disabled>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {copiedIndex === messageIndex && (
        <span className="ml-1 text-xs text-gray-500" role="status">
          Copied
        </span>
      )}
    </div>
  )
}

const pillShell =
  'flex min-h-[52px] items-end gap-2 rounded-[1.75rem] border border-gray-200 bg-white px-2 py-2 shadow-sm'

const pillTextarea =
  'max-h-40 min-h-[36px] w-full flex-1 resize-none border-0 bg-transparent py-2 text-[15px] leading-snug text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-40'

const iconBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:pointer-events-none disabled:opacity-30'

const AI_HISTORY_OPEN_KEY = 'ir-ai-history-open'

/** Match sticky sidebar column height exactly (navbar `h-14` = 3.5rem). */
const AI_PAGE_SHELL = 'box-border flex h-[calc(100vh-3.5rem)] w-full max-w-full flex-col overflow-hidden'

const aiCollapsedSessionBtn = (active: boolean) =>
  `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight transition-all sm:h-9 sm:w-9 ${
    active
      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
      : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 hover:shadow-sm'
  }`

export function AiPlaceholderPage() {
  const token = useMemo(() => getToken(), [])
  const [historyOpen, setHistoryOpen] = useState(() => {
    try {
      return localStorage.getItem(AI_HISTORY_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })
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
  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null)
  const [msgVote, setMsgVote] = useState<Record<number, 'up' | 'down'>>({})
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

  useEffect(() => {
    try {
      localStorage.setItem(AI_HISTORY_OPEN_KEY, historyOpen ? 'true' : 'false')
    } catch {
      // ignore
    }
  }, [historyOpen])

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
    setMsgVote({})
    setCopiedMsgIndex(null)
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
        setMsgVote({})
        scrollToBottom()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    },
    [token, startNewChat, scrollToBottom]
  )

  const regenerateLast = useCallback(async () => {
    if (!token || loading) return
    const msgs = chatMessages
    if (msgs.length < 2) return
    const last = msgs[msgs.length - 1]
    const prevUser = msgs[msgs.length - 2]
    if (last.role !== 'assistant' || prevUser.role !== 'user') return
    const history = msgs.slice(0, -2)
    const userText = prevUser.content
    setError(null)
    setLoading(true)
    setChatMessages(msgs.slice(0, -1))
    scrollToBottom()
    try {
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: userText,
        history,
        session_id: chatSessionId ?? undefined,
      })
      setChatSessionId(res.session_id)
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
      scrollToBottom()
      void refreshChatSessions()
    } catch (e) {
      setChatMessages(msgs)
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [token, loading, chatMessages, chatSessionId, scrollToBottom, refreshChatSessions])

  const tabHint = MODES.find((m) => m.value === tab)?.hint ?? ''
  const hasChatThread = tab === 'chat' && chatMessages.length > 0
  const isNewChat = chatSessionId === null
  const lastAssistantIndex = useMemo(() => {
    for (let j = chatMessages.length - 1; j >= 0; j--) {
      if (chatMessages[j]?.role === 'assistant') return j
    }
    return -1
  }, [chatMessages])

  return (
    <div className={`${AI_PAGE_SHELL} bg-white text-gray-900`}>
      {/* Same shell as Compare / Reports: full-width row, secondary sidebar, flex-1 main (no max-w-7xl wrapper) */}
      <div className="flex h-full min-h-0 w-full min-w-0">
        {tab === 'chat' && !historyOpen && (
          <div
            className="flex h-full w-10 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 sm:w-11"
            aria-label="Chat history (collapsed)"
          >
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-10 w-full shrink-0 items-center justify-center border-b border-slate-200/80 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
              title="Expand history"
              aria-label="Show chat history"
              aria-expanded={false}
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-2">
              {token &&
                chatSessions.map((s) => {
                  const active = chatSessionId === s.session_id
                  const label = (s.preview || s.session_id || 'Chat').trim()
                  const words = label.split(/\s+/).filter((w) => w.length > 0)
                  const abbr =
                    words.length >= 2
                      ? (words[0]![0]! + words[1]![0]!).toUpperCase()
                      : (words[0] ?? 'C').slice(0, 2).toUpperCase()
                  return (
                    <button
                      key={s.session_id}
                      type="button"
                      disabled={loading || loadingSessions}
                      onClick={() => void onSessionSelect(s.session_id)}
                      title={label}
                      aria-label={label}
                      className={aiCollapsedSessionBtn(active)}
                    >
                      {abbr}
                    </button>
                  )
                })}
            </div>
            <button
              type="button"
              onClick={() => startNewChat()}
              disabled={!token || loading}
              className="flex h-10 w-full shrink-0 items-center justify-center border-t border-slate-200/80 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50 disabled:opacity-40"
              title="New chat"
              aria-label="New chat"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {tab === 'chat' && historyOpen && (
          <aside
            className="flex h-full min-h-0 w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:w-56 lg:w-60"
            aria-label="Chat history"
          >
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <h2 className="truncate text-sm font-semibold text-slate-900">History</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                title="Collapse history"
                aria-label="Hide chat history"
                aria-expanded={true}
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="p-1.5 sm:p-2">
              <button
                type="button"
                onClick={() => {
                  startNewChat()
                }}
                disabled={!token || loading}
                className={`flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm ${
                  isNewChat
                    ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
                    : 'text-slate-700 hover:bg-white hover:shadow-sm'
                }`}
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 leading-snug">New chat</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pt-1 sm:px-2">
              {!token && (
                <p className="px-2 py-2 text-xs text-slate-500">Sign in to see past chats.</p>
              )}
              {token && loadingSessions && chatSessions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </div>
              )}
              {token && !loadingSessions && chatSessions.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-500">No past conversations yet.</p>
              )}
              <ul className="space-y-1" role="list">
                {token &&
                  chatSessions.map((s) => {
                    const active = chatSessionId === s.session_id
                    const preview = s.preview || `${s.session_id.slice(0, 8)}…`
                    const fromResearch = s.source === 'research_inspector'
                    return (
                      <li key={s.session_id}>
                        <button
                          type="button"
                          disabled={loading || loadingSessions}
                          onClick={() => void onSessionSelect(s.session_id)}
                          className={`flex w-full flex-col gap-0.5 rounded-xl px-2 py-2 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-50 sm:px-3 sm:py-2.5 sm:text-sm ${
                            active
                              ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
                              : 'text-slate-700 hover:bg-white/80 hover:shadow-sm'
                          }`}
                        >
                          {fromResearch && (
                            <span className="mb-0.5 inline-flex w-fit rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Research
                            </span>
                          )}
                          <span className="line-clamp-2 wrap-break-word">{preview}</span>
                          <span className="text-xs font-normal text-slate-500">
                            {formatSessionTime(s.last_at)} · {s.turn_count} turn
                            {s.turn_count === 1 ? '' : 's'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={`mx-auto flex w-full min-w-0 max-w-3xl min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8 ${
              hasChatThread && tab === 'chat' ? 'sm:py-4' : 'sm:py-10'
            }`}
          >
            {!(hasChatThread && tab === 'chat') && (
              <>
                <div className="mb-2 flex justify-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/25">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </div>
                </div>

                {!hasChatThread && (
                  <h1 className="text-center text-3xl font-medium tracking-tight text-gray-900 sm:text-4xl">
                    Where should we begin?
                  </h1>
                )}
              </>
            )}

            {!token && (
              <div
                className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 ${
                  hasChatThread && tab === 'chat' ? 'mt-4' : 'mt-8'
                }`}
              >
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
              className={
                hasChatThread && tab === 'chat'
                  ? 'mt-0 flex min-h-0 flex-1 flex-col'
                  : 'mt-8 flex flex-1 flex-col'
              }
            >
              {tab === 'chat' && hasChatThread && (
                <div
                  ref={scrollRef}
                  className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-0.5 pb-4 sm:px-0"
                >
                  {chatMessages.map((msg, i) =>
                    msg.role === 'user' ? (
                      <div
                        key={`${i}-${msg.role}-${msg.content.slice(0, 24)}`}
                        className="flex justify-end"
                      >
                        <div className="max-w-[min(85%,20rem)] rounded-2xl bg-gray-100 px-3 py-2 text-[15px] leading-relaxed text-gray-900">
                          <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`${i}-${msg.role}-${msg.content.slice(0, 24)}`}
                        className="flex justify-start"
                      >
                        <div className="w-full min-w-0 max-w-2xl">
                          <div className="text-[15px] leading-relaxed text-gray-900">
                            <span className="block whitespace-pre-wrap wrap-break-word">{msg.content}</span>
                          </div>
                          <AssistantMessageToolbar
                            content={msg.content}
                            messageIndex={i}
                            isLastAssistant={i === lastAssistantIndex}
                            loading={loading}
                            onRegenerate={() => void regenerateLast()}
                            vote={msgVote[i]}
                            onVote={(v) =>
                              setMsgVote((prev) => {
                                const next = { ...prev }
                                if (next[i] === v) delete next[i]
                                else next[i] = v
                                return next
                              })
                            }
                            copiedIndex={copiedMsgIndex}
                            onCopied={setCopiedMsgIndex}
                          />
                        </div>
                      </div>
                    )
                  )}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Thinking…
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div
                className={
                  hasChatThread && tab === 'chat'
                    ? 'mt-auto shrink-0 space-y-3 border-t border-gray-100 bg-white pt-3'
                    : 'shrink-0'
                }
              >
              {hasChatThread && tab === 'chat' ? (
                <>
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-sm text-red-800">
                      {error}
                    </div>
                  )}
                  <Tabs.List
                    className="flex flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    aria-label="AI modes"
                  >
                    {MODES.map((m) => {
                      const Icon = m.icon
                      return (
                        <Tabs.Trigger
                          key={m.value}
                          value={m.value}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 data-[state=active]:border-violet-300 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                        >
                          <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                          {m.label}
                        </Tabs.Trigger>
                      )
                    })}
                  </Tabs.List>
                  <div className={pillShell}>
                    <button
                      type="button"
                      onClick={startNewChat}
                      disabled={!token || loading}
                      className={iconBtn}
                      aria-label="Start new conversation"
                      title="New conversation"
                    >
                      <Plus className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <textarea
                      rows={1}
                      className={pillTextarea}
                      placeholder="Ask anything"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (token && !loading) void runChat()
                        }
                      }}
                      disabled={!token || loading}
                      aria-label="Message"
                    />
                    <button
                      type="button"
                      className={iconBtn}
                      disabled
                      title="Voice input is not available"
                      aria-label="Voice input (not available)"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void runChat()}
                      disabled={!token || loading || !chatInput.trim()}
                      className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-900 shadow-md transition-transform hover:scale-105 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
                      aria-label="Send"
                    >
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="text-center text-[11px] leading-relaxed text-gray-400">
                    AI can make mistakes. Check important information.
                  </p>
                </>
              ) : (
                <>
                  {tab === 'chat' && (
                    <div className={pillShell}>
                      <button
                        type="button"
                        onClick={startNewChat}
                        disabled={!token || loading}
                        className={iconBtn}
                        aria-label="Start new conversation"
                        title="New conversation"
                      >
                        <Plus className="h-5 w-5" strokeWidth={2} />
                      </button>
                      <textarea
                        rows={1}
                        className={pillTextarea}
                        placeholder="Ask anything"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (token && !loading) void runChat()
                          }
                        }}
                        disabled={!token || loading}
                        aria-label="Message"
                      />
                      <button
                        type="button"
                        className={iconBtn}
                        disabled
                        title="Voice input is not available"
                        aria-label="Voice input (not available)"
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void runChat()}
                        disabled={!token || loading || !chatInput.trim()}
                        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-md transition-transform hover:scale-105 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
                        aria-label="Send"
                      >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </div>
                  )}

                  {tab !== 'chat' && (
                    <div className={pillShell + ' min-h-[120px] items-stretch'}>
                      <textarea
                        className={pillTextarea + ' min-h-[100px] py-3'}
                        placeholder="Paste or type content…"
                        value={singleInput}
                        onChange={(e) => setSingleInput(e.target.value)}
                        disabled={!token || loading}
                      />
                      <div className="flex shrink-0 flex-col justify-end gap-1 pb-0.5">
                        <button
                          type="button"
                          onClick={() => void runSingleMode()}
                          disabled={!token || loading || !singleInput.trim()}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white shadow-md transition-transform hover:scale-105 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
                          aria-label="Run with Groq"
                        >
                          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
                      {error}
                    </div>
                  )}

                  <Tabs.List
                    className="mt-5 flex flex-wrap items-center justify-center gap-2"
                    aria-label="AI modes"
                  >
                    {MODES.map((m) => {
                      const Icon = m.icon
                      return (
                        <Tabs.Trigger
                          key={m.value}
                          value={m.value}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 data-[state=active]:border-violet-300 data-[state=active]:bg-violet-50 data-[state=active]:text-violet-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                        >
                          <Icon className="h-4 w-4 opacity-80" aria-hidden />
                          {m.label}
                        </Tabs.Trigger>
                      )
                    })}
                  </Tabs.List>

                  <p className="mt-4 text-center text-xs text-gray-500">{tabHint}</p>
                </>
              )}
            </div>

          <Tabs.Content value="chat" className="sr-only outline-none" tabIndex={0}>
            Active mode: chat. Use the composer and conversation above.
          </Tabs.Content>

          {(['summarize', 'rewrite', 'brainstorm'] as const).map((mode) => (
            <Tabs.Content key={mode} value={mode} className="mt-6 outline-none">
              {singleOutput && (
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">Result</h3>
                  <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">
                    {singleOutput}
                  </div>
                </div>
              )}
            </Tabs.Content>
          ))}
        </Tabs.Root>

            <p
              className={`mt-auto text-center text-[11px] leading-relaxed text-gray-500 ${
                hasChatThread && tab === 'chat' ? 'pt-6' : 'pt-12'
              }`}
            >
              Powered by Groq; conversations stored in MongoDB (
              <code className="text-gray-600">ai_interactions</code>).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
