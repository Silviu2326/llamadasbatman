import { useEffect, useState } from 'react'
import DataStatusBanner from './DataStatusBanner'

/**
 * El backend puede estar perfectamente sano y no ejecutar nada: las llamadas,
 * las automatizaciones y los envíos corren en un proceso worker aparte. Sin él,
 * la aplicación responde igual pero las tareas se quedan encoladas para siempre.
 * `/health/ready` ya devuelve 503 en ese caso; aquí solo se hace visible.
 */
const POLL_MS = 60_000

export default function WorkerStatusBanner() {
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    let active = true
    const check = () => fetch('/health/ready')
      .then(response => response.json().catch(() => null))
      .then(data => {
        if (!active || !data) return
        const worker = data.checks?.worker
        if (data.status === 'ready') return setProblem(null)
        if (worker && worker !== 'healthy') {
          return setProblem('Las tareas automáticas están detenidas: no responde el proceso de fondo. Las llamadas, automatizaciones y envíos programados no se ejecutarán hasta que vuelva.')
        }
        setProblem('El servicio está degradado: algunas tareas de fondo pueden no ejecutarse.')
      })
      .catch(() => {})

    check()
    const timer = setInterval(check, POLL_MS)
    return () => { active = false; clearInterval(timer) }
  }, [])

  if (!problem) return null
  return <DataStatusBanner status="disconnected" message={problem} />
}
