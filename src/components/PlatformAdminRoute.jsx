import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Puerta del back office en el cliente.
 *
 * `isPlatformAdmin` llega del servidor en la respuesta de sesión, así que no es
 * un dato que el navegador se invente. Aun así esto solo decide si se pinta la
 * pantalla: la autorización real la aplica `requirePlatformAdmin` en el backend,
 * que reconsulta la base en cada petición. Falsear el flag en el cliente
 * enseñaría una pantalla vacía de errores 403, no datos.
 */
export default function PlatformAdminRoute({ children }) {
  const { user, isRestoring, impersonation } = useAuth()

  if (isRestoring) return null
  // Durante una suplantación el back office está cerrado por diseño: el backend
  // rechaza esas sesiones, así que redirigir evita una pantalla rota.
  if (impersonation || !user?.isPlatformAdmin) return <Navigate to="/dashboard" replace />
  return children
}
