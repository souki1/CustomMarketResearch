import { useEffect, useState } from 'react'
import { getCurrentUserName } from '@/lib/auth'

const icon3DClass = 'icon-3d shrink-0 rounded-lg p-3'

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

type FileTab = 'all' | 'recents' | 'favourites'

export function HomePage() {
  const [displayName, setDisplayName] = useState(() => getCurrentUserName() ?? 'there')
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTab, setFileTab] = useState<FileTab>('all')

  useEffect(() => {
    const stored = getCurrentUserName()
    if (stored) setDisplayName(stored)
  }, [])

  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col pl-3 pr-6 py-6">
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

        {/* CARD SIZE – Width: w-80. Padding: p-4. Gap between cards: gap-5. Icon/text gap: gap-4. Icon: h-8 w-8, p-3. */}
        <div className="mt-4 flex flex-wrap gap-5">
          {FEATURE_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              className="flex w-80 flex-row items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-md transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1"
            >
              {card.icon}
              <div className="min-w-10 flex-1">
                <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                <p className="mt-1 text-xs leading-snug text-gray-500">{card.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-6 border-b border-gray-200">
          {(['all', 'recents', 'favourites'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFileTab(tab)}
              className={`pb-2.5 text-sm font-medium transition-colors focus:outline-none ${
                fileTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600 -mb-px'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'all' ? 'All files' : tab === 'recents' ? 'Recents' : 'Favorites'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
