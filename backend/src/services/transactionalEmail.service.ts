/**
 * Email transaccional mínimo vía Resend (HTTP puro, sin dependencias).
 * Configuración: RESEND_API_KEY + EMAIL_FROM (p. ej. "Vendrava <avisos@tudominio.com>").
 * Sin configurar → no-op que devuelve false; quien llama decide si le importa.
 * ponytail: un solo proveedor — si algún día hace falta SMTP genérico, aquí
 * es donde se cambia.
 */
import { recordUsage } from '../lib/usage'

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/** Versión de tarifa de los costes de este archivo (ledger, FUNDAMENTOS §3). */
const RATE_VERSION = '2026-08'

/** Coste por email aceptado, en céntimos. Configurable por env. */
function costCentsPerEmail(): number {
  const raw = Number(process.env.RESEND_COST_CENTS_PER_EMAIL)
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.09
}

export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  html: string
  /**
   * Contexto para el ledger de consumo. Opcional por compatibilidad: los
   * llamadores sin organización a mano (crons de sistema) no registran.
   * Solo se apunta el envío que Resend aceptó.
   */
  usage?: { orgId: string; capability?: string }
}): Promise<boolean> {
  if (!isEmailConfigured()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`[TransactionalEmail] Resend respondió ${res.status}`)
      return false
    }
    const responseBody = await res.json().catch(() => null) as { id?: unknown } | null
    const providerRequestId = typeof responseBody?.id === 'string'
      ? responseBody.id
      : res.headers.get('x-request-id')
    // Registrar siempre, cobrar después: solo el envío aceptado cuenta.
    // `recordUsage` nunca lanza, así que no puede convertir un envío bueno en fallo.
    if (input.usage?.orgId && providerRequestId) {
      void recordUsage({
        orgId: input.usage.orgId,
        provider: 'resend',
        capability: input.usage.capability ?? 'email.transactional',
        quantity: 1,
        unit: 'requests',
        costCents: costCentsPerEmail(),
        billingMode: 'managed',
        rateVersion: RATE_VERSION,
        idempotencyKey: `resend:${providerRequestId}`,
      })
    } else if (input.usage?.orgId) {
      console.error('[TransactionalEmail] Resend aceptó el envío sin id de petición; no puede registrarse de forma idempotente')
    }
    return true
  } catch (error) {
    console.warn('[TransactionalEmail] fallo de envío:', (error as Error).message)
    return false
  }
}
