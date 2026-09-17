import type { BridgeAgent, BridgeMessage, BridgeOrg, BridgeQuoteCard } from './oemTypes'

export const THIS_OEM_ID = 'o1'
export const DEMO_SUPPLIER_ID = 's1'

export const OEM_RFQ_AGENT_ID = 'oem-rfq'
export const OEM_SPEC_AGENT_ID = 'oem-spec'
export const OEM_BUYER_AGENT_ID = 'oem-buyer'

export const SUP_QUOTE_AGENT_ID = 'sup-quote'
export const SUP_CAPACITY_AGENT_ID = 'sup-capacity'
export const SUP_QUALITY_AGENT_ID = 'sup-quality'

const OEM_AGENTS: BridgeAgent[] = [
  {
    id: OEM_RFQ_AGENT_ID,
    name: 'RFQ intake',
    focus: 'Quotes & award rules',
    blurb: 'Accepts supplier quotes, checks MOQ / need-by, and replies with bid status.',
  },
  {
    id: OEM_SPEC_AGENT_ID,
    name: 'Spec desk',
    focus: 'AML · datasheet · rev',
    blurb: 'Answers genuine vs aftermarket, revision, and drawing questions.',
  },
  {
    id: OEM_BUYER_AGENT_ID,
    name: 'Buyer desk',
    focus: 'Ship-to · expedite',
    blurb: 'Plant docks, Incoterms, and whether an expedite is even possible.',
  },
]

const SUPPLIER_AGENTS: BridgeAgent[] = [
  {
    id: SUP_QUOTE_AGENT_ID,
    name: 'Quote desk',
    focus: 'Price · MOQ · validity',
    blurb: 'Returns live offer fields for an RFQ line. Does not invent stock.',
  },
  {
    id: SUP_CAPACITY_AGENT_ID,
    name: 'Capacity',
    focus: 'Lead · warehouse',
    blurb: 'On-hand vs factory order and same-day cutoff.',
  },
  {
    id: SUP_QUALITY_AGENT_ID,
    name: 'Quality pack',
    focus: 'CoC · ISO · PPAP',
    blurb: 'Which certs are on file for this PN.',
  },
]

export const BRIDGE_OEMS: BridgeOrg[] = [
  {
    id: THIS_OEM_ID,
    name: 'Plant 2 · service parts',
    subtitle: 'This OEM desk · Kubota PN program',
    agents: OEM_AGENTS,
  },
  {
    id: 'o2',
    name: 'Plant 4 · assembly',
    subtitle: 'Hose & harness family',
    agents: OEM_AGENTS,
  },
  {
    id: 'o3',
    name: 'Aftermarket central',
    subtitle: 'Equivalent / dual-source buys',
    agents: OEM_AGENTS,
  },
]

export function supplierOrgsFromRows(
  rows: { id: string; name: string; category: string; region: string }[]
): BridgeOrg[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    subtitle: `${row.category} · ${row.region}`,
    agents: SUPPLIER_AGENTS,
  }))
}

export function bridgeThreadId(oemId: string, supplierId: string, agentId: string): string {
  return `${oemId}::${supplierId}::${agentId}`
}

export function seedBridgeMessages(): BridgeMessage[] {
  const now = 'Today 09:12'
  return [
    {
      id: 'm1',
      threadId: bridgeThreadId(THIS_OEM_ID, DEMO_SUPPLIER_ID, OEM_RFQ_AGENT_ID),
      speaker: 'supplier-human',
      agentId: OEM_RFQ_AGENT_ID,
      text: 'Sending a quote for RFQ-2026-0911, TC403-14670, 40 pcs.',
      at: now,
      quote: {
        rfqId: 'r1',
        rfqNumber: 'RFQ-2026-0911',
        partNumber: 'TC403-14670',
        qty: 40,
        unitPrice: 18.4,
        leadDays: 2,
      },
    },
    {
      id: 'm2',
      threadId: bridgeThreadId(THIS_OEM_ID, DEMO_SUPPLIER_ID, OEM_RFQ_AGENT_ID),
      speaker: 'oem-agent',
      agentId: OEM_RFQ_AGENT_ID,
      text: 'Quote logged against RFQ-2026-0911. Need-by is 28 Sep. Your 2-day lead clears the dock window. Bid is in play with two other sellers. I will not share their prices.',
      at: 'Today 09:12',
    },
    {
      id: 'm3',
      threadId: bridgeThreadId(THIS_OEM_ID, DEMO_SUPPLIER_ID, SUP_QUOTE_AGENT_ID),
      speaker: 'oem-human',
      agentId: SUP_QUOTE_AGENT_ID,
      text: 'Can Messicks hold $18.40 on the oil seal if we lift qty to 80?',
      at: 'Today 08:40',
    },
    {
      id: 'm4',
      threadId: bridgeThreadId(THIS_OEM_ID, DEMO_SUPPLIER_ID, SUP_QUOTE_AGENT_ID),
      speaker: 'supplier-agent',
      agentId: SUP_QUOTE_AGENT_ID,
      text: 'Yes. At 80 pcs the break is $17.60, MOQ 10, quote valid 7 days. Genuine Kubota channel. Datasheet is the OEM PDF, not a catalog page.',
      at: 'Today 08:41',
    },
  ]
}

