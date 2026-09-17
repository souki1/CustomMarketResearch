import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Send } from 'lucide-react'
import {
  BRIDGE_OEMS,
  THIS_OEM_ID,
  DEMO_SUPPLIER_ID,
  OEM_RFQ_AGENT_ID,
  SUP_QUOTE_AGENT_ID,
  bridgeThreadId,
  supplierOrgsFromRows,
} from './agentBridgeSeed'
import { AppScroll } from '@/components/AppScroll'
import { useOemDesk } from './OemDeskContext'
import type { BridgeMessage, BridgeOrg, BridgeQuoteCard, BridgeSide, BridgeSpeaker } from './oemTypes'
import { Badge, formatUsd } from './oemUi'

type AgentBridgePanelProps = {
  side: BridgeSide
}

function speakerLabel(
  side: BridgeSide,
  msg: BridgeMessage,
  org: BridgeOrg | undefined
): string {
  const agent = org?.agents.find((a) => a.id === msg.agentId)
  switch (msg.speaker) {
    case 'oem-human':
      return side === 'oem' ? 'You · buyer' : 'OEM buyer'
    case 'supplier-human':
      return side === 'supplier' ? 'You · Messicks' : 'Supplier'
    case 'oem-agent':
      return agent ? `${agent.name} · OEM agent` : 'OEM agent'
    case 'supplier-agent':
      return agent ? `${agent.name} · supplier agent` : 'Supplier agent'
    default: {
      const _exhaustive: never = msg.speaker
      return _exhaustive
    }
  }
}

function isOwnBubble(side: BridgeSide, speaker: BridgeSpeaker): boolean {
  if (side === 'oem') return speaker === 'oem-human'
  return speaker === 'supplier-human'
}

function isAgentBubble(speaker: BridgeSpeaker): boolean {
  return speaker === 'oem-agent' || speaker === 'supplier-agent'
}

