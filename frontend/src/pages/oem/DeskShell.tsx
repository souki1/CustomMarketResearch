import { Outlet } from 'react-router-dom'
import { OemDeskProvider } from './OemDeskContext'

export function DeskShell() {
  return (
    <OemDeskProvider>
      <Outlet />
    </OemDeskProvider>
  )
}
