import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BetweenVerticalStart,
  Code2,
  Heading1,
  Heading2,
  Image as ImageIcon,
  LayoutTemplate,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Sparkles,
  Type,
} from 'lucide-react'
import type { ReportBlockType } from '@/lib/savedReports'

export const ELEMENT_TOOLS: { type: ReportBlockType; label: string; icon: LucideIcon }[] = [
  { type: 'title', label: 'Title', icon: Heading1 },
  { type: 'heading', label: 'Heading', icon: Type },
  { type: 'subheading', label: 'Subheading', icon: Heading2 },
  { type: 'paragraph', label: 'Paragraph', icon: LayoutTemplate },
  { type: 'bullets', label: 'Bullets', icon: List },
  { type: 'numbered', label: 'Numbered', icon: ListOrdered },
  { type: 'table', label: 'Table', icon: Table },
  { type: 'quote', label: 'Quote', icon: Quote },
  { type: 'callout', label: 'Callout', icon: Sparkles },
  { type: 'metric', label: 'Metric', icon: BarChart3 },
  { type: 'code', label: 'Code', icon: Code2 },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'divider', label: 'Line', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: BetweenVerticalStart },
]
