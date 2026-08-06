import { prisma } from '../lib/prisma'
import { fetchWithTimeout } from '../lib/integrationRuntime'
import { VERTICAL_MODULES, detectSectors, getModule, type VerticalModule } from '../data/verticalModules'

/**
 * Onboarding adaptativo — `docs/vendrava/organico.md` §4.
 *
 * El recorrido: formulario universal → Vendrava investiga el negocio → detecta
 * sector con confianza → el usuario confirma o corrige → cargan las preguntas
 * de ese sector → se activan las reglas del núcleo universal.
 *
 * Dos decisiones que gobiernan el diseño:
 *
 * 1. **Los módulos verticales son datos** (`data/verticalModules.ts`). Este
 *    servicio no conoce ningún sector: pide el módulo por su clave y sirve sus
 *    preguntas. Añadir "clínicas" no toca este archivo.
 *
 * 2. **La aprobación automática nunca excede la frontera de la §9.** El
 *    onboarding puede pedir `auto` para un formato, pero el contenido público
 *    nuevo sigue pasando por la sala de aprobación hasta que el nivel se gane
 *    con uso. Se aplica al guardar, no se confía en lo que llegue del cliente.
 */

const STEPS = ['business', 'sector', 'sources', 'events', 'content', 'approval', 'activation'] as const
export type OnboardingStep = (typeof STEPS)[number]

const SITE_FETCH_TIMEOUT_MS = 8_000
const MAX_SITE_BYTES = 400_000

export class OnboardingError extends Error {
  readonly statusCode = 400
  constructor(message: string) {
    super(message)
    this.name = 'OnboardingError'
  }
}

function moduleSummary(module: VerticalModule) {
  return {
    key: module.key,
    label: module.label,
    questionGroups: module.questionGroups,
    events: module.events,
    channels: module.channels,
    suggestedSources: module.suggestedSources,
  }
}

export async function getOnboarding(orgId: string) {
  const project = await prisma.organicProject.findUnique({
    where: { orgId },
    include: { contentRules: { orderBy: { label: 'asc' } } },
  })

  const modules = project?.sectors?.length
    ? project.sectors.map(getModule).filter((module): module is VerticalModule => module != null)
    : []

  return {
    status: project?.onboardingStatus ?? 'not_started',
    step: (project?.onboardingStep as OnboardingStep | null) ?? 'business',
    steps: STEPS,
    project: project
      ? {
          id: project.id,
          name: project.name,
          website: project.website,
          locations: project.locations,
          sectors: project.sectors,
          businessModel: project.businessModel,
          primaryGoal: project.primaryGoal,
          businessDescription: project.businessDescription,
          audience: project.audience,
          socialProfiles: project.socialProfiles,
          personalizationLevel: project.personalizationLevel,
          moduleAnswers: project.moduleAnswers,
        }
      : null,
    /** Preguntas del sector confirmado; vacío mientras no haya sector. */
    modules: modules.map(moduleSummary),
    rules: project?.contentRules ?? [],
    /** Catálogo completo, para poder corregir el sector detectado. */
    availableModules: VERTICAL_MODULES.map(module => ({ key: module.key, label: module.label })),
  }
}

/** Extrae texto legible del HTML sin dependencias: basta para el vocabulario. */
function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SITE_BYTES)
}

/**
 * Pantalla 2: Vendrava investiga el negocio y propone sectores con su confianza.
 *
 * Lee la web de verdad y puntúa contra el vocabulario de cada módulo. Devuelve
 * los términos encontrados para que la confianza sea **defendible**: el usuario
 * ve por qué se dedujo el sector y puede corregirlo con criterio, en vez de
 * aceptar un porcentaje salido de ninguna parte.
 */
