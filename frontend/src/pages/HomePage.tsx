import { useEffect, useState } from 'react'
import { getCurrentUserName } from '@/lib/auth'

export function HomePage() {
  const [displayName, setDisplayName] = useState('there')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const stored = getCurrentUserName()
    if (stored) setDisplayName(stored)
  }, [])

  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col gap-3 pl-5 pr-6 py-6">
        <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">
          Hey {displayName}, ready to get started?
        </h1>

        <div className="flex w-full max-w-xl items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5">
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
      </div>
    </div>
  )
}
