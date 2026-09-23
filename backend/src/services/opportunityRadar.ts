import { z } from 'zod'
import { radarKnowledgeSchema } from './radarKnowledge.schema'

export const RADAR_KINDS = ['clients', 'properties', 'suppliers', 'influencers', 'partners'] as const
export const RADAR_BUSINESSES = ['real_estate', 'software', 'services', 'commerce', 'hospitality', 'industry', 'other'] as const
const radarObjectiveSchema = z.object({
  kind: z.enum(RADAR_KINDS),
  target: z.string().trim().min(3).max(300),
  criteria: z.string().trim().max(600).default(''),
  exclusions: z.string().trim().max(300).optional(),
  signals: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
  channels: z.array(z.enum(['web', 'linkedin', 'instagram', 'youtube'])).min(1).max(4).optional(),
}).strict()
export const radarSearchSchema = radarObjectiveSchema.extend({
  businessType: z.enum(RADAR_BUSINESSES).optional(),
  name: z.string().trim().max(100).optional(),
  offering: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(500).optional(),
  companyKnowledge: radarKnowledgeSchema.optional(),
  location: z.string().trim().min(2).max(200),
  objectives: z.array(radarObjectiveSchema).min(1).max(5).optional(),
}).strict().superRefine((value, ctx) => {
  const objectives = value.objectives || [value]
  if (value.businessType && value.businessType !== 'real_estate' && objectives.some(item => item.kind === 'properties')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kind'], message: 'La captación de inmuebles requiere un negocio inmobiliario.' })
  }
  if (new Set(objectives.map(item => item.kind)).size !== objectives.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objectives'], message: 'Selecciona cada objetivo una sola vez.' })
  if (value.objectives?.length && (value.kind !== value.objectives[0].kind || value.target !== value.objectives[0].target)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objectives'], message: 'El objetivo principal debe coincidir con el primer objetivo.' })
})
export type RadarSearch = z.infer<typeof radarSearchSchema>

type BusinessContext = {
  company: { industry?: string | null; address?: string | null }
  profile: { description: string; idealCustomer: string }
}

/** Suggestions come from the company's own activity, never from its customers' sector alone. */
export function radarSetup(context: BusinessContext) {
  const industry = context.company.industry || ''
  const description = context.profile.description || ''
  const activityDescription = description.split(/\bpara\b/i)[0]
  const text = `${industry} ${activityDescription}`
  const suggestedType = /software|saas|plataforma|aplicaci[oó]n|app\b/i.test(text) ? 'software'
    : /inmobili|real estate|captaci[oó]n de (pisos|viviendas)/i.test(text) ? 'real_estate'
    : /hotel|restaurante|hosteler|turismo|alojamiento/i.test(industry || description) ? 'hospitality'
    : /ecommerce|e-commerce|tienda|comercio|retail/i.test(industry || description) ? 'commerce'
    : /f[aá]brica|industria|manufactur/i.test(industry || description) ? 'industry'
    : /servicio|agencia|consultor|peluquer|cl[ií]nica|despacho/i.test(industry || description) ? 'services' : 'other'
  const customer = (context.profile.idealCustomer || description.match(/(?:software|plataforma|aplicaci[oó]n|sistema).{0,70}?\bpara\s+([^.;\n]{3,180})/i)?.[1] || '').trim().slice(0, 300)
  const definitions = [
    { id: 'real_estate', label: 'Inmobiliaria', description: 'Captación, venta o alquiler de inmuebles.', supplier: 'Empresas de fotografía inmobiliaria y reformas', partner: 'Administradores de fincas y agencias de reubicación', audience: 'vivienda y decoración' },
    { id: 'software', label: 'Software y tecnología', description: 'Vendes una aplicación, una plataforma o un servicio digital.', supplier: 'Proveedores de infraestructura y servicios tecnológicos', partner: 'Consultoras e integradores de software', audience: customer || 'tecnología' },
    { id: 'services', label: 'Servicios', description: 'Ofreces servicios profesionales o atención en un negocio local.', supplier: '', partner: '', audience: industry },
    { id: 'commerce', label: 'Comercio y tienda online', description: 'Vendes productos en una tienda o por internet.', supplier: 'Fabricantes y distribuidores mayoristas', partner: 'Distribuidores y tiendas colaboradoras', audience: industry },
    { id: 'hospitality', label: 'Hostelería y turismo', description: 'Alojamiento, restauración o experiencias turísticas.', supplier: 'Proveedores de alimentación y equipamiento para hostelería', partner: 'Agencias de viajes y organizadores de eventos', audience: 'gastronomía y viajes' },
    { id: 'industry', label: 'Industria y fabricación', description: 'Fabricas productos o suministras a otras empresas.', supplier: 'Proveedores de materias primas y componentes', partner: 'Distribuidores industriales', audience: industry },
    { id: 'other', label: 'Otro tipo de negocio', description: 'Define a quién necesitas encontrar sin asumir un sector.', supplier: '', partner: '', audience: '' },
  ]
  return {
    suggestedType,
    reason: suggestedType === 'other' ? 'El perfil no permite identificar la actividad con suficiente claridad. Elige la que mejor te represente.' : 'Sugerido a partir del sector y la descripción de tu empresa. Puedes corregirlo para este radar.',
    businesses: definitions.map(business => ({
      id: business.id, label: business.label, description: business.description,
      goals: [
        ...(business.id === 'real_estate' ? [{ kind: 'properties', label: 'Captar inmuebles', description: 'Anuncios de particulares con propiedades que puedas comercializar.', target: 'Pisos en venta de particulares', criteriaPlaceholder: 'Venta o alquiler, precio máximo, m², habitaciones…' }] : []),
        { kind: 'clients', label: business.id === 'software' ? 'Encontrar empresas que usarían mi software' : 'Encontrar clientes', description: business.id === 'software' ? 'Busca a tus compradores: por ejemplo, peluquerías si tu software gestiona sus citas.' : 'Negocios o perfiles públicos que encajen con tu cliente ideal.', target: business.id === suggestedType ? customer : '', criteriaPlaceholder: 'Especialidad, tamaño del negocio, necesidades…' },
        { kind: 'suppliers', label: 'Encontrar proveedores', description: 'Empresas que puedan suministrar lo que tu negocio necesita.', target: business.supplier, criteriaPlaceholder: 'Producto o servicio, cobertura, pedido mínimo…' },
        { kind: 'influencers', label: 'Encontrar creadores e influencers', description: 'Perfiles públicos con contenido afín a la audiencia que quieres alcanzar.', target: business.audience ? `Creadores de contenido sobre ${business.audience}`.slice(0, 300) : '', criteriaPlaceholder: 'Temática, idioma, plataforma, audiencia…' },
        { kind: 'partners', label: 'Encontrar colaboradores', description: 'Socios, distribuidores o negocios con los que crear acuerdos.', target: business.partner, criteriaPlaceholder: 'Especialidad, canal de distribución, tipo de acuerdo…' },
      ],
    })),
  }
}

export function radarDefaults(context: BusinessContext) {
  const setup = radarSetup(context)
  const goal = setup.businesses.find(item => item.id === setup.suggestedType)!.goals[0]
  return {
    kind: goal.kind as 'properties' | 'clients',
    target: goal.target,
    location: context.company.address?.trim().slice(0, 200) || '',
    criteria: '',
  }
}

export function radarQueries(search: RadarSearch): string[] {
  if (search.objectives) {
    const batches = search.objectives.map(objective => radarQueries({ ...objective, location: search.location }))
    return [...new Set(Array.from({ length: 4 }, (_, index) => batches.map(batch => batch[index]).filter(Boolean)).flat())].slice(0, 20)
  }
  const subject = `${search.target} ${search.location}`
  const angles: Record<RadarSearch['kind'], string[]> = {
    clients: ['web contacto', 'empresas negocios', 'directorio local'],
    properties: ['anuncio venta particular', 'inmueble precio superficie', 'piso casa contacto propietario'],
    suppliers: ['proveedor distribuidor contacto', 'catálogo servicios cobertura', 'mayorista fabricante'],
    influencers: ['creador influencer perfil', 'site:instagram.com', 'site:youtube.com'],
    partners: ['colaboración empresa contacto', 'distribuidor socio', 'asociación profesional'],
  }
  const channels = search.channels?.filter(channel => channel !== 'web') || []
  const suffix = channels.length && !search.channels?.includes('web') ? ` (${channels.map(channel => `site:${channel}.com`).join(' OR ')})` : ''
  const criteria = `${search.criteria} ${(search.signals || []).join(' ')}`
  const selectedAngles = [...channels.map(channel => `site:${channel}.com`), ...angles[search.kind].filter(angle => !channels.length || !angle.startsWith('site:'))].slice(0, 3)
  return [...new Set([`${subject} ${criteria}`, ...selectedAngles.map(angle => `${subject} ${angle} ${criteria}`)]
    .map(query => `${query.replace(/\s+/g, ' ').trim().slice(0, 380 - suffix.length)}${suffix}`))].slice(0, 4)
}

export const radarCandidateSchema = z.object({
  name: z.string(), kind: z.enum(RADAR_KINDS), location: z.string().nullable(),
  rationale: z.string(), sourceUrl: z.string().url(), sourceTitle: z.string(), sourceSnippet: z.string(),
  detail: z.string().nullable(), detectedAt: z.string(), status: z.literal('candidate'),
})
type Source = { title: string; url: string; snippet: string }
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
export function publicSourceUrl(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}

/** Model-written URLs and unsupported names, locations or figures never become table data. */
export function groundedCandidates(raw: unknown, sources: Source[], search: RadarSearch, detectedAt: string) {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : []).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const kind = search.objectives ? search.objectives.find(objective => objective.kind === item.kind)?.kind : search.kind
    if (!kind) return []
    const index = Number(item.source)
    const source = Number.isInteger(index) && index > 0 ? sources[index - 1] : null
    const name = text(item.name, 220)
    const rationale = text(item.rationale, 900)
    if (!source || !publicSourceUrl(source.url) || name.length < 3 || !rationale) return []
    const evidence = normalized(`${source.title} ${source.snippet}`)
    if (!evidence.includes(normalized(name))) return []
    const key = `${kind}|${source.url}|${normalized(name)}`
    if (seen.has(key)) return []
    seen.add(key)
    const location = text(item.location, 200)
    const detail = text(item.detail, 300)
    return [{ name, kind, rationale, sourceUrl: source.url, sourceTitle: source.title, sourceSnippet: source.snippet,
      location: location && evidence.includes(normalized(location)) ? location : null,
      detail: detail && evidence.includes(normalized(detail)) ? detail : null,
      detectedAt, status: 'candidate' as const,
    }]
  }).slice(0, 20)
}