export function AgentBridgePanel({ side }: AgentBridgePanelProps) {
  const { suppliers, rfqs, bridgeMessages, sendBridgeChat, sendQuoteToOemAgent } = useOemDesk()
  const [params, setParams] = useSearchParams()
  const orgs = useMemo(
    () => (side === 'oem' ? supplierOrgsFromRows(suppliers) : BRIDGE_OEMS),
    [side, suppliers]
  )

  const paramKey = side === 'oem' ? 'supplier' : 'oem'
  const requestedOrg = params.get(paramKey)
  const requestedAgent = params.get('agent')
  const rfqFromUrl = params.get('rfq')

  const [orgId, setOrgId] = useState(
    () => requestedOrg || (side === 'oem' ? DEMO_SUPPLIER_ID : THIS_OEM_ID)
  )
  const defaultAgent = side === 'oem' ? SUP_QUOTE_AGENT_ID : OEM_RFQ_AGENT_ID
  const [agentId, setAgentId] = useState(() => requestedAgent || defaultAgent)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  const org = orgs.find((o) => o.id === orgId) ?? orgs[0]
  const agent = org?.agents.find((a) => a.id === agentId) ?? org?.agents[0]
  const oemId = side === 'oem' ? THIS_OEM_ID : (org?.id ?? THIS_OEM_ID)
  const supplierId = side === 'oem' ? (org?.id ?? DEMO_SUPPLIER_ID) : DEMO_SUPPLIER_ID
  const threadId = agent ? bridgeThreadId(oemId, supplierId, agent.id) : ''
  const thread = bridgeMessages.filter((m) => m.threadId === threadId)

  const attachableRfqs = rfqs.filter((r) => r.status === 'open')
  const selectedRfq =
    attachableRfqs.find((r) => r.id === rfqFromUrl) ?? attachableRfqs[0] ?? null

  useEffect(() => {
    if (requestedOrg && orgs.some((o) => o.id === requestedOrg)) setOrgId(requestedOrg)
  }, [requestedOrg, orgs])

  useEffect(() => {
    if (requestedAgent && org?.agents.some((a) => a.id === requestedAgent)) {
      setAgentId(requestedAgent)
    }
  }, [requestedAgent, org])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [thread.length, threadId])

  const selectOrg = (id: string) => {
    setOrgId(id)
    const next = orgs.find((o) => o.id === id)
    const keep = next?.agents.some((a) => a.id === agentId) ? agentId : next?.agents[0]?.id
    if (keep) setAgentId(keep)
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set(paramKey, id)
        if (keep) p.set('agent', keep)
        return p
      },
      { replace: true }
    )
  }

  const selectAgent = (id: string) => {
    setAgentId(id)
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set(paramKey, orgId)
        p.set('agent', id)
        return p
      },
      { replace: true }
    )
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !agent) return
    sendBridgeChat({
      side,
      oemId,
      supplierId,
      agentId: agent.id,
      text,
    })
    setDraft('')
  }

  const sendQuote = () => {
    if (!selectedRfq || side !== 'supplier' || !agent) return
    const mine = selectedRfq.bids.find((b) => b.supplierName === 'Messicks')
    sendQuoteToOemAgent({
      oemId,
      supplierId,
      quote: {
        rfqId: selectedRfq.id,
        rfqNumber: selectedRfq.number,
        partNumber: selectedRfq.partNumber,
        qty: selectedRfq.qty,
        unitPrice: mine?.unitPrice ?? 18.4,
        leadDays: mine?.leadDays ?? 2,
      },
    })
    if (agent.id !== OEM_RFQ_AGENT_ID) {
      setAgentId(OEM_RFQ_AGENT_ID)
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('agent', OEM_RFQ_AGENT_ID)
          return p
        },
        { replace: true }
      )
    }
  }

  if (!org || !agent) {
    return <p className="text-[13px] text-app-secondary">No counterparties on the bridge yet.</p>
  }

  return (
    <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-[12px] border border-app-separator bg-app-surface lg:h-[calc(100vh-14rem)] lg:flex-row">
      <aside className="w-full shrink-0 border-b border-app-separator lg:w-56 lg:border-b-0 lg:border-r">
        <p className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-app-tertiary">
          {side === 'oem' ? 'Ask a supplier agent' : 'Ask an OEM agent'}
        </p>
        <ul className="max-h-40 overflow-y-auto lg:max-h-none">
          {orgs.map((item) => {
            const on = item.id === org.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectOrg(item.id)}
                  className={`flex w-full flex-col px-3 py-2.5 text-left ${
                    on ? 'bg-app-fill-strong' : 'hover:bg-app-fill'
                  }`}
                >
                  <span className="text-[13px] font-semibold text-app-label">{item.name}</span>
                  <span className="text-[11px] text-app-secondary">{item.subtitle}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <div className="border-b border-app-separator px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-app-accent" strokeWidth={1.75} aria-hidden />
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-app-label">
              {org.name}
            </h2>
            <Badge tone="info">{agent.name}</Badge>
          </div>
          <p className="mt-1 text-[12px] text-app-secondary">{agent.blurb}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {org.agents.map((item) => {
              const on = item.id === agent.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectAgent(item.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    on
                      ? 'border-app-accent bg-app-accent-soft text-app-label'
                      : 'border-app-separator text-app-secondary hover:bg-app-fill'
                  }`}
                >
                  {item.name}
                  <span className="ml-1 text-app-tertiary">{item.focus}</span>
                </button>
              )
            })}
          </div>
        </div>

        <AppScroll ref={scroller} className="min-h-0 flex-1" contentClassName="space-y-3 px-4 py-3">
          {thread.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-app-separator px-3 py-4 text-[13px] text-app-secondary">
              {side === 'supplier'
                ? 'No thread yet. Send a doubt to this OEM agent, or push an RFQ quote onto RFQ intake.'
                : 'No thread yet. Ask this supplier’s agent for price, stock, or certs. Replies stay on this bridge (preview only).'}
            </p>
          ) : (
            thread.map((msg) => {
              const mine = isOwnBubble(side, msg.speaker)
              const agentMsg = isAgentBubble(msg.speaker)
              return (
                <article
                  key={msg.id}
                  className={`max-w-[min(100%,28rem)] rounded-[12px] px-3 py-2.5 ${
                    mine
                      ? 'ml-auto bg-app-accent-soft'
                      : agentMsg
                        ? 'border border-app-separator bg-app-bg'
                        : 'bg-app-fill'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-app-tertiary">
                    {speakerLabel(side, msg, org)} · {msg.at}
                  </p>
                  {msg.quote ? <QuoteChip quote={msg.quote} /> : null}
                  <p className="mt-1 text-[13px] leading-relaxed text-app-label">{msg.text}</p>
                </article>
              )
            })
          )}
        </AppScroll>

        {side === 'supplier' && selectedRfq ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-separator bg-app-bg px-4 py-2">
            <p className="text-[12px] text-app-secondary">
              Push {selectedRfq.number} · {selectedRfq.partNumber} to this OEM’s RFQ agent
            </p>
            <button
              type="button"
              onClick={sendQuote}
              className="inline-flex h-8 items-center rounded-[8px] border border-app-separator bg-app-surface px-3 text-[12px] font-medium text-app-label hover:bg-app-fill"
            >
              Send quote to OEM agent
            </button>
          </div>
        ) : null}

        <form
          className="flex gap-2 border-t border-app-separator p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <label className="sr-only" htmlFor="bridge-draft">
            Message
          </label>
          <input
            id="bridge-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              side === 'supplier'
                ? `Ask ${agent.name} at ${org.name}…`
                : `Ask ${org.name} · ${agent.name}…`
            }
            className="h-9 min-w-0 flex-1 rounded-[8px] border border-app-separator bg-app-bg px-3 text-[13px] text-app-label placeholder:text-app-tertiary focus:border-app-accent focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-app-accent px-3 text-[13px] font-medium text-white hover:bg-app-accent-hover"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Send
          </button>
        </form>
        <p className="px-3 pb-3 text-[11px] text-app-tertiary">
          Preview replies only — no live model call. The other portal on this desk shares the same
          thread.
        </p>
      </div>
    </div>
  )
}

function QuoteChip({ quote }: { quote: BridgeQuoteCard }) {
  return (
    <div className="mt-2 rounded-[8px] border border-app-separator bg-app-surface px-2.5 py-2">
      <p className="text-[11px] font-semibold text-app-label">
        {quote.rfqNumber} · {quote.partNumber}
      </p>
      <p className="text-[11px] text-app-secondary">
        qty {quote.qty} · {formatUsd(quote.unitPrice)} · {quote.leadDays}d lead
      </p>
    </div>
  )
}
