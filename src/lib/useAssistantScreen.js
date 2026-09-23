import { useEffect, useRef } from 'react'
import { registerAssistantScreen } from './assistantScreen'
import { useAuth } from '../contexts/AuthContext'

export function useAssistantScreen(screen, context, run) {
  const { user } = useAuth() || {}
  const latest = useRef({ context, run }); latest.current = { context, run }
  useEffect(() => registerAssistantScreen(screen, () => latest.current.context, command => latest.current.run(command)), [screen, user?.orgId, user?.id])
}