function clockLabel(): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())
}

export function mockAgentReply(input: {
  sideAsking: 'oem' | 'supplier'
  agentId: string
  text: string
  quote?: BridgeQuoteCard
}): string {
  const q = input.text.toLowerCase()
  if (input.quote) {
    return `Quote received for ${input.quote.rfqNumber} · ${input.quote.partNumber} @ $${input.quote.unitPrice.toFixed(2)} / ${input.quote.leadDays}d. Logged on the OEM RFQ desk. Award still pending — I will not confirm a PO from chat.`
  }

  if (input.sideAsking === 'supplier') {
    switch (input.agentId) {
      case OEM_RFQ_AGENT_ID:
        if (/award|won|status/.test(q)) {
          return 'RFQ-2026-0911 is still open. Three bids are in. Award is a buyer action, not an agent action. Keep your need-by honest.'
        }
        if (/moq|minimum/.test(q)) {
          return 'Plant 2 will accept MOQ 10 on seals. Do not bid a reel qty we cannot receive at dock 3.'
        }
        return 'I am the Plant 2 RFQ agent. Send a priced line (PN, qty, unit price, lead days) and I will post it to the live RFQ. Ask Spec desk for revision questions.'
      case OEM_SPEC_AGENT_ID:
        if (/aftermarket|genuine|oem/.test(q)) {
          return 'TC403-14670 is genuine Kubota rev C. Aftermarket gaskets are a different family (TA040-14720). Do not cross them on this RFQ.'
        }
        if (/rev|revision|datasheet/.test(q)) {
          return 'Current drawing is rev C. Datasheet must be a PDF from the OEM domain. Catalog HTML is rejected.'
        }
        return 'Spec desk: ask about AML, revision, datasheet PDF, or OEM vs aftermarket. I do not price.'
      case OEM_BUYER_AGENT_ID:
        if (/expedite|rush|today/.test(q)) {
          return 'Dock 3 cutoff is 14:00. Same-day only if the seller is authorized and the line is already in a US warehouse. Expedite does not skip quality hold.'
        }
        if (/ship|dock|incoterm/.test(q)) {
          return 'Ship-to is Plant 2, dock 3, DAP. Mark the ASN with the OEM PN, not your house SKU.'
        }
        return 'Buyer desk agent: docks, Incoterms, expedite rules. RFQ pricing goes to RFQ intake.'
      default:
        return 'This OEM agent can only answer from the buyer desk facts on file.'
    }
  }

  switch (input.agentId) {
    case SUP_QUOTE_AGENT_ID:
      if (/80|break|qty/.test(q)) {
        return 'Price ladder on TC403-14670: 10 @ $18.40, 40 @ $18.40, 80 @ $17.60. Valid 7 days. Authorized Kubota line.'
      }
      if (/lead|stock/.test(q)) {
        return 'Quote desk defers stock to Capacity. List price assumes 2-day if Capacity confirms on-hand.'
      }
      return 'Quote desk for this supplier. Ask for unit price, breaks, MOQ, or quote validity. I will not disclose other OEM accounts.'
    case SUP_CAPACITY_AGENT_ID:
      if (/today|cutoff|stock/.test(q)) {
        return 'PA warehouse shows 64 on-hand for TC403-14670. Cutoff 15:00 ET. Transfer from KY adds 1 day.'
      }
      return 'Capacity agent: on-hand, transfer, factory lead. No pricing from this seat.'
    case SUP_QUALITY_AGENT_ID:
      if (/ppap|iso|coc|cert/.test(q)) {
        return 'ISO 9001 on file. CoC available per lot. PPAP not required on service seals unless Plant 4 assembly asks.'
      }
      return 'Quality pack: CoC, ISO, material certs. I will not invent a PPAP level that is not requested.'
    default:
      return 'This supplier agent only answers from the published offer and quality file.'
  }
}

export function newBridgeMessage(
  partial: Omit<BridgeMessage, 'id' | 'at'> & { at?: string }
): BridgeMessage {
  return {
    ...partial,
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: partial.at ?? clockLabel(),
  }
}
