/**
 * Email transaccional mínimo vía Resend (HTTP puro, sin dependencias).
 * Configuración: RESEND_API_KEY + EMAIL_FROM (p. ej. "Vendrava <avisos@tudominio.com>").
 * Sin configurar → no-op que devuelve false; quien llama decide si le importa.
 * ponytail: un solo proveedor — si algún día hace falta SMTP genérico, aquí
 * es donde se cambia.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  html: string
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
    return true
  } catch (error) {
    console.warn('[TransactionalEmail] fallo de envío:', (error as Error).message)
    return false
  }
}
