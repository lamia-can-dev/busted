import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { userId, groupId, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && (!userId || !groupId)) {
      navigate('/', { replace: true })
    }
  }, [loading, userId, groupId, navigate])

  if (loading || !userId || !groupId) return null

  return <>{children}</>
}
