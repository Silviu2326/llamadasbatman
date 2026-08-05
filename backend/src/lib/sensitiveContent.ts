/**
 * Contenido que nunca publica una máquina sola.
 *
 * Vive aquí y no dentro de una superficie concreta porque la frontera es la
 * misma en las tres: `landings.md` §10 la escribió primero para los cambios de
 * landing y `organico.md` §9 la repite palabra por palabra para las piezas
 * orgánicas — precios, promesas, afirmaciones legales o sanitarias y prueba
 * social exigen una persona. Duplicar las expresiones regulares habría creado
 * dos fronteras que se separan en cuanto alguien arregla una en un sitio.
 *
 * La comprobación es sobre el **contenido**, no sobre la etiqueta del cambio:
 * un "texto de CTA" que dice «desde 9 € al mes» es una promesa comercial
 * aunque el tipo de cambio esté en la lista blanca.
 */

export type SensitiveContentRule = {
  pattern: RegExp
  reason: string
}

export const SENSITIVE_CONTENT_RULES: SensitiveContentRule[] = [
  // Sin `\b` final tras «€»: el símbolo no es carácter de palabra, así que el
  // límite nunca casaría y «desde 9 € al mes» se colaría como texto inocente.
  { pattern: /\d+\s*(€|eur\b|euros\b)|\b(precio|precios|gratis|descuento|oferta|rebaja|promoci[óo]n|sin coste|sin cargo)\b/i, reason: 'menciona precios o promociones' },
  // La promesa de reembolso también se escribe como verbo ("te devolvemos el
  // dinero"), no solo como sustantivo.
  { pattern: /\b(garant[íi]as?|garantizad[oa]s?|reembolsos?)\b|devolv\w*\s+(el\s+|tu\s+)?dinero|devoluci[óo]n del dinero/i, reason: 'incluye una garantía' },
  { pattern: /\b(legal|jur[íi]dic|sanitari|m[ée]dic|cura|tratamiento|certificad|homologad)\w*/i, reason: 'contiene afirmaciones legales o sanitarias' },
  { pattern: /\b(contrato|permanencia|cl[áa]usula|condiciones contractuales)\b/i, reason: 'toca condiciones contractuales' },
  { pattern: /\b(testimonios?|opiniones? de|clientes? reales?|casos? de [ée]xito|valoraciones? de)\b/i, reason: 'usa prueba social' },
]

/** Primera regla que casa, o `null` si el texto es publicable sin persona. */
export function findSensitiveContent(text: string): SensitiveContentRule | null {
  return SENSITIVE_CONTENT_RULES.find(rule => rule.pattern.test(text)) ?? null
}

/**
 * Todos los motivos presentes en un texto.
 *
 * Se usa para comparar un antes y un después: refrescar un artículo "sin
 * cambiar sus afirmaciones" (`organico.md` §9) es exactamente que este conjunto
 * no crezca. Comparar textos enteros diría que cambió cualquier coma; comparar
 * las afirmaciones sensibles dice lo único que la frontera protege.
 */
export function sensitiveReasons(text: string): string[] {
  return SENSITIVE_CONTENT_RULES.filter(rule => rule.pattern.test(text)).map(rule => rule.reason)
}

/** Afirmaciones sensibles que el texto nuevo añade y el viejo no tenía. */
export function newSensitiveClaims(before: string, after: string): string[] {
  const had = new Set(sensitiveReasons(before))
  return sensitiveReasons(after).filter(reason => !had.has(reason))
}
