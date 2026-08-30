import { prisma } from '../lib/prisma'
import { getBusinessProfile } from './businessProfile.service'

export const BUSINESS_INTELLIGENCE_MICROAPP_ID = 'business-opportunity-radar'

export const RESEARCH_LENSES = [
  'costs_suppliers',
  'demand_growth',
  'competition',
  'automation',
  'partnerships',
  'risk',
] as const

export type ResearchLensKey = typeof RESEARCH_LENSES[number]

export type ResearchLens = {
  key: ResearchLensKey
  title: string
  description: string
  outcome: string
  queryAngles: string[]
}

type Vertical = 'hospitality' | 'healthcare' | 'real_estate' | 'restaurants' | 'ecommerce' | 'saas' | 'manufacturing' | 'professional_services' | 'generic'

const VERTICAL_PATTERNS: Array<{ vertical: Vertical; pattern: RegExp }> = [
  { vertical: 'hospitality', pattern: /hotel|hostal|resort|alojamiento|hospitality|turismo|apartahotel|casa rural/i },
  { vertical: 'healthcare', pattern: /cl[ií]nica|salud|m[eé]dic|dent|fisioter|hospital|healthcare/i },
  { vertical: 'real_estate', pattern: /inmobili|real estate|propiedad|vivienda|alquiler/i },
  { vertical: 'restaurants', pattern: /restaurante|hosteler[ií]a|cafeter[ií]a|food|catering/i },
  { vertical: 'ecommerce', pattern: /ecommerce|e-commerce|tienda online|retail|comercio electr[oó]nico/i },
  { vertical: 'saas', pattern: /saas|software|plataforma digital|tecnolog[ií]a|app\b/i },
  { vertical: 'manufacturing', pattern: /fabricaci[oó]n|manufactur|industria|f[aá]brica|producci[oó]n/i },
  { vertical: 'professional_services', pattern: /consultor[ií]a|agencia|asesor[ií]a|despacho|servicios profesionales/i },
]

const LABELS: Record<Vertical, string> = {
  hospitality: 'Hoteles y alojamientos',
  healthcare: 'Salud y clínicas',
  real_estate: 'Inmobiliario',
  restaurants: 'Restauración',
  ecommerce: 'E-commerce y retail',
  saas: 'Software y SaaS',
  manufacturing: 'Industria y fabricación',
  professional_services: 'Servicios profesionales',
  generic: 'Negocio general',
}

export function classifyBusinessVertical(input: { industry?: string | null; description?: string | null }): { key: Vertical; label: string; confidence: 'high' | 'medium' } {
  const text = `${input.industry ?? ''} ${input.description ?? ''}`.trim()
  const match = VERTICAL_PATTERNS.find(item => item.pattern.test(text))
  const key = match?.vertical ?? 'generic'
  return { key, label: LABELS[key], confidence: match ? 'high' : 'medium' }
}

const BASE_LENSES: Record<ResearchLensKey, Omit<ResearchLens, 'key'>> = {
  costs_suppliers: {
    title: 'Proveedores y ahorro',
    description: 'Localiza alternativas de compra y señales de ahorro sin afirmar precios que no estén publicados.',
    outcome: 'Candidatos comparables, evidencia de precio y preguntas de negociación.',
    queryAngles: ['proveedores mayoristas', 'comparativa de precios', 'costes operativos y benchmarks'],
  },
  demand_growth: {
    title: 'Demanda y crecimiento',
    description: 'Busca cambios de demanda, estacionalidad y segmentos con intención observable.',
    outcome: 'Oportunidades priorizadas con impacto, esfuerzo y primera acción.',
    queryAngles: ['tendencias de demanda', 'crecimiento del sector', 'segmentos emergentes'],
  },
  competition: {
    title: 'Competencia y posicionamiento',
    description: 'Contrasta propuestas, canales y movimientos públicos de competidores.',
    outcome: 'Huecos de posicionamiento y respuestas comerciales verificables.',
    queryAngles: ['competidores principales', 'benchmark de propuesta de valor', 'nuevos servicios y ofertas'],
  },
  automation: {
    title: 'Automatización y eficiencia',
    description: 'Investiga procesos del sector que pueden reducir trabajo manual o pérdidas de conversión.',
    outcome: 'Casos de automatización con requisito, riesgo y métrica de éxito.',
    queryAngles: ['automatización operativa', 'software especializado', 'casos de uso inteligencia artificial'],
  },
  partnerships: {
    title: 'Alianzas y distribución',
    description: 'Descubre socios, canales y acuerdos que puedan ampliar demanda o distribución.',
    outcome: 'Mapa de socios potenciales y propuesta concreta de colaboración.',
    queryAngles: ['socios de distribución', 'alianzas sectoriales', 'canales de adquisición'],
  },
  risk: {
    title: 'Riesgos y cambios',
    description: 'Vigila regulación, costes, reputación y cambios de mercado que exigen actuar.',
    outcome: 'Riesgos con evidencia, horizonte y plan de verificación.',
    queryAngles: ['regulación reciente', 'riesgos operativos', 'cambios de costes y demanda'],
  },
}

