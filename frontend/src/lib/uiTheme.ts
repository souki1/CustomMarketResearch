export type UiThemeId = 'sky' | 'purple' | 'dark'

export const UI_THEME_STORAGE_KEY = 'cmr_ui_theme'

/** Reference accents: purple dashboard ≈ #7c3aed (violet-600) */
export const UI_THEME_OPTIONS: {
  id: UiThemeId
  label: string
  blurb: string
  /** Short label on theme picker */
  pickerLabel: string
  preview: string[]
}[] = [
  {
    id: 'sky',
    label: 'Light blue',
    blurb: 'Glassmorphism — frosted panels on soft blue depth',
    pickerLabel: 'Blue',
    preview: ['#38bdf8', '#7dd3fc', '#e0f2fe'],
  },
  {
    id: 'purple',
    label: 'Light purple',
    blurb: 'Sensei-style — lavender shell, crisp white cards',
    pickerLabel: 'Purple',
    preview: ['#a78bfa', '#c4b5fd', '#ede9fe'],
  },
  {
    id: 'dark',
    label: 'Dark',
    blurb: 'Dashdark-style — charcoal base, purple & cyan accents',
    pickerLabel: 'Dark',
    preview: ['#0b0e14', '#c65dfb', '#23d3ee'],
  },
]

