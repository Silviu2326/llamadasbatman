/**
 * Códigos que devuelve la pasarela telefónica (zadarma/runtime.ts, gateway.ts,
 * ami.ts) o la capa de salida (outbound.ts), traducidos para la interfaz.
 * Los usa la ficha del agente (prueba telefónica) y `lastCallBlock.detail`
 * de un lead. Espejo en el frontend: `src/lib/callBlockLabels.js`; si se
 * añade un código aquí, añadirlo también allí.
 */
export const GATEWAY_CODE_MESSAGES: Array<[RegExp, string]> = [
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

/** Matiz de `ORIGINATE_REJECTED` según la causa que dio la centralita. */
export const ORIGINATE_CAUSE_MESSAGES: Record<string, string> = {
  busy: 'La centralita marcó y el destino comunicaba.',
  no_answer: 'La centralita marcó y el destino no contestó.',
  congestion: 'La centralita marcó pero la red estaba congestionada.',
  rejected: 'La centralita rechazó el marcado.',
}

/** Busca un código conocido en `source` (código y/o mensaje crudo). `null` si no hay ninguno. */
export function describeGatewayCode(source: string, cause?: string | null): { code: string; message: string } | null {
  for (const [pattern, message] of GATEWAY_CODE_MESSAGES) {
    const match = source.match(pattern)
    if (!match) continue
    if (match[0] === 'ORIGINATE_REJECTED' && cause && ORIGINATE_CAUSE_MESSAGES[cause]) return { code: match[0], message: ORIGINATE_CAUSE_MESSAGES[cause] }
    return { code: match[0], message }
  }
  return null
}