const VERTICAL_OVERRIDES: Partial<Record<Vertical, Partial<Record<ResearchLensKey, Partial<Omit<ResearchLens, 'key'>>>>>> = {
  hospitality: {
    costs_suppliers: {
      description: 'Compara candidatos para amenities, lavandería, limpieza, alimentación, energía y mantenimiento.',
      queryAngles: ['proveedores para hoteles amenities lavandería limpieza', 'compra hotelera comparativa precios', 'ahorro energético hoteles'],
    },
    demand_growth: {
      description: 'Cruza turismo, eventos, conectividad, estacionalidad y tipos de huésped de la zona.',
      queryAngles: ['tendencias turismo ocupación hotelera', 'eventos y demanda alojamiento', 'segmentos viajeros en crecimiento'],
    },
    automation: {
      description: 'Busca mejoras en reservas, atención telefónica, upselling, check-in y experiencia del huésped.',
      queryAngles: ['automatización reservas hotel', 'IA atención huésped hotel', 'upselling hotel software'],
    },
    partnerships: {
      description: 'Explora acuerdos con operadores, eventos, empresas locales y experiencias para huéspedes.',
      queryAngles: ['alianzas hoteles empresas locales', 'partners experiencias turísticas', 'acuerdos alojamiento eventos'],
    },
  },
  healthcare: {
    costs_suppliers: { queryAngles: ['proveedores material clínico comparativa', 'compras clínicas ahorro', 'software clínica precios'] },
    demand_growth: { queryAngles: ['demanda tratamientos clínicas', 'tendencias pacientes salud privada', 'servicios médicos crecimiento'] },
    automation: { queryAngles: ['automatización citas clínica', 'IA atención pacientes', 'reducción no show clínicas'] },
  },
  restaurants: {
    costs_suppliers: { queryAngles: ['proveedores hostelería mayoristas precios', 'coste materias primas restaurante', 'ahorro energético restauración'] },
    demand_growth: { queryAngles: ['tendencias consumo restauración', 'demanda delivery reservas', 'eventos gastronomía locales'] },
  },
  ecommerce: {
    costs_suppliers: { queryAngles: ['proveedores logística ecommerce precios', 'packaging mayorista comparativa', 'coste fulfillment ecommerce'] },
    demand_growth: { queryAngles: ['tendencias ecommerce categoría', 'productos demanda creciente', 'marketplaces crecimiento'] },
  },
}

export function buildResearchLenses(vertical: Vertical): ResearchLens[] {
  return RESEARCH_LENSES.map((key) => ({
    key,
    ...BASE_LENSES[key],
    ...(VERTICAL_OVERRIDES[vertical]?.[key] ?? {}),
  }))
}

export async function getBusinessIntelligenceContext(orgId: string) {
  const source = await getBusinessProfile(orgId)
  if (!source) return null
  const vertical = classifyBusinessVertical({ industry: source.company.industry, description: source.profile.description })
  const missing = [
    !source.profile.description.trim() ? 'Descripción del negocio' : null,
    !source.company.industry?.trim() ? 'Sector' : null,
    !source.profile.idealCustomer.trim() ? 'Cliente ideal' : null,
    !source.profile.valueProposition.trim() ? 'Propuesta de valor' : null,
    !source.company.address?.trim() ? 'Ubicación o mercado' : null,
  ].filter((value): value is string => Boolean(value))
  return {
    ...source,
    vertical,
    lenses: buildResearchLenses(vertical.key),
    intelligenceReadiness: {
      score: Math.round(((5 - missing.length) / 5) * 100),
      missing,
      canResearch: Boolean(source.company.name.trim() && (source.company.industry?.trim() || source.profile.description.trim())),
    },
  }
}

export async function listBusinessInvestigations(orgId: string, limit = 6) {
  const [investigations, activeJobs] = await Promise.all([
    prisma.microappRun.findMany({
      where: { orgId, microappId: BUSINESS_INTELLIGENCE_MICROAPP_ID },
      select: { id: true, jobId: true, version: true, input: true, result: true, staleAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
    }),
    prisma.job.findMany({
      where: { orgId, microappId: BUSINESS_INTELLIGENCE_MICROAPP_ID, status: { in: ['pending', 'running', 'waiting_provider'] } },
      select: { id: true, status: true, progress: true, createdAt: true, costEstimateCents: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])
  return {
    investigations,
    activeJobs: activeJobs.map(job => ({ ...job, costEstimateCents: job.costEstimateCents == null ? null : Number(job.costEstimateCents) })),
  }
}
