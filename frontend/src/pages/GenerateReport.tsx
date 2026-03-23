import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReportGalleryHome, ReportStudio } from '@/components/reports'
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

export function GenerateReportPage() {
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
    setStudioMode('studio')
  }, [])

  const openStudioEdit = useCallback((r: SavedReport) => {
    setEditingId(r.id)
    setDocTitle(r.title)
    setBlocks(r.blocks.map((b) => normalizeBlock(structuredClone(b))))
    setSelectedId(r.blocks[0]?.id ?? null)
    setStudioMode('studio')
  }, [])

  const closeStudio = useCallback(() => {
    setStudioMode('home')
    setSelectedId(null)
  }, [])

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
      onOpenStudioEdit={openStudioEdit}
      onDeleteReport={handleDelete}
    />
  )
}

export default GenerateReportPage
