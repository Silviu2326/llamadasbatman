// Espejo de backend/src/jobs/leadCallDispatch.ts (CALL_BLOCK_LABELS) y de
// backend/src/voice/telephony/gatewayCodes.ts (GATEWAY_CODE_MESSAGES). Si se
// añade un motivo o un código allí, añadirlo aquí. Sin framework:
// node --test src/lib/callBlockLabels.test.mjs

export const CALL_BLOCK_LABELS = {
  lead_without_phone: 'El contacto no tiene teléfono.',
  max_attempts: 'Se alcanzó el máximo de intentos de llamada.',
  no_campaign: 'El contacto no pertenece a ninguna campaña.',
  campaign_changed: 'El contacto cambió de campaña después de programar la llamada.',
  campaign_inactive: 'La campaña no está activa.',
  agent_missing: 'La campaña no tiene agente asignado.',
  agent_not_active: 'El agente no está publicado y activo.',
  agent_incomplete: 'Al agente le falta voz, instrucciones o número de salida.',
  agent_voice_consent_missing: 'El consentimiento de voz del agente no está vigente.',
  agent_limits: 'El agente ha alcanzado sus límites operativos.',
  white_label_quota: 'La cuota de voz del plan está agotada.',
  invalid_phone: 'El teléfono del contacto no es válido.',
  quota_exceeded: 'La cuota de minutos de llamada está agotada.',
  optout: 'El contacto pidió no recibir llamadas.',
  outside_hours: 'Fuera del horario permitido para llamar; se reprograma a la siguiente ventana.',
  missing_voice_consent: 'El contacto no tiene consentimiento de voz registrado.',
  gateway_rejected: 'La pasarela de voz rechazó la llamada antes de marcar.',
}

export const GATEWAY_CODE_LABELS = [
  [/ZADARMA_PHONE_MISMATCH/, 'El número del agente no coincide con la línea configurada en la pasarela. Cambia el número de salida del agente por el de la línea.'],
  [/ZADARMA_LANGUAGE_UNSUPPORTED/, 'La pasarela solo admite agentes en español o inglés. Cambia el idioma del agente.'],
  [/ZADARMA_VOICE_RUNTIME_UNAVAILABLE/, 'Faltan credenciales o el proveedor de voz/IA elegido no está disponible en el servidor. Revisa el pipeline del agente.'],
  [/ZADARMA_AGENT_CONFIG_UNAVAILABLE/, 'La pasarela no pudo cargar la configuración del agente (voz, instrucciones o número). Revisa la ficha del agente.'],
  [/ZADARMA_VOICE_QUOTA/, 'La cuota de voz del plan está agotada. Amplía el plan o espera al siguiente periodo.'],
  [/ZADARMA_CALL_NOT_ALLOWED/, 'La normativa de llamadas no permite marcar a este número ahora (opt-out, horario o consentimiento).'],
  [/ZADARMA_CALL_NOT_READY/, 'La pasarela no tenía la llamada preparada cuando la centralita conectó el audio. Vuelve a intentarlo.'],
  [/ZADARMA_LEAD_ALREADY_CALLING/, 'Ya hay una llamada en curso con este contacto. Espera a que termine.'],
  [/AMI_UNAVAILABLE/, 'La pasarela no pudo hablar con la centralita (AMI). Comprueba que Asterisk y la pasarela están activos.'],
  [/ORIGINATE_INVALID/, 'La centralita rechazó el marcado por configuración (dialplan, permisos o canal). No se llegó a llamar; revisa la pasarela.'],
  [/ORIGINATE_REJECTED/, 'La centralita marcó pero la llamada no se estableció.'],
  [/ORIGINATE_TIMEOUT/, 'La centralita no consiguió establecer la llamada a tiempo. Comprueba que la línea SIP sigue registrada y vuelve a intentarlo.'],
  [/ZADARMA_CAPACITY_REACHED|ZADARMA_GATEWAY_CALL_FAILED_409/, 'La pasarela ya tiene una llamada en curso. Espera a que termine y vuelve a intentarlo.'],
  [/TEST_CALL_REQUIRES_ZADARMA_GATEWAY/, 'La prueba telefónica solo está disponible con la pasarela propia. Este entorno no la tiene activada.'],
  [/ZADARMA_GATEWAY_CALL_FAILED_401|ZADARMA_GATEWAY_CALL_FAILED_403/, 'La pasarela rechazó la autenticación del servidor. Revisa el token de la pasarela.'],
  [/ZADARMA_GATEWAY_CALL_FAILED_5\d\d|ZADARMA_GATEWAY_INVALID_RESPONSE/, 'La pasarela telefónica no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'],
  [/ZADARMA_CALL_BLOCKED_OR_FAILED/, 'La pasarela bloqueó la llamada sin detallar el motivo. Revisa número de salida, idioma y consentimiento.'],
]

// Detalles que escribe el dispatch en `lastCallBlock.detail` que no son códigos de pasarela.
const DETAIL_LABELS = {
  daily_limit: 'tope de llamadas diarias alcanzado',
  outside_schedule: 'fuera de la franja horaria del agente',
  inactive_day: 'día no activo para el agente',
  monthly_minutes: 'minutos mensuales agotados',
  voice: 'falta la voz',
  instructions: 'faltan las instrucciones',
  phone: 'falta el número de salida',
}

export function callBlockReasonLabel(reason) {
  return CALL_BLOCK_LABELS[reason] || `Motivo: ${reason || 'desconocido'}`
}

// Traduce un código de pasarela (ZADARMA_..., ORIGINATE_...) o un detalle
// del dispatch; devuelve '' si no hay nada que explicar.
export function gatewayCodeLabel(detail) {
  if (!detail || typeof detail !== 'string') return ''
  for (const [pattern, label] of GATEWAY_CODE_LABELS) if (pattern.test(detail)) return label
  if (DETAIL_LABELS[detail]) return DETAIL_LABELS[detail]
  // «voice,phone» del motivo agent_incomplete.
  const parts = detail.split(',').map(item => DETAIL_LABELS[item.trim()]).filter(Boolean)
  if (parts.length) return parts.join(', ')
  return ''
}

// Frase completa para la ficha del lead: motivo + detalle traducido (o el código crudo si no se conoce).
export function describeCallBlock(block) {
  if (!block || typeof block !== 'object' || !block.reason) return ''
  const base = callBlockReasonLabel(block.reason)
  if (!block.detail) return base
  const detail = gatewayCodeLabel(block.detail)
  return detail ? `${base} ${detail.endsWith('.') ? detail : `${detail}.`}` : `${base} (${block.detail})`
}
