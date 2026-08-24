import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart2, Loader2, MessageSquare, Send, Sparkles, X } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  aiGroqChat,
  getAiSessionMessages,
  type AiChatHistoryMessage,
} from '@/lib/api'
import type { CompareDecisionRow, ComparePartChip } from '@/components/compare/CompareDecisionWorkspace'

const COMPARE_SPARK_SOURCE = 'compare_spark_ai'

type Props = {
  open: boolean
  onClose: () => void
  partLabel: string
  rows: CompareDecisionRow[]
  partChips?: ComparePartChip[]
  activePartId?: string | null
}

function money(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${n.toFixed(2)}`
}

function safeHttpsImage(url: string | null | undefined): string | null {
  if (url == null || typeof url !== 'string') return null
  const t = url.trim()
  if (t.length === 0 || t.length > 2048) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
}

function buildCompareContext(
  partLabel: string,
  rows: CompareDecisionRow[],
  partChips: ComparePartChip[] | undefined,
  activePartId: string | null | undefined
): string {
  const selectedParts = (partChips ?? []).filter((p) => p.selected).map((p) => p.label)
  const prices = rows.map((r) => r.price).filter((n): n is number => n != null)
  const best = prices.length ? Math.min(...prices) : null
  const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null
  const vendors = rows.slice(0, 40).map((r) => ({
    vendor: r.vendor,
    price: r.price,
    price_label: r.priceLabel,
    shipping: r.shippingLabel,
    availability: r.availability,
    delivery: r.delivery,
    location: r.location,
    contact: r.contact,
    url: r.url,
    has_image: Boolean(safeHttpsImage(r.imageUrl)),
  }))

  return JSON.stringify(
    {
      assistant_role:
        'You are a procurement decision assistant. Use ONLY the provided comparison data. Help the user choose vendors, explain price spreads, shipping/stock risks, and multi-part tradeoffs. Be concise and actionable. When useful, suggest which chart view matters (price vs vendor, free shipping, ships today).',
      active_part: partLabel,
      active_part_id: activePartId ?? null,
      selected_parts: selectedParts,
      summary: {
        vendor_count: rows.length,
        best_price: best,
        avg_price: avg,
        priced_vendor_count: prices.length,
      },
      vendors,
    },
    null,
    0
  )
}

function PriceChart({ rows }: { rows: CompareDecisionRow[] }) {
  const byPrice = useMemo(() => {
    return [...rows]
      .filter((r) => r.price != null)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .slice(0, 12)
  }, [rows])

  const maxP = byPrice.reduce((m, r) => Math.max(m, r.price ?? 0), 0)

  if (byPrice.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
        No priced vendors to chart yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Price by vendor
      </p>
      <ul className="space-y-2">
        {byPrice.map((row, i) => {
          const pct = maxP > 0 ? ((row.price ?? 0) / maxP) * 100 : 0
          const isBest = i === 0
          return (
            <li key={row.id} className="min-w-0">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-700">{row.vendor}</span>
                <span
                  className={`shrink-0 font-mono text-xs font-semibold ${
                    isBest ? 'text-emerald-600' : 'text-slate-800'
                  }`}
                >
                  {money(row.price)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    isBest ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const QUICK_PROMPTS = [
  'Which vendor is the best buy overall?',
  'Summarize price spread and where I overpay.',
  'Any stock or shipping risks I should watch?',
  'Compare free shipping vs best price.',
] as const

export function CompareSparkAiPanel({
  open,
  onClose,
  partLabel,
  rows,
  partChips,
  activePartId,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'chat' | 'charts'>('chat')
  const [messages, setMessages] = useState<AiChatHistoryMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)

  const sessionId = useMemo(() => {
    const parts = (partChips ?? [])
      .filter((p) => p.selected)
      .map((p) => p.id)
      .sort()
      .join('|')
    const key = parts || activePartId || partLabel || 'compare'
    return `compare-spark:${key.slice(0, 180)}`
  }, [partChips, activePartId, partLabel])

  const context = useMemo(
    () => buildCompareContext(partLabel, rows, partChips, activePartId),
    [partLabel, rows, partChips, activePartId]
  )

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      const token = getToken()
      if (!token) {
        setMessages([])
        return
      }
      setLoadingSession(true)
      try {
        const data = await getAiSessionMessages(token, sessionId)
        if (!cancelled) {
          setMessages(data.messages)
          setError(null)
        }
      } catch {
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setLoadingSession(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, sessionId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      const token = getToken()
      if (!trimmed || !token) {
        if (!token) setError('Sign in to use Spark AI.')
        return
      }
      const prior = messages
      setError(null)
      setLoading(true)
      setInput('')
      setMessages([...prior, { role: 'user', content: trimmed }])
      scrollToBottom()
      try {
        const res = await aiGroqChat(token, {
          mode: 'chat',
          message: trimmed,
          history: prior,
          session_id: sessionId,
          context,
          session_label: `Compare · ${partLabel || 'parts'}`,
          source: COMPARE_SPARK_SOURCE,
        })
        setMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
        scrollToBottom()
      } catch (e) {
        setMessages(prior)
        setInput(trimmed)
        setError(e instanceof Error ? e.message : 'Request failed')
      } finally {
        setLoading(false)
      }
    },
    [messages, sessionId, context, partLabel, scrollToBottom]
  )

  const runDecisionBrief = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setError('Sign in to use Spark AI.')
      return
    }
    if (rows.length === 0) {
      setError('Select parts with vendor data first.')
      return
    }
    setTab('chat')
    setBriefLoading(true)
    setError(null)
    const prompt =
      'Read all comparison data for the selected parts and give a short decision brief: best buy, notable savings vs average, shipping/stock risks, and one clear recommendation. Use bullet points.'
    const prior = messages
    setMessages([...prior, { role: 'user', content: prompt }])
    scrollToBottom()
    try {
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: prompt,
        history: prior,
        session_id: sessionId,
        context,
        session_label: `Compare · ${partLabel || 'parts'}`,
        source: COMPARE_SPARK_SOURCE,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
      scrollToBottom()
    } catch (e) {
      setMessages(prior)
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBriefLoading(false)
    }
  }, [rows.length, messages, sessionId, context, partLabel, scrollToBottom])

  if (!open) return null

  const selectedCount = (partChips ?? []).filter((p) => p.selected).length

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="compare-spark-title">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/25 transition-opacity"
        aria-label="Close Spark AI"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-md animate-[slideInRight_0.22s_ease-out] flex-col border-l border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0.85; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-300">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="compare-spark-title" className="text-sm font-semibold text-slate-900">
              Spark AI
            </h2>
            <p className="truncate text-[11px] text-slate-500">
              {partLabel || 'Comparison'}
              {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
              {rows.length > 0 ? ` · ${rows.length} vendors` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-slate-200 px-3 py-2">
          {(
            [
              { k: 'chat' as const, label: 'Decide', Icon: MessageSquare },
              { k: 'charts' as const, label: 'Charts', Icon: BarChart2 },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <t.Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'charts' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <PriceChart rows={rows} />
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              Charts use the vendors currently visible for this part selection. Ask Spark in Decide for
              a written recommendation.
            </p>
            <button
              type="button"
              disabled={briefLoading || loading || rows.length === 0}
              onClick={() => void runDecisionBrief()}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {briefLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Explain this chart
            </button>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {loadingSession && (
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversation…
                </p>
              )}
              {!loadingSession && messages.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-medium text-slate-800">Decision helper</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Spark can read your selected parts and vendor prices, shipping, and availability to
                    help you choose.
                  </p>
                  <button
                    type="button"
                    disabled={briefLoading || loading || rows.length === 0}
                    onClick={() => void runDecisionBrief()}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {briefLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Run decision brief
                  </button>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={loading || briefLoading}
                        onClick={() => void sendMessage(q)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ml-6 bg-slate-900 text-white'
                      : 'mr-4 border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {(loading || briefLoading) && (
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 p-3">
              {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendMessage(input)
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={2}
                  placeholder="Ask about vendors, price, shipping…"
                  disabled={loading || briefLoading}
                  className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendMessage(input)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || briefLoading || !input.trim()}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Send"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
