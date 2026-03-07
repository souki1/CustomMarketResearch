import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function ResearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

type Command = {
  id: string
  label: string
  keywords: string[]
  icon: React.ReactNode
  shortcut?: string
  action: () => void
}

type CommandPaletteProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps = {}) {
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value
      if (isControlled) onOpenChange?.(next)
      else setInternalOpen(next)
    },
    [isControlled, onOpenChange, open]
  )
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'home',
        label: 'Go to Home',
        keywords: ['home', 'dashboard', 'main'],
        icon: <HomeIcon className="h-4 w-4 shrink-0 text-gray-500" />,
        shortcut: 'G H',
        action: () => navigate('/'),
      },
      {
        id: 'search-files',
        label: 'Search files',
        keywords: ['search', 'files', 'find', 'file'],
        icon: <FileIcon className="h-4 w-4 shrink-0 text-gray-500" />,
        action: () => navigate('/'),
      },
      {
        id: 'search-folders',
        label: 'Search folders',
        keywords: ['search', 'folders', 'find', 'folder'],
        icon: <FolderIcon className="h-4 w-4 shrink-0 text-gray-500" />,
        action: () => navigate('/'),
      },
      {
        id: 'new-research',
        label: 'Create new research',
        keywords: ['create', 'new', 'research', 'start'],
        icon: <ResearchIcon className="h-4 w-4 shrink-0 text-gray-500" />,
        shortcut: 'N',
        action: () => navigate('/research'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        keywords: ['settings', 'preferences', 'config', 'profile'],
        icon: <SettingsIcon className="h-4 w-4 shrink-0 text-gray-500" />,
        shortcut: 'S',
        action: () => navigate('/settings'),
      },
    ],
    [navigate]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q))
    )
  }, [commands, query])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const runCommand = useCallback(
    (cmd: Command) => {
      cmd.action()
      closePalette()
    },
    [closePalette]
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePalette()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(1, filtered.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length))
        return
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        runCommand(filtered[selectedIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closePalette, filtered, selectedIndex, runCommand])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const item = el.querySelector(`[data-index="${selectedIndex}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, filtered.length])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-hidden
        onClick={closePalette}
      />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-[opacity,transform] duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <SearchIcon className="h-5 w-5 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything..."
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-activedescendant={filtered[selectedIndex] ? `command-${filtered[selectedIndex].id}` : undefined}
          />
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 sm:inline-block">
            ESC
          </kbd>
        </div>
        <div
          id="command-list"
          ref={listRef}
          className="max-h-[min(60vh,320px)] overflow-y-auto py-2"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">No commands found.</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                data-index={i}
                id={`command-${cmd.id}`}
                role="option"
                aria-selected={i === selectedIndex}
                onClick={() => runCommand(cmd)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === selectedIndex ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {cmd.icon}
                <span className="min-w-0 flex-1 font-medium">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between text-[11px] text-gray-400">
          <span>Press ↑ ↓ to navigate</span>
          <span>Enter to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
