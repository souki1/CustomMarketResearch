import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUserName, clearAuth } from '@/lib/auth'

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

export function Navbar() {
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const displayName = getCurrentUserName() ?? 'User'
  const workspaceLabel = `${displayName}'s Workspace`

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  function handleSignOut() {
    clearAuth()
    setDropdownOpen(false)
    navigate('/signin')
  }
  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white" aria-label="Main navigation">
      <div className="w-full max-w-8xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-11 gap-2">
          <button
            type="button"
            className="flex items-center justify-center p-1.5 -ml-1.5 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors cursor-pointer"
            aria-label="Home"
          >
            <NavbarIcon />
          </button>

          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors cursor-pointer"
            >
              <StarIcon className="w-3.5 h-3.5 text-white" />
              Upgrade your plan
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
              aria-label="Credits"
            >
              <CreditsIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium hidden sm:inline">Credits</span>
            </button>

            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
              aria-label="Help"
            >
              <HelpIcon className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="relative flex items-center justify-center w-7 h-7 rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <BellIcon className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden />
            </button>

            <div className="relative pl-1.5 border-l border-gray-200" ref={dropdownRef}>
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
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{displayName}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{workspaceLabel}</p>
                </div>
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-64 border border-gray-200 bg-white py-2 shadow-lg z-50"
                  role="menu"
                >
                  <p className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Workspaces
                  </p>
                  <div className="flex items-center gap-3 px-4 py-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600 text-white text-xs font-semibold shrink-0">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                      {workspaceLabel}
                    </span>
                    <CheckIcon className="w-4 h-4 text-gray-900 shrink-0" />
                  </div>
                  <div className="border-t border-gray-100 my-2" />
                  <p className="px-4 py-1 text-xs text-gray-500 truncate" title="Signed in">
                    Signed in as {displayName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                    role="menuitem"
                  >
                    <SettingsIcon className="w-4 h-4 text-gray-500" />
                    Settings...
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                    role="menuitem"
                  >
                    <SignOutIcon className="w-4 h-4 text-gray-500" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
