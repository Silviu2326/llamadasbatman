// Recetas de sistema (docs/plataforma-abierta/05-FLUJOS.md §6: "5 recetas de
// sistema publicadas"). Flows con orgId null visibles para todas las
// organizaciones desde listFlows.
//
// Las microapps se referencian por id (string), nunca importando sus módulos:
// se registran en el arranque del worker y, si alguna falta en un deploy, el
// paso falla con MICROAPP_UNKNOWN en vez de romper el import de este archivo.
//
// Topic del trigger de la receta 1: 'opportunity.won' — evento real del outbox
// (lo publica pipeline.service.ts al ganar una oportunidad y ya lo consumen
// automatizaciones y señales de conversión en outboxDispatcher.ts).
import { prisma } from '../lib/prisma'
import { publishFlowVersion } from '../services/flows.service'
import { flowGraph } from './graph'

export interface SystemRecipe {
  slug: string
  name: string
  description: string
  graph: unknown
}

export const SYSTEM_RECIPES: SystemRecipe[] = [
  {
    slug: 'oportunidad-ganada-a-caso-de-exito',
    name: 'Oportunidad ganada → caso, anuncio y atribución',
    description: 'Convierte una venta en caso de éxito, anuncio visual, campaña publicada y un informe atribuido tras siete días.',
    graph: {
      variables: {
        caseSource: 'Acabamos de ganar una oportunidad. Redacta un caso de éxito honesto con la estructura situación inicial → intervención → resultado, sin inventar cifras ni testimonios: deja huecos [COMPLETAR] donde falte el dato real.',
        tone: 'cercano y profesional',
        imagePrompt: 'Imagen editorial de caso de éxito B2B, limpia, creíble, sin cifras ni texto inventado',
        campaignName: 'Caso de éxito — campaña automática',
        campaignObjective: 'Convertir la prueba social en nuevas conversaciones comerciales',
        campaignBudgetCents: 5000,
      },
      trigger: { type: 'event', topic: 'opportunity.won' },
      nodes: [
        {
          key: 'caso_de_exito',
          type: 'microapp',
          microappId: 'content-multiplier',
          // El manifiesto exige sourceText|callId + channels. El evento
          // opportunity.won no trae narrativa: la fuente es una consigna
          // editable que el aprobador revisa antes de difundir nada.
          input: {
            sourceText: { var: 'caseSource' },
            channels: ['linkedin', 'instagram', 'email'],
            tone: { var: 'tone' },
          },
        },
        {
          key: 'aprobar_creatividad_y_gasto',
          type: 'approval',
          action: 'spend',
          reason: 'Revisar el caso de éxito y autorizar la generación de sus variantes visuales',
        },
        {
          key: 'generar_variantes',
          type: 'capability',
          capability: 'image.generate',
          tier: 'draft',
          input: { prompt: { var: 'imagePrompt' }, quality: 'draft', count: 3 },
        },
        {
          key: 'mejorar_final',
          type: 'capability',
          capability: 'image.upscale',
          tier: 'premium',
          input: { assetId: { from: 'generar_variantes.assetIds.0' }, mode: 'faithful' },
        },
        {
          key: 'publicar_creatividad',
          type: 'action',
          action: 'publish_asset',
          input: { assetId: { from: 'mejorar_final.assetIds.0' } },
        },
        {
          key: 'preparar_campana',
          type: 'action',
          action: 'landing.create_draft',
          input: {
            name: { var: 'campaignName' },
            objective: { var: 'campaignObjective' },
            budgetCents: { var: 'campaignBudgetCents' },
            adCopy: { var: 'caseSource' },
            imageAssetId: { from: 'publicar_creatividad.assetId' },
            imageUrl: { from: 'publicar_creatividad.imageUrl' },
          },
        },
        {
          key: 'aprobar_activacion',
          type: 'approval',
          action: 'campaign_publish',
          reason: 'Segunda revisión humana: aprobar presupuesto, landing y anuncio antes de activar Meta',
        },
        {
          key: 'publicar_ads_pausada',
          type: 'action',
          action: 'ads.publish_paused',
          input: {
            campaignId: { from: 'preparar_campana.campaignId' },
            budgetCents: { var: 'campaignBudgetCents' },
          },
        },
        {
          key: 'activar_campana',
          type: 'action',
          action: 'ads.activate',
          input: {
            campaignId: { from: 'preparar_campana.campaignId' },
            dailyBudgetCents: 500,
            durationDays: 10,
          },
        },
        {
          key: 'esperar_atribucion',
          type: 'wait',
          seconds: 604800,
        },
        {
          key: 'informe_atribucion',
          type: 'action',
          action: 'attribution_report',
          input: {
            campaignId: { from: 'preparar_campana.campaignId' },
            periodDays: 30,
          },
        },
      ],
      edges: [],
    },
  },
  {
    slug: 'dossier-antes-de-reunion',
    name: 'Dossier antes de la reunión',
    description: 'Investiga la empresa, prepara la llamada y deja una tarea con el dossier listo.',
    graph: {
      variables: { companyName: '', companyWebsite: '', leadId: '' },
      trigger: { type: 'manual' },
      nodes: [
        {
          key: 'investigar',
          type: 'microapp',
          microappId: 'company-research-360',
          input: { companyName: { var: 'companyName' }, website: { var: 'companyWebsite' } },
        },
        {
          key: 'preparar_llamada',
          type: 'microapp',
          microappId: 'call-prep',
          input: { leadId: { var: 'leadId' } },
        },
        {
          key: 'crear_tarea',
          type: 'action',
          action: 'create_task',
          input: {
            title: 'Revisar el dossier antes de la reunión',
            leadId: { var: 'leadId' },
            dueInDays: 1,
          },
        },
      ],
      edges: [],
    },
  },
  {
    slug: 'anuncio-con-imagen-mejorada',
    name: 'Anuncio con imagen mejorada',
    description: 'Genera una imagen en borrador, aprueba el gasto y produce la versión final con upscale.',
    graph: {
      variables: { prompt: 'Imagen para el anuncio' },
      trigger: { type: 'manual' },
      nodes: [
        {
          key: 'generar_imagen',
          type: 'capability',
          capability: 'image.generate',
          tier: 'draft',
          input: { prompt: { var: 'prompt' }, quality: 'draft', count: 1 },
        },
        {
          key: 'aprobar_gasto',
          type: 'approval',
          action: 'spend',
          reason: 'Aprobar el gasto del upscale final de la imagen del anuncio',
        },
        {
          key: 'mejorar_imagen',
          type: 'capability',
          capability: 'image.upscale',
          tier: 'premium',
          input: { assetId: { from: 'generar_imagen.assetIds.0' }, mode: 'faithful' },
        },
        {
          key: 'avisar',
          type: 'action',
          action: 'notify',
          input: { message: 'Imagen final del anuncio lista en la biblioteca' },
        },
      ],
      edges: [],
    },
  },
  {
    slug: 'investigacion-y-diagnostico',
    name: 'Investigación y diagnóstico',
    description: 'Investiga la empresa del prospecto, genera el diagnóstico y deja una tarea de seguimiento.',
    graph: {
      variables: { companyName: '', companyWebsite: '', leadId: '' },
      trigger: { type: 'manual' },
      nodes: [
        {
          key: 'investigar',
          type: 'microapp',
          microappId: 'company-research-360',
          input: { companyName: { var: 'companyName' }, website: { var: 'companyWebsite' } },
        },
        {
          key: 'diagnostico',
          type: 'microapp',
          microappId: 'prospect-diagnosis',
          input: { website: { var: 'companyWebsite' }, businessName: { var: 'companyName' } },
        },
        {
          key: 'crear_tarea',
          type: 'action',
          action: 'create_task',
          input: {
            title: 'Revisar el diagnóstico del prospecto',
            leadId: { var: 'leadId' },
            dueInDays: 2,
          },
        },
      ],
      edges: [],
    },
  },
  {
    slug: 'concepto-a-storyboard',
    name: 'De concepto a storyboard',
    description: 'Desarrolla conceptos de cine, aprueba el gasto y genera un fotograma por escena vía map.',
    graph: {
      variables: {
        objective: '',
        audience: '',
        channel: 'reels',
        durationS: 15,
        // El map recorre esta lista (editable al lanzar): un fotograma por
        // prompt de escena.
        scenePrompts: ['Plano de apertura', 'Plano del conflicto', 'Plano de resolución'],
      },
      trigger: { type: 'manual' },
      nodes: [
        {
          key: 'conceptos',
          type: 'microapp',
          microappId: 'cinema-concepts',
          input: {
            objective: { var: 'objective' },
            audience: { var: 'audience' },
            channel: { var: 'channel' },
            durationS: { var: 'durationS' },
          },
        },
        {
          key: 'aprobar_gasto',
          type: 'approval',
          action: 'spend',
          reason: 'Aprobar la generación de los fotogramas del storyboard',
        },
        {
          key: 'fotogramas',
          type: 'map',
          items: { var: 'scenePrompts' },
          node: 'generar_fotograma',
          concurrency: 1,
        },
        {
          // Plantilla del map: el recorrido lineal la marca 'skipped' y solo
          // la ejecuta el fan-out, una vez por escena con {var:'item'}.
          key: 'generar_fotograma',
          type: 'capability',
          capability: 'image.generate',
          tier: 'draft',
          input: { prompt: { var: 'item' }, quality: 'draft', count: 1 },
        },
        {
          key: 'avisar',
          type: 'action',
          action: 'notify',
          input: { message: 'Storyboard generado: fotogramas disponibles en la biblioteca' },
        },
      ],
      edges: [],
    },
  },
]