export async function investigate(orgId: string, website?: string) {
  const project = await prisma.organicProject.findUnique({ where: { orgId } })
  const url = (website ?? project?.website ?? '').trim()
  if (!url) throw new OnboardingError('Hace falta la web del negocio para poder investigarlo.')

  let target: URL
  try {
    target = new URL(url.includes('://') ? url : `https://${url}`)
  } catch {
    throw new OnboardingError(`"${url}" no es una dirección web válida.`)
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new OnboardingError('Solo se pueden analizar direcciones http o https.')
  }

  let text = ''
  let fetchError: string | null = null
  try {
    const response = await fetchWithTimeout(target.toString(), { redirect: 'follow' }, SITE_FETCH_TIMEOUT_MS)
    if (!response.ok) {
      fetchError = `La web respondió ${response.status}.`
    } else {
      text = textFromHtml((await response.text()).slice(0, MAX_SITE_BYTES))
    }
  } catch (error) {
    fetchError = `No se pudo leer la web: ${(error as Error).message}`
  }

  // Se suma lo que el usuario ya contó: si la web no es legible, su propia
  // descripción sigue siendo señal válida en vez de dejarlo sin resultado.
  const declared = [project?.businessDescription, project?.name, ...(project?.services ?? [])]
    .filter(Boolean)
    .join(' ')
  const sectors = detectSectors(`${text} ${declared}`)

  return {
    website: target.toString(),
    analyzedChars: text.length,
    fetchError,
    sectors,
    // Sin coincidencias no se inventa un sector: se pide que lo elija.
    needsManualChoice: sectors.length === 0,
    availableModules: VERTICAL_MODULES.map(module => ({ key: module.key, label: module.label })),
  }
}

type SavePayload = {
  step?: OnboardingStep
  name?: string
  website?: string
  locations?: string[]
  sectors?: string[]
  businessModel?: string
  primaryGoal?: string
  businessDescription?: string
  audience?: string
  socialProfiles?: string[]
  moduleAnswers?: Record<string, unknown>
}

/** Guarda el paso actual. Idempotente: se puede retomar donde se dejó (§6). */
export async function saveOnboarding(orgId: string, payload: SavePayload) {
  const existing = await prisma.organicProject.findUnique({ where: { orgId } })

  const data = {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.website !== undefined ? { website: payload.website } : {}),
    ...(payload.locations !== undefined ? { locations: payload.locations } : {}),
    ...(payload.sectors !== undefined ? { sectors: payload.sectors } : {}),
    ...(payload.businessModel !== undefined ? { businessModel: payload.businessModel } : {}),
    ...(payload.primaryGoal !== undefined ? { primaryGoal: payload.primaryGoal } : {}),
    ...(payload.businessDescription !== undefined ? { businessDescription: payload.businessDescription } : {}),
    ...(payload.audience !== undefined ? { audience: payload.audience } : {}),
    ...(payload.socialProfiles !== undefined ? { socialProfiles: payload.socialProfiles } : {}),
    ...(payload.moduleAnswers !== undefined ? { moduleAnswers: payload.moduleAnswers as object } : {}),
    ...(payload.step ? { onboardingStep: payload.step } : {}),
    onboardingStatus: 'in_progress',
  }

  if (!existing) {
    if (!payload.name) throw new OnboardingError('Hace falta el nombre del negocio para empezar.')
    await prisma.organicProject.create({ data: { orgId, name: payload.name, ...data } })
  } else {
    await prisma.organicProject.update({ where: { orgId }, data })
  }
  return getOnboarding(orgId)
}

type RuleChoice = {
  moduleKey: string
  eventKey: string
  formats?: string[]
  timings?: string[]
  channels?: string[]
  approvalPolicy?: 'auto' | 'approval' | 'always_approval'
  isActive?: boolean
}

/**
 * Activación: traduce las respuestas al núcleo universal y crea las reglas.
 *
 * Aquí se aplica la frontera de la §9 sin negociación: un acontecimiento
 * marcado como sensible por su módulo queda en `always_approval` aunque el
 * cliente pida automático, y sin el permiso de imágenes de personas ninguna
 * regla puede ser automática.
 */
