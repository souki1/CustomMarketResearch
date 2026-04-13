import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  AllFilesView,
  Card,
  CreateFileModal,
  CreateFolderModal,
} from '@/components'
import { getCurrentUserName, getToken } from '@/lib/auth'
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteReport,
  deleteWorkspaceItem,
  listReports,
  listWorkspaceItems,
  moveWorkspaceItem,
  uploadWorkspaceCsv,
  uploadWorkspaceImage,
} from '@/lib/api'
import type { FileTableRow } from '@/types'

/** Convert an Excel file to a CSV File so we can upload it via the existing CSV endpoint. */
async function excelFileToCsvFile(file: File): Promise<File> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const firstSheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[firstSheetName]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  const baseName = file.name.replace(/\\.(xlsx?|xls)$/i, '')
  return new File([csv], `${baseName}.csv`, { type: 'text/csv' })
}



const icon3DClass = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl'

const FEATURE_CARDS = [
  {
    id: 'import-image',
    title: 'Upload Image',
    description: 'Upload images from your device or drag and drop.',
    icon: (
      <div className={`${icon3DClass} bg-linear-to-br from-emerald-50 to-emerald-100/90`}>
        <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
  },
  {
    id: 'import-data',
    title: 'Import data',
    description: 'Import your existing list from CRM or CSV.',
    icon: (
      <div className={`${icon3DClass} bg-linear-to-br from-violet-50 to-violet-100/90`}>
        <svg className="h-8 w-8 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </div>
    ),
  },
  {
    id: 'start-template',
    title: 'Start from template',
    description: 'Choose from pre-built workflows to get started.',
    icon: (
      <div className={`${icon3DClass} bg-linear-to-br from-blue-50 to-blue-100/90`}>
        <svg className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
      </div>
    ),
  },
] as const

const PLACEHOLDER_FILES: FileTableRow[] = [
  { id: 'f1', name: 'Clay Starter Table', isFolder: false, favorite: true, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f2', name: 'People Search', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f3', name: 'updated_file2', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f4', name: 'Copy of 10K Finder & Analyzer | Sales', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
]

type FileTab = 'all' | 'recents' | 'favourites'
type BreadcrumbSegment = { id: string; name: string }

export function HomePage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(() => getCurrentUserName() ?? 'there')
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTab, setFileTab] = useState<FileTab>('all')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [rows, setRows] = useState<FileTableRow[]>([])
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbSegment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [createFileOpen, setCreateFileOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveSourceRow, setMoveSourceRow] = useState<FileTableRow | null>(null)
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null)
  const [imageDropActive, setImageDropActive] = useState(false)

  useEffect(() => {
    const stored = getCurrentUserName()
    if (stored) setDisplayName(stored)
  }, [])

  const token = getToken()

  useEffect(() => {
    if (!token) {
      setRows(PLACEHOLDER_FILES)
      setError(null)
      return
    }

    const parentNumeric = currentFolderId ? Number(currentFolderId) : null
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([listWorkspaceItems(parentNumeric, token), listReports(token)])
      .then(([items, reports]) => {
        if (cancelled) return
        const mapped: FileTableRow[] = items.map((item) => {
          const created = new Date(item.created_at)
          const createdAt = created.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          const lastOpened = item.last_opened
            ? new Date(item.last_opened).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '—'
          return {
            id: String(item.id),
            name: item.name,
            isFolder: item.is_folder,
            favorite: item.favorite,
            createdAt,
            lastOpened,
            owner: item.owner_display_name ?? (getCurrentUserName() ?? 'You'),
            access: item.access,
            parentId: item.parent_id != null ? String(item.parent_id) : null,
          }
        })

        const inFolder = reports.filter((r) => (r.workspace_parent_id ?? null) === parentNumeric)
        const ownerLabel = getCurrentUserName() ?? 'You'
        const reportRows: FileTableRow[] = inFolder.map((r) => {
          const created = new Date(r.created_at)
          const updated = new Date(r.updated_at)
          const createdAt = created.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          const lastOpened = updated.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          return {
            id: `report:${r.id}`,
            name: r.title,
            isFolder: false,
            rowKind: 'report' as const,
            reportId: r.id,
            favorite: false,
            createdAt,
            lastOpened,
            owner: ownerLabel,
            access: 'Edit',
            parentId: currentFolderId,
          }
        })

        const merged = [...mapped, ...reportRows].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        )
        setRows(merged)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load files')
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, currentFolderId])

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    if (!token) {
      // fallback to local-only state if not authenticated
      const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const localFolder: FileTableRow = {
        id: `local-folder-${Date.now()}`,
        name,
        isFolder: true,
        favorite: false,
        createdAt: now,
        lastOpened: '—',
        owner: displayName,
        access: 'Edit',
        parentId: currentFolderId,
      }
      setRows((prev) => [...prev, localFolder])
    } else {
      const parentNumeric = currentFolderId ? Number(currentFolderId) : null
      try {
        const created = await createWorkspaceFolder(name, parentNumeric, token)
        const createdAt = new Date(created.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        const newRow: FileTableRow = {
          id: String(created.id),
          name: created.name,
          isFolder: created.is_folder,
          favorite: created.favorite,
          createdAt,
          lastOpened: '—',
          owner: created.owner_display_name ?? displayName,
          access: created.access,
          parentId: created.parent_id != null ? String(created.parent_id) : null,
        }
        setRows((prev) => [...prev, newRow])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create folder')
      }
    }
    setNewFolderName('')
    setCreateFolderOpen(false)
  }

  const handleCreateFile = async () => {
    const name = newFileName.trim()
    if (!name) return
    if (!token) {
      const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const localFile: FileTableRow = {
        id: `local-file-${Date.now()}`,
        name,
        isFolder: false,
        favorite: false,
        createdAt: now,
        lastOpened: '—',
        owner: displayName,
        access: 'Edit',
        parentId: currentFolderId,
      }
      setRows((prev) => [...prev, localFile])
    } else {
      const parentNumeric = currentFolderId ? Number(currentFolderId) : null
      try {
        const created = await createWorkspaceFile(name, parentNumeric, token)
        const createdAt = new Date(created.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        const newRow: FileTableRow = {
          id: String(created.id),
          name: created.name,
          isFolder: created.is_folder,
          favorite: created.favorite,
          createdAt,
          lastOpened: '—',
          owner: created.owner_display_name ?? displayName,
          access: created.access,
          parentId: created.parent_id != null ? String(created.parent_id) : null,
        }
        setRows((prev) => [...prev, newRow])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create file')
      }
    }
    setNewFileName('')
    setCreateFileOpen(false)
  }

  const rowsInCurrentFolder = rows.filter(
    (row) => (row.parentId ?? null) === currentFolderId
  )

  const handleOpenFolder = (folderId: string) => {
    setCurrentFolderId(folderId)
    setBreadcrumbPath((prev) => {
      const existingIndex = prev.findIndex((seg) => seg.id === folderId)
      if (existingIndex >= 0) return prev.slice(0, existingIndex + 1)
      const folder = rows.find((row) => row.id === folderId && row.isFolder)
      const name = folder?.name ?? 'Folder'
      return [...prev, { id: folderId, name }]
    })
  }

  const handleGoToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId)
    if (!folderId) {
      setBreadcrumbPath([])
      return
    }
    setBreadcrumbPath((prev) => {
      const existingIndex = prev.findIndex((seg) => seg.id === folderId)
      if (existingIndex >= 0) return prev.slice(0, existingIndex + 1)
      const folder = rows.find((row) => row.id === folderId && row.isFolder)
      const name = folder?.name ?? 'Folder'
      return [...prev, { id: folderId, name }]
    })
  }

  const handleDelete = async (row: FileTableRow) => {
    if (!token) {
      setError('You need to be signed in to delete items.')
      return
    }
    try {
      setError(null)
      if (row.rowKind === 'report' && row.reportId != null) {
        await deleteReport(token, row.reportId)
      } else {
        await deleteWorkspaceItem(Number(row.id), token)
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item')
    }
  }

  const handleUploadCsvClick = (folderId?: string | null) => {
    setUploadTargetFolderId(folderId ?? currentFolderId)
    fileInputRef.current?.click()
  }

  const handleUploadImageClick = () => {
    setUploadTargetFolderId(currentFolderId)
    setTimeout(() => imageInputRef.current?.click(), 0)
  }

  const isValidImageFile = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const validExtensions = /\.(jpg|jpeg|png|gif|webp|svg)$/i
    return validTypes.includes(file.type) || validExtensions.test(file.name)
  }

  const uploadImageFile = async (file: File, parentId: string | null) => {
    if (!token) return
    const parentNumeric = parentId ? Number(parentId) : null
    const created = await uploadWorkspaceImage(file, parentNumeric, token)
    const createdAt = new Date(created.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const newRow: FileTableRow = {
      id: String(created.id),
      name: created.name,
      isFolder: created.is_folder,
      favorite: created.favorite,
      createdAt,
      lastOpened: '—',
      owner: created.owner_display_name ?? displayName,
      access: created.access,
      parentId: created.parent_id != null ? String(created.parent_id) : null,
    }
    setRows((prev) => [...prev, newRow])
  }

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (!token) {
      setError('You need to be signed in to upload images.')
      return
    }

    if (!isValidImageFile(file)) {
      setError('Please upload an image file (.jpg, .png, .gif, .webp, .svg).')
      return
    }

    try {
      setError(null)
      await uploadImageFile(file, uploadTargetFolderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    }
  }

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImageDropActive(false)

    if (!token) {
      setError('You need to be signed in to upload images.')
      return
    }

    const files = Array.from(e.dataTransfer.files).filter(isValidImageFile)
    if (files.length === 0) {
      setError('Please drop image files (.jpg, .png, .gif, .webp, .svg).')
      return
    }

    setError(null)
    for (const file of files) {
      try {
        await uploadImageFile(file, currentFolderId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload image')
        break
      }
    }
  }

  const handleCsvSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (!token) {
      setError('You need to be signed in to upload files.')
      return
    }

    const isCsv =
      file.name.toLowerCase().endsWith('.csv') ||
      file.type === 'text/csv' ||
      file.type === 'application/csv'
    const isExcel = /\.(xlsx?|xls)$/i.test(file.name)

    let fileToUpload: File
    if (isCsv) {
      fileToUpload = file
    } else if (isExcel) {
      try {
        setError(null)
        fileToUpload = await excelFileToCsvFile(file)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read Excel file. Try saving as CSV and uploading instead.')
        return
      }
    } else {
      setError('Unsupported file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls).')
      return
    }

    try {
      setError(null)
      const parentNumeric = uploadTargetFolderId ? Number(uploadTargetFolderId) : null
      const created = await uploadWorkspaceCsv(fileToUpload, parentNumeric, token)
      const createdAt = new Date(created.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const newRow: FileTableRow = {
        id: String(created.id),
        name: created.name,
        isFolder: created.is_folder,
        favorite: created.favorite,
        createdAt,
        lastOpened: '—',
        owner: created.owner_display_name ?? displayName,
        access: created.access,
        parentId: created.parent_id != null ? String(created.parent_id) : null,
      }
      setRows((prev) => [...prev, newRow])
      // reset input so same file can be selected again later
      event.target.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    }
  }

  const handleOpenMove = (row: FileTableRow) => {
    setMoveSourceRow(row)
    setMoveTargetFolderId(row.parentId ?? null)
    setMoveDialogOpen(true)
  }

  const allFolders = rows.filter((r) => r.isFolder)

  const handleConfirmMove = async () => {
    if (!token || !moveSourceRow) {
      setMoveDialogOpen(false)
      return
    }
    if (moveSourceRow.rowKind === 'report') {
      setMoveDialogOpen(false)
      setMoveSourceRow(null)
      return
    }
    const targetNumeric = moveTargetFolderId ? Number(moveTargetFolderId) : null
    const sourceId = Number(moveSourceRow.id)
    try {
      setError(null)
      const updated = await moveWorkspaceItem(sourceId, targetNumeric, token)
      setRows((prev) =>
        prev.map((r) =>
          r.id === moveSourceRow.id
            ? {
                ...r,
                parentId: updated.parent_id != null ? String(updated.parent_id) : null,
              }
            : r
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move item')
    } finally {
      setMoveDialogOpen(false)
      setMoveSourceRow(null)
    }
  }

  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col pl-6 pr-6 py-6">
        <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">
          Hey {displayName}, ready to get started?
        </h1>

        <div className="mt-2 flex w-full max-w-xl items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-sm">
            <span role="img" aria-label="search">🔍</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files, run research, or ask AI anything…"
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Submit"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          {FEATURE_CARDS.map((card) =>
            card.id === 'import-image' ? (
              <div
                key={card.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setImageDropActive(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setImageDropActive(false)
                  }
                }}
                onDrop={handleImageDrop}
                className="w-80"
              >
                <Card
                  as="button"
                  type="button"
                  onClick={handleUploadImageClick}
                  className={`flex w-full flex-row items-center gap-4 transition-colors ${
                    imageDropActive ? 'ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50' : ''
                  }`}
                >
                  {card.icon}
                  <div className="min-w-10 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                    <p className="mt-1 text-xs leading-snug text-gray-500">
                      {card.description}
                      {imageDropActive ? ' — Drop images here' : ''}
                    </p>
                  </div>
                </Card>
              </div>
            ) : (
              <Card
                key={card.id}
                as="button"
                type="button"
                className="flex w-80 flex-row items-center gap-4"
              >
                {card.icon}
                <div className="min-w-10 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                  <p className="mt-1 text-xs leading-snug text-gray-500">{card.description}</p>
                </div>
              </Card>
            )
          )}
        </div>

        <div className="mt-6 flex gap-6 border-b border-gray-200">
          {(['all', 'recents', 'favourites'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFileTab(tab)}
              className={`pb-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
                fileTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600 -mb-px'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'all' ? 'All files' : tab === 'recents' ? 'Recents' : 'Favorites'}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {loading && !error && (
          <div className="mt-2 text-sm text-gray-500">
            Loading files…
          </div>
        )}

        {fileTab === 'all' && (
          <AllFilesView
            rows={rowsInCurrentFolder}
            breadcrumbPath={breadcrumbPath}
            onOpenFolder={handleOpenFolder}
            onGoToFolder={handleGoToFolder}
            onOpenFile={(fileId, fileName) => {
              if (fileId.startsWith('report:')) {
                const rid = Number(fileId.replace(/^report:/, ''))
                if (Number.isFinite(rid)) navigate(`/reports?edit=${rid}`)
                return
              }
              const folderPath = breadcrumbPath.map((seg) => seg.name).join(' / ')
              const params = new URLSearchParams()
              params.set('fileId', fileId)
              if (fileName) params.set('name', fileName)
              if (folderPath) params.set('folder', folderPath)
              try {
                localStorage.setItem('ir_last_file_id', fileId)
                if (fileName) localStorage.setItem('ir_last_file_name', fileName)
                if (folderPath) localStorage.setItem('ir_last_file_folder', folderPath)
              } catch {
                // ignore
              }
              navigate(`/research?${params.toString()}`)
            }}
            onNewReportClick={() => navigate('/reports')}
            onDelete={handleDelete}
            onNewFolderClick={() => setCreateFolderOpen(true)}
            onNewFileClick={() => handleUploadCsvClick()}
            onNewResearchClick={() => navigate('/research')}
            onImportCsvClick={() => handleUploadCsvClick()}
            onUploadFileClick={() => handleUploadCsvClick()}
            onMoveClick={handleOpenMove}
          />
        )}

        {fileTab === 'recents' && (
          <div className="mt-6 text-sm text-gray-500">Recents — no items yet.</div>
        )}
        {fileTab === 'favourites' && (
          <div className="mt-6 text-sm text-gray-500">Favorites — no items yet.</div>
        )}
      </div>

      <CreateFolderModal
        open={createFolderOpen}
        name={newFolderName}
        onNameChange={setNewFolderName}
        onCreate={handleCreateFolder}
        onCancel={() => {
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
      />
      <CreateFileModal
        open={createFileOpen}
        name={newFileName}
        onNameChange={setNewFileName}
        onCreate={handleCreateFile}
        onCancel={() => {
          setCreateFileOpen(false)
          setNewFileName('')
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleCsvSelected}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageSelected}
      />

      {moveDialogOpen && moveSourceRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Move “{moveSourceRow.name}”</h2>
            <p className="mt-1 text-xs text-gray-500">Choose a folder to move this file into.</p>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">Destination folder</label>
              <select
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={moveTargetFolderId ?? ''}
                onChange={(e) => setMoveTargetFolderId(e.target.value || null)}
              >
                <option value="">Home (no folder)</option>
                {allFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMoveDialogOpen(false)
                  setMoveSourceRow(null)
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
