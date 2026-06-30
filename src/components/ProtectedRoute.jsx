import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'

export default function ProtectedRoute() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080c14', overflow: 'hidden' }}>
      <Sidebar />
      <Outlet />
    </div>
  )
}
