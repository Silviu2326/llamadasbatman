import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { createPseudonymizer } from '../lib/pseudonymize'

/**
 * Voz del dueño — `docs/xarly/semana.md` día 3.
 *
 * Perfil de estilo extraído de las intervenciones del **lado del negocio** en
 * las transcripciones: muletillas, longitud de frase, expresiones y trato.
 *
 * Se calcula de forma determinista a propósito. Lo que pide el documento
 * —muletillas, longitud de frase, expresiones— es medible; pedírselo a un
 * modelo costaría dinero, haría el perfil irreproducible y lo dejaría sin
 * funcionar cuando falta la clave. El modelo se usa después, para escribir con
 * este perfil, no para deducirlo.
 *
 * El texto se seudonimiza igual que en el Radar: el perfil no puede contener
 * nombres de clientes ni de nadie.
 */

export interface OwnerVoiceProfile {
  version: string
  /** Longitud media de frase, en palabras. */
  averageSentenceWords: number
  /** Expresiones repetidas del lado del negocio, de más a menos frecuente. */
  expressions: string[]
  /** tú | usted | mixto — cómo trata al cliente. */
  address: 'tu' | 'usted' | 'mixto'
  /** Frases con las que suele abrir. */
  openings: string[]
  /** Cuántas intervenciones sustentan el perfil. */
  sampleSize: number
  computedAt: string
}

/** Por debajo de esto el perfil sería una caricatura de tres frases sueltas. */
const MIN_SAMPLE = 15

/** Marcas del lado del negocio en las transcripciones. */
const AGENT_PREFIX = /^\s*(agente|asesor|comercial|vendedor|operador)\s*:/i
const CLIENT_PREFIX = /^\s*(cliente|lead|contacto|usuario)\s*:/i

const STOPWORDS = new Set([
  'que', 'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'por', 'con', 'para',
  'su', 'sus', 'lo', 'le', 'se', 'del', 'al', 'es', 'son', 'me', 'te', 'nos', 'mi', 'tu',
  'ya', 'muy', 'más', 'mas', 'pero', 'como', 'si', 'no', 'sí', 'esta', 'este', 'eso',
])

function sentences(text: string) {
  return text.split(/[.!?¿¡\n]+/).map(part => part.trim()).filter(Boolean)
}

/** N-gramas de 2 y 3 palabras: las muletillas son expresiones, no palabras. */
function expressionsFrom(lines: string[]) {
  const counts = new Map<string, number>()

  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^\wáéíóúñü\s]/g, ' ').split(/\s+/).filter(Boolean)
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= words.length; index++) {
        const gram = words.slice(index, index + size)
        // Un n-grama que es solo palabras vacías no dice nada del estilo.
        if (gram.every(word => STOPWORDS.has(word))) continue
        if (gram.some(word => word.length < 2)) continue
        const key = gram.join(' ')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  return Array.from(counts.entries())
    // Repetido al menos tres veces: dos es coincidencia.
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 12)
    .map(([expression]) => expression)
}

function addressFrom(lines: string[]): OwnerVoiceProfile['address'] {
  const text = lines.join(' ').toLowerCase()
  const usted = (text.match(/\b(usted|ustedes|su\s|le\s|dígame|puede usted)\b/g) ?? []).length
  const tu = (text.match(/\b(tú|tu\s|te\s|contigo|dime|puedes)\b/g) ?? []).length
  if (usted > tu * 1.5) return 'usted'
  if (tu > usted * 1.5) return 'tu'
  return 'mixto'
}

/** Calcula el perfil a partir de las transcripciones recientes. */
export async function computeOwnerVoice(orgId: string, days = 90): Promise<OwnerVoiceProfile | null> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const [calls, contacts] = await Promise.all([
    prisma.call.findMany({
      where: { orgId, createdAt: { gte: since }, transcript: { not: null } },
      select: { transcript: true },
      take: 400,
    }),
    prisma.lead.findMany({ where: { orgId }, select: { name: true }, take: 2000 }),
  ])

  const pseudonymizer = createPseudonymizer(contacts.map(contact => contact.name).filter(Boolean))
  const agentLines: string[] = []

  for (const call of calls) {
    const clean = pseudonymizer.apply(call.transcript ?? '')
    for (const line of clean.split('\n')) {
      // Solo el lado del negocio: el perfil describe cómo habla el dueño, no
      // cómo hablan sus clientes.
      if (AGENT_PREFIX.test(line) && !CLIENT_PREFIX.test(line)) {
        agentLines.push(line.replace(AGENT_PREFIX, '').trim())
      }
    }
  }

  if (agentLines.length < MIN_SAMPLE) return null

  const allSentences = agentLines.flatMap(sentences)
  const totalWords = allSentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0)

  return {
    version: `voice-${new Date().toISOString().slice(0, 10)}`,
    averageSentenceWords: allSentences.length ? Math.round(totalWords / allSentences.length) : 0,
    expressions: expressionsFrom(agentLines),
    address: addressFrom(agentLines),
    openings: Array.from(new Set(agentLines.map(line => sentences(line)[0]).filter(Boolean))).slice(0, 5),
    sampleSize: agentLines.length,
    computedAt: new Date().toISOString(),
  }
}

export async function getOwnerVoice(orgId: string): Promise<OwnerVoiceProfile | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const settings = (org?.settings ?? {}) as { ownerVoice?: OwnerVoiceProfile }
  return settings.ownerVoice ?? null
}

/** Recalcula y guarda. Devuelve `null` si no hay muestra suficiente. */
export async function refreshOwnerVoice(orgId: string) {
  const profile = await computeOwnerVoice(orgId)
  if (!profile) return null

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const settings = (org?.settings ?? {}) as Record<string, unknown>
  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: { ...settings, ownerVoice: profile } as unknown as Prisma.InputJsonObject },
  })
  return profile
}

/**
 * Traduce el perfil a instrucciones para el modelo. Si no hay perfil, devuelve
 * `null` y quien genere debe decirlo: escribir "con la voz del dueño" sin
 * tenerla sería exactamente la promesa vacía que este producto evita.
 */
export function voiceInstructions(profile: OwnerVoiceProfile | null) {
  if (!profile) return null
  const trato = profile.address === 'usted' ? 'de usted' : profile.address === 'tu' ? 'de tú' : 'alternando tú y usted como hace el negocio'
  const lines = [
    `Trata al lector ${trato}.`,
    `Frases de unas ${profile.averageSentenceWords} palabras de media.`,
  ]
  if (profile.expressions.length) {
    lines.push(`Usa con naturalidad expresiones propias del negocio como: ${profile.expressions.slice(0, 6).join(', ')}.`)
  }
  lines.push(`Perfil calculado sobre ${profile.sampleSize} intervenciones reales del negocio.`)
  return lines.join('\n')
}
