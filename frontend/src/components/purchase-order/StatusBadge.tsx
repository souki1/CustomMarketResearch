import { Sparkles } from 'lucide-react'
import type { POStatus } from './poShared'
import { STATUS_LABEL } from './poShared'

export function StatusBadge({
  status,
  inRevision,
}: {
  status: POStatus
  inRevision?: boolean
}) {
  const label = inRevision ? 'In revision' : STATUS_LABEL[status]
  const cls = badgeClass(status, Boolean(inRevision))
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  )
}

export function AiMark() {
  return (
    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-[#7C6BF5]">
      <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
      AI
    </span>
  )
}

export function ChipStatus({
  status,
  received,
  billed,
}: {
  status: POStatus
  received?: boolean
  billed?: boolean
}) {
  const chips: { label: string; tone: 'draft' | 'pending' | 'ok' | 'warn' | 'info' }[] = [
    { label: STATUS_LABEL[status], tone: toneForStatus(status) },
  ]
  if (status === 'approved' || status === 'sent' || status === 'partial' || status === 'closed') {
    chips.push({ label: received ? 'Received' : 'Not received', tone: received ? 'ok' : 'pending' })
    chips.push({ label: billed || status === 'closed' ? 'Billed' : 'Not billed', tone: billed || status === 'closed' ? 'ok' : 'warn' })
  }
  if (status === 'sent' || status === 'closed' || status === 'partial') {
    chips.push({ label: 'Sent to ledger', tone: 'info' })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${chipToneClass(chip.tone)}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function toneForStatus(status: POStatus): 'draft' | 'pending' | 'ok' | 'warn' | 'info' {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'submitted':
      return 'pending'
    case 'approved':
    case 'sent':
    case 'closed':
      return 'ok'
    case 'partial':
      return 'warn'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function badgeClass(status: POStatus, inRevision: boolean): string {
  if (inRevision) return 'bg-[#FFF1E6] text-[#C05621]'
  switch (status) {
    case 'draft':
      return 'bg-[#EEF0F5] text-[#5C6378]'
    case 'submitted':
      return 'bg-[#FFF1E6] text-[#C05621]'
    case 'approved':
    case 'sent':
      return 'bg-[#E5F8ED] text-[#178C4A]'
    case 'partial':
      return 'bg-[#FFF4E0] text-[#B45309]'
    case 'closed':
      return 'bg-[#E5F8ED] text-[#178C4A]'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function chipToneClass(tone: 'draft' | 'pending' | 'ok' | 'warn' | 'info'): string {
  switch (tone) {
    case 'draft':
      return 'bg-[#EEF0F5] text-[#5C6378]'
    case 'pending':
      return 'bg-[#FFF1E6] text-[#C05621]'
    case 'ok':
      return 'bg-[#E5F8ED] text-[#178C4A]'
    case 'warn':
      return 'bg-[#FFE8E8] text-[#C24141]'
    case 'info':
      return 'bg-[#EEF0FF] text-[#4F46E5]'
    default: {
      const _exhaustive: never = tone
      return _exhaustive
    }
  }
}
