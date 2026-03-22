import type { BlockAlign, CalloutTone, ReportBlock } from '@/lib/savedReports'

export function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function alignClass(align: BlockAlign | undefined): string {
  switch (align ?? 'left') {
    case 'center':
      return 'text-center'
    case 'right':
      return 'text-right'
    case 'left':
    default:
      return 'text-left'
  }
}

export function calloutToneClass(tone: CalloutTone | undefined): string {
  switch (tone ?? 'amber') {
    case 'blue':
      return 'rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-950 ring-1 ring-blue-100'
    case 'emerald':
      return 'rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-950 ring-1 ring-emerald-100'
    case 'slate':
      return 'rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200'
    case 'amber':
    default:
      return 'rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-100'
  }
}

export function spacerHeight(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'h-4'
    case 'lg':
      return 'h-16'
    case 'md':
    default:
      return 'h-8'
  }
}

export function patchAlign(block: ReportBlock, align: BlockAlign): ReportBlock {
  switch (block.type) {
    case 'divider':
    case 'spacer':
      return block
    default:
      return { ...block, align }
  }
}