// Comparación estable de grafos: Postgres jsonb no conserva el orden de las
// claves, así que un JSON.stringify directo daría siempre "cambiado".
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Publica (upsert idempotente por slug con orgId null) las recetas de sistema.
 * Solo crea una versión nueva cuando el grafo normalizado cambió: reiniciar el
 * worker N veces no acumula N versiones. Cualquier fallo se propaga al caller
 * (flowRunner lo captura y lo registra: una BD sin migrar no tumba el worker).
 */
export async function ensureSystemFlows(): Promise<void> {
  for (const recipe of SYSTEM_RECIPES) {
    // parse normaliza defaults (concurrency, edges, variables) para que la
    // comparación con lo persistido sea estable.
    const normalized = flowGraph.parse(recipe.graph)
    const existing = await prisma.flow.findFirst({ where: { orgId: null, slug: recipe.slug } })
    if (existing?.currentVersionId) {
      const version = await prisma.flowVersion.findUnique({ where: { id: existing.currentVersionId } })
      if (version) {
        const stored = flowGraph.safeParse(version.graph)
        if (stored.success && stableStringify(stored.data) === stableStringify(normalized)) continue
      }
    }
    await publishFlowVersion({
      orgId: null,
      slug: recipe.slug,
      name: recipe.name,
      description: recipe.description,
      graph: recipe.graph,
    })
    console.log(`[Flows] receta de sistema publicada: ${recipe.slug}`)
  }
}
