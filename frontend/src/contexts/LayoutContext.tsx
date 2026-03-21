import { createContext, useContext, useState, type ReactNode } from 'react'

export type LayoutContextValue = {
  collapseSidebarForInspector: boolean
  setCollapseSidebarForInspector: (value: boolean) => void
}

export const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [collapseSidebarForInspector, setCollapseSidebarForInspector] = useState(false)
  return (
    <LayoutContext.Provider value={{ collapseSidebarForInspector, setCollapseSidebarForInspector }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext)
  return ctx ?? { collapseSidebarForInspector: false, setCollapseSidebarForInspector: () => {} }
}
