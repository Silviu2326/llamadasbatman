import { prisma } from '../lib/prisma'
import { getConnectorHealth } from './verticalConnector.service'
import { getIngestFreshness } from './organicGoogleIngest.service'

/**
 * Integridad de las fuentes orgánicas — Fase 0 de `docs/vendrava/organico.md`.
 *
 * El defecto que repara: hoy la página promete paneles (`potentialCustomers`,
 * `competitorGap`, `demand`…) que ningún endpoint envía, así que se renderizan
 * vacíos para siempre y el usuario no sabe si es que no hay datos o es que la
 * integración no existe.
 *
 * La distinción que gobierna este servicio es la del §6: una integración
 * **conectada cuyo dato todavía no se ingiere** no es un panel vacío ni un
 * cero; es `connected_no_ingest`, y se dice qué fase la activará. Callarlo
 * hace creer que el negocio no tiene tráfico cuando lo que no hay es lectura.
 */

export type SourceStatus =
  | 'ready'
  | 'connected_no_ingest'
  | 'not_connected'
  | 'not_configured'
  | 'error'

export type OrganicSource = {
  key: string
  label: string
  status: SourceStatus
  detail: string
  /** Qué se desbloquea al conectarla; es la razón para molestarse en hacerlo. */
  unlocks?: string
  lastSyncAt?: Date | null
  rows?: number | null
  action?: string
}

export type OrganicDataQuality = {
  status: 'ready' | 'partial' | 'stale' | 'unreliable'
  sources: OrganicSource[]
  issues: string[]
  computedAt: string
}

/** Los Insights de búsqueda se sincronizan a diario; el doble es tolerable. */
const SEARCH_CONSOLE_STALE_HOURS = 48

function hoursSince(date: Date | null | undefined): number | null {
  if (!date) return null
  return (Date.now() - date.getTime()) / 3_600_000
}

