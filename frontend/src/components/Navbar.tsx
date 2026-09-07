import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  CircleHelp,
  CreditCard,
  LayoutPanelLeft,
  LogOut,
  PanelLeft,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  UserRound,
} from 'lucide-react'
import {
  AUTH_CHANGED_EVENT,
  getCurrentUserName,
  getCurrentUserEmail,
  getCurrentUserPhotoUrl,
  clearAuth,
} from '@/lib/auth'
import { profilePhotoUrl } from '@/lib/api'
import { BUCKET_PATH } from '@/lib/paths'
import { useBucket } from '@/contexts/BucketContext'

type NavbarProps = {
  sidebarOpen?: boolean
  onSidebarToggle?: () => void
  onOpenCommandPalette?: () => void
}

type NotificationItem = {
  id: string
  text: string
  time: string
  unread: boolean
}

const TIP_SEEN_KEY = 'cmr_command_palette_tip_seen'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? '⌘' : 'Ctrl'

const iconBtn =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-app-secondary transition-colors hover:bg-app-fill hover:text-app-label focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40'

export function Navbar({ sidebarOpen = true, onSidebarToggle, onOpenCommandPalette }: NavbarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const showSearchOnNarrow =
    location.pathname === '/research' || location.pathname.startsWith('/research/')
  const { items: bucketItems } = useBucket()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [displayName, setDisplayName] = useState(() => getCurrentUserName() ?? 'User')
  const [userEmail, setUserEmail] = useState(() => getCurrentUserEmail())
  const [profilePhotoFullUrl, setProfilePhotoFullUrl] = useState<string | null>(() => {
    const path = getCurrentUserPhotoUrl()
    return path ? profilePhotoUrl(path) : null
  })
  const [showCommandTip, setShowCommandTip] = useState(() => {
    try {
      return !localStorage.getItem(TIP_SEEN_KEY)
    } catch {
      return false
    }
  })
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsAnimated, setNotificationsAnimated] = useState(false)
  const [menuAnimated, setMenuAnimated] = useState(false)
  const dropdownBtnRef = useRef<HTMLButtonElement>(null)
  const dropdownMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => n.unread).length
  const initials = displayName.trim().charAt(0).toUpperCase() || 'U'

  useEffect(() => {
    const syncFromStorage = () => {
      setDisplayName(getCurrentUserName() ?? 'User')
      setUserEmail(getCurrentUserEmail())
      const path = getCurrentUserPhotoUrl()
      setProfilePhotoFullUrl(path ? profilePhotoUrl(path) : null)
    }

    syncFromStorage()
    window.addEventListener(AUTH_CHANGED_EVENT, syncFromStorage as EventListener)
    window.addEventListener('storage', syncFromStorage)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncFromStorage as EventListener)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        dropdownOpen &&
        !dropdownBtnRef.current?.contains(target) &&
        !dropdownMenuRef.current?.contains(target)
      ) {
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

  function handleSignOut() {
    clearAuth()
    setDropdownOpen(false)
    navigate('/signin')
  }

  function closeAndNavigate(to: string) {
    setDropdownOpen(false)
    navigate(to)
  }

  const notificationLabel =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <nav
      className="sticky top-0 z-20 border-b border-app-separator bg-app-surface/80 backdrop-blur-xl"
      aria-label="Main navigation"
    >
      <div className="flex h-14 w-full items-center gap-2 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {onSidebarToggle && (
            <button
              type="button"
              onClick={onSidebarToggle}
              className={iconBtn}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? (
                <PanelLeft size={18} strokeWidth={1.75} aria-hidden />
              ) : (
                <LayoutPanelLeft size={18} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          )}
          <Link
            to="/"
            className={iconBtn}
            aria-label="Home"
            title="Home"
          >
            <Sparkles size={18} strokeWidth={1.75} className="text-app-accent" aria-hidden />
          </Link>

          {onOpenCommandPalette && (
            <div
              className={`relative min-w-0 max-w-md flex-1 ${showSearchOnNarrow ? 'block' : 'hidden sm:block'}`}
            >
              <button
                type="button"
                onClick={handleOpenCommandPalette}
                className="flex h-9 w-full items-center gap-2 rounded-[10px] bg-app-fill px-3 text-left text-[13px] text-app-tertiary transition-colors hover:bg-app-fill-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
                aria-label="Search (Ctrl+K)"
              >
                <Search size={15} strokeWidth={1.75} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Search files, folders, and pages</span>
                <kbd className="hidden shrink-0 rounded-md bg-app-surface px-1.5 py-0.5 text-xs font-medium text-app-secondary ring-1 ring-app-separator sm:inline">
                  {isMac ? '⌘K' : 'Ctrl+K'}
                </kbd>
              </button>
              {showCommandTip && (
                <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-app-separator bg-app-elevated px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                  <p className="text-[13px] font-semibold text-app-label">Search from anywhere</p>
                  <p className="mt-0.5 text-xs text-app-secondary">
                    Press Ctrl+K to jump to files, research, and settings.
                  </p>
                  <button
                    type="button"
                    onClick={dismissCommandTip}
                    className="mt-2 text-[13px] font-medium text-app-accent hover:text-app-accent-hover"
                  >
                    Got it
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            to="/settings/billing"
            className="hidden h-8 items-center rounded-full bg-app-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-app-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 sm:inline-flex"
          >
            Upgrade
          </Link>

          <Link
            to={BUCKET_PATH}
            className={`${iconBtn} relative`}
            aria-label={
              bucketItems.length > 0 ? `Bucket, ${bucketItems.length} items` : 'Bucket'
            }
            title="Bucket"
          >
            <ShoppingCart size={18} strokeWidth={1.75} aria-hidden />
            {bucketItems.length > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-app-accent px-1 text-[11px] font-semibold leading-none text-white">
                {bucketItems.length > 9 ? '9+' : bucketItems.length}
              </span>
            )}
          </Link>

          <div className="relative" ref={helpRef}>
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              className={iconBtn}
              aria-label="Help"
              aria-expanded={helpOpen}
              aria-haspopup="true"
            >
              <CircleHelp size={18} strokeWidth={1.75} aria-hidden />
            </button>
            {helpOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-app-separator bg-app-elevated py-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                <div className="px-4 py-2">
                  <h3 className="text-xs font-semibold tracking-[0.04em] text-app-tertiary">
                    Keyboard shortcuts
                  </h3>
                </div>
                <div className="space-y-1.5 px-4 pb-2 text-[13px]">
                  <ShortcutRow label="Search" keys={`${modKey} + K`} />
                  <ShortcutRow label="Settings" keys={`${modKey} + ,`} />
                  <ShortcutRow label="Help" keys={`${modKey} + /`} />
                  <ShortcutRow label="Close" keys="Esc" />
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((o) => !o)}
              className={`${iconBtn} relative`}
              aria-label={notificationLabel}
              aria-expanded={notificationsOpen}
              aria-haspopup="true"
            >
              <Bell size={18} strokeWidth={1.75} aria-hidden />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-app-accent" aria-hidden />
              )}
            </button>

            {notificationsOpen && (
              <div
                className={`absolute right-0 top-full z-50 mt-1.5 w-80 origin-top-right rounded-xl border border-app-separator bg-app-elevated shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-200 ease-out ${notificationsAnimated ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                role="dialog"
                aria-label="Notifications"
              >
                <div className="px-4 py-3">
                  <h3 className="text-[13px] font-semibold text-app-label">Notifications</h3>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Bell size={22} strokeWidth={1.5} className="mx-auto text-app-tertiary" aria-hidden />
                      <p className="mt-2 text-[13px] font-medium text-app-label">No notifications</p>
                      <p className="mt-0.5 text-xs text-app-secondary">
                        Updates about research and orders will show up here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-app-fill focus:bg-app-fill focus:outline-none"
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] ${n.unread ? 'font-semibold text-app-label' : 'text-app-label'}`}>
                            {n.unread && (
                              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-app-accent align-middle" aria-hidden />
                            )}
                            {n.text}
                          </p>
                          <p className="mt-0.5 text-xs text-app-secondary">{n.time}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="flex items-center justify-between gap-2 border-t border-app-separator px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))}
                      className="text-xs font-medium text-app-accent hover:underline disabled:opacity-50"
                      disabled={!notifications.some((n) => n.unread)}
                    >
                      Mark all as read
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifications([])}
                      className="text-xs font-medium text-app-secondary hover:text-app-label"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative ml-1 pl-2">
            <span className="absolute left-0 top-1/2 h-5 w-px -translate-y-1/2 bg-app-separator" aria-hidden />
            <button
              ref={dropdownBtnRef}
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex h-9 items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 text-app-label hover:bg-app-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
              aria-label="Workspace and account menu"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-accent text-xs font-semibold text-white">
                {profilePhotoFullUrl ? (
                  <img src={profilePhotoFullUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="hidden min-w-0 text-left sm:block">
                <p className="truncate text-[13px] font-semibold leading-tight text-app-label">{displayName}</p>
                <p className="truncate text-xs leading-tight text-app-secondary" title={userEmail ?? undefined}>
                  {userEmail ?? `${displayName}'s Workspace`}
                </p>
              </div>
              <ChevronDown size={14} strokeWidth={2} className="hidden text-app-tertiary sm:block" aria-hidden />
            </button>

            {dropdownOpen &&
              createPortal(
                <div
                  ref={dropdownMenuRef}
                  style={{
                    position: 'fixed',
                    zIndex: 9999,
                    top: (dropdownBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
                    left: Math.max(
                      8,
                      Math.min(
                        (dropdownBtnRef.current?.getBoundingClientRect().right ?? 260) - 260,
                        window.innerWidth - 268
                      )
                    ),
                  }}
                  className={`w-[260px] origin-top-right rounded-xl border border-app-separator bg-app-elevated py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-200 ease-out ${menuAnimated ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                  role="menu"
                >
                  <MenuItem
                    icon={UserRound}
                    label="Profile"
                    onClick={() => closeAndNavigate('/settings/profile')}
                  />
                  <MenuItem
                    icon={LayoutPanelLeft}
                    label="Workspace"
                    onClick={() => closeAndNavigate('/')}
                  />
                  <MenuItem
                    icon={CreditCard}
                    label="Billing"
                    onClick={() => closeAndNavigate('/settings/billing')}
                  />
                  <MenuItem
                    icon={Settings}
                    label="Settings"
                    onClick={() => closeAndNavigate('/settings/profile')}
                    shortcut={isMac ? '⌘,' : 'Ctrl+,'}
                  />
                  <div className="my-1.5 border-t border-app-separator" aria-hidden />
                  <MenuItem icon={LogOut} label="Log out" onClick={handleSignOut} />
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>
    </nav>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-app-secondary">{label}</span>
      <kbd className="shrink-0 rounded-md bg-app-fill px-1.5 py-0.5 text-xs font-medium text-app-label">
        {keys}
      </kbd>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  icon: typeof UserRound
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-app-label transition-colors hover:bg-app-fill focus:bg-app-fill focus:outline-none"
      role="menuitem"
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-app-secondary" aria-hidden />
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? <span className="text-xs text-app-tertiary">{shortcut}</span> : null}
    </button>
  )
}
