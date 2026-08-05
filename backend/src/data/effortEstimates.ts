/**
 * Minutos estimados por formato — `docs/xarly/organico.md` §5.2.
 *
 * El gasto del orgánico es tiempo, no euros: sin estos números no existe el
 * coste por cualificado en tiempo, que es la métrica que sustituye al CAC
 * publicitario.
 *
 * Se presenta siempre como **estimación declarada**, nunca como contabilidad
 * exacta. Nadie ha cronometrado estas piezas; son el punto de partida acordado
 * con el equipo y se pueden ajustar. Si el número está mal, lo que se desordena
 * es el ranking entre canales, así que conviene revisarlo con datos reales
 * cuando los haya.
 */

export const MINUTES_PER_FORMAT: Record<string, number> = {
  post: 20,
  carrusel: 45,
  carousel: 45,
  story: 10,
  articulo: 120,
  article: 120,
  landing: 180,
  reel_script: 40,
  guion_reel: 40,
  /** Lote de prospección de 50 registros. */
  prospect_batch: 30,
  seo_fix: 25,
}

/** Tamaño del lote al que se refiere `prospect_batch`. */
export const PROSPECT_BATCH_SIZE = 50

export function minutesForFormat(format: string): number {
  return MINUTES_PER_FORMAT[format.toLowerCase()] ?? 20
}

/** Horas de un conjunto de piezas, redondeadas a una décima. */
export function hoursForPieces(formats: string[]): number {
  const minutes = formats.reduce((total, format) => total + minutesForFormat(format), 0)
  return Math.round((minutes / 60) * 10) / 10
}

/**
 * Horas de un lote de prospección. Se prorratea el lote de 50: importar 120
 * prospectos cuesta más que importar 10, aunque no linealmente en la práctica.
 */
export function hoursForProspects(count: number): number {
  const minutes = (count / PROSPECT_BATCH_SIZE) * MINUTES_PER_FORMAT.prospect_batch
  return Math.round((minutes / 60) * 10) / 10
}
