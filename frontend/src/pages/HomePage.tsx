import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AllFilesView,
  Card,
  CreateFileModal,
  CreateFolderModal,
} from '@/components'
import { getCurrentUserName, getToken } from '@/lib/auth'
import { createWorkspaceFile, createWorkspaceFolder, listWorkspaceItems, uploadWorkspaceCsv } from '@/lib/api'
import type { FileTableRow } from '@/types'



const icon3DClass = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl'

const FEATURE_CARDS = [
  {
    id: 'import-image',
    title: 'Upload Image',
    description: 'Upload images from your device or drag and drop.',
    icon: (
      <div className={`${icon3DClass} bg-gradient-to-br from-emerald-50 to-emerald-100/90`}>
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
      <div className={`${icon3DClass} bg-gradient-to-br from-violet-50 to-violet-100/90`}>
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
      <div className={`${icon3DClass} bg-gradient-to-br from-blue-50 to-blue-100/90`}>
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
    listWorkspaceItems(parentNumeric, token)
      .then((items) => {
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
        setRows(mapped)
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

  const handleUploadCsvClick = () => {
    fileInputRef.current?.click()
  }

  const handleCsvSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!token) {
      setError('You need to be signed in to upload CSV files.')
      return
    }
    try {
      const parentNumeric = currentFolderId ? Number(currentFolderId) : null
      const created = await uploadWorkspaceCsv(file, parentNumeric, token)
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
      setError(err instanceof Error ? err.message : 'Failed to upload CSV file')
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
            placeholder="Ask me anything about Clay or describe what you'd like to do..."
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
          {FEATURE_CARDS.map((card) => (
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
          ))}
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
            onNewFolderClick={() => setCreateFolderOpen(true)}
            onNewFileClick={handleUploadCsvClick}
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
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvSelected}
      />
    </div>
  )
}
