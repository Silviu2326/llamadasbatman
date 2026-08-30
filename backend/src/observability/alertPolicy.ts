export type OperationalAlertSeverity = 'critical' | 'warning'

export type OperationalAlert = {
  code: string
  severity: OperationalAlertSeverity
  summary: string
  action: string
  value?: number
}

export type AlertPolicyInput = {
  database: 'healthy' | 'missing' | 'unavailable'
  redis: 'configured' | 'missing' | 'disabled' | 'unavailable'
  redisRequired: boolean
  heartbeat: 'healthy' | 'missing' | 'stale' | 'unavailable'
  workersEnabled: boolean
  databaseQueriesAvailable: boolean
  outbox: { pending: number | null; oldestPendingAgeSeconds: number | null; expiredLeases: number | null; deadLetter: number | null }
  webhooks: { received: number | null; failed: number | null; deadLetter: number | null }
  automationRuns: { queued: number | null; running: number | null; failed: number | null; deadLetter: number | null }
  importJobs: { pending: number | null; processing: number | null; failed: number | null; expiredLeases: number | null }
  emailDeliveries: { queued: number | null; processing: number | null; failed: number | null; uncertain: number | null; expiredLeases: number | null }
  sequenceSteps: { pending: number | null; processing: number | null; failed: number | null; expiredLeases: number | null }
  scheduledTriggers: { pending: number | null; overdue: number | null }
}

const OUTBOX_LAG_WARNING_SECONDS = 10 * 60
const OUTBOX_LAG_CRITICAL_SECONDS = 30 * 60

