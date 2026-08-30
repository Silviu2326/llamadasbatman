/**
 * Decisiones puras de preproducción del Studio de Cine
 * (docs/plataforma-abierta/06-STUDIO-DE-CINE.md §3).
 *
 * Este módulo no importa Prisma, ni red, ni nada con estado a propósito: son
 * las reglas que el test offline puede ejercitar sin base de datos, y que
 * studio.service.ts consume para no mezclar criterio con persistencia.
 */

export type StoryboardAspectRatio = '1:1' | '9:16' | '16:9'

/**
 * Aspect ratio del storyboard según el canal del brief.
 *
 * Decisión (documentada aquí porque el enunciado la delega):
 * - reels / tiktok / shorts / stories → 9:16 — formatos verticales nativos.
 * - youtube → 16:9 — el player horizontal clásico.
 * - ads → depende de la duración: hasta 15 s el placement dominante es
 *   stories/reels (vertical, 9:16); por encima de 15 s la pieza suele vivir en
 *   feed, donde el cuadrado 1:1 conserva área en todos los placements.
 * - canal desconocido → 9:16: la plataforma es vertical-first (los criterios
 *   de salida de v1/v2 del doc hablan de piezas verticales).
 */
export function storyboardAspectRatio(channel: string | undefined, durationS: number | undefined): StoryboardAspectRatio {
  const normalized = (channel ?? '').trim().toLowerCase()
  if (/(reel|tiktok|short|stories|story)/.test(normalized)) return '9:16'
  if (/youtube/.test(normalized)) return '16:9'
  if (/(ads|ad$|paid|meta)/.test(normalized)) {
    return (durationS ?? 15) <= 15 ? '9:16' : '1:1'
  }
  return '9:16'
}

/**
 * Ritmo de locución que usa el guionista: ~15 caracteres por segundo de VO en
 * castellano (≈150 ppm con palabras de ~6 caracteres). Es una estimación de
 * planificación, no una medición del TTS; se declara en el JSON del guion.
 */
export const VOICEOVER_CHARS_PER_SECOND = 15

/** Segundos de locución que ocupa un texto al ritmo estándar (redondeo arriba). */
export function voiceoverSeconds(text: string): number {
  const chars = text.trim().length
  if (chars === 0) return 0
  return Math.ceil(chars / VOICEOVER_CHARS_PER_SECOND)
}

/** Caracteres de VO que caben en una pieza de esta duración. */
export function voiceoverCharBudget(durationS: number): number {
  return Math.max(0, Math.floor(durationS * VOICEOVER_CHARS_PER_SECOND))
}

export interface BudgetCheck {
  ok: boolean
  /** null cuando la producción no tiene presupuesto definido (no se limita). */
  remainingCents: number | null
  /** Lo que faltaría para poder lanzar (0 cuando ok). */
  shortfallCents: number
}

/**
 * Presupuesto duro (§4 del doc, misma regla que FlowRun): sin budgetCents no
 * hay límite; con él, se rechaza lanzar si gastado + estimado lo supera.
 * Función pura: quien la llama decide qué hacer con el resultado.
 */
export function checkBudget(
  budgetCents: number | null | undefined,
  spentCents: number,
  estimateCents: number,
): BudgetCheck {
  if (budgetCents == null) return { ok: true, remainingCents: null, shortfallCents: 0 }
  const remaining = budgetCents - spentCents
  const shortfall = estimateCents - remaining
  return {
    ok: shortfall <= 0,
    remainingCents: remaining,
    shortfallCents: Math.max(0, shortfall),
  }
}

export interface StoryboardPromptParts {
  framing: string
  movement: string
  action: string
  sceneContext?: string
  styleNotes?: string[]
  characterNotes?: string[]
  productNotes?: string[]
  locationNotes?: string[]
}

/**
 * Prompt visual de un fotograma de storyboard. El movimiento de cámara se
 * describe como intención ("fotograma inicial de un travelling...") porque la
 * imagen es fija. Se recorta a 4000 caracteres: es el máximo del contrato
 * image.generate (providers/capabilities.ts).
 */
export function buildStoryboardPrompt(parts: StoryboardPromptParts): string {
  const lines: string[] = [
    'Fotograma de storyboard cinematográfico, imagen fija.',
    `Encuadre: ${parts.framing}.`,
    `Movimiento de cámara previsto (representar el fotograma inicial): ${parts.movement}.`,
    `Acción: ${parts.action}.`,
  ]
  if (parts.sceneContext) lines.push(`Contexto de la escena: ${parts.sceneContext}.`)
  if (parts.styleNotes?.length) lines.push(`Estilo visual: ${parts.styleNotes.join('; ')}.`)
  if (parts.characterNotes?.length) lines.push(`Personajes: ${parts.characterNotes.join('; ')}.`)
  if (parts.productNotes?.length) lines.push(`Producto: ${parts.productNotes.join('; ')}.`)
  if (parts.locationNotes?.length) lines.push(`Localización: ${parts.locationNotes.join('; ')}.`)
  return lines.join('\n').slice(0, 4000)
}