export function readStoredUiTheme(): UiThemeId {
  try {
    const v = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (v === 'purple' || v === 'sky' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'sky'
}

type Shell = {
  sidebar: string
  linkFocus: string
  linkActive: string
  linkInactive: string
  icon: string
}

export const THEME_SHELL: Record<UiThemeId, Shell> = {
  sky: {
    sidebar:
      'border-r border-white/50 bg-sky-100/20 backdrop-blur-2xl shadow-[inset_-1px_0_0_rgba(255,255,255,0.35)]',
    linkFocus: 'focus:ring-sky-400/45',
    linkActive:
      'border border-white/65 bg-white/55 backdrop-blur-xl text-slate-900 shadow-lg shadow-sky-900/15 ring-1 ring-white/40',
    linkInactive:
      'border border-transparent text-slate-700 hover:border-white/35 hover:bg-white/35 hover:backdrop-blur-md',
    icon: 'h-5 w-5 shrink-0 text-sky-700',
  },
  purple: {
    sidebar:
      'border-r border-violet-200/55 bg-gradient-to-b from-violet-200/50 via-violet-100/45 to-violet-50/35 backdrop-blur-md',
    linkFocus: 'focus:ring-violet-500/45',
    linkActive:
      'border border-violet-100/90 bg-white text-violet-950 shadow-md shadow-violet-500/20 ring-1 ring-violet-200/40',
    linkInactive:
      'border border-transparent text-violet-900/85 hover:border-violet-200/50 hover:bg-white/70',
    icon: 'h-5 w-5 shrink-0 text-[#7c3aed]',
  },
  dark: {
    sidebar:
      'border-r border-slate-800/90 bg-[#0c0f14] shadow-[inset_-1px_0_0_rgba(148,163,184,0.08)] backdrop-blur-xl',
    linkFocus: 'focus:ring-[#c65dfb]/45',
    linkActive:
      'border border-slate-700/80 bg-[#161b26] text-slate-50 shadow-lg shadow-black/40 ring-1 ring-[#c65dfb]/30',
    linkInactive:
      'border border-transparent text-slate-400 hover:border-slate-700/70 hover:bg-[#161b26]/80 hover:text-slate-200',
    icon: 'h-5 w-5 shrink-0 text-[#c65dfb]',
  },
}

export function sidebarNavLinkClass(theme: UiThemeId, active: boolean, collapsed: boolean): string {
  const s = THEME_SHELL[theme]
  const base = collapsed
    ? 'flex items-center justify-center rounded-2xl p-2.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-inset'
    : 'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-inset'
  return `${base} ${s.linkFocus} ${active ? s.linkActive : s.linkInactive}`
}

type NavbarShell = {
  bar: string
  logoIcon: string
  searchTrigger: string
  searchKbd: string
  iconButton: string
  verticalRule: string
  upgradeCta: string
  accountTrigger: string
  tipLink: string
  accentLink: string
  notifBadge: string
  mobileBucketBadge: string
  unreadPip: string
}

export const THEME_NAVBAR: Record<UiThemeId, NavbarShell> = {
  sky: {
    bar: 'border-b border-white/45 bg-white/40 backdrop-blur-2xl shadow-sm shadow-sky-900/10 ring-1 ring-white/30',
    logoIcon: 'text-sky-800',
    searchTrigger:
      'flex w-full items-center gap-2 rounded-lg border border-white/50 bg-white/35 px-3 py-1.5 text-left text-sm text-slate-600 shadow-inner shadow-sky-900/5 backdrop-blur-md transition-colors hover:border-white/60 hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-sky-400/35 focus:ring-offset-1',
    searchKbd:
      'shrink-0 rounded border border-white/45 bg-white/50 px-1.5 py-0.5 text-xs font-medium text-slate-500',
    iconButton:
      'text-slate-600 hover:bg-white/45 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400/40',
    verticalRule: 'bg-white/50',
    upgradeCta:
      'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1',
    accountTrigger:
      'flex cursor-pointer items-center gap-2 p-1 pr-2 text-slate-800 hover:bg-white/45 focus:outline-none',
    tipLink: 'mt-2 text-[11px] font-medium text-sky-600 hover:text-sky-800 focus:outline-none focus:underline',
    accentLink: 'text-xs font-medium text-sky-600 hover:text-sky-800 focus:outline-none focus:underline',
    notifBadge: 'bg-sky-600',
    mobileBucketBadge: 'bg-sky-100 text-sky-800',
    unreadPip: 'bg-sky-500',
  },
  purple: {
    bar: 'border-b border-violet-200/55 bg-gradient-to-r from-violet-100/50 via-violet-50/35 to-fuchsia-50/30 backdrop-blur-2xl shadow-sm shadow-violet-500/12 ring-1 ring-violet-200/45',
    logoIcon: 'text-violet-900',
    searchTrigger:
      'flex w-full items-center gap-2 rounded-lg border border-violet-200/70 bg-violet-100/40 px-3 py-1.5 text-left text-sm text-violet-900/80 shadow-sm shadow-violet-500/5 backdrop-blur-md transition-colors hover:border-violet-300/75 hover:bg-violet-100/55 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:ring-offset-1',
    searchKbd:
      'shrink-0 rounded border border-violet-200/70 bg-violet-100/90 px-1.5 py-0.5 text-xs font-medium text-violet-800',
    iconButton:
      'text-violet-900 hover:bg-violet-200/45 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400/45',
    verticalRule: 'bg-violet-300/50',
    upgradeCta:
      'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#7c3aed] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1',
    accountTrigger:
      'flex cursor-pointer items-center gap-2 p-1 pr-2 text-violet-950 hover:bg-violet-100/60 focus:outline-none',
    tipLink: 'mt-2 text-[11px] font-medium text-violet-600 hover:text-violet-800 focus:outline-none focus:underline',
    accentLink: 'text-xs font-medium text-violet-600 hover:text-violet-800 focus:outline-none focus:underline',
    notifBadge: 'bg-[#7c3aed]',
    mobileBucketBadge: 'bg-violet-100 text-violet-900',
    unreadPip: 'bg-violet-600',
  },
  dark: {
    bar: 'border-b border-slate-800 bg-[#0c0f14]/95 backdrop-blur-xl shadow-sm shadow-black/50',
    logoIcon: 'text-[#c65dfb]',
    searchTrigger:
      'flex w-full items-center gap-2 rounded-lg border border-slate-700/90 bg-[#161b26] px-3 py-1.5 text-left text-sm text-slate-300 shadow-inner shadow-black/30 transition-colors hover:border-slate-600 hover:bg-[#1a2030] focus:outline-none focus:ring-2 focus:ring-[#c65dfb]/35 focus:ring-offset-0 focus:ring-offset-[#0c0f14]',
    searchKbd:
      'shrink-0 rounded border border-slate-600 bg-[#0f1219] px-1.5 py-0.5 text-xs font-medium text-slate-400',
    iconButton:
      'text-slate-300 hover:bg-slate-800/90 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#c65dfb]/35',
    verticalRule: 'bg-slate-700/55',
    upgradeCta:
      'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#c65dfb] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#b855f0] focus:outline-none focus:ring-2 focus:ring-[#c65dfb] focus:ring-offset-1 focus:ring-offset-[#0c0f14]',
    accountTrigger:
      'flex cursor-pointer items-center gap-2 p-1 pr-2 text-slate-100 hover:bg-slate-800/80 focus:outline-none',
    tipLink: 'mt-2 text-[11px] font-medium text-[#23d3ee] hover:text-cyan-300 focus:outline-none focus:underline',
    accentLink: 'text-xs font-medium text-[#23d3ee] hover:text-cyan-300 focus:outline-none focus:underline',
    notifBadge: 'bg-[#c65dfb]',
    mobileBucketBadge: 'bg-slate-800 text-[#c65dfb]',
    unreadPip: 'bg-[#23d3ee]',
  },
}

type SettingsShell = {
  rail: string
  navActive: string
  navInactive: string
}

export const THEME_SETTINGS_RAIL: Record<UiThemeId, SettingsShell> = {
  sky: {
    rail: 'border-r border-white/45 bg-sky-100/25 backdrop-blur-xl',
    navActive:
      'border-l-2 border-sky-600 bg-white/60 backdrop-blur-lg font-semibold text-slate-900 shadow-md shadow-sky-900/10 ring-1 ring-white/40',
    navInactive:
      'border-l-2 border-transparent font-medium text-slate-600 hover:bg-white/40 hover:backdrop-blur-sm',
  },
  purple: {
    rail: 'border-r border-violet-200/55 bg-gradient-to-b from-violet-100/40 to-violet-50/25 backdrop-blur-sm',
    navActive:
      'border-l-2 border-violet-600 bg-white font-semibold text-violet-950 shadow-md shadow-violet-500/15',
    navInactive:
      'border-l-2 border-transparent font-medium text-violet-900/80 hover:bg-white/65',
  },
  dark: {
    rail: 'border-r border-slate-800 bg-[#0c0f14]',
    navActive:
      'border-l-2 border-[#c65dfb] bg-[#161b26] font-semibold text-slate-50 shadow-md shadow-black/40',
    navInactive:
      'border-l-2 border-transparent font-medium text-slate-400 hover:bg-[#161b26]/70 hover:text-slate-200',
  },
}

type CardShell = {
  surface: string
  focusRing: string
  rounded: string
  buttonHoverShadow: string
}

export const THEME_CARD: Record<UiThemeId, CardShell> = {
  sky: {
    rounded: 'rounded-3xl',
    surface:
      'border border-white/70 bg-white/50 backdrop-blur-2xl shadow-xl shadow-sky-900/[0.1] ring-1 ring-white/35',
    focusRing: 'focus:ring-sky-400/35',
    buttonHoverShadow: 'hover:shadow-2xl hover:shadow-sky-900/[0.12]',
  },
  purple: {
    rounded: 'rounded-2xl',
    surface:
      'border border-violet-100/95 bg-white shadow-lg shadow-violet-500/[0.12] ring-1 ring-violet-950/[0.04]',
    focusRing: 'focus:ring-violet-500/40',
    buttonHoverShadow: 'hover:shadow-xl hover:shadow-violet-500/20',
  },
  dark: {
    rounded: 'rounded-2xl',
    surface:
      'border border-slate-700/80 bg-[#161b26] shadow-xl shadow-black/35 ring-1 ring-slate-600/30',
    focusRing: 'focus:ring-[#c65dfb]/40',
    buttonHoverShadow: 'hover:shadow-xl hover:shadow-[#c65dfb]/15',
  },
}

type PrimaryCta = {
  generateReport: string
}

export const THEME_PRIMARY_CTA: Record<UiThemeId, PrimaryCta> = {
  sky: {
    generateReport:
      'border-2 border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-600/30 hover:border-sky-700 hover:bg-sky-700 focus-visible:ring-sky-400',
  },
  purple: {
    generateReport:
      'border-2 border-[#7c3aed] bg-[#7c3aed] text-white shadow-lg shadow-violet-600/35 hover:border-violet-700 hover:bg-violet-700 focus-visible:ring-violet-500',
  },
  dark: {
    generateReport:
      'border-2 border-[#c65dfb] bg-[#c65dfb] text-white shadow-lg shadow-[#c65dfb]/35 hover:border-[#d876ff] hover:bg-[#d876ff] focus-visible:ring-[#c65dfb]',
  },
}

type HomeChrome = {
  searchBar: string
  searchSubmit: string
  homeTabActive: string
  homeTabInactive: string
  fileTabsBorder: string
  themeToggleWrap: string
}

export const THEME_HOME: Record<UiThemeId, HomeChrome> = {
  sky: {
    searchBar:
      'rounded-full border border-white/55 bg-white/45 backdrop-blur-xl shadow-inner shadow-sky-900/5 ring-1 ring-white/30',
    searchSubmit:
      'bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-400 focus:ring-offset-1 shadow-md shadow-sky-600/25',
    homeTabActive: 'border-b-2 border-sky-600 text-sky-800 -mb-px',
    homeTabInactive: 'text-slate-600 hover:text-slate-900',
    fileTabsBorder: 'border-white/40',
    themeToggleWrap: 'border-white/50 bg-white/40 backdrop-blur-lg ring-1 ring-white/25',
  },
  purple: {
    searchBar:
      'rounded-2xl border border-violet-200/60 bg-white/92 shadow-md shadow-violet-500/10',
    searchSubmit:
      'bg-[#7c3aed] text-white hover:bg-violet-700 focus:ring-violet-500 focus:ring-offset-1 shadow-md shadow-violet-600/30',
    homeTabActive: 'border-b-2 border-violet-600 text-violet-900 -mb-px',
    homeTabInactive: 'text-slate-600 hover:text-slate-900',
    fileTabsBorder: 'border-violet-200/45',
    themeToggleWrap: 'border-violet-200/70 bg-white/85 shadow-sm shadow-violet-500/10',
  },
  dark: {
    searchBar:
      'rounded-2xl border border-slate-700/90 bg-[#161b26] shadow-md shadow-black/40 ring-1 ring-slate-700/50',
    searchSubmit:
      'bg-[#c65dfb] text-white hover:bg-[#b855f0] focus:ring-[#c65dfb] focus:ring-offset-1 focus:ring-offset-[#0b0e14] shadow-md shadow-[#c65dfb]/25',
    homeTabActive: 'border-b-2 border-[#c65dfb] text-slate-100 -mb-px',
    homeTabInactive: 'text-slate-500 hover:text-slate-200',
    fileTabsBorder: 'border-slate-700/60',
    themeToggleWrap:
      'rounded-xl border border-slate-700/90 bg-[#0f1219] p-1 shadow-inner shadow-black/50 ring-1 ring-slate-800',
  },
}

type AuthPanel = {
  panel: string
}

export const THEME_AUTH: Record<UiThemeId, AuthPanel> = {
  sky: {
    panel:
      'border-white/60 bg-white/55 backdrop-blur-2xl shadow-2xl shadow-sky-900/15 ring-1 ring-white/40',
  },
  purple: {
    panel: 'border-violet-200/75 bg-white/96 shadow-2xl shadow-violet-500/20 ring-1 ring-violet-950/[0.05]',
  },
  dark: {
    panel:
      'border border-slate-700/90 bg-[#161b26] shadow-2xl shadow-black/50 ring-1 ring-slate-600/40',
  },
}

type ModalChrome = {
  panel: string
}

export const THEME_MODAL: Record<UiThemeId, ModalChrome> = {
  sky: {
    panel:
      'border border-white/60 bg-white/70 backdrop-blur-2xl shadow-2xl shadow-sky-900/20 ring-1 ring-white/40',
  },
  purple: {
    panel:
      'border border-violet-200/70 bg-white/95 shadow-2xl shadow-violet-500/15 ring-1 ring-violet-950/[0.04]',
  },
  dark: {
    panel:
      'border border-slate-700/90 bg-[#161b26] shadow-2xl shadow-black/50 ring-1 ring-[#c65dfb]/20',
  },
}

/** Portfolio / dense dashboards — stat cards & panels */
export function themePagePanelClasses(theme: UiThemeId): string {
  if (theme === 'purple') {
    return 'border border-violet-100/90 bg-white shadow-md shadow-violet-500/[0.1] ring-1 ring-violet-950/[0.03]'
  }
  if (theme === 'dark') {
    return 'border border-slate-700/80 bg-[#161b26] shadow-lg shadow-black/40 ring-1 ring-slate-600/35'
  }
  return 'border border-white/65 bg-white/50 backdrop-blur-xl shadow-lg shadow-sky-900/[0.08] ring-1 ring-white/35'
}

/** Home file list — compact search chip (not full pill) */
export function themeFilesSearchWrap(theme: UiThemeId): string {
  if (theme === 'purple') {
    return 'rounded-xl border border-violet-200/60 bg-white/92 shadow-md shadow-violet-500/10'
  }
  if (theme === 'dark') {
    return 'rounded-xl border border-slate-700/90 bg-[#161b26] shadow-md shadow-black/40 ring-1 ring-slate-700/50'
  }
  return 'rounded-xl border border-white/55 bg-white/45 backdrop-blur-xl shadow-inner shadow-sky-900/5 ring-1 ring-white/30'
}

type ResearchChrome = {
  pageRoot: string
  inspectorDocked: string
  inspectorMaximized: string
  primaryBtn: string
  primaryBtnCompact: string
  segmentActive: string
  segmentInactive: string
  toolGhost: string
  outlineTool: string
  compareCardOn: string
  compareCardOff: string
  loaderIcon: string
  tableHeadSticky: string
  tableBody: string
  tableRowSelected: string
  tableRowHover: string
  inspectorHeaderBar: string
  resizeHandle: string
  subtleWell: string
  filterBanner: string
  scrapedSourcePanel: string
  pillActive: string
  pillInactive: string
  pillGroup: string
  filePickerRow: string
}

export const THEME_RESEARCH: Record<UiThemeId, ResearchChrome> = {
  sky: {
    pageRoot: 'bg-transparent',
    inspectorDocked:
      'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/50 bg-white/45 backdrop-blur-xl shadow-[inset_1px_0_0_rgba(255,255,255,0.4)] ring-1 ring-white/25 animate-[slideInRight_0.2s_ease-out]',
    inspectorMaximized:
      'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden border border-white/55 bg-white/82 backdrop-blur-2xl shadow-2xl shadow-sky-900/20 ring-1 ring-white/35',
    primaryBtn:
      'rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 disabled:opacity-50',
    primaryBtnCompact: 'rounded-md bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700',
    segmentActive: 'bg-sky-600 text-white shadow-sm shadow-sky-600/25',
    segmentInactive: 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/90',
    toolGhost:
      'inline-flex items-center gap-1.5 rounded-lg bg-slate-100/85 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-50',
    outlineTool:
      'inline-flex items-center gap-1.5 rounded-lg border border-white/55 bg-white/45 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md ring-1 ring-white/25 hover:bg-white/65',
    compareCardOn: 'border border-sky-200 bg-sky-50/90',
    compareCardOff: 'border border-slate-200/90 hover:bg-sky-50/45',
    loaderIcon: 'text-sky-600',
    tableHeadSticky: 'sticky top-0 z-10 bg-sky-50/85 backdrop-blur-sm',
    tableBody: 'divide-y divide-slate-200/80 bg-white/70 backdrop-blur-sm',
    tableRowSelected: 'bg-sky-50/90',
    tableRowHover: 'hover:bg-sky-50/55',
    inspectorHeaderBar: 'flex shrink-0 items-center justify-end gap-1 border-b border-white/45 bg-sky-50/65 px-4 py-3 backdrop-blur-md',
    resizeHandle:
      'shrink-0 w-1.5 cursor-col-resize border-l border-white/40 bg-slate-200/40 hover:bg-sky-200/60 active:bg-sky-300/70 transition-colors',
    subtleWell: 'rounded-lg border border-sky-200/60 bg-sky-50/55 p-8 text-center text-sm text-gray-500',
    filterBanner: 'rounded-lg border border-sky-200/60 bg-sky-50/55 p-3 text-sm text-gray-600',
    scrapedSourcePanel: 'rounded-lg border border-sky-100/90 bg-sky-50/45 p-3',
    pillActive: 'bg-sky-200/75 text-slate-900',
    pillInactive: 'text-gray-600 hover:bg-sky-100/70',
    pillGroup: 'flex rounded-lg border border-white/45 bg-white/25 p-0.5 backdrop-blur-sm',
    filePickerRow:
      'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-sky-100/80 hover:text-sky-950',
  },
  purple: {
    pageRoot: 'bg-transparent',
    inspectorDocked:
      'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-violet-200/70 bg-white/92 shadow-[inset_1px_0_0_rgba(255,255,255,0.9)] ring-1 ring-violet-950/[0.04] animate-[slideInRight_0.2s_ease-out]',
    inspectorMaximized:
      'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden border border-violet-200/70 bg-white/95 shadow-2xl shadow-violet-500/18 ring-1 ring-violet-950/[0.05]',
    primaryBtn:
      'rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 disabled:opacity-50',
    primaryBtnCompact: 'rounded-md bg-[#7c3aed] px-3 text-xs font-semibold text-white hover:bg-violet-700',
    segmentActive: 'bg-[#7c3aed] text-white shadow-sm shadow-violet-600/30',
    segmentInactive: 'bg-violet-100/75 text-violet-900 hover:bg-violet-100',
    toolGhost:
      'inline-flex items-center gap-1.5 rounded-lg bg-violet-100/65 px-3 py-1.5 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50',
    outlineTool:
      'inline-flex items-center gap-1.5 rounded-lg border border-violet-200/80 bg-white/92 px-3 py-1.5 text-sm font-medium text-violet-900 shadow-sm shadow-violet-500/10 hover:bg-violet-50/80',
    compareCardOn: 'border border-violet-200 bg-violet-50',
    compareCardOff: 'border border-violet-100/90 hover:bg-violet-50/55',
    loaderIcon: 'text-violet-600',
    tableHeadSticky: 'sticky top-0 z-10 bg-violet-50/90 backdrop-blur-sm',
    tableBody: 'divide-y divide-violet-100/90 bg-white',
    tableRowSelected: 'bg-violet-50/90',
    tableRowHover: 'hover:bg-violet-50/50',
    inspectorHeaderBar:
      'flex shrink-0 items-center justify-end gap-1 border-b border-violet-200/55 bg-violet-50/80 px-4 py-3 backdrop-blur-sm',
    resizeHandle:
      'shrink-0 w-1.5 cursor-col-resize border-l border-violet-200/60 bg-violet-100/50 hover:bg-violet-200/60 active:bg-violet-300/55 transition-colors',
    subtleWell: 'rounded-lg border border-violet-200/55 bg-violet-50/45 p-8 text-center text-sm text-gray-500',
    filterBanner: 'rounded-lg border border-violet-200/55 bg-violet-50/40 p-3 text-sm text-gray-600',
    scrapedSourcePanel: 'rounded-lg border border-violet-100/95 bg-violet-50/50 p-3',
    pillActive: 'bg-violet-200/80 text-violet-950',
    pillInactive: 'text-violet-800 hover:bg-violet-100/70',
    pillGroup: 'flex rounded-lg border border-violet-200/65 bg-violet-50/40 p-0.5',
    filePickerRow:
      'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm text-violet-950 hover:bg-violet-100/85 hover:text-violet-950',
  },
  dark: {
    pageRoot: 'bg-transparent',
    inspectorDocked:
      'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-700/80 bg-[#161b26] shadow-[inset_1px_0_0_rgba(198,93,251,0.12)] ring-1 ring-slate-800 animate-[slideInRight_0.2s_ease-out]',
    inspectorMaximized:
      'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden border border-slate-700 bg-[#0f1219] shadow-2xl shadow-black/60 ring-1 ring-[#c65dfb]/20',
    primaryBtn:
      'rounded-lg bg-[#c65dfb] px-4 py-2 text-sm font-medium text-white hover:bg-[#b855f0] focus:outline-none focus:ring-2 focus:ring-[#c65dfb] focus:ring-offset-1 focus:ring-offset-[#0b0e14] disabled:opacity-50',
    primaryBtnCompact: 'rounded-md bg-[#c65dfb] px-3 text-xs font-semibold text-white hover:bg-[#b855f0]',
    segmentActive: 'bg-[#c65dfb] text-white shadow-sm shadow-[#c65dfb]/35',
    segmentInactive: 'bg-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-slate-100',
    toolGhost:
      'inline-flex items-center gap-1.5 rounded-lg bg-slate-800/90 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50',
    outlineTool:
      'inline-flex items-center gap-1.5 rounded-lg border border-slate-600/90 bg-[#161b26] px-3 py-1.5 text-sm font-medium text-slate-200 shadow-sm hover:border-slate-500 hover:bg-[#1a2030]',
    compareCardOn: 'border border-[#c65dfb]/50 bg-[#c65dfb]/10',
    compareCardOff: 'border border-slate-700 hover:bg-slate-800/80',
    loaderIcon: 'text-[#23d3ee]',
    tableHeadSticky: 'sticky top-0 z-10 bg-[#1a2030] backdrop-blur-sm',
    tableBody: 'divide-y divide-slate-700/80 bg-[#161b26]/95',
    tableRowSelected: 'bg-[#c65dfb]/12',
    tableRowHover: 'hover:bg-slate-800/70',
    inspectorHeaderBar:
      'flex shrink-0 items-center justify-end gap-1 border-b border-slate-700 bg-[#0f1219] px-4 py-3',
    resizeHandle:
      'shrink-0 w-1.5 cursor-col-resize border-l border-slate-700 bg-slate-800/80 hover:bg-[#c65dfb]/30 active:bg-[#c65dfb]/45 transition-colors',
    subtleWell: 'rounded-lg border border-slate-700 bg-[#161b26] p-8 text-center text-sm text-slate-400',
    filterBanner: 'rounded-lg border border-slate-700 bg-[#0f1219] p-3 text-sm text-slate-400',
    scrapedSourcePanel: 'rounded-lg border border-slate-700 bg-[#0f1219] p-3',
    pillActive: 'bg-[#c65dfb]/25 text-slate-50',
    pillInactive: 'text-slate-400 hover:bg-slate-800/80',
    pillGroup: 'flex rounded-lg border border-slate-700 bg-[#0f1219] p-0.5',
    filePickerRow:
      'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800/90 hover:text-slate-50',
  },
}

type AccountMenuChrome = {
  panel: string
  item: string
  divider: string
  avatarBg: string
  panelHeaderBorder: string
}

export const THEME_ACCOUNT_MENU: Record<UiThemeId, AccountMenuChrome> = {
  sky: {
    panel:
      'rounded-xl border border-white/55 bg-white/75 py-1.5 shadow-xl shadow-sky-900/15 backdrop-blur-2xl ring-1 ring-white/35',
    item: 'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-white/55 focus:outline-none focus:bg-white/55',
    divider: 'my-2 border-t border-sky-200/45',
    avatarBg: 'bg-sky-600',
    panelHeaderBorder: 'border-b border-white/40',
  },
  purple: {
    panel:
      'rounded-xl border border-violet-200/70 bg-white/95 py-1.5 shadow-lg shadow-violet-500/12 ring-1 ring-violet-950/[0.04]',
    item: 'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-violet-950 transition-colors duration-150 hover:bg-violet-50/90 focus:outline-none focus:bg-violet-50/90',
    divider: 'my-2 border-t border-violet-200/55',
    avatarBg: 'bg-[#7c3aed]',
    panelHeaderBorder: 'border-b border-violet-200/50',
  },
  dark: {
    panel:
      'rounded-xl border border-slate-700/90 bg-[#161b26] py-1.5 shadow-xl shadow-black/50 ring-1 ring-slate-600/50',
    item: 'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-200 transition-colors duration-150 hover:bg-slate-800/90 focus:outline-none focus:bg-slate-800/90',
    divider: 'my-2 border-t border-slate-700',
    avatarBg: 'bg-[#c65dfb]',
    panelHeaderBorder: 'border-b border-slate-700',
  },
}