export async function completeOnboarding(orgId: string, choices: RuleChoice[]) {
  const project = await prisma.organicProject.findUnique({ where: { orgId } })
  if (!project) throw new OnboardingError('No hay proyecto que activar.')
  if (!project.sectors.length) throw new OnboardingError('Confirma primero el sector del negocio.')

  const answers = (project.moduleAnswers ?? {}) as Record<string, Record<string, unknown>>
  const created: string[] = []

  for (const choice of choices) {
    const module = getModule(choice.moduleKey)
    const event = module?.events.find(item => item.key === choice.eventKey)
    if (!module || !event) continue

    // Sin permiso declarado para nombres y fotos, nada puede publicarse solo.
    const mediaConsent = answers[module.key]?.playerMediaConsent
    const consentBlocked = mediaConsent === false

    const requested = choice.approvalPolicy ?? event.defaultApproval
    const approvalPolicy = event.sensitive
      ? 'always_approval'
      : consentBlocked && requested === 'auto'
        ? 'approval'
        : requested

    await prisma.organicContentRule.upsert({
      where: { projectId_moduleKey_eventKey: { projectId: project.id, moduleKey: module.key, eventKey: event.key } },
      create: {
        orgId,
        projectId: project.id,
        moduleKey: module.key,
        eventKey: event.key,
        label: event.label,
        formats: choice.formats ?? event.suggestedFormats,
        timings: choice.timings ?? event.suggestedTimings,
        channels: choice.channels ?? module.channels.slice(0, 3),
        approvalPolicy,
        sensitive: Boolean(event.sensitive),
        isActive: choice.isActive !== false,
      },
      update: {
        formats: choice.formats ?? event.suggestedFormats,
        timings: choice.timings ?? event.suggestedTimings,
        channels: choice.channels ?? module.channels.slice(0, 3),
        approvalPolicy,
        isActive: choice.isActive !== false,
      },
    })
    created.push(event.label)
  }

  await prisma.organicProject.update({
    where: { orgId },
    data: {
      onboardingStatus: 'complete',
      onboardingStep: 'activation',
      // Nivel 1: plantilla sectorial. El 2 exige conectores reales (fase 2).
      personalizationLevel: Math.max(project.personalizationLevel, 1),
    },
  })

  const rules = await prisma.organicContentRule.findMany({ where: { projectId: project.id, isActive: true } })
  const formats = new Set(rules.flatMap(rule => rule.formats))
  const needsApproval = rules.filter(rule => rule.approvalPolicy !== 'auto')

  return {
    // La pantalla final del §4.10, con números reales y no con una promesa.
    summary: {
      events: rules.length,
      formats: formats.size,
      approvals: needsApproval.length,
      sentence:
        `Vendrava vigilará ${rules.length} tipo${rules.length === 1 ? '' : 's'} de acontecimientos, ` +
        `generará ${formats.size} formato${formats.size === 1 ? '' : 's'} y solicitará aprobación ` +
        // "situación" pierde la tilde en plural: "situaciones", no "situaciónes".
        `en ${needsApproval.length} ${needsApproval.length === 1 ? 'situación' : 'situaciones'}.`,
    },
    rules,
    created,
  }
}

/**
 * Vista previa viva (§4.6, columna derecha): qué hará Vendrava con lo configurado
 * hasta ahora. Se calcula desde las reglas elegidas, no desde un ejemplo fijo.
 */
export function previewTimeline(moduleKey: string, eventKeys: string[]) {
  const module = getModule(moduleKey)
  if (!module) return []
  const TIMING_LABEL: Record<string, string> = {
    '7d_before': '7 días antes',
    '24h_before': '24 horas antes',
    '1h_before': '1 hora antes',
    on_start: 'al empezar',
    on_end: 'al terminar',
    next_day: 'al día siguiente',
    weekly: 'resumen semanal',
  }
  return module.events
    .filter(event => eventKeys.includes(event.key))
    .map(event => ({
      event: event.label,
      steps: event.suggestedTimings.map(timing => ({
        when: TIMING_LABEL[timing] ?? timing,
        what: event.suggestedFormats.join(' + '),
      })),
      approval: event.sensitive ? 'Aprobación obligatoria' : event.defaultApproval === 'auto' ? 'Automático' : 'Aprobación',
    }))
}