export function evaluateOperationalAlerts(input: AlertPolicyInput): OperationalAlert[] {
  const alerts: OperationalAlert[] = []
  const add = (alert: OperationalAlert) => alerts.push(alert)

  if (input.database !== 'healthy') add({
    code: 'DATABASE_NOT_READY', severity: 'critical',
    summary: 'PostgreSQL no está disponible.',
    action: 'Comprobar DATABASE_URL, conectividad TLS y estado de la base antes de aceptar tráfico.',
  })
  if (!input.databaseQueriesAvailable) add({
    code: 'QUEUE_SNAPSHOT_UNAVAILABLE', severity: 'critical',
    summary: 'No se pudo leer el estado persistido de las colas.',
    action: 'Revisar errores de Prisma y repetir /health/workers con el mismo correlationId.',
  })
  if (input.workersEnabled && input.redisRequired && input.redis !== 'configured') add({
    code: 'REDIS_NOT_READY', severity: 'critical',
    summary: 'Redis es obligatorio para workers activos y no está listo.',
    action: 'Comprobar REDIS_URL, TLS, firewall y que el proceso dedicado del worker esté desplegado.',
  })
  if (input.workersEnabled && input.heartbeat !== 'healthy') add({
    code: input.heartbeat === 'stale' ? 'WORKER_HEARTBEAT_STALE' : 'WORKER_HEARTBEAT_MISSING',
    severity: 'critical',
    summary: input.heartbeat === 'stale' ? 'El heartbeat del worker está obsoleto.' : 'No se observa heartbeat del worker.',
    action: input.redisRequired
      ? 'Comprobar el proceso dedicado, sus logs de arranque y su conexión a Redis.'
      : 'Comprobar el proceso dedicado y su conexión a PostgreSQL.',
  })

  if ((input.outbox.expiredLeases ?? 0) > 0) add({
    code: 'OUTBOX_EXPIRED_LEASES', severity: 'warning', value: input.outbox.expiredLeases ?? undefined,
    summary: 'Hay eventos outbox con lease caducada.',
    action: 'Revisar caída o bloqueo del worker; los eventos deben ser reclamados por el siguiente ciclo.',
  })
  if ((input.outbox.deadLetter ?? 0) > 0) add({
    code: 'OUTBOX_DEAD_LETTER', severity: 'critical', value: input.outbox.deadLetter ?? undefined,
    summary: 'Hay eventos outbox en dead-letter.',
    action: 'Consultar lastErrorCode y correlationId; corregir la causa y usar replay controlado.',
  })
  if ((input.outbox.oldestPendingAgeSeconds ?? 0) >= OUTBOX_LAG_CRITICAL_SECONDS) add({
    code: 'OUTBOX_LAG_CRITICAL', severity: 'critical', value: input.outbox.oldestPendingAgeSeconds ?? undefined,
    summary: 'El outbox lleva más de 30 minutos sin drenarse.',
    action: 'Escalar el worker y Redis; no publicar nuevas acciones irreversibles hasta recuperar el drenaje.',
  })
  else if ((input.outbox.oldestPendingAgeSeconds ?? 0) >= OUTBOX_LAG_WARNING_SECONDS) add({
    code: 'OUTBOX_LAG_HIGH', severity: 'warning', value: input.outbox.oldestPendingAgeSeconds ?? undefined,
    summary: 'El outbox acumula más de 10 minutos de lag.',
    action: 'Revisar capacidad/concurrencia del worker y el número de eventos pendientes.',
  })

  if ((input.webhooks.failed ?? 0) > 0) add({
    code: 'WEBHOOK_FAILURES', severity: 'warning', value: input.webhooks.failed ?? undefined,
    summary: 'Hay webhooks rechazados o fallidos persistidos.',
    action: 'Revisar firma, proveedor, errorCode y reintentos; no marcar la integración como saludable por recibir HTTP 200.',
  })
  if ((input.webhooks.deadLetter ?? 0) > 0) add({
    code: 'WEBHOOK_DEAD_LETTER', severity: 'critical', value: input.webhooks.deadLetter ?? undefined,
    summary: 'Hay webhooks agotados en dead-letter.',
    action: 'Resolver la causa y solicitar reentrega desde el proveedor o redrive con el eventId original.',
  })
  if ((input.automationRuns.deadLetter ?? 0) > 0) add({
    code: 'AUTOMATION_DEAD_LETTER', severity: 'critical', value: input.automationRuns.deadLetter ?? undefined,
    summary: 'Hay automatizaciones en dead-letter.',
    action: 'Revisar el paso bloqueado y el resultado incierto antes de reanudar.',
  })
  if ((input.automationRuns.failed ?? 0) > 0) add({
    code: 'AUTOMATION_FAILURES', severity: 'warning', value: input.automationRuns.failed ?? undefined,
    summary: 'Hay ejecuciones de automatización fallidas.',
    action: 'Abrir el detalle del run, corregir errorCode y comprobar que el reintento sea idempotente.',
  })
  if ((input.importJobs.expiredLeases ?? 0) > 0) add({
    code: 'IMPORT_EXPIRED_LEASES', severity: 'warning', value: input.importJobs.expiredLeases ?? undefined,
    summary: 'Hay importaciones con lease caducada.',
    action: 'Comprobar el worker de importación y permitir la recuperación por externalLeadId determinista.',
  })
  if ((input.emailDeliveries.uncertain ?? 0) > 0) add({
    code: 'EMAIL_OUTCOME_UNKNOWN', severity: 'critical', value: input.emailDeliveries.uncertain ?? undefined,
    summary: 'Hay envíos de email con resultado incierto.',
    action: 'Verificar el proveedor antes de redrive para evitar duplicar contactos.',
  })
  if ((input.emailDeliveries.expiredLeases ?? 0) > 0 || (input.sequenceSteps.expiredLeases ?? 0) > 0) add({
    code: 'QUEUE_EXPIRED_LEASES', severity: 'warning',
    summary: 'Hay leases caducadas en colas operativas.',
    action: 'Revisar saturación o caída del worker; confirmar que el claim condicional recupera el trabajo.',
  })
  if ((input.scheduledTriggers.overdue ?? 0) > 0) add({
    code: 'SCHEDULER_LAG', severity: 'warning', value: input.scheduledTriggers.overdue ?? undefined,
    summary: 'Hay triggers temporales vencidos sin publicar.',
    action: 'Revisar el tick del scheduler y el drenaje del outbox.',
  })

  return alerts
}

export function readinessFromAlerts(alerts: OperationalAlert[]): 'ready' | 'degraded' | 'not_ready' {
  if (alerts.some(alert => alert.severity === 'critical')) return 'not_ready'
  if (alerts.length > 0) return 'degraded'
  return 'ready'
}