export async function getOrganicDataQuality(orgId: string, projectId: string | null): Promise<OrganicDataQuality> {
  const issues: string[] = []

  const [integrations, queryOpportunities, lastProspectImport, landingEvents, org, freshness] = await Promise.all([
    projectId
      ? prisma.organicIntegration.findMany({ where: { orgId, projectId } })
      : Promise.resolve([]),
    projectId
      ? prisma.organicOpportunity.count({ where: { orgId, projectId } })
      : Promise.resolve(0),
    prisma.acquisitionEvent.findFirst({
      where: { orgId, type: 'prospect_import' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.acquisitionEvent.count({
      where: { orgId, type: { in: ['landing_view', 'landing_lead'] } },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { metricoolEnabled: true } }),
    // La frescura solo decora la banda de integridad («último dato el X»). Iba
    // dentro del Promise.all sin red: cuando la consulta falló —la tabla de
    // ingesta no existía todavía en la base— se llevó por delante la calidad de
    // datos, y con ella el overview y la sala de autonomía, que devolvieron 500.
    // Una decoración no puede tumbar el centro de mando: degrada a vacío.
    projectId
      ? getIngestFreshness(orgId, projectId).catch((error) => {
        console.warn('[OrganicDataQuality] frescura de ingesta no disponible:', (error as Error).message)
        return new Map<string, { lastDate: Date | null; rows: number }>()
      })
      : Promise.resolve(new Map<string, { lastDate: Date | null; rows: number }>()),
  ])

  const byProvider = new Map(integrations.map(item => [item.provider, item]))

  // ── Search Console: la única fuente con ingesta real hoy ───────────────────
  const searchConsole = byProvider.get('search_console') ?? byProvider.get('google_search_console')
  const scHours = hoursSince(searchConsole?.lastSyncedAt)
  const sources: OrganicSource[] = [
    {
      key: 'search_console',
      label: 'Search Console',
      status: !searchConsole || searchConsole.status !== 'connected'
        ? 'not_connected'
        : searchConsole.lastError
          ? 'error'
          : !searchConsole.externalPropertyId
            ? 'connected_no_ingest'
            : 'ready',
      detail: !searchConsole || searchConsole.status !== 'connected'
        ? 'Sin conectar: no se puede saber qué búsquedas te encuentran.'
        : searchConsole.lastError
          ? `Última sincronización con error: ${searchConsole.lastError}`
          : !searchConsole.externalPropertyId
            ? 'Conectada, pero falta elegir la propiedad que se va a leer.'
            : `${queryOpportunities} consultas ingeridas${scHours != null ? ` · última sync hace ${Math.round(scHours)} h` : ''}`,
      unlocks: 'Qué keywords te traen visitas y cuáles tienen demanda sin contenido que la capture.',
      lastSyncAt: searchConsole?.lastSyncedAt ?? null,
      rows: searchConsole?.externalPropertyId ? queryOpportunities : null,
      action: !searchConsole || searchConsole.status !== 'connected'
        ? 'Conectar Google'
        : !searchConsole.externalPropertyId
          ? 'Elegir propiedad'
          : undefined,
    },
  ]

  // ── GA4 y GBP: ya se ingieren; el estado sale de si han traído filas ──────
  for (const [provider, label, unlocks, needs] of [
    ['ga4', 'Google Analytics 4', 'Las visitas orgánicas reales por página, no solo las impresiones de búsqueda.', 'una propiedad'],
    ['google_business_profile', 'Perfil de Empresa de Google', 'Vistas de ficha, llamadas desde Google y reseñas sin responder.', 'una ubicación'],
  ] as const) {
    const integration = byProvider.get(provider)
    const connected = integration?.status === 'connected'
    const ingest = freshness.get(provider)
    const ingestHours = hoursSince(integration?.lastSyncedAt)
    const status: SourceStatus = !connected
      ? 'not_connected'
      : integration?.lastError
        ? 'error'
        : !integration?.externalPropertyId || !ingest?.rows
          ? 'connected_no_ingest'
          : 'ready'
    sources.push({
      key: provider,
      label,
      status,
      detail: !connected
        ? 'Sin conectar.'
        : integration?.lastError
          ? `Última sincronización con error: ${integration.lastError}`
          : !integration?.externalPropertyId
            ? `Conectada, pero falta elegir ${needs} que leer.`
            : !ingest?.rows
              ? 'Conectada y con recurso elegido, pero todavía no ha traído ni un día de datos. Sincroniza para empezar a medir.'
              : `${ingest.rows} días ingeridos · último dato del ${ingest.lastDate?.toISOString().slice(0, 10)}` +
                `${ingestHours != null ? ` · última sync hace ${Math.round(ingestHours)} h` : ''}`,
      unlocks,
      lastSyncAt: integration?.lastSyncedAt ?? null,
      rows: ingest?.rows ?? null,
      action: !connected
        ? 'Conectar Google'
        : !integration?.externalPropertyId
          ? provider === 'ga4' ? 'Elegir propiedad' : 'Elegir ubicación'
          : !ingest?.rows
            ? 'Sincronizar'
            : undefined,
    })
    if (connected && integration?.lastError) {
      issues.push(`${label} falló en su última sincronización (${integration.lastError}): sus datos están congelados.`)
    } else if (connected && !ingest?.rows) {
      issues.push(`${label} está conectado pero todavía no ha traído datos: el embudo orgánico es parcial hasta la primera sincronización.`)
    }
  }

  // ── Metricool ─────────────────────────────────────────────────────────────
  const metricoolConfigured = Boolean(process.env.METRICOOL_USER_TOKEN && process.env.METRICOOL_BLOG_ID)
  sources.push({
    key: 'metricool',
    label: 'Metricool (redes)',
    status: !org?.metricoolEnabled ? 'not_configured' : metricoolConfigured ? 'connected_no_ingest' : 'not_connected',
    detail: !org?.metricoolEnabled
      ? 'No incluido en la configuración de esta organización.'
      : metricoolConfigured
        ? 'Configurado, pero los posts publicados todavía no se registran localmente: sin ese registro no hay atribución post → lead.'
        : 'Faltan credenciales de Metricool.',
    unlocks: 'Qué publicación concreta trajo cada lead.',
  })

  // ── Telemetría de landings ────────────────────────────────────────────────
  sources.push({
    key: 'landing_telemetry',
    label: 'Telemetría de landings',
    status: landingEvents > 0 ? 'ready' : 'connected_no_ingest',
    detail: landingEvents > 0
      ? `${landingEvents} eventos de landing registrados.`
      : 'Sin eventos de landing todavía: no se puede medir qué pasa entre la visita y el lead.',
    unlocks: 'El tramo visita → lead, que es donde más tráfico se pierde.',
  })

  // ── Prospección ───────────────────────────────────────────────────────────
  const placesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY)
  sources.push({
    key: 'prospecting',
    label: 'Prospección',
    status: !placesConfigured ? 'not_configured' : lastProspectImport ? 'ready' : 'connected_no_ingest',
    detail: !placesConfigured
      ? 'Falta la clave de Google Places.'
      : lastProspectImport
        ? `Última importación el ${lastProspectImport.createdAt.toISOString().slice(0, 10)}.`
        : 'Configurada, sin importaciones todavía.',
    unlocks: 'Qué sector y ciudad producen prospectos que acaban comprando.',
    lastSyncAt: lastProspectImport?.createdAt ?? null,
  })

  // ── Conectores verticales: una fila por conector dado de alta (§5.1) ──────
  // Decía "llegan en la fase 2" mucho después de que la fase 2 los construyera:
  // una fila congelada en el futuro es tan falsa como un panel vacío.
  const connectors = await getConnectorHealth(orgId)
  if (!connectors.length) {
    sources.push({
      key: 'vertical_connectors',
      label: 'Conectores del sector',
      status: 'not_configured',
      detail: 'Sin conectores dados de alta: el contenido no puede usar datos propios del negocio.',
      unlocks: 'Contenido generado con datos reales del negocio, no plantillas.',
    })
  } else {
    for (const connector of connectors) {
      sources.push({
        key: connector.key,
        label: `${connector.label} (${connector.module})`,
        status: connector.status as SourceStatus,
        detail: connector.detail,
        unlocks: 'Contenido generado con datos reales del negocio, no plantillas.',
        lastSyncAt: connector.lastSyncAt,
      })
      if (connector.status === 'error') {
        issues.push(`El conector "${connector.label}" está en error y no está entregando acontecimientos.`)
      }
    }
  }

  // ── Veredicto ─────────────────────────────────────────────────────────────
  if (!projectId) {
    issues.push('Todavía no hay proyecto orgánico: nada se está midiendo.')
  }
  if (searchConsole?.lastError) {
    issues.push(`Search Console devolvió un error en su última sincronización: ${searchConsole.lastError}`)
  }
  const searchConsoleStale = scHours != null && scHours > SEARCH_CONSOLE_STALE_HOURS
  if (searchConsoleStale) {
    issues.push(`Los datos de búsqueda tienen ${Math.round(scHours!)} h: las comparaciones por canal pueden estar desfasadas.`)
  }

  const ready = sources.filter(source => source.status === 'ready').length
  const status: OrganicDataQuality['status'] = !projectId || ready === 0
    ? 'unreliable'
    : searchConsoleStale
      ? 'stale'
      : ready === sources.length
        ? 'ready'
        : 'partial'

  return { status, sources, issues, computedAt: new Date().toISOString() }
}
