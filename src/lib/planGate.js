// El backend responde 403 con `code` estable cuando la pagina existe pero el
// plan (o la integracion) no la incluye: ver backend/src/access-control/
// requireEntitlement.ts. Eso NO es una caida del servicio, asi que la UI debe
// decir "no esta en tu plan" en vez de "servicio no disponible".
// ponytail: helper, no capa de cliente HTTP — apiFetch sigue devolviendo el Response crudo.

const GATE_CODES = new Set(['PLAN_CAPABILITY_REQUIRED', 'INTEGRATION_DISABLED', 'LIMIT_REACHED'])

/**
 * @returns {null | {code: string, capability: string|null, plan: string|null, resource: string|null, message: string}}
 *   null si la respuesta no es un bloqueo de plan (entonces es un error real).
 */
export async function readPlanGate(response) {
  if (!response || (response.status !== 403 && response.status !== 409)) return null
  let body = null
  try { body = await response.clone().json() } catch { return null }
  if (!body || !GATE_CODES.has(body.code)) return null
  return {
    code: body.code,
    capability: body.capability ?? null,
    plan: body.plan ?? null,
    resource: body.resource ?? null,
    message: typeof body.error === 'string' && body.error ? body.error : 'Esta sección no está incluida en tu plan.',
  }
}

/** Copy corto y accionable para el banner, sin jerga de capacidades internas. */
export function planGateMessage(gate, locale = 'es') {
  if (!gate) return ''
  const en = locale === 'en'
  if (gate.code === 'LIMIT_REACHED') {
    return en
      ? `You reached your plan limit for ${gate.resource ?? 'this resource'}. Upgrade to keep going.`
      : `Has alcanzado el límite de ${gate.resource ?? 'este recurso'} de tu plan. Mejóralo para continuar.`
  }
  if (gate.code === 'INTEGRATION_DISABLED') {
    return en
      ? 'This integration is not enabled for your organization. Ask your administrator to turn it on.'
      : 'Esta integración no está habilitada en tu organización. Pide a tu administrador que la active.'
  }
  return en
    ? `This section is not included in your ${gate.plan ?? ''} plan. Upgrade it to unlock it.`.replace('  ', ' ')
    : `Esta sección no está incluida en tu plan ${gate.plan ?? ''}. Mejóralo para desbloquearla.`.replace('  ', ' ')
}
