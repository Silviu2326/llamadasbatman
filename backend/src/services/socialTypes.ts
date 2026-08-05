export type PostCampaignAttribution = {
  campaignId: string
  landingSlug: string
  cta?: string
  /**
   * UTM propio de la pieza. Sin él, dos piezas de la misma campaña y canal
   * comparten atribución y "leads por pieza" (pantallas.md §4) no se puede
   * calcular. Cuando falta se conserva el valor por canal de siempre.
   */
  utmContent?: string
}
