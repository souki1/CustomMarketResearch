import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { MainLayout } from '@/layouts'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HomePage } from '@/pages/HomePage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
  { path: 'signin', element: <SignInPage /> },
  { path: 'signup', element: <SignUpPage /> },
  { path: 'auth/callback', element: <AuthCallbackPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
