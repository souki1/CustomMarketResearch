import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Calendar,
  Check,
  Circle,
  EyeOff,
  Highlighter,
  Image as ImageIcon,
  Minus,
  PenLine,
  SquarePen,
  StickyNote,
  Table,
  Type,
  TextCursorInput,
  X,
} from 'lucide-react'
import type { ReportBlock } from '@/lib/savedReports'
import { createEmptyBlock } from '@/lib/savedReports'

/** pdfFiller-style quick fill tools. Each inserts a prefilled block. */
export type FillToolId =
  | 'text'
  | 'sign'
  | 'initials'
  | 'image'
  | 'check'
  | 'cross'
  | 'circle'
  | 'table'
  | 'textbox'
  | 'date'
  | 'blackout'
  | 'highlight'
  | 'line'
  | 'arrow'
  | 'sticky'

export const FILL_TOOLS: { id: FillToolId; label: string; icon: LucideIcon }[] = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'sign', label: 'Sign', icon: PenLine },
  { id: 'initials', label: 'Initials', icon: SquarePen },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'check', label: 'Check', icon: Check },
  { id: 'cross', label: 'Cross', icon: X },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'table', label: 'Table', icon: Table },
  { id: 'textbox', label: 'Text Box', icon: TextCursorInput },
  { id: 'date', label: 'Date', icon: Calendar },
  { id: 'blackout', label: 'Blackout', icon: EyeOff },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'sticky', label: 'Sticky', icon: StickyNote },
]

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AB'
  return parts
    .slice(0, 3)
    .map((p) => p[0]!.toUpperCase())
    .join('.')
    .concat('.')
}

export function buildFillBlock(tool: FillToolId, userName?: string | null): ReportBlock {
  const name = userName?.trim() || ''
  const tag = (block: ReportBlock): ReportBlock => ({ ...block, pdf_overlay: true })

  switch (tool) {
    case 'text':
      return tag(createEmptyBlock('paragraph'))
    case 'sign': {
      const b = createEmptyBlock('quote')
      if (b.type === 'quote') return tag({ ...b, text: `/s/ ${name || 'Your signature'}` })
      return tag(b)
    }
    case 'initials': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: initialsFromName(name) })
      return tag(b)
    }
    case 'image':
      return tag(createEmptyBlock('image'))
    case 'check': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: '✔' })
      return tag(b)
    }
    case 'cross': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: '✘' })
      return tag(b)
    }
    case 'circle': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: '◯' })
      return tag(b)
    }
    case 'table':
      return tag(createEmptyBlock('table'))
    case 'textbox': {
      const b = createEmptyBlock('callout')
      if (b.type === 'callout') return tag({ ...b, tone: 'slate' })
      return tag(b)
    }
    case 'date': {
      const b = createEmptyBlock('paragraph')
      const today = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      if (b.type === 'paragraph') return tag({ ...b, text: today })
      return tag(b)
    }
    case 'blackout': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: '█████████████' })
      return tag(b)
    }
    case 'highlight': {
      const b = createEmptyBlock('callout')
      if (b.type === 'callout') return tag({ ...b, tone: 'amber', text: 'Highlighted text' })
      return tag(b)
    }
    case 'line':
      return tag(createEmptyBlock('divider'))
    case 'arrow': {
      const b = createEmptyBlock('paragraph')
      if (b.type === 'paragraph') return tag({ ...b, text: '→' })
      return tag(b)
    }
    case 'sticky': {
      const b = createEmptyBlock('callout')
      if (b.type === 'callout') return tag({ ...b, tone: 'amber', text: 'Note: ' })
      return tag(b)
    }
    default: {
      const _exhaustive: never = tool
      return _exhaustive
    }
  }
}
