import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReportGalleryHome, ReportStudio } from '@/components/reports'
import { aiGroqChat } from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  createEmptyBlock,
  createNewReport,
  loadSavedReports,
  persistSavedReports,
  normalizeBlock,
  type ReportBlock,
  type ReportBlockType,
  type SavedReport,
} from '@/lib/savedReports'

type StudioMode = 'home' | 'studio'

function newBlockId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createTitleBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'title', text, align: 'left' }
}

function createHeadingBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'heading', text, align: 'left' }
}

function createParagraphBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'paragraph', text, align: 'left' }
}

function createBulletsBlock(items: string[]): ReportBlock {
  return { id: newBlockId(), type: 'bullets', items, align: 'left' }
}

function extractJsonCandidate(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim()
  return raw.trim()
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseAiToReportDraft(userPrompt: string, raw: string): { title: string; blocks: ReportBlock[] } {
  let parsed: Record<string, unknown> | null = null
  const candidate = extractJsonCandidate(raw)
  try {
    const json = JSON.parse(candidate) as unknown
    if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json as Record<string, unknown>
  } catch {
    parsed = null
  }

  const fallbackTitle = userPrompt.trim().slice(0, 80) || 'AI generated report'
  const title = readString(parsed?.title) ?? fallbackTitle
  const blocks: ReportBlock[] = [createTitleBlock(title)]

  const summary = readString(parsed?.summary)
  if (summary) blocks.push(createParagraphBlock(summary))

  const sections = parsed && Array.isArray(parsed.sections) ? parsed.sections : []
  for (const section of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    const row = section as Record<string, unknown>
    const heading = readString(row.heading)
    if (heading) blocks.push(createHeadingBlock(heading))
    for (const p of readStringArray(row.paragraphs)) {
      blocks.push(createParagraphBlock(p))
    }
    const bullets = readStringArray(row.bullets)
    if (bullets.length) blocks.push(createBulletsBlock(bullets))
  }

  const keyPoints = readStringArray(parsed?.key_points)
  if (keyPoints.length) {
    blocks.push(createHeadingBlock('Key points'))
    blocks.push(createBulletsBlock(keyPoints))
  }

  const conclusion = readString(parsed?.conclusion)
  if (conclusion) {
    blocks.push(createHeadingBlock('Conclusion'))
    blocks.push(createParagraphBlock(conclusion))
  }

  if (blocks.length > 1) return { title, blocks }

  const chunks = raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue

    const markdownHeading = lines[0]?.match(/^#{1,6}\s+(.+)$/)
    if (markdownHeading?.[1]) {
      blocks.push(createHeadingBlock(markdownHeading[1].trim()))
      const body = lines.slice(1).join(' ').trim()
      if (body) blocks.push(createParagraphBlock(body))
      continue
    }

    const bulletItems = lines
      .filter((line) => /^[-*•]\s+/.test(line))
      .map((line) => line.replace(/^[-*•]\s+/, '').trim())
      .filter(Boolean)
    if (bulletItems.length >= 2 && bulletItems.length === lines.length) {
      blocks.push(createBulletsBlock(bulletItems))
      continue
    }

    blocks.push(createParagraphBlock(lines.join(' ')))
  }

  if (blocks.length === 1) {
    blocks.push(createParagraphBlock(raw.trim() || 'No AI content generated.'))
  }

  return { title, blocks }
}

export function GenerateReportPage() {
  const token = useMemo(() => getToken(), [])
  const [studioMode, setStudioMode] = useState<StudioMode>('home')
  const [tab, setTab] = useState<'list' | 'create'>('list')
  const [reports, setReports] = useState<SavedReport[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [docTitle, setDocTitle] = useState('Untitled report')
  const [blocks, setBlocks] = useState<ReportBlock[]>(() => [
    createEmptyBlock('title'),
    createEmptyBlock('paragraph'),
  ])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [showAiComposer, setShowAiComposer] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    setReports(loadSavedReports())
  }, [])

  useEffect(() => {
    persistSavedReports(reports)
  }, [reports])

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports]
  )

  const openStudioNew = useCallback(() => {
    setEditingId(null)
    setDocTitle('Untitled report')
    setBlocks([createEmptyBlock('title'), createEmptyBlock('paragraph')])
    setSelectedId(null)
    setShowAiComposer(false)
    setAiPrompt('')
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const openStudioAi = useCallback(() => {
    setEditingId(null)
    setDocTitle('Untitled report')
    setBlocks([createEmptyBlock('title'), createEmptyBlock('paragraph')])
    setSelectedId(null)
    setShowAiComposer(true)
    setAiPrompt('')
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const openStudioEdit = useCallback((r: SavedReport) => {
    setEditingId(r.id)
    setDocTitle(r.title)
    setBlocks(r.blocks.map((b) => normalizeBlock(structuredClone(b))))
    setSelectedId(r.blocks[0]?.id ?? null)
    setShowAiComposer(false)
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const closeStudio = useCallback(() => {
    setStudioMode('home')
    setSelectedId(null)
    setAiGenerating(false)
    setAiError(null)
  }, [])

  const generateWithAi = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    if (!token) {
      setAiError('Sign in to generate reports with AI.')
      return
    }

    setAiGenerating(true)
    setAiError(null)
    try {
      const instruction = [
        'Generate a professional report from the user prompt.',
        'Return JSON only (no markdown), using this schema:',
        '{"title":"string","summary":"string","sections":[{"heading":"string","paragraphs":["string"],"bullets":["string"]}],"key_points":["string"],"conclusion":"string"}',
        'Use concise, factual language and avoid unsafe or unverifiable claims.',
      ].join('\n')

      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: `${instruction}\n\nUser prompt:\n${prompt}`,
        history: [],
      })

      const generated = parseAiToReportDraft(prompt, res.content)
      const normalizedBlocks = generated.blocks.map((b) => normalizeBlock(structuredClone(b)))
      setDocTitle(generated.title)
      setBlocks(normalizedBlocks)
      setSelectedId(normalizedBlocks[0]?.id ?? null)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setAiGenerating(false)
    }
  }, [aiPrompt, token])

  const addBlock = useCallback((type: ReportBlockType) => {
    const nb = createEmptyBlock(type)
    setBlocks((prev) => {
      if (!selectedId) return [...prev, nb]
      const i = prev.findIndex((b) => b.id === selectedId)
      if (i < 0) return [...prev, nb]
      return [...prev.slice(0, i + 1), nb, ...prev.slice(i + 1)]
    })
    setSelectedId(nb.id)
  }, [selectedId])

  const updateBlock = useCallback((id: string, next: ReportBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? normalizeBlock(next) : b)))
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((b) => b.id !== id)
      setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur))
      return next
    })
  }, [])

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[i]!
      next[i] = next[j]!
      next[j] = t
      return next
    })
  }, [])

  const saveDocument = useCallback(() => {
    const title = docTitle.trim() || 'Untitled report'
    const normalized = blocks.map((b) => normalizeBlock(structuredClone(b)))
    if (editingId) {
      setReports((prev) => prev.map((r) => (r.id === editingId ? { ...r, title, blocks: normalized } : r)))
    } else {
      const next = createNewReport(title, normalized)
      setReports((prev) => [next, ...prev])
      setEditingId(next.id)
    }
  }, [docTitle, editingId, blocks])

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this report?')) return
    setReports((prev) => prev.filter((r) => r.id !== id))
    setPreviewId((cur) => (cur === id ? null : cur))
  }, [])

  if (studioMode === 'studio') {
    return (
      <ReportStudio
        docTitle={docTitle}
        onDocTitleChange={setDocTitle}
        onClose={closeStudio}
        onSave={saveDocument}
        blocks={blocks}
        selectedId={selectedId}
        onSelectId={setSelectedId}
        onAddBlock={addBlock}
        onUpdateBlock={updateBlock}
        onRemoveBlock={removeBlock}
        onMoveBlock={moveBlock}
        showAiComposer={showAiComposer}
        aiPrompt={aiPrompt}
        aiGenerating={aiGenerating}
        aiError={aiError}
        onAiPromptChange={setAiPrompt}
        onGenerateWithAi={() => void generateWithAi()}
      />
    )
  }

  return (
    <ReportGalleryHome
      tab={tab}
      onTabChange={setTab}
      sorted={sorted}
      previewId={previewId}
      onPreviewIdChange={setPreviewId}
      onOpenStudioNew={openStudioNew}
      onOpenStudioAi={openStudioAi}
      onOpenStudioEdit={openStudioEdit}
      onDeleteReport={handleDelete}
    />
  )
}

export default GenerateReportPage
