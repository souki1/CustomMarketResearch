import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUserName, getCurrentUserEmail, clearAuth } from '@/lib/auth'
import { useBucket, type BucketItem } from '@/contexts/BucketContext'

function NavbarIcon() {
  return (
    <svg className="w-6 h-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function CreditsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  )
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function WorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function BillingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  )
}

function BucketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function SidebarPanelIcon({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Left panel (sidebar): filled when open, outline when closed */}
      <rect x="2" y="4" width="8" height="16" rx="1.5" className={open ? 'fill-gray-300 stroke-gray-400' : ''} />
      {/* Right area (content) */}
      <rect x="13" y="4" width="9" height="16" rx="1.5" />
    </svg>
  )
}

type NavbarProps = {
  sidebarOpen?: boolean
  onSidebarToggle?: () => void
  onOpenCommandPalette?: () => void
}

function NotificationIconSuccess({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
function NotificationIconFolder({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}
function NotificationIconWarning({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}
function NotificationIconSystem({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

type NotificationIconType = 'success' | 'folder' | 'warning' | 'system'

function NotificationTypeIcon({ type, className }: { type: NotificationIconType; className?: string }) {
  const size = 'h-3.5 w-3.5 shrink-0'
  const c = className ?? `${size}`
  switch (type) {
    case 'success':
      return <NotificationIconSuccess className={`${c} text-emerald-500`} />
    case 'folder':
      return <NotificationIconFolder className={`${c} text-blue-500`} />
    case 'warning':
      return <NotificationIconWarning className={`${c} text-amber-500`} />
    case 'system':
      return <NotificationIconSystem className={`${c} text-gray-500`} />
    default:
      return null
  }
}

const SAMPLE_NOTIFICATIONS: { id: string; text: string; time: string; unread: boolean; icon: NotificationIconType }[] = [
  { id: '1', text: 'File uploaded successfully', time: '2 min ago', unread: true, icon: 'success' },
  { id: '2', text: 'Import completed', time: '1 hour ago', unread: true, icon: 'folder' },
  { id: '3', text: 'Price alert triggered', time: '3 hours ago', unread: true, icon: 'warning' },
  { id: '4', text: 'System update', time: 'Yesterday', unread: false, icon: 'system' },
]

const TIP_SEEN_KEY = 'cmr_command_palette_tip_seen'

export function Navbar({ sidebarOpen = true, onSidebarToggle, onOpenCommandPalette }: NavbarProps) {
  const navigate = useNavigate()
  const { items: bucketItems, removeItem, drawerOpen, setDrawerOpen } = useBucket()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showCommandTip, setShowCommandTip] = useState(() => {
    try {
      return !localStorage.getItem(TIP_SEEN_KEY)
    } catch {
      return false
    }
  })
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS)
  const [notificationsAnimated, setNotificationsAnimated] = useState(false)
  const [menuAnimated, setMenuAnimated] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)

  const displayName = getCurrentUserName() ?? 'User'
  const userEmail = getCurrentUserEmail()
  const workspaceLabel = `${displayName}'s Workspace`
  const unreadCount = notifications.filter((n) => n.unread).length


  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false)
      }
      if (helpRef.current && !helpRef.current.contains(target)) {
        setHelpOpen(false)
      }
    }
    if (dropdownOpen || notificationsOpen || helpOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen, notificationsOpen, helpOpen])

  useEffect(() => {
    if (!showCommandTip) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(TIP_SEEN_KEY, '1')
      } catch {
        // ignore
      }
      setShowCommandTip(false)
    }, 6000)
    return () => clearTimeout(t)
  }, [showCommandTip])

  function dismissCommandTip() {
    try {
      localStorage.setItem(TIP_SEEN_KEY, '1')
    } catch {
      // ignore
    }
    setShowCommandTip(false)
  }

  function handleOpenCommandPalette() {
    onOpenCommandPalette?.()
    dismissCommandTip()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setHelpOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (notificationsOpen) {
      setNotificationsAnimated(false)
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setNotificationsAnimated(true))
      })
      return () => cancelAnimationFrame(t)
    }
    setNotificationsAnimated(false)
  }, [notificationsOpen])

  useEffect(() => {
    if (dropdownOpen) {
      setMenuAnimated(false)
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setMenuAnimated(true))
      })
      return () => cancelAnimationFrame(t)
    }
    setMenuAnimated(false)
  }, [dropdownOpen])

  function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  function clearAllNotifications() {
    setNotifications([])
  }

  function handleSignOut() {
    clearAuth()
    setDropdownOpen(false)
    navigate('/signin')
  }

  function closeAndNavigate(to: string) {
    setDropdownOpen(false)
    navigate(to)
  }
  return (
    <>
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white" aria-label="Main navigation">
      <div className="w-full max-w-8xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-11 gap-2">
          <div className="flex items-center gap-1">
            {onSidebarToggle && (
              <button
                type="button"
                onClick={onSidebarToggle}
                className="flex items-center justify-center p-1.5 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors cursor-pointer"
                aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <SidebarPanelIcon className="w-5 h-5" open={sidebarOpen} />
              </button>
            )}
            <button
              type="button"
              className="flex items-center justify-center p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors cursor-pointer"
              aria-label="Home"
            >
              <NavbarIcon />
            </button>

            {onOpenCommandPalette && (
              <div className="relative hidden sm:block flex-1 min-w-0 max-w-md mx-4" ref={searchBarRef}>
                <button
                  type="button"
                  onClick={handleOpenCommandPalette}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-left text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1"
                  aria-label="Search (Ctrl+K)"
                >
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">Search files, folders, templates...</span>
                  <kbd className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-gray-500 bg-[#F3F4F6] border border-gray-200/80">
                    Ctrl + K
                  </kbd>
                </button>
                {showCommandTip && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                    <p className="text-xs font-medium text-gray-900">Tip 💡</p>
                    <p className="mt-0.5 text-xs text-gray-600">Press Ctrl + K to quickly search anything.</p>
                    <button
                      type="button"
                      onClick={dismissCommandTip}
                      className="mt-2 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      Got it
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0 ml-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors cursor-pointer"
            >
              <StarIcon className="w-3.5 h-3.5 text-white" />
              Upgrade your plan
            </button>

            <span className="h-4 w-px shrink-0 mx-2 bg-[#E5E7EB]" aria-hidden />

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 p-1 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
              aria-label="Bucket"
              title="Bucket"
            >
              <BucketIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium hidden sm:inline">
                Bucket{bucketItems.length > 0 ? ` (${bucketItems.length})` : ''}
              </span>
              {bucketItems.length > 0 && (
                <span className="sm:hidden flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-100 text-blue-700 px-1 text-[10px] font-semibold">
                  {bucketItems.length > 9 ? '9+' : bucketItems.length}
                </span>
              )}
            </button>

            <span className="h-4 w-px shrink-0 mx-2 bg-[#E5E7EB]" aria-hidden />

            <button
              type="button"
              className="inline-flex items-center gap-1.5 p-1 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
              aria-label="Credits"
            >
              <CreditsIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium hidden sm:inline">Credits</span>
            </button>

            <span className="h-4 w-px shrink-0 mx-2 bg-[#E5E7EB]" aria-hidden />

            <div className="relative" ref={helpRef}>
              <button
                type="button"
                onClick={() => setHelpOpen((o) => !o)}
                className="flex items-center justify-center w-8 h-8 p-1 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
                aria-label="Help"
                aria-expanded={helpOpen}
                aria-haspopup="true"
              >
                <HelpIcon className="w-4 h-4" />
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-sm z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Keyboard shortcuts</h3>
                  </div>
                  <div className="px-4 py-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-700">Open command search</span>
                      <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Ctrl + K</kbd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-700">Open help</span>
                      <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Ctrl + /</kbd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-700">Close modal</span>
                      <kbd className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Esc</kbd>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <span className="h-4 w-px shrink-0 mx-2 bg-[#E5E7EB]" aria-hidden />

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((o) => !o)}
                className="relative flex items-center justify-center w-8 h-8 p-1 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
              >
                <BellIcon className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white"
                    aria-hidden
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  className={`absolute right-0 top-full mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-sm z-50 origin-top-right transition-[opacity,transform] duration-200 ease-out ${notificationsAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                  role="dialog"
                  aria-label="Notifications"
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">
                        No notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer hover:bg-gray-50 focus:outline-none focus:bg-gray-50 ${n.unread ? 'bg-gray-50' : ''}`}
                        >
                          <NotificationTypeIcon type={n.icon} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${n.unread ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>
                              {n.unread && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" aria-hidden />}
                              {n.text}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">{n.time}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-gray-100 px-3 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:underline disabled:opacity-50"
                      disabled={notifications.length === 0 || !notifications.some((n) => n.unread)}
                    >
                      Mark all as read
                    </button>
                    <button
                      type="button"
                      onClick={clearAllNotifications}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:underline disabled:opacity-50"
                      disabled={notifications.length === 0}
                    >
                      Clear all
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:underline"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="h-4 w-px shrink-0 mx-2 bg-[#E5E7EB]" aria-hidden />

            <div className="relative pl-1 ml-3" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 p-1 pr-2 text-gray-700 hover:bg-gray-100 focus:outline-none cursor-pointer"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                aria-label="Workspace and account menu"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-700 text-white text-xs font-semibold shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{displayName}</p>
                  <p className="text-xs text-[#6B7280] leading-tight truncate" title={userEmail ?? undefined}>
                    {userEmail ?? workspaceLabel}
                  </p>
                </div>
              </button>

              {dropdownOpen && (
                <div
                  className={`absolute right-0 top-full mt-1 w-[260px] rounded-xl border border-gray-200 bg-white py-1.5 shadow-sm z-50 origin-top-right transition-[opacity,transform] duration-200 ease-out ${menuAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                  role="menu"
                >
                  <Link
                    to="/settings/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    role="menuitem"
                  >
                    <UserIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    My Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => closeAndNavigate('/')}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    role="menuitem"
                  >
                    <WorkspaceIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    Workspace
                  </button>
                  <Link
                    to="/settings/billing"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    role="menuitem"
                  >
                    <BillingIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    Billing
                  </Link>
                  <Link
                    to="/settings/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    role="menuitem"
                  >
                    <SettingsIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    Settings
                  </Link>
                  <div className="my-2 border-t border-gray-200" aria-hidden />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
                    role="menuitem"
                  >
                    <SignOutIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>

    {drawerOpen && (
      <BucketDrawer
        items={bucketItems}
        onRemove={removeItem}
        onClose={() => setDrawerOpen(false)}
        onViewDetails={() => { setDrawerOpen(false); navigate('/research'); }}
        onCompare={() => { setDrawerOpen(false); navigate('/research'); }}
      />
    )}
    </>
  )
}

function BucketDrawer({
  items,
  onRemove,
  onClose,
  onViewDetails,
  onCompare,
}: {
  items: BucketItem[]
  onRemove: (id: string) => void
  onClose: () => void
  onViewDetails: (item: BucketItem) => void
  onCompare: (item: BucketItem) => void
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl animate-[slideInRight_0.2s_ease-out]"
        style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}
        role="dialog"
        aria-label="Bucket"
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Bucket ({items.length})</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No items in bucket. Add items from the Research inspector.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <p className="font-medium text-gray-900 truncate">{item.title || '—'}</p>
                  <p className="mt-0.5 text-sm text-gray-600 truncate">Manufacturer: {item.manufacturer || '—'}</p>
                  <p className="mt-0.5 text-sm text-gray-700">Price: {item.price || '—'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewDetails(item)}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompare(item)}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Compare
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
