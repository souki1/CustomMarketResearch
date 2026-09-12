import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, FlaskConical, FolderPlus, Bot, Plus, Upload } from 'lucide-react'

type NewMenuProps = {
  onFolderClick: () => void
  onFileClick?: () => void
  onNewResearchClick?: () => void
  onNewAgentClick?: () => void
  onNewReportClick?: () => void
  onImportCsvClick?: () => void
  onUploadFileClick?: () => void
}

export function NewMenu({
  onFolderClick,
  onFileClick,
  onNewResearchClick,
  onNewAgentClick,
  onNewReportClick,
  onImportCsvClick,
  onUploadFileClick,
}: NewMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-app-label transition-colors hover:bg-app-fill focus:outline-none focus:bg-app-fill'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-app-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-app-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="New"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        New
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[200px] rounded-[12px] border border-app-separator bg-app-elevated p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)]"
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              onFolderClick()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <FolderPlus className="h-4 w-4 shrink-0 text-app-warn" strokeWidth={1.75} />
            New folder
          </button>
          <button
            type="button"
            onClick={() => {
              onNewResearchClick?.()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <FlaskConical className="h-4 w-4 shrink-0 text-app-accent" strokeWidth={1.75} />
            New research
          </button>
          <button
            type="button"
            onClick={() => {
              onNewAgentClick?.()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <Bot className="h-4 w-4 shrink-0 text-app-accent" strokeWidth={1.75} />
            New agent
          </button>
          <button
            type="button"
            onClick={() => {
              onNewReportClick?.()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <FileText className="h-4 w-4 shrink-0 text-app-accent" strokeWidth={1.75} />
            New report
          </button>
          <button
            type="button"
            onClick={() => {
              ;(onImportCsvClick ?? onFileClick)?.()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => {
              ;(onUploadFileClick ?? onFileClick)?.()
              setOpen(false)
            }}
            className={itemClass}
            role="menuitem"
          >
            <Upload className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
            Upload file
          </button>
        </div>
      )}
    </div>
  )
}
