import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setCurrentUserName, setToken } from '@/lib/auth'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const displayName = searchParams.get('display_name')
  const error = searchParams.get('error')

  useEffect(() => {
    if (error) {
      navigate('/signin?error=' + encodeURIComponent(error), { replace: true })
      return
    }
    if (token) {
      setToken(token)
      if (displayName) setCurrentUserName(displayName)
    }
    navigate('/', { replace: true })
  }, [token, displayName, error, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-600">
      Signing you in...
    </div>
  )
}
