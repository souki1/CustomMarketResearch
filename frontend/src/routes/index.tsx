import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { MainLayout } from '@/layouts'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { ComparePage } from '@/pages/ComparePage'
import { HomePage } from '@/pages/HomePage'
import { PurchaseOrderPage } from '@/pages/PurchaseOrderPage'
import { ResearchPage } from '@/pages/ResearchPage'
import { SettingsLayout } from '@/pages/SettingsLayout'
import { SettingsBillingPage } from '@/pages/settings/SettingsBillingPage'
import { SettingsCompanyPage } from '@/pages/settings/SettingsCompanyPage'
import { SettingsNotificationsPage } from '@/pages/settings/SettingsNotificationsPage'
import { SettingsProfilePage } from '@/pages/settings/SettingsProfilePage'
import { SettingsSecurityPage } from '@/pages/settings/SettingsSecurityPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

function AiPlaceholderPage() {
  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col gap-2 px-6 py-6">
        <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">AI</h1>
        <p className="text-sm text-gray-600">AI page placeholder. Tell me what you want this screen to do and I will wire it up.</p>
      </div>
    </div>
  )
}

function PortfolioPlaceholderPage() {
  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col gap-2 px-6 py-6">
        <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">Portfolio</h1>
        <p className="text-sm text-gray-600">Portfolio page placeholder. Tell me what content you want to show here.</p>
      </div>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'research', element: <ResearchPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'purchase-order', element: <PurchaseOrderPage /> },
      { path: 'ai', element: <AiPlaceholderPage /> },
      { path: 'portfolio', element: <PortfolioPlaceholderPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="/settings/profile" replace /> },
          { path: 'profile', element: <SettingsProfilePage /> },
          { path: 'company', element: <SettingsCompanyPage /> },
          { path: 'billing', element: <SettingsBillingPage /> },
          { path: 'notifications', element: <SettingsNotificationsPage /> },
          { path: 'security', element: <SettingsSecurityPage /> },
        ],
      },
    ],
  },
  { path: 'signin', element: <SignInPage /> },
  { path: 'signup', element: <SignUpPage /> },
  { path: 'auth/callback', element: <AuthCallbackPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
