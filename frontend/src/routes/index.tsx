import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { MainLayout } from '@/layouts'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { ComparePage } from '@/pages/ComparePage'
import { AiPlaceholderPage } from '@/pages/AiPlaceholderPage'
import { HomePage } from '@/pages/HomePage'
import { RESEARCH_COMPARE_PATH } from '@/lib/paths'
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
import { PortfolioPage } from '@/pages/Portfolio'
import { GenerateReportPage } from '@/pages/GenerateReport'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'research', element: <ResearchPage /> },
      { path: 'research/compare', element: <ComparePage /> },
      { path: 'compare', element: <Navigate to={RESEARCH_COMPARE_PATH} replace /> },
      { path: 'reports', element: <GenerateReportPage /> },
      { path: 'purchase-order', element: <PurchaseOrderPage /> },
      { path: 'ai', element: <AiPlaceholderPage /> },
      { path: 'portfolio', element: <PortfolioPage /> },
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
