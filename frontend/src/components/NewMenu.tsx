import { useEffect, useRef, useState } from 'react'

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2-2z" />
    </svg>
  )
}

function ResearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function ReportDocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h4m2-14H9a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-3.828-3.828A2 2 0 0013.172 3H9z"
      />
    </svg>
  )
}

function CsvIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

type NewMenuProps = {
  onFolderClick: () => void
  onFileClick?: () => void
  onNewResearchClick?: () => void
  onNewReportClick?: () => void
  onImportCsvClick?: () => void
  onUploadFileClick?: () => void
}

export function NewMenu({
  onFolderClick,
  onFileClick,
  onNewResearchClick,
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
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="New"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-xl border border-gray-200 bg-white py-1 shadow-sm"
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
            <FolderIcon className="h-5 w-5 shrink-0 text-amber-500" />
            New Folder
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
            <ResearchIcon className="h-5 w-5 shrink-0 text-blue-500" />
            New Research
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
            <ReportDocIcon className="h-5 w-5 shrink-0 text-violet-500" />
            New Report
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
            <CsvIcon className="h-5 w-5 shrink-0 text-gray-500" />
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
            <UploadIcon className="h-5 w-5 shrink-0 text-gray-500" />
            Upload File
          </button>
        </div>
      )}
    </div>
  )
}
